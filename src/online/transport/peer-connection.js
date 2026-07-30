import {
  PEER_STATE,
  PeerTransportError,
  SIGNAL_KIND,
  TRANSPORT_SCHEMA_VERSION,
  WIRE_ENVELOPE_TYPE,
  copyJson,
  encodedBytes,
  requireSeatProof,
  requireTransportIdentifier,
  requireTransportVersion,
  safeError,
} from "./contract.js";

export function createWebRtcPeerConnection({
  matchId,
  localPlayerId,
  remotePlayerId,
  offerer,
  transportProtocolVersion,
  engineSchemaVersion,
  engineRulesVersion,
  localSeatProof,
  verifyRemoteSeatProof,
  signalling,
  rtcPeerConnectionFactory,
  clock = Date.now,
  scheduler = globalThis,
  heartbeatIntervalMs = 10_000,
  heartbeatTimeoutMs = 30_000,
  negotiationTimeoutMs = 12_000,
  sequenceGapTimeoutMs = 12_000,
  iceRestartInitialMs = 1_000,
  iceRestartMaximumMs = 8_000,
  maximumIceRestartAttempts = 5,
  maxWireBytes = 65_536,
  maxPendingMessages = 64,
  iceTransportPolicy = "all",
  schemaVersion = TRANSPORT_SCHEMA_VERSION,
  channelLabel = "crazy-rummy",
} = {}) {
  requireTransportIdentifier(matchId, "match ID");
  requireTransportIdentifier(localPlayerId, "local player ID");
  requireTransportIdentifier(remotePlayerId, "remote player ID");
  requireTransportVersion(transportProtocolVersion, "transport protocol version");
  requireTransportVersion(engineSchemaVersion, "engine schema version");
  requireTransportVersion(engineRulesVersion, "engine rules version");
  requireSeatProof(localSeatProof);
  requireTransportVersion(schemaVersion, "transport schema version");
  if (localPlayerId === remotePlayerId) throw invalid("A peer cannot connect to itself.");
  if (typeof offerer !== "boolean" || !signalling || typeof signalling.sendSignal !== "function") {
    throw invalid("Peer role and signalling are required.");
  }
  if (typeof rtcPeerConnectionFactory !== "function") throw invalid("An RTCPeerConnection factory is required.");
  if (typeof verifyRemoteSeatProof !== "function") throw invalid("A remote seat-proof verifier is required.");
  if (!Number.isFinite(heartbeatIntervalMs) || heartbeatIntervalMs < 1
    || !Number.isFinite(heartbeatTimeoutMs) || heartbeatTimeoutMs <= heartbeatIntervalMs) {
    throw invalid("Heartbeat timing is invalid.");
  }
  if (!Number.isFinite(negotiationTimeoutMs) || negotiationTimeoutMs < 1
    || !Number.isFinite(sequenceGapTimeoutMs) || sequenceGapTimeoutMs < 1) {
    throw invalid("Transport recovery timing is invalid.");
  }
  if (!Number.isFinite(iceRestartInitialMs) || iceRestartInitialMs < 1
    || !Number.isFinite(iceRestartMaximumMs) || iceRestartMaximumMs < iceRestartInitialMs
    || !Number.isSafeInteger(maximumIceRestartAttempts) || maximumIceRestartAttempts < 1) {
    throw invalid("ICE restart timing is invalid.");
  }
  if (!Number.isSafeInteger(maxWireBytes) || maxWireBytes < 256
    || !Number.isSafeInteger(maxPendingMessages) || maxPendingMessages < 1) {
    throw invalid("Wire message and reorder bounds are invalid.");
  }

  let state = PEER_STATE.IDLE;
  let error = null;
  let connection = null;
  let channel = null;
  let started = false;
  let closed = false;
  let remoteDescriptionSet = false;
  let receivedHello = false;
  let receivedHelloAck = false;
  let helloSent = false;
  let outboundSequence = 0;
  let inboundSequence = 1;
  let lastReceivedAt = null;
  let heartbeatTimer = null;
  let negotiationTimer = null;
  let sequenceGapTimer = null;
  let restartNudgeTimer = null;
  let iceRestartTimer = null;
  let iceRestartAttempts = 0;
  let recoveryActive = false;
  let restartNudgePending = false;
  let unsubscribeSignals = null;
  let unsubscribeSignallingState = null;
  let operationChain = Promise.resolve();
  const queuedCandidates = [];
  const pendingSignals = [];
  const pendingMessages = new Map();
  const stateListeners = new Set();
  const messageListeners = new Set();

  function getSnapshot() {
    return Object.freeze({
      state,
      matchId,
      localPlayerId,
      remotePlayerId,
      offerer,
      connectionState: connection?.connectionState ?? "new",
      channelState: channel?.readyState ?? "closed",
      negotiated: remoteDescriptionSet,
      handshakeComplete: receivedHello && receivedHelloAck,
      lastReceivedAt,
      lastError: safeError(error),
    });
  }

  function transition(next, nextError = null) {
    if (state === PEER_STATE.CLOSED) return;
    state = next;
    error = nextError;
    const snapshot = getSnapshot();
    for (const listener of [...stateListeners]) listener(snapshot);
  }

  async function start() {
    if (closed) throw new PeerTransportError("PEER_CLOSED", "The peer connection is closed.");
    if (started) return getSnapshot();
    started = true;
    transition(PEER_STATE.SIGNALLING);
    try {
      unsubscribeSignals = signalling.subscribeSignals((envelope) => {
        if (envelope.matchId !== matchId || envelope.fromPlayerId !== remotePlayerId
          || envelope.toPlayerId !== localPlayerId) return;
        if (!connection) {
          pendingSignals.push(envelope);
          return;
        }
        operationChain = operationChain.then(() => handleSignal(envelope)).catch(recoverOrFail);
      });
      unsubscribeSignallingState = signalling.subscribe?.((snapshot) => {
        if (closed || snapshot?.state !== PEER_STATE.CONNECTED || !restartNudgePending) return;
        operationChain = operationChain
          .then(() => requestRemoteRestart("signalling-restored"))
          .catch(() => {});
      }) ?? null;
      await signalling.start?.();
      const { iceServers } = await signalling.getIceServers({
        matchId,
        remotePlayerId,
        iceTransportPolicy,
      });
      connection = rtcPeerConnectionFactory({ iceServers, iceTransportPolicy });
      wireConnection(connection);
      transition(PEER_STATE.CONNECTING);
      armNegotiationWatchdog();
      for (const envelope of pendingSignals.splice(0)) {
        operationChain = operationChain.then(() => handleSignal(envelope)).catch(recoverOrFail);
      }
      if (offerer) {
        wireChannel(connection.createDataChannel(channelLabel, { ordered: true }));
        await createAndSendOffer({ iceRestart: false });
      } else {
        // A newly restored answerer may be replacing a peer that the existing
        // offerer still considers connected. This authenticated nudge makes
        // the designated offerer renegotiate immediately. During ordinary
        // startup it is harmless because the offerer creates its first offer.
        await requestRemoteRestart("answerer-ready");
      }
      return getSnapshot();
    } catch (cause) {
      fail(cause);
      throw error;
    }
  }

  function wireConnection(peerConnection) {
    addListener(peerConnection, "icecandidate", ({ candidate } = {}) => {
      if (!candidate) return;
      const value = typeof candidate.toJSON === "function" ? candidate.toJSON() : candidate;
      sendSignal(SIGNAL_KIND.ICE_CANDIDATE, { candidate: copyJson(value) }).catch(recoverOrFail);
    });
    addListener(peerConnection, "datachannel", ({ channel: remoteChannel } = {}) => wireChannel(remoteChannel));
    addListener(peerConnection, "connectionstatechange", () => {
      if (closed || peerConnection !== connection) return;
      if (peerConnection.connectionState === "connected") {
        clearIceRestart();
        if (receivedHello && receivedHelloAck) transition(PEER_STATE.CONNECTED);
        else if (channel?.readyState === "open") beginHandshake();
        else {
          transition(PEER_STATE.CONNECTING);
          armNegotiationWatchdog();
        }
      } else if (peerConnection.connectionState === "disconnected") {
        beginRecovery(new PeerTransportError(
          "WEBRTC_DISCONNECTED",
          "The WebRTC connection was interrupted.",
          { retryable: true },
        ));
      } else if (peerConnection.connectionState === "failed") {
        beginRecovery(new PeerTransportError(
          "WEBRTC_FAILED",
          "The WebRTC connection failed.",
          { retryable: true },
        ));
      } else if (peerConnection.connectionState === "closed") {
        close({ notifyRemote: false });
      }
    });
  }

  function wireChannel(nextChannel) {
    if (!nextChannel || channel === nextChannel || closed) return;
    if (nextChannel.ordered === false) {
      fail(new PeerTransportError("UNORDERED_CHANNEL", "Crazy Rummy requires an ordered data channel."));
      return;
    }
    channel = nextChannel;
    const wiredChannel = nextChannel;
    addListener(channel, "open", () => {
      if (closed || channel !== wiredChannel) return;
      beginHandshake();
    });
    addListener(channel, "message", ({ data } = {}) => handleWire(data));
    addListener(channel, "close", () => {
      if (!closed && channel === wiredChannel) {
        beginRecovery(new PeerTransportError(
          "DATA_CHANNEL_CLOSED",
          "The peer data channel closed unexpectedly.",
          { retryable: true },
        ));
      }
    });
    addListener(channel, "error", () => {
      if (channel === wiredChannel) {
        beginRecovery(new PeerTransportError(
          "DATA_CHANNEL_FAILED",
          "The peer data channel failed.",
          { retryable: true },
        ));
      }
    });
    if (channel.readyState === "open") {
      beginHandshake();
    }
  }

  function beginHandshake() {
    if (closed || channel?.readyState !== "open") return;
    transition(PEER_STATE.HANDSHAKING);
    if (helloSent) return;
    helloSent = true;
    sendWire("hello", {
      transportProtocolVersion,
      engineSchemaVersion,
      engineRulesVersion,
      playerId: localPlayerId,
      seatProof: localSeatProof,
    }).catch(recoverOrFail);
  }

  function resetNegotiation() {
    remoteDescriptionSet = false;
    receivedHello = false;
    receivedHelloAck = false;
    helloSent = false;
    outboundSequence = 0;
    inboundSequence = 1;
    lastReceivedAt = null;
    queuedCandidates.splice(0);
    pendingMessages.clear();
    clearSequenceGapWatchdog();
  }

  async function createAndSendOffer({ iceRestart }) {
    if (!connection || closed) return;
    if (iceRestart) {
      resetNegotiation();
      if (channel?.readyState !== "open") {
        wireChannel(connection.createDataChannel(channelLabel, { ordered: true }));
      }
      connection.restartIce?.();
    }
    const offer = await connection.createOffer(iceRestart ? { iceRestart: true } : undefined);
    await connection.setLocalDescription(offer);
    await sendSignal(SIGNAL_KIND.OFFER, {
      description: plainDescription(connection.localDescription || offer),
      iceRestart: Boolean(iceRestart),
    });
  }

  function clearIceRestart() {
    if (iceRestartTimer !== null) scheduler.clearTimeout?.(iceRestartTimer);
    iceRestartTimer = null;
    iceRestartAttempts = 0;
    recoveryActive = false;
  }

  function clearNegotiationWatchdog() {
    if (negotiationTimer !== null) scheduler.clearTimeout?.(negotiationTimer);
    negotiationTimer = null;
  }

  function armNegotiationWatchdog() {
    if (closed || recoveryActive || negotiationTimer !== null || state === PEER_STATE.CONNECTED
      || (state === PEER_STATE.FAILED && error?.retryable !== true)) return;
    negotiationTimer = scheduler.setTimeout?.(() => {
      negotiationTimer = null;
      if (closed || state === PEER_STATE.CONNECTED
        || (state === PEER_STATE.FAILED && error?.retryable !== true)) return;
      const cause = new PeerTransportError(
        "NEGOTIATION_TIMEOUT",
        "The peer negotiation did not complete in time.",
        { retryable: true },
      );
      if (offerer) beginRecovery(cause, { force: true });
      else {
        transition(PEER_STATE.DISCONNECTED, cause);
        operationChain = operationChain.then(() => requestRemoteRestart("negotiation-timeout")).catch(() => {});
      }
      armNegotiationWatchdog();
    }, negotiationTimeoutMs) ?? null;
  }

  function clearSequenceGapWatchdog() {
    if (sequenceGapTimer !== null) scheduler.clearTimeout?.(sequenceGapTimer);
    sequenceGapTimer = null;
  }

  function armSequenceGapWatchdog() {
    if (closed || sequenceGapTimer !== null || pendingMessages.size === 0) return;
    sequenceGapTimer = scheduler.setTimeout?.(() => {
      sequenceGapTimer = null;
      if (closed || pendingMessages.size === 0) return;
      beginRecovery(new PeerTransportError(
        "WIRE_SEQUENCE_STALLED",
        "A peer transport event sequence did not recover in time.",
        { retryable: true },
      ), { force: true });
    }, sequenceGapTimeoutMs) ?? null;
  }

  function clearRestartNudgeRetry() {
    if (restartNudgeTimer !== null) scheduler.clearTimeout?.(restartNudgeTimer);
    restartNudgeTimer = null;
  }

  function scheduleRestartNudgeRetry(reason) {
    if (closed || offerer || !restartNudgePending || restartNudgeTimer !== null) return;
    restartNudgeTimer = scheduler.setTimeout?.(() => {
      restartNudgeTimer = null;
      if (closed || !restartNudgePending) return;
      operationChain = operationChain.then(() => requestRemoteRestart(reason)).catch(() => {});
    }, iceRestartInitialMs) ?? null;
  }

  function scheduleIceRestart(delay = 0) {
    if (closed || !offerer || !recoveryActive || iceRestartTimer !== null) return;
    const run = () => {
      iceRestartTimer = null;
      operationChain = operationChain.then(attemptIceRestart).catch(handleIceRestartFailure);
    };
    if (delay === 0 || typeof scheduler.setTimeout !== "function") run();
    else iceRestartTimer = scheduler.setTimeout(run, delay);
  }

  async function attemptIceRestart() {
    if (closed || !recoveryActive || state === PEER_STATE.CONNECTED) return;
    if (iceRestartAttempts >= maximumIceRestartAttempts) {
      fail(new PeerTransportError(
        "ICE_RESTART_EXHAUSTED",
        "The peer connection could not be recovered.",
        { retryable: true },
      ));
      return;
    }
    iceRestartAttempts += 1;
    transition(PEER_STATE.CONNECTING);
    armNegotiationWatchdog();
    await createAndSendOffer({ iceRestart: true });
    if (!closed && state !== PEER_STATE.CONNECTED && recoveryActive) {
      const delay = Math.min(
        iceRestartInitialMs * (2 ** (iceRestartAttempts - 1)),
        iceRestartMaximumMs,
      );
      if (typeof scheduler.setTimeout === "function") scheduleIceRestart(delay);
    }
  }

  function handleIceRestartFailure(cause) {
    if (closed) return;
    transition(PEER_STATE.DISCONNECTED, cause);
    if (iceRestartAttempts >= maximumIceRestartAttempts) {
      fail(new PeerTransportError(
        "ICE_RESTART_EXHAUSTED",
        "The peer connection could not be recovered.",
        { retryable: true, cause },
      ));
      return;
    }
    const delay = Math.min(
      iceRestartInitialMs * (2 ** Math.max(0, iceRestartAttempts - 1)),
      iceRestartMaximumMs,
    );
    scheduleIceRestart(delay);
  }

  function beginRecovery(cause, { force = false } = {}) {
    if (closed || (state === PEER_STATE.FAILED && (!force || error?.retryable !== true))) return;
    transition(PEER_STATE.DISCONNECTED, cause);
    if (!offerer) {
      armNegotiationWatchdog();
      operationChain = operationChain.then(() => requestRemoteRestart("peer-recovery")).catch(() => {});
      return;
    }
    if (recoveryActive && !force) return;
    if (force) clearIceRestart();
    clearNegotiationWatchdog();
    recoveryActive = true;
    scheduleIceRestart();
  }

  async function requestRemoteRestart(reason) {
    if (closed || offerer) return;
    restartNudgePending = true;
    try {
      await sendSignal(SIGNAL_KIND.RESTART, { reason });
      restartNudgePending = false;
      clearRestartNudgeRetry();
    } catch (cause) {
      if (!closed) {
        transition(PEER_STATE.DISCONNECTED, new PeerTransportError(
          "RESTART_SIGNAL_PENDING",
          "Connection recovery is waiting for signalling.",
          { retryable: true, cause },
        ));
        scheduleRestartNudgeRetry(reason);
      }
    }
  }

  async function resume() {
    if (closed) throw new PeerTransportError("PEER_CLOSED", "The peer connection is closed.");
    if (!started || !connection) return getSnapshot();
    const cause = new PeerTransportError(
      "PEER_RESUMED",
      "The browser returned to the active game.",
      { retryable: true },
    );
    transition(PEER_STATE.DISCONNECTED, cause);
    try {
      await signalling.resume?.();
    } catch (refreshCause) {
      transition(PEER_STATE.DISCONNECTED, new PeerTransportError(
        "SIGNALLING_REFRESH_PENDING",
        "Peer recovery is waiting for a fresh signalling connection.",
        { retryable: true, cause: refreshCause },
      ));
    }
    if (offerer) beginRecovery(cause, { force: true });
    else {
      await requestRemoteRestart("browser-resumed");
    }
    armNegotiationWatchdog();
    return getSnapshot();
  }

  async function handleSignal(envelope) {
    if (closed) return;
    if (envelope.kind === SIGNAL_KIND.CLOSE) {
      await verifySignalIdentity(envelope);
      await close({ notifyRemote: false });
      return;
    }
    if (!connection) return;
    await verifySignalIdentity(envelope);
    if (envelope.kind === SIGNAL_KIND.RESTART) {
      if (offerer && (
        state === PEER_STATE.CONNECTED
        || state === PEER_STATE.DISCONNECTED
        || state === PEER_STATE.FAILED
      )) {
        beginRecovery(new PeerTransportError(
          "REMOTE_RESTART_REQUESTED",
          "The remote peer requested connection recovery.",
          { retryable: true },
        ), { force: true });
      }
      return;
    }
    if (envelope.kind === SIGNAL_KIND.OFFER) {
      if (offerer) throw new PeerTransportError("UNEXPECTED_SIGNAL", "The offerer received an unexpected offer.");
      resetNegotiation();
      transition(PEER_STATE.CONNECTING);
      armNegotiationWatchdog();
      await connection.setRemoteDescription(envelope.payload?.description);
      remoteDescriptionSet = true;
      await flushCandidates();
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await sendSignal(SIGNAL_KIND.ANSWER, { description: plainDescription(connection.localDescription || answer) });
      return;
    }
    if (envelope.kind === SIGNAL_KIND.ANSWER) {
      if (!offerer) throw new PeerTransportError("UNEXPECTED_SIGNAL", "The answerer received an unexpected answer.");
      await connection.setRemoteDescription(envelope.payload?.description);
      remoteDescriptionSet = true;
      await flushCandidates();
      return;
    }
    if (envelope.kind === SIGNAL_KIND.ICE_CANDIDATE) {
      const candidate = envelope.payload?.candidate;
      if (!remoteDescriptionSet) queuedCandidates.push(candidate);
      else await connection.addIceCandidate(candidate);
    }
  }

  async function flushCandidates() {
    while (queuedCandidates.length) await connection.addIceCandidate(queuedCandidates.shift());
  }

  async function sendSignal(kind, payload) {
    return signalling.sendSignal({
      matchId,
      toPlayerId: remotePlayerId,
      kind,
      payload: {
        ...payload,
        identity: {
          transportProtocolVersion,
          engineSchemaVersion,
          engineRulesVersion,
          seatProof: localSeatProof,
        },
      },
    });
  }

  async function verifySignalIdentity(envelope) {
    const identity = envelope.payload?.identity;
    if (identity?.transportProtocolVersion !== transportProtocolVersion
      || identity?.engineSchemaVersion !== engineSchemaVersion
      || identity?.engineRulesVersion !== engineRulesVersion
      || typeof identity?.seatProof !== "string"
      || !(await verifyRemoteSeatProof({
        matchId,
        remotePlayerId,
        seatProof: identity.seatProof,
      }))) {
      throw new PeerTransportError("INVALID_SEAT_PROOF", "The signalling sender did not prove its assigned seat.");
    }
  }

  function handleWire(raw) {
    if (closed) return;
    let byteLength;
    try {
      byteLength = typeof raw === "string"
        ? new TextEncoder().encode(raw).byteLength
        : encodedBytes(raw);
    } catch {
      fail(new PeerTransportError("INVALID_WIRE_MESSAGE", "The peer sent invalid transport data."));
      return;
    }
    if (byteLength > maxWireBytes) {
      fail(new PeerTransportError("WIRE_MESSAGE_TOO_LARGE", "The peer transport message exceeded its size bound."));
      return;
    }
    let message;
    try {
      message = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      fail(new PeerTransportError("INVALID_WIRE_MESSAGE", "The peer sent invalid transport data."));
      return;
    }
    if (!message || message.type !== WIRE_ENVELOPE_TYPE || message.schemaVersion !== schemaVersion) {
      fail(new PeerTransportError("INCOMPATIBLE_SCHEMA", "The peer transport schema is incompatible."));
      return;
    }
    if (message.kind === "hello") {
      const payload = message.payload || {};
      if (payload.playerId !== remotePlayerId
        || payload.transportProtocolVersion !== transportProtocolVersion
        || payload.engineSchemaVersion !== engineSchemaVersion
        || payload.engineRulesVersion !== engineRulesVersion) {
        fail(new PeerTransportError("INCOMPATIBLE_PEER", "The peer protocol or rules version is incompatible."));
        return;
      }
      try {
        requireSeatProof(payload.seatProof);
      } catch {
        fail(new PeerTransportError("INVALID_SEAT_PROOF", "The peer did not prove its assigned seat."));
        return;
      }
      Promise.resolve().then(() => verifyRemoteSeatProof({
        matchId,
        remotePlayerId,
        seatProof: payload.seatProof,
      })).then((verified) => {
        if (!verified) throw new PeerTransportError("INVALID_SEAT_PROOF", "The peer did not prove its assigned seat.");
        markReceived();
        receivedHello = true;
        return sendWire("hello-ack", { playerId: localPlayerId });
      }).then(maybeConnected).catch(recoverOrFail);
      return;
    }
    if (message.kind === "hello-ack") {
      if (message.payload?.playerId !== remotePlayerId) {
        fail(new PeerTransportError("INCOMPATIBLE_PEER", "The peer identity handshake failed."));
        return;
      }
      markReceived();
      receivedHelloAck = true;
      maybeConnected();
      return;
    }
    if (message.kind === "ping") {
      if (typeof message.payload?.nonce !== "string" || message.payload.nonce.length > 64) {
        fail(new PeerTransportError("INVALID_WIRE_MESSAGE", "The peer heartbeat was malformed."));
        return;
      }
      markReceived();
      sendWire("pong", { nonce: message.payload?.nonce }).catch(recoverOrFail);
      return;
    }
    if (message.kind === "pong") {
      if (typeof message.payload?.nonce !== "string" || message.payload.nonce.length > 64) {
        fail(new PeerTransportError("INVALID_WIRE_MESSAGE", "The peer heartbeat reply was malformed."));
        return;
      }
      markReceived();
      return;
    }
    if (message.kind === "close") {
      markReceived();
      close({ notifyRemote: false });
      return;
    }
    if (message.kind !== "event" || !Number.isSafeInteger(message.sequence)
      || message.sequence < 1 || message.payload === undefined) {
      fail(new PeerTransportError("INVALID_WIRE_MESSAGE", "The peer sent an unknown or malformed transport message."));
      return;
    }
    if (message.sequence > inboundSequence + maxPendingMessages) {
      fail(new PeerTransportError("WIRE_SEQUENCE_GAP", "The peer event sequence exceeded the reorder bound."));
      return;
    }
    if (message.sequence < inboundSequence || pendingMessages.has(message.sequence)) {
      markReceived();
      return;
    }
    if (pendingMessages.size >= maxPendingMessages) {
      fail(new PeerTransportError("WIRE_BUFFER_OVERFLOW", "The peer event reorder buffer is full."));
      return;
    }
    markReceived();
    pendingMessages.set(message.sequence, message.payload);
    armSequenceGapWatchdog();
    while (pendingMessages.has(inboundSequence)) {
      const payload = pendingMessages.get(inboundSequence);
      pendingMessages.delete(inboundSequence);
      inboundSequence += 1;
      for (const listener of [...messageListeners]) listener(copyJson(payload));
    }
    if (pendingMessages.size === 0) clearSequenceGapWatchdog();
  }

  function markReceived() {
    lastReceivedAt = clock();
    if (state === PEER_STATE.DISCONNECTED && receivedHello && receivedHelloAck) {
      transition(PEER_STATE.CONNECTED);
    }
  }

  function maybeConnected() {
    if (!receivedHello || !receivedHelloAck || closed) return;
    clearIceRestart();
    clearNegotiationWatchdog();
    clearRestartNudgeRetry();
    transition(PEER_STATE.CONNECTED);
    lastReceivedAt = clock();
    if (heartbeatTimer === null) {
      heartbeatTimer = scheduler.setInterval(() => {
        if (closed || state !== PEER_STATE.CONNECTED) return;
        if (lastReceivedAt !== null && clock() - lastReceivedAt > heartbeatTimeoutMs) {
          beginRecovery(new PeerTransportError(
            "HEARTBEAT_TIMEOUT",
            "The peer stopped responding.",
            { retryable: true },
          ));
          return;
        }
        sendWire("ping", { nonce: `${clock()}` }).catch(recoverOrFail);
      }, heartbeatIntervalMs);
    }
  }

  async function send(payload) {
    if (state !== PEER_STATE.CONNECTED) {
      throw new PeerTransportError("PEER_NOT_CONNECTED", "The peer data channel is not connected.", { retryable: true });
    }
    if (channel?.readyState !== "open") {
      const cause = new PeerTransportError(
        "DATA_CHANNEL_NOT_OPEN",
        "The peer data channel closed while a message was being sent.",
        { retryable: true },
      );
      beginRecovery(cause, { force: true });
      throw cause;
    }
    const sequence = outboundSequence + 1;
    try {
      await sendWire("event", copyJson(payload), sequence);
      outboundSequence = sequence;
      return sequence;
    } catch (cause) {
      recoverOrFail(asSendFailure(cause));
      throw cause;
    }
  }

  async function sendWire(kind, payload, sequence = undefined) {
    if (!channel || channel.readyState !== "open") {
      throw new PeerTransportError("DATA_CHANNEL_NOT_OPEN", "The peer data channel is not open.", { retryable: true });
    }
    const value = JSON.stringify({
      type: WIRE_ENVELOPE_TYPE,
      schemaVersion,
      kind,
      ...(sequence === undefined ? {} : { sequence }),
      payload,
    });
    if (new TextEncoder().encode(value).byteLength > maxWireBytes) {
      throw new PeerTransportError("WIRE_MESSAGE_TOO_LARGE", "The peer transport message exceeded its size bound.");
    }
    await Promise.resolve(channel.send(value));
  }

  function fail(cause) {
    if (closed || state === PEER_STATE.FAILED) return;
    error = cause instanceof PeerTransportError
      ? cause
      : new PeerTransportError("PEER_CONNECTION_FAILED", "Peer connection setup failed.", { retryable: true, cause });
    pendingMessages.clear();
    clearSequenceGapWatchdog();
    clearIceRestart();
    transition(PEER_STATE.FAILED, error);
    if (error.retryable) armNegotiationWatchdog();
  }

  function asSendFailure(cause) {
    if (cause instanceof PeerTransportError) return cause;
    return new PeerTransportError(
      "DATA_CHANNEL_SEND_FAILED",
      "The peer data channel could not send a message.",
      { retryable: true, cause },
    );
  }

  function recoverOrFail(cause) {
    const error = asSendFailure(cause);
    if (error.retryable) {
      beginRecovery(error, { force: true });
      return;
    }
    fail(error);
  }

  async function close({ notifyRemote = true } = {}) {
    if (closed) return;
    if (notifyRemote) {
      // Closing local gameplay resources must never wait on a provider call.
      // The close notification is best effort; peer/session recovery remains
      // authoritative if it cannot leave the browser.
      if (channel?.readyState === "open") void sendWire("close", { reason: "normal" }).catch(() => {});
      void sendSignal(SIGNAL_KIND.CLOSE, { reason: "normal" }).catch(() => {});
    }
    closed = true;
    clearIceRestart();
    clearNegotiationWatchdog();
    clearSequenceGapWatchdog();
    clearRestartNudgeRetry();
    if (heartbeatTimer !== null) scheduler.clearInterval(heartbeatTimer);
    unsubscribeSignals?.();
    unsubscribeSignallingState?.();
    channel?.close?.();
    connection?.close?.();
    state = PEER_STATE.CLOSED;
    error = null;
    const snapshot = getSnapshot();
    for (const listener of [...stateListeners]) listener(snapshot);
    stateListeners.clear();
    messageListeners.clear();
  }

  return Object.freeze({
    start,
    resume,
    send,
    close,
    getSnapshot,
    subscribe(listener) {
      if (typeof listener !== "function") throw invalid("A state listener is required.");
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onMessage(listener) {
      if (typeof listener !== "function") throw invalid("A message listener is required.");
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
  });
}

function plainDescription(value) {
  if (!value || typeof value.type !== "string") throw new PeerTransportError("INVALID_SDP", "A session description is required.");
  return { type: value.type, sdp: value.sdp };
}

function addListener(target, type, listener) {
  if (typeof target?.addEventListener === "function") target.addEventListener(type, listener);
  else if (typeof target?.on === "function") target.on(type, listener);
  else throw invalid(`The injected WebRTC object does not support ${type} events.`);
}

function invalid(message) {
  return new PeerTransportError("INVALID_TRANSPORT_INPUT", message);
}

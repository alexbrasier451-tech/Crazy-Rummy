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
  let outboundSequence = 0;
  let inboundSequence = 1;
  let lastReceivedAt = null;
  let heartbeatTimer = null;
  let unsubscribeSignals = null;
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
        operationChain = operationChain.then(() => handleSignal(envelope)).catch(fail);
      });
      await signalling.start?.();
      const { iceServers } = await signalling.getIceServers({
        matchId,
        remotePlayerId,
        iceTransportPolicy,
      });
      connection = rtcPeerConnectionFactory({ iceServers, iceTransportPolicy });
      wireConnection(connection);
      transition(PEER_STATE.CONNECTING);
      for (const envelope of pendingSignals.splice(0)) {
        operationChain = operationChain.then(() => handleSignal(envelope)).catch(fail);
      }
      if (offerer) {
        wireChannel(connection.createDataChannel(channelLabel, { ordered: true }));
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await sendSignal(SIGNAL_KIND.OFFER, { description: plainDescription(connection.localDescription || offer) });
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
      sendSignal(SIGNAL_KIND.ICE_CANDIDATE, { candidate: copyJson(value) }).catch(fail);
    });
    addListener(peerConnection, "datachannel", ({ channel: remoteChannel } = {}) => wireChannel(remoteChannel));
    addListener(peerConnection, "connectionstatechange", () => {
      if (closed) return;
      if (peerConnection.connectionState === "connected") {
        transition(receivedHello && receivedHelloAck
          ? PEER_STATE.CONNECTED
          : channel?.readyState === "open" ? PEER_STATE.HANDSHAKING : PEER_STATE.CONNECTING);
      } else if (peerConnection.connectionState === "disconnected") {
        transition(PEER_STATE.DISCONNECTED);
      } else if (peerConnection.connectionState === "failed") {
        fail(new PeerTransportError("WEBRTC_FAILED", "The WebRTC connection failed.", { retryable: true }));
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
    addListener(channel, "open", () => {
      if (closed) return;
      transition(PEER_STATE.HANDSHAKING);
      sendWire("hello", {
        transportProtocolVersion,
        engineSchemaVersion,
        engineRulesVersion,
        playerId: localPlayerId,
        seatProof: localSeatProof,
      }).catch(fail);
    });
    addListener(channel, "message", ({ data } = {}) => handleWire(data));
    addListener(channel, "close", () => {
      if (!closed) transition(PEER_STATE.DISCONNECTED);
    });
    addListener(channel, "error", () => fail(new PeerTransportError(
      "DATA_CHANNEL_FAILED",
      "The peer data channel failed.",
      { retryable: true },
    )));
    if (channel.readyState === "open") {
      transition(PEER_STATE.HANDSHAKING);
      sendWire("hello", {
        transportProtocolVersion,
        engineSchemaVersion,
        engineRulesVersion,
        playerId: localPlayerId,
        seatProof: localSeatProof,
      }).catch(fail);
    }
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
    if (envelope.kind === SIGNAL_KIND.OFFER) {
      if (offerer) throw new PeerTransportError("UNEXPECTED_SIGNAL", "The offerer received an unexpected offer.");
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
      }).then(maybeConnected).catch(fail);
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
      sendWire("pong", { nonce: message.payload?.nonce }).catch(fail);
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
    while (pendingMessages.has(inboundSequence)) {
      const payload = pendingMessages.get(inboundSequence);
      pendingMessages.delete(inboundSequence);
      inboundSequence += 1;
      for (const listener of [...messageListeners]) listener(copyJson(payload));
    }
  }

  function markReceived() {
    lastReceivedAt = clock();
    if (state === PEER_STATE.DISCONNECTED && receivedHello && receivedHelloAck) {
      transition(PEER_STATE.CONNECTED);
    }
  }

  function maybeConnected() {
    if (!receivedHello || !receivedHelloAck || closed) return;
    transition(PEER_STATE.CONNECTED);
    lastReceivedAt = clock();
    if (heartbeatTimer === null) {
      heartbeatTimer = scheduler.setInterval(() => {
        if (closed || state === PEER_STATE.FAILED) return;
        if (lastReceivedAt !== null && clock() - lastReceivedAt > heartbeatTimeoutMs) {
          transition(PEER_STATE.DISCONNECTED, new PeerTransportError(
            "HEARTBEAT_TIMEOUT",
            "The peer stopped responding.",
            { retryable: true },
          ));
          return;
        }
        sendWire("ping", { nonce: `${clock()}` }).catch(fail);
      }, heartbeatIntervalMs);
    }
  }

  async function send(payload) {
    if (state !== PEER_STATE.CONNECTED || channel?.readyState !== "open") {
      throw new PeerTransportError("PEER_NOT_CONNECTED", "The peer data channel is not connected.", { retryable: true });
    }
    outboundSequence += 1;
    await sendWire("event", copyJson(payload), outboundSequence);
    return outboundSequence;
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
    transition(PEER_STATE.FAILED, error);
  }

  async function close({ notifyRemote = true } = {}) {
    if (closed) return;
    if (notifyRemote) {
      if (channel?.readyState === "open") await sendWire("close", { reason: "normal" }).catch(() => {});
      await sendSignal(SIGNAL_KIND.CLOSE, { reason: "normal" }).catch(() => {});
    }
    closed = true;
    if (heartbeatTimer !== null) scheduler.clearInterval(heartbeatTimer);
    unsubscribeSignals?.();
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

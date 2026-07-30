import {
  PEER_STATE,
  PeerTransportError,
  SIGNAL_KIND,
  TRANSPORT_SCHEMA_VERSION,
  createSignallingEnvelope,
  parseSignallingEnvelope,
  requireTransportIdentifier,
  safeError,
  validateIceServers,
} from "./contract.js";

/**
 * Provider-neutral adapter over the accepted Metered SignallingClient shape:
 * connect/subscribe/publish/send plus message/direct/connected events.
 */
export function createManagedSignallingAdapter({
  client,
  channel,
  localPlayerId,
  remotePlayerId,
  clock = Date.now,
  createSignalId = defaultSignalId,
  credentialProvider = null,
  signalTtlMs = 30_000,
  maxMessageBytes = 32_768,
  schemaVersion = TRANSPORT_SCHEMA_VERSION,
} = {}) {
  if (!client || typeof client !== "object") throw invalid("A managed signalling client is required.");
  if (typeof client.publish !== "function" || typeof client.subscribe !== "function") {
    throw invalid("The managed client must support publish and subscribe.");
  }
  requireTransportIdentifier(localPlayerId, "local player ID");
  requireTransportIdentifier(remotePlayerId, "remote player ID");
  if (localPlayerId === remotePlayerId) throw invalid("A signalling pair requires two different players.");
  if (typeof channel !== "string" || !/^[A-Za-z0-9][A-Za-z0-9/_-]{2,127}$/.test(channel)) {
    throw invalid("A bounded signalling channel is required.");
  }
  if (typeof clock !== "function" || typeof createSignalId !== "function") throw invalid("Signalling dependencies are invalid.");
  if (!Number.isFinite(signalTtlMs) || signalTtlMs < 1) throw invalid("The signalling TTL is invalid.");

  let state = PEER_STATE.IDLE;
  let started = false;
  let closed = false;
  let providerIceServers = null;
  let credentialError = null;
  let lastError = null;
  let subscribed = false;
  let subscriptionPromise = null;
  let subscriptionGeneration = 0;
  const listeners = new Set();
  const signalListeners = new Set();
  const peerRoutes = new Map();
  const seenSignals = new Set();

  const emit = () => {
    const snapshot = getSnapshot();
    for (const listener of [...listeners]) listener(snapshot);
  };
  const transition = (next, error = null) => {
    state = next;
    lastError = safeError(error);
    emit();
  };
  const onConnected = (event = {}) => {
    try {
      if (!credentialProvider && Array.isArray(event.iceServers)) {
        // SignallingClient v1.2 validates TURN metadata before emitting it but
        // does not expose a credential expiry for publishable-key sessions.
        // Accept that trusted provider event without weakening direct callers,
        // which still require an explicit short-lived expiry by default.
        providerIceServers = validateIceServers({
          iceServers: event.iceServers,
          expiresAt: event.turnCredentialExpiresAt ?? event.expiresAt ?? null,
        }, { now: clock(), allowProviderManagedTurn: true });
      }
      credentialError = null;
      ensureSubscribed().catch((cause) => {
        if (closed) return;
        const recoveryError = new PeerTransportError(
          "SIGNALLING_UNAVAILABLE",
          "Managed signalling could not restore its subscription.",
          { retryable: true, cause },
        );
        transition(PEER_STATE.DISCONNECTED, recoveryError);
      });
    } catch (cause) {
      credentialError = cause;
      transition(PEER_STATE.FAILED, cause);
    }
  };
  const onDisconnected = ({ willReconnect } = {}) => {
    subscribed = false;
    subscriptionGeneration += 1;
    subscriptionPromise = null;
    if (!closed) transition(willReconnect ? PEER_STATE.CONNECTING : PEER_STATE.DISCONNECTED);
  };
  const onMessage = ({ data } = {}) => receive(data);
  const onDirect = ({ data } = {}) => receive(data);

  function receive(value) {
    if (closed) return;
    let envelope;
    try {
      envelope = parseSignallingEnvelope(value, { now: clock(), maxBytes: maxMessageBytes, schemaVersion });
    } catch {
      return;
    }
    if (envelope.toPlayerId !== localPlayerId || envelope.fromPlayerId !== remotePlayerId
      || seenSignals.has(envelope.signalId)) return;
    seenSignals.add(envelope.signalId);
    if (seenSignals.size > 512) seenSignals.delete(seenSignals.values().next().value);
    for (const listener of [...signalListeners]) listener(envelope);
  }

  function ensureSubscribed() {
    if (closed || !started) return Promise.resolve();
    if (subscribed) return Promise.resolve();
    if (subscriptionPromise) return subscriptionPromise;
    const generation = subscriptionGeneration;
    subscriptionPromise = Promise.resolve(client.subscribe(channel))
      .then(() => {
        if (closed || generation !== subscriptionGeneration) return;
        subscribed = true;
        transition(PEER_STATE.CONNECTED);
      })
      .finally(() => {
        if (generation === subscriptionGeneration) subscriptionPromise = null;
      });
    return subscriptionPromise;
  }

  async function start() {
    if (closed) throw new PeerTransportError("SIGNALLING_CLOSED", "Signalling is closed.");
    if (started) return getSnapshot();
    started = true;
    transition(PEER_STATE.SIGNALLING);
    client.on?.("connected", onConnected);
    client.on?.("disconnected", onDisconnected);
    client.on?.("message", onMessage);
    client.on?.("direct", onDirect);
    try {
      if (typeof client.connect === "function" && client.state !== "connected") await client.connect();
      if (credentialError) throw credentialError;
      await ensureSubscribed();
      return getSnapshot();
    } catch (cause) {
      const error = cause instanceof PeerTransportError
        ? cause
        : new PeerTransportError("SIGNALLING_UNAVAILABLE", "Managed signalling is unavailable.", {
          retryable: true,
          cause,
        });
      transition(PEER_STATE.FAILED, error);
      throw error;
    }
  }

  async function sendSignal({ matchId, toPlayerId, kind, payload = null }) {
    if (!started || closed) throw new PeerTransportError("SIGNALLING_CLOSED", "Signalling is not available.");
    const createdAt = clock();
    const envelope = createSignallingEnvelope({
      signalId: createSignalId(),
      matchId,
      fromPlayerId: localPlayerId,
      toPlayerId,
      kind,
      payload,
      createdAt,
      expiresAt: createdAt + signalTtlMs,
      schemaVersion,
    }, { maxBytes: maxMessageBytes });
    try {
      const providerPeerId = peerRoutes.get(toPlayerId);
      if (providerPeerId && typeof client.send === "function") await client.send(providerPeerId, envelope);
      else await client.publish(channel, envelope);
      return envelope.signalId;
    } catch (cause) {
      const error = new PeerTransportError("SIGNAL_SEND_FAILED", "The peer signal could not be sent.", {
        retryable: true,
        cause,
      });
      lastError = safeError(error);
      emit();
      throw error;
    }
  }

  async function getIceServers(context = {}) {
    if (credentialProvider) {
      const supplied = await credentialProvider({
        ...context,
        localPlayerId,
        signalChannel: channel,
      });
      return validateIceServers(supplied, { now: clock() });
    }
    return providerIceServers || validateIceServers([], { now: clock() });
  }

  function getSnapshot() {
    return Object.freeze({
      state,
      channel,
      localPlayerId,
      remotePlayerId,
      started,
      hasIceServers: Boolean(providerIceServers?.iceServers.length),
      turnCredentialExpiresAt: providerIceServers?.expiresAt ?? null,
      lastError,
    });
  }

  async function close() {
    if (closed) return;
    closed = true;
    subscriptionGeneration += 1;
    client.off?.("connected", onConnected);
    client.off?.("disconnected", onDisconnected);
    client.off?.("message", onMessage);
    client.off?.("direct", onDirect);
    if (started && subscribed) await client.unsubscribe?.(channel);
    subscribed = false;
    transition(PEER_STATE.CLOSED);
    signalListeners.clear();
    listeners.clear();
  }

  return Object.freeze({
    start,
    sendSignal,
    getIceServers,
    registerPeerRoute(playerId, providerPeerId) {
      requireTransportIdentifier(playerId, "player ID");
      if (typeof providerPeerId !== "string" || !providerPeerId) throw invalid("A provider peer ID is required.");
      peerRoutes.set(playerId, providerPeerId);
    },
    subscribeSignals(listener) {
      if (typeof listener !== "function") throw invalid("A signal listener is required.");
      signalListeners.add(listener);
      return () => signalListeners.delete(listener);
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw invalid("A state listener is required.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    close,
  });
}

export { SIGNAL_KIND };

function defaultSignalId() {
  return globalThis.crypto?.randomUUID?.().replaceAll("-", "_")
    || `signal_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function invalid(message) {
  return new PeerTransportError("INVALID_TRANSPORT_INPUT", message);
}

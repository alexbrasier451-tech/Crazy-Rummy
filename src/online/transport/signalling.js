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
  scheduler = globalThis,
  retryInitialMs = 250,
  retryMaximumMs = 2_000,
  operationTimeoutMs = 8_000,
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
  if (!scheduler || typeof scheduler.setTimeout !== "function" || typeof scheduler.clearTimeout !== "function"
    || !Number.isFinite(retryInitialMs) || retryInitialMs < 1
    || !Number.isFinite(retryMaximumMs) || retryMaximumMs < retryInitialMs
    || !Number.isFinite(operationTimeoutMs) || operationTimeoutMs < 1) {
    throw invalid("Signalling retry timing is invalid.");
  }

  let state = PEER_STATE.IDLE;
  let started = false;
  let closed = false;
  let providerIceServers = null;
  let credentialError = null;
  let lastError = null;
  let subscribed = false;
  let subscriptionPromise = null;
  let providerConnectPromise = null;
  let providerRefreshPromise = null;
  let providerRefreshActive = false;
  let providerRefreshRequired = false;
  let subscriptionGeneration = 0;
  let subscriptionRetryTimer = null;
  let subscriptionRetryAttempts = 0;
  const providerOperations = new Set();
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
      ensureSubscribed().then(clearSubscriptionRetry).catch(scheduleSubscriptionRetry);
    } catch (cause) {
      credentialError = cause;
      transition(PEER_STATE.FAILED, cause);
    }
  };
  const onDisconnected = ({ willReconnect } = {}) => {
    resetSubscription({ resetRetryAttempts: !providerRefreshActive });
    if (!closed) {
      transition(willReconnect ? PEER_STATE.CONNECTING : PEER_STATE.DISCONNECTED);
      if (!providerRefreshActive) {
        scheduleSubscriptionRetry(new PeerTransportError(
          "SIGNALLING_DISCONNECTED",
          "Managed signalling disconnected before the peer subscription could be restored.",
          { retryable: true },
        ));
      }
    }
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
    subscriptionPromise = withProviderDeadline(() => client.subscribe(channel), "subscribe")
      .then(() => {
        if (closed || generation !== subscriptionGeneration) return;
        subscribed = true;
        clearSubscriptionRetry();
        transition(PEER_STATE.CONNECTED);
      })
      .finally(() => {
        if (generation === subscriptionGeneration) subscriptionPromise = null;
      });
    return subscriptionPromise;
  }

  function resetSubscription({ resetRetryAttempts = true } = {}) {
    subscribed = false;
    subscriptionGeneration += 1;
    subscriptionPromise = null;
    clearSubscriptionRetry({ resetAttempts: resetRetryAttempts });
  }

  function requireProviderRefresh(cause = null, { resetRetryAttempts = false } = {}) {
    if (closed || !started) return;
    providerRefreshRequired = true;
    resetSubscription({ resetRetryAttempts });
    transition(PEER_STATE.DISCONNECTED, cause);
  }

  function refreshProviderConnection() {
    if (closed || !started) return Promise.resolve(getSnapshot());
    if (providerRefreshPromise) return providerRefreshPromise;
    providerRefreshPromise = (async () => {
      providerRefreshActive = true;
      clearSubscriptionRetry({ resetAttempts: false });
      transition(PEER_STATE.CONNECTING);
      try {
        // Android can preserve an SDK-level "connected" state while the
        // suspended WebSocket and its provider-side subscription are gone.
        // The SDK only permits connect() from idle/closed, so deliberately
        // create a fresh provider epoch before any WebRTC recovery signal.
        if (typeof client.close === "function" && !["idle", "closed"].includes(client.state)) {
          await withProviderDeadline(
            () => client.close(1000, "browser foreground recovery"),
            "foreground close",
          );
        }
        if (typeof client.connect === "function" && client.state !== "connected") {
          await withProviderDeadline(() => client.connect(), "foreground connect");
        }
        await ensureSubscribed();
        providerRefreshRequired = false;
        clearSubscriptionRetry();
        return getSnapshot();
      } catch (cause) {
        const error = cause instanceof PeerTransportError
          ? cause
          : new PeerTransportError(
            "SIGNALLING_REFRESH_FAILED",
            "Managed signalling could not establish a fresh foreground connection.",
            { retryable: true, cause },
          );
        providerRefreshRequired = true;
        transition(PEER_STATE.DISCONNECTED, error);
        scheduleSubscriptionRetry(error);
        throw error;
      } finally {
        providerRefreshActive = false;
        providerRefreshPromise = null;
      }
    })();
    return providerRefreshPromise;
  }

  function ensureProviderConnectedAndSubscribed() {
    if (closed || !started) return Promise.resolve();
    if (providerRefreshRequired) return refreshProviderConnection();
    const connected = client.state === "connected";
    if (connected || typeof client.connect !== "function") return ensureSubscribed();
    // Give a provider-declared automatic reconnect one bounded interval before
    // actively calling connect again. This avoids racing its normal reconnect
    // loop while still recovering if that loop stalls.
    if (client.state === "connecting" && subscriptionRetryAttempts <= 1) {
      return Promise.reject(new PeerTransportError(
        "SIGNALLING_CONNECTING",
        "Managed signalling is still reconnecting.",
        { retryable: true },
      ));
    }
    if (!providerConnectPromise) {
      providerConnectPromise = withProviderDeadline(() => client.connect(), "connect")
        .finally(() => { providerConnectPromise = null; });
    }
    return providerConnectPromise.then(() => ensureSubscribed());
  }

  function clearSubscriptionRetry({ resetAttempts = true } = {}) {
    if (subscriptionRetryTimer !== null) scheduler.clearTimeout(subscriptionRetryTimer);
    subscriptionRetryTimer = null;
    if (resetAttempts) subscriptionRetryAttempts = 0;
  }

  function scheduleSubscriptionRetry(cause) {
    if (closed || !started || subscriptionRetryTimer !== null || subscribed) return;
    const error = new PeerTransportError(
      "SIGNALLING_UNAVAILABLE",
      "Managed signalling could not restore its subscription.",
      { retryable: true, cause },
    );
    transition(PEER_STATE.DISCONNECTED, error);
    const delay = Math.min(retryInitialMs * (2 ** subscriptionRetryAttempts), retryMaximumMs);
    subscriptionRetryAttempts += 1;
    subscriptionRetryTimer = scheduler.setTimeout(() => {
      subscriptionRetryTimer = null;
      ensureProviderConnectedAndSubscribed().then(clearSubscriptionRetry).catch(scheduleSubscriptionRetry);
    }, delay);
  }

  function withProviderDeadline(operation, name) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const entry = { timer: null, reject };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        if (entry.timer !== null) scheduler.clearTimeout(entry.timer);
        providerOperations.delete(entry);
        callback(value);
      };
      entry.timer = scheduler.setTimeout(() => finish(reject, new PeerTransportError(
        "SIGNALLING_OPERATION_TIMEOUT",
        `Managed signalling ${name} did not settle in time.`,
        { retryable: true },
      )), operationTimeoutMs);
      providerOperations.add(entry);
      Promise.resolve().then(operation).then(
        (value) => finish(resolve, value),
        (cause) => finish(reject, cause),
      );
    });
  }

  function cancelProviderOperations() {
    for (const entry of [...providerOperations]) {
      if (entry.timer !== null) scheduler.clearTimeout(entry.timer);
      providerOperations.delete(entry);
      entry.reject(new PeerTransportError("SIGNALLING_CLOSED", "Signalling was closed while an operation was pending."));
    }
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
      if (typeof client.connect === "function" && client.state !== "connected") {
        await withProviderDeadline(() => client.connect(), "connect");
      }
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
      // Initial bootstrap has no established peer to recover. Preserve the
      // start contract so the runtime can release its provider lifecycle;
      // retry scheduling is for an already-started provider reconnect.
      transition(PEER_STATE.FAILED, error);
      throw error;
    }
  }

  async function sendSignal({ matchId, toPlayerId, kind, payload = null }) {
    if (!started || closed) throw new PeerTransportError("SIGNALLING_CLOSED", "Signalling is not available.");
    try {
      await ensureProviderConnectedAndSubscribed();
    } catch (cause) {
      const error = signalSendFailure(cause);
      throw error;
    }
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
      if (providerPeerId && typeof client.send === "function") {
        await withProviderDeadline(() => client.send(providerPeerId, envelope), "direct send");
      } else {
        await withProviderDeadline(() => client.publish(channel, envelope), "publish");
      }
      return envelope.signalId;
    } catch (cause) {
      const error = signalSendFailure(cause);
      throw error;
    }
  }

  function signalSendFailure(cause) {
    const error = new PeerTransportError("SIGNAL_SEND_FAILED", "The peer signal could not be sent.", {
      retryable: true,
      cause,
    });
    requireProviderRefresh(error);
    scheduleSubscriptionRetry(error);
    return error;
  }

  async function resume() {
    if (!started || closed) throw new PeerTransportError("SIGNALLING_CLOSED", "Signalling is not available.");
    requireProviderRefresh(new PeerTransportError(
      "SIGNALLING_FOREGROUND_REFRESH",
      "The browser returned to the active game.",
      { retryable: true },
    ), { resetRetryAttempts: true });
    return refreshProviderConnection();
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
    providerConnectPromise = null;
    providerRefreshRequired = false;
    clearSubscriptionRetry();
    cancelProviderOperations();
    client.off?.("connected", onConnected);
    client.off?.("disconnected", onDisconnected);
    client.off?.("message", onMessage);
    client.off?.("direct", onDirect);
    if (started && subscribed && typeof client.unsubscribe === "function") {
      await withProviderDeadline(() => client.unsubscribe(channel), "unsubscribe").catch(() => {});
    }
    subscribed = false;
    transition(PEER_STATE.CLOSED);
    signalListeners.clear();
    listeners.clear();
  }

  return Object.freeze({
    start,
    resume,
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

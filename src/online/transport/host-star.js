import {
  PEER_STATE,
  PeerTransportError,
  TRANSPORT_SCHEMA_VERSION,
  copyJson,
  requireTransportIdentifier,
} from "./contract.js";

const TOPOLOGY_MESSAGE = "crazy-rummy/topology-event";

export function createHostStarTransport({
  matchId,
  localPlayerId,
  hostPlayerId,
  seatPlayerIds,
  createPeer,
  schemaVersion = TRANSPORT_SCHEMA_VERSION,
} = {}) {
  requireTransportIdentifier(matchId, "match ID");
  requireTransportIdentifier(localPlayerId, "local player ID");
  requireTransportIdentifier(hostPlayerId, "host player ID");
  if (!Array.isArray(seatPlayerIds) || seatPlayerIds.length < 2 || seatPlayerIds.length > 6) {
    throw invalid("Host-star topology requires two to six seats.");
  }
  const seats = [...new Set(seatPlayerIds.map((id) => requireTransportIdentifier(id, "seat player ID")))];
  if (seats.length !== seatPlayerIds.length || !seats.includes(localPlayerId) || !seats.includes(hostPlayerId)) {
    throw invalid("Topology seats must be unique and include the local player and host.");
  }
  if (typeof createPeer !== "function") throw invalid("A per-peer connection factory is required.");

  const isHost = localPlayerId === hostPlayerId;
  const remoteIds = isHost ? seats.filter((id) => id !== localPlayerId) : [hostPlayerId];
  const peers = new Map();
  const unsubscribers = [];
  const stateListeners = new Set();
  const messageListeners = new Set();
  const routeChains = new Map();
  let state = PEER_STATE.IDLE;
  let started = false;
  let closed = false;

  for (const remotePlayerId of remoteIds) {
    const peer = createPeer({
      matchId,
      localPlayerId,
      remotePlayerId,
      // The host commits the lobby transition and subscribes first. The guest
      // receives its private bootstrap later, so it publishes the transient
      // SDP offer only after the host is already listening on the pair scope.
      offerer: !isHost,
      pairPlayerIds: Object.freeze([localPlayerId, remotePlayerId].sort()),
    });
    if (!peer || typeof peer.start !== "function" || typeof peer.send !== "function") {
      throw invalid("The peer factory returned an invalid connection.");
    }
    peers.set(remotePlayerId, peer);
    unsubscribers.push(peer.subscribe?.(() => refreshState()) || (() => {}));
    unsubscribers.push(peer.onMessage((message) => enqueue(
      `${remotePlayerId}:${message?.sourcePlayerId || "unknown"}:${message?.destinationPlayerId || "unknown"}`,
      () => receiveFrom(remotePlayerId, message),
    )));
  }

  function getSnapshot() {
    return Object.freeze({
      state,
      matchId,
      localPlayerId,
      hostPlayerId,
      role: isHost ? "host" : "guest",
      seatCount: seats.length,
      connections: Object.freeze([...peers.entries()].map(([playerId, peer]) => Object.freeze({
        playerId,
        state: peer.getSnapshot?.().state ?? PEER_STATE.IDLE,
      }))),
    });
  }

  function refreshState() {
    if (closed) return;
    const states = [...peers.values()].map((peer) => peer.getSnapshot?.().state ?? PEER_STATE.IDLE);
    if (states.some((value) => value === PEER_STATE.FAILED)) state = PEER_STATE.FAILED;
    else if (states.some((value) => [PEER_STATE.DISCONNECTED, PEER_STATE.CLOSED].includes(value))) {
      state = PEER_STATE.DISCONNECTED;
    }
    else if (states.length && states.every((value) => value === PEER_STATE.CONNECTED)) state = PEER_STATE.CONNECTED;
    else if (started) state = PEER_STATE.CONNECTING;
    else state = PEER_STATE.IDLE;
    const snapshot = getSnapshot();
    for (const listener of [...stateListeners]) listener(snapshot);
  }

  async function start() {
    if (closed) throw new PeerTransportError("TOPOLOGY_CLOSED", "The host-star transport is closed.");
    if (started) return getSnapshot();
    started = true;
    state = PEER_STATE.CONNECTING;
    await Promise.all([...peers.values()].map((peer) => peer.start()));
    refreshState();
    return getSnapshot();
  }

  async function send(destinationPlayerId, payload) {
    if (closed || state !== PEER_STATE.CONNECTED) {
      throw new PeerTransportError("TOPOLOGY_NOT_CONNECTED", "The host-star transport is not connected.", {
        retryable: !closed,
      });
    }
    requireTransportIdentifier(destinationPlayerId, "destination player ID");
    if (!seats.includes(destinationPlayerId) || destinationPlayerId === localPlayerId) {
      throw invalid("The topology destination is not a remote seat.");
    }
    const packet = {
      type: TOPOLOGY_MESSAGE,
      schemaVersion,
      sourcePlayerId: localPlayerId,
      destinationPlayerId,
      payload: copyJson(payload),
    };
    const nextHop = isHost ? destinationPlayerId : hostPlayerId;
    return peers.get(nextHop).send(packet);
  }

  async function broadcast(payload) {
    return Promise.all(seats
      .filter((playerId) => playerId !== localPlayerId)
      .map((playerId) => send(playerId, payload)));
  }

  async function resume() {
    if (closed) throw new PeerTransportError("TOPOLOGY_CLOSED", "The host-star transport is closed.");
    await Promise.all([...peers.values()].map((peer) => peer.resume?.()));
    refreshState();
    return getSnapshot();
  }

  async function receiveFrom(remotePlayerId, packet) {
    if (!packet || packet.type !== TOPOLOGY_MESSAGE || packet.schemaVersion !== schemaVersion) return;
    if (!seats.includes(packet.sourcePlayerId) || !seats.includes(packet.destinationPlayerId)) return;
    if (isHost) {
      if (packet.sourcePlayerId !== remotePlayerId) return;
      if (packet.destinationPlayerId !== localPlayerId) {
        await peers.get(packet.destinationPlayerId)?.send(copyJson(packet));
        return;
      }
    } else if (remotePlayerId !== hostPlayerId || packet.destinationPlayerId !== localPlayerId) {
      return;
    }
    for (const listener of [...messageListeners]) listener(copyJson(packet.payload), Object.freeze({
      sourcePlayerId: packet.sourcePlayerId,
      destinationPlayerId: localPlayerId,
    }));
  }

  function enqueue(key, operation) {
    const previous = routeChains.get(key) || Promise.resolve();
    const next = previous.then(operation, operation);
    const tracked = next.finally(() => {
      if (routeChains.get(key) === tracked) routeChains.delete(key);
    });
    routeChains.set(key, tracked);
    return tracked;
  }

  async function close() {
    if (closed) return;
    closed = true;
    await Promise.all([...peers.values()].map((peer) => peer.close()));
    for (const unsubscribe of unsubscribers) unsubscribe();
    state = PEER_STATE.CLOSED;
    const snapshot = getSnapshot();
    for (const listener of [...stateListeners]) listener(snapshot);
    stateListeners.clear();
    messageListeners.clear();
  }

  return Object.freeze({
    start,
    send,
    broadcast,
    resume,
    close,
    getSnapshot,
    subscribe(listener) {
      if (typeof listener !== "function") throw invalid("A topology state listener is required.");
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onMessage(listener) {
      if (typeof listener !== "function") throw invalid("A topology message listener is required.");
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
  });
}

function invalid(message) {
  return new PeerTransportError("INVALID_TRANSPORT_INPUT", message);
}

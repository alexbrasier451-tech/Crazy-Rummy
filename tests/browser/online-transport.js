import { connectionState } from "../../src/components/index.js";
import { RULES_VERSION, SCHEMA_VERSION } from "../../src/engine/index.js";
import {
  DEFAULT_TRANSPORT_PROTOCOL_VERSION,
  PEER_STATE,
  createHostStarTransport,
  createWebRtcPeerConnection
} from "../../src/online/index.js";

const MATCH_ID = "browser_stage5";
const HOST_ID = "host";
const SEATS = Object.freeze([HOST_ID, "guest_one", "guest_two"]);
const PROOFS = Object.freeze({
  host: "host-browser-seat-proof-000001",
  guest_one: "guest-one-seat-proof-000001",
  guest_two: "guest-two-seat-proof-000001"
});
const VERSION_FIELDS = Object.freeze({
  transportProtocolVersion: DEFAULT_TRANSPORT_PROTOCOL_VERSION,
  engineSchemaVersion: SCHEMA_VERSION,
  engineRulesVersion: RULES_VERSION
});

const statusRoot = document.querySelector("#transport-status");
const detail = document.querySelector("#transport-detail");
const pairs = new Map();
const topologies = new Map();
const receivedByGuestTwo = [];

function signallingPair(firstId, secondId) {
  const listeners = new Map([[firstId, new Set()], [secondId, new Set()]]);
  const endpoint = (localPlayerId, remotePlayerId) => ({
    async start() {},
    async getIceServers() { return { iceServers: [], expiresAt: null }; },
    subscribeSignals(listener) {
      listeners.get(localPlayerId).add(listener);
      return () => listeners.get(localPlayerId).delete(listener);
    },
    async sendSignal(input) {
      const envelope = {
        ...input,
        fromPlayerId: localPlayerId,
        toPlayerId: remotePlayerId
      };
      queueMicrotask(() => {
        for (const listener of listeners.get(remotePlayerId)) listener(envelope);
      });
      return `${localPlayerId}-${input.kind}`;
    }
  });
  return {
    first: endpoint(firstId, secondId),
    second: endpoint(secondId, firstId)
  };
}

function peerPair(guestId) {
  const signalling = signallingPair(HOST_ID, guestId);
  const common = {
    matchId: MATCH_ID,
    ...VERSION_FIELDS,
    verifyRemoteSeatProof: ({ remotePlayerId, seatProof }) =>
      PROOFS[remotePlayerId] === seatProof,
    rtcPeerConnectionFactory: (configuration) => new RTCPeerConnection(configuration)
  };
  return {
    host: createWebRtcPeerConnection({
      ...common,
      localPlayerId: HOST_ID,
      remotePlayerId: guestId,
      localSeatProof: PROOFS.host,
      offerer: true,
      signalling: signalling.first
    }),
    guest: createWebRtcPeerConnection({
      ...common,
      localPlayerId: guestId,
      remotePlayerId: HOST_ID,
      localSeatProof: PROOFS[guestId],
      offerer: false,
      signalling: signalling.second
    })
  };
}

for (const guestId of SEATS.slice(1)) pairs.set(guestId, peerPair(guestId));

function topology(localPlayerId) {
  return createHostStarTransport({
    matchId: MATCH_ID,
    localPlayerId,
    hostPlayerId: HOST_ID,
    seatPlayerIds: SEATS,
    createPeer({ remotePlayerId }) {
      return localPlayerId === HOST_ID
        ? pairs.get(remotePlayerId).host
        : pairs.get(localPlayerId).guest;
    }
  });
}

for (const seatId of SEATS) topologies.set(seatId, topology(seatId));

function render() {
  const host = topologies.get(HOST_ID).getSnapshot();
  const state = host.state === PEER_STATE.CONNECTED
    ? "online"
    : host.state === PEER_STATE.DISCONNECTED ? "offline" : "connecting";
  statusRoot.replaceChildren(connectionState({
    state,
    label: host.state === PEER_STATE.CONNECTED
      ? "All peer links connected"
      : host.state === PEER_STATE.DISCONNECTED
        ? "A peer link closed"
        : "Connecting peer links",
    detail: `${host.connections.filter((connection) => connection.state === PEER_STATE.CONNECTED).length} of ${host.connections.length} host links connected`,
    announce: true
  }));
  detail.textContent = `Host ${host.connections.length} links · guests ${SEATS.slice(1)
    .map((seatId) => topologies.get(seatId).getSnapshot().connections.length)
    .join(" and ")} link each`;
}

function waitUntil(predicate, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const check = () => {
      if (predicate()) {
        resolve();
      } else if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error("Peer transport acceptance timed out."));
      } else {
        setTimeout(check, 20);
      }
    };
    check();
  });
}

for (const item of topologies.values()) item.subscribe(render);
topologies.get("guest_two").onMessage((payload) => receivedByGuestTwo.push(payload.index));
render();

const ready = (async () => {
  await Promise.all([...topologies.values()].map((item) => item.start()));
  await waitUntil(() =>
    [...topologies.values()].every((item) => item.getSnapshot().state === PEER_STATE.CONNECTED)
  );
  render();
})();

globalThis.transportHarness = Object.freeze({
  ready,
  snapshots: () => Object.fromEntries([...topologies].map(([seatId, item]) => [
    seatId,
    item.getSnapshot()
  ])),
  receivedByGuestTwo: () => [...receivedByGuestTwo],
  async sendOrdered() {
    await ready;
    await topologies.get("guest_one").send("guest_two", { index: 1 });
    await topologies.get("guest_one").send("guest_two", { index: 2 });
    await topologies.get("guest_one").send("guest_two", { index: 3 });
    await waitUntil(() => receivedByGuestTwo.length === 3);
  },
  async closeGuestOne() {
    await topologies.get("guest_one").close();
    await waitUntil(() => topologies.get(HOST_ID).getSnapshot().state === PEER_STATE.DISCONNECTED);
  },
  async close() {
    await Promise.all([...topologies.values()].map((item) => item.close()));
  }
});

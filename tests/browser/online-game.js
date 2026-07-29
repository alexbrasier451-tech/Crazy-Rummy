import {
  COMMAND_TYPE,
  RULES_VERSION,
  SCHEMA_VERSION,
  createLobbyState,
  createSeat,
  executeCommand,
  initialDealerSeatIdFor
} from "../../src/engine/index.js";
import {
  DEFAULT_TRANSPORT_PROTOCOL_VERSION,
  PEER_STATE,
  createHostStarTransport,
  createOnlineMatchSession,
  createWebRtcPeerConnection
} from "../../src/online/index.js";
import { gameScreen } from "../../src/screens/game.js";

const MATCH_ID = "stage6-browser-match";
const STAGE6_SEATS = Object.freeze([
  Object.freeze({ seatId: "a", playerId: "player-a", displayName: "Aster" }),
  Object.freeze({ seatId: "b", playerId: "player-b", displayName: "Blake" }),
  Object.freeze({ seatId: "c", playerId: "player-c", displayName: "Casey" })
]);
const HOST_PLAYER_ID = STAGE6_SEATS[0].playerId;
const PLAYER_IDS = STAGE6_SEATS.map((seat) => seat.playerId);
const ROOM_SECRET = "stage6-browser-room-secret";
const SEAT_SECRETS = Object.freeze({
  a: "stage6-browser-secret-a",
  b: "stage6-browser-secret-b",
  c: "stage6-browser-secret-c"
});
const PROOFS = Object.freeze(Object.fromEntries(STAGE6_SEATS.map((seat) => [
  seat.playerId,
  `stage6-browser-proof-${seat.seatId}-000001`
])));
const VERSION_FIELDS = Object.freeze({
  transportProtocolVersion: DEFAULT_TRANSPORT_PROTOCOL_VERSION,
  engineSchemaVersion: SCHEMA_VERSION,
  engineRulesVersion: RULES_VERSION
});

function threeSeatState() {
  const seats = STAGE6_SEATS.map((seat) => createSeat({ ...seat, ready: true }));
  const initial = createLobbyState({
    gameId: MATCH_ID,
    hostSeatId: "a",
    seats
  });
  let seedNumber = 0;
  let shuffleSeed;
  do {
    shuffleSeed = `stage6-browser-seed-${++seedNumber}`;
  } while (initialDealerSeatIdFor(shuffleSeed, STAGE6_SEATS.map((seat) => seat.seatId)) !== "b");
  const started = executeCommand(initial, {
    type: COMMAND_TYPE.START_GAME,
    gameId: MATCH_ID,
    actorSeatId: "a",
    clientCommandId: `${MATCH_ID}:start`,
    expectedRevision: initial.revision,
    initialDealerSeatId: "b",
    shuffleSeed
  });
  if (!started.accepted) throw new Error(`Could not start browser fixture: ${started.reason}`);
  return started.state;
}

function stage6Bootstraps() {
  const secretsByPlayerId = Object.fromEntries(STAGE6_SEATS.map((seat) => [
    seat.playerId,
    SEAT_SECRETS[seat.seatId]
  ]));
  return Object.fromEntries(STAGE6_SEATS.map((localSeat) => {
    const requiredPeers = STAGE6_SEATS.filter((seat) =>
      localSeat.playerId === HOST_PLAYER_ID
        ? seat.playerId !== localSeat.playerId
        : seat.playerId === HOST_PLAYER_ID
    );
    return [localSeat.seatId, {
      version: 1,
      matchId: MATCH_ID,
      localSeatId: localSeat.seatId,
      localPlayerId: localSeat.playerId,
      hostPlayerId: HOST_PLAYER_ID,
      seats: STAGE6_SEATS.map((seat) => ({ ...seat })),
      roomSecret: ROOM_SECRET,
      seatSecret: SEAT_SECRETS[localSeat.seatId],
      ...(localSeat.playerId === HOST_PLAYER_ID
        ? { seatSecretById: secretsByPlayerId }
        : {}),
      localSeatProof: PROOFS[localSeat.playerId],
      remoteSeatProofs: Object.fromEntries(requiredPeers.map((seat) => [
        seat.playerId,
        PROOFS[seat.playerId]
      ])),
      pairScopes: Object.fromEntries(requiredPeers.map((seat) => [
        seat.playerId,
        `stage6-browser-pair-${[localSeat.playerId, seat.playerId].sort().join("-")}`
      ])),
      engineSchemaVersion: SCHEMA_VERSION,
      rulesVersion: RULES_VERSION,
      transportProtocolVersion: DEFAULT_TRANSPORT_PROTOCOL_VERSION
    }];
  }));
}

function withoutPrivateHand(view) {
  const result = structuredClone(view);
  if (result?.hand) delete result.hand.ownHandCardIds;
  return result;
}

const initialState = threeSeatState();
const bootstraps = stage6Bootstraps();
const pairs = new Map();
const topologies = new Map();
const sessions = new Map();

function signallingPair(firstId, secondId) {
  const listeners = new Map([[firstId, new Set()], [secondId, new Set()]]);
  const endpoint = (localPlayerId, remotePlayerId) => ({
    async start() {},
    async getIceServers() {
      return { iceServers: [], expiresAt: null };
    },
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

function peerPair(guestPlayerId) {
  const signalling = signallingPair(HOST_PLAYER_ID, guestPlayerId);
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
      localPlayerId: HOST_PLAYER_ID,
      remotePlayerId: guestPlayerId,
      localSeatProof: PROOFS[HOST_PLAYER_ID],
      offerer: true,
      signalling: signalling.first
    }),
    guest: createWebRtcPeerConnection({
      ...common,
      localPlayerId: guestPlayerId,
      remotePlayerId: HOST_PLAYER_ID,
      localSeatProof: PROOFS[guestPlayerId],
      offerer: false,
      signalling: signalling.second
    })
  };
}

for (const guestPlayerId of PLAYER_IDS.slice(1)) {
  pairs.set(guestPlayerId, peerPair(guestPlayerId));
}

function topology(localPlayerId) {
  return createHostStarTransport({
    matchId: MATCH_ID,
    localPlayerId,
    hostPlayerId: HOST_PLAYER_ID,
    seatPlayerIds: PLAYER_IDS,
    createPeer({ remotePlayerId }) {
      return localPlayerId === HOST_PLAYER_ID
        ? pairs.get(remotePlayerId).host
        : pairs.get(localPlayerId).guest;
    }
  });
}

for (const playerId of PLAYER_IDS) topologies.set(playerId, topology(playerId));

function holdCommands(transport) {
  const held = [];
  let holding = true;
  return Object.freeze({
    start: (...args) => transport.start(...args),
    close: (...args) => transport.close(...args),
    getSnapshot: () => transport.getSnapshot(),
    subscribe: (listener) => transport.subscribe(listener),
    onMessage: (listener) => transport.onMessage(listener),
    send(destinationPlayerId, payload) {
      if (holding && payload?.type === "COMMAND") {
        held.push({ destinationPlayerId, payload: structuredClone(payload) });
        return Promise.resolve();
      }
      return transport.send(destinationPlayerId, payload);
    },
    async release() {
      holding = false;
      await Promise.all(held.splice(0).map(({ destinationPlayerId, payload }) =>
        transport.send(destinationPlayerId, payload)
      ));
    },
    heldCount: () => held.length
  });
}

const guestBTransport = holdCommands(topologies.get("player-b"));
const recoveryStorage = Object.freeze({
  read() { return null; },
  write() { return null; },
  remove() {}
});

for (const seat of STAGE6_SEATS) {
  const session = createOnlineMatchSession({
    bootstrap: {
      ...bootstraps[seat.seatId],
      localSeatProof: PROOFS[seat.playerId]
    },
    playerId: seat.playerId,
    initialState: seat.seatId === "a" ? initialState : undefined,
    transport: seat.seatId === "b" ? guestBTransport : topologies.get(seat.playerId),
    recoveryStorage
  });
  sessions.set(seat.seatId, session);
}

function waitUntil(predicate, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const check = () => {
      if (predicate()) resolve();
      else if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error("Stage 6 online game acceptance timed out."));
      } else {
        setTimeout(check, 20);
      }
    };
    check();
  });
}

const router = Object.freeze({
  addBackLayer() {
    return () => {};
  }
});

function mountViews() {
  for (const seat of STAGE6_SEATS) {
    const root = document.querySelector(`#seat-${seat.seatId}`);
    root.replaceChildren(gameScreen({
      navigate(path) {
        root.dataset.navigation = path;
      },
      router,
      onlineGameSession: sessions.get(seat.seatId)
    }));
  }
}

const ready = (async () => {
  await Promise.all([...sessions.values()].map((session) => session.start()));
  await waitUntil(() => [...sessions.values()].every((session) =>
    session.getSnapshot().view?.revision === initialState.revision
  ));
  mountViews();
})();

function snapshots() {
  return Object.fromEntries([...sessions].map(([seatId, session]) => [
    seatId,
    session.getSnapshot()
  ]));
}

globalThis.onlineGameHarness = Object.freeze({
  ready,
  snapshots,
  topologySnapshots: () => Object.fromEntries([...topologies].map(([playerId, item]) => [
    playerId,
    item.getSnapshot()
  ])),
  privateCards: () => Object.fromEntries(STAGE6_SEATS.map((seat) => [
    seat.seatId,
    [...document.querySelectorAll(
      `#seat-${seat.seatId} [data-private-hand='true'] [data-card-id]`
    )].map((node) => node.dataset.cardId)
  ])),
  publicProjections: () => Object.fromEntries([...sessions].map(([seatId, session]) => [
    seatId,
    withoutPrivateHand(session.getSnapshot().view)
  ])),
  hostRevision: () => sessions.get("a").getSnapshot().view.revision,
  pendingOpening() {
    const result = sessions.get("b").submit(COMMAND_TYPE.DEALER_INITIAL_DISCARD, {
      clientCommandId: "stage6-browser-pending-opening",
      cardId: initialState.hand.handsBySeat.b[0]
    });
    return {
      result,
      action: sessions.get("b").getSnapshot().lastAction,
      heldCount: guestBTransport.heldCount()
    };
  },
  async releaseOpening() {
    await guestBTransport.release();
    await waitUntil(() =>
      sessions.get("b").getSnapshot().lastAction?.phase === "ACCEPTED"
      && [...sessions.values()].every((session) => session.getSnapshot().view?.revision === 2)
    );
    return snapshots();
  },
  async close() {
    await Promise.all([...sessions.values()].map((session) => session.dispose()));
  }
});

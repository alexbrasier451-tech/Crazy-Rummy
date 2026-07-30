import {
  COMMAND_TYPE,
  RULES_VERSION,
  SCHEMA_VERSION,
  createLobbyState,
  createSeat,
  executeCommand,
  initialDealerSeatIdFor,
  publicView
} from "../../src/engine/index.js";
import {
  DEFAULT_TRANSPORT_PROTOCOL_VERSION,
  PEER_STATE,
  createClientSyncSession,
  createHostSyncSession,
  createOnlineMatchSession
} from "../../src/online/index.js";

export const STAGE6_SEATS = Object.freeze([
  Object.freeze({ seatId: "a", playerId: "player-a", displayName: "Aster" }),
  Object.freeze({ seatId: "b", playerId: "player-b", displayName: "Blake" }),
  Object.freeze({ seatId: "c", playerId: "player-c", displayName: "Casey" })
]);

export const STAGE6_MATCH_ID = "stage6-match";
export const STAGE6_ROOM_SECRET = "stage6-room-secret-opaque";
export const STAGE6_SEAT_SECRETS = Object.freeze({
  a: "stage6-seat-secret-a",
  b: "stage6-seat-secret-b",
  c: "stage6-seat-secret-c"
});

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function noopRecoveryStorage() {
  const removedMatches = new Set();
  return Object.freeze({
    read() { return null; },
    write() { return null; },
    writeComposition() { return null; },
    remove(matchId) { removedMatches.add(matchId); },
    wasRemoved: (matchId) => removedMatches.has(matchId)
  });
}

function quietScheduler() {
  const tasks = [];
  function nextPendingTask() {
    return tasks.find((task) => !task.cancelled && !task.ran) ?? null;
  }
  return Object.freeze({
    setTimeout(callback, delay) {
      const task = { callback, delay, cancelled: false, ran: false };
      tasks.push(task);
      return task;
    },
    clearTimeout(task) {
      task.cancelled = true;
    },
    runNext() {
      const task = nextPendingTask();
      if (!task) return false;
      task.ran = true;
      task.callback();
      return true;
    },
    pending: () => tasks.filter((task) => !task.cancelled && !task.ran)
  });
}

export function createThreeSeatState({
  matchId = STAGE6_MATCH_ID,
  dealerSeatId = "b",
  seedPrefix = "stage6-seed"
} = {}) {
  const seats = STAGE6_SEATS.map((seat) => createSeat({ ...seat, ready: true }));
  const initial = createLobbyState({
    gameId: matchId,
    hostSeatId: STAGE6_SEATS[0].seatId,
    seats
  });
  let seedNumber = 0;
  let shuffleSeed;
  do {
    shuffleSeed = `${seedPrefix}-${++seedNumber}`;
  } while (initialDealerSeatIdFor(shuffleSeed, STAGE6_SEATS.map((seat) => seat.seatId)) !== dealerSeatId);
  const started = executeCommand(initial, {
    type: COMMAND_TYPE.START_GAME,
    gameId: matchId,
    actorSeatId: initial.hostSeatId,
    clientCommandId: `${matchId}:start`,
    expectedRevision: initial.revision,
    initialDealerSeatId: dealerSeatId,
    shuffleSeed
  });
  if (!started.accepted) throw new Error(`Could not create Stage 6 state: ${started.reason}`);
  return started.state;
}

export function createStage6Bootstraps({ matchId = STAGE6_MATCH_ID } = {}) {
  const hostPlayerId = STAGE6_SEATS[0].playerId;
  const proofsByPlayerId = Object.fromEntries(STAGE6_SEATS.map((seat) => [
    seat.playerId,
    `stage6-seat-proof-${seat.seatId}-000001`
  ]));
  const secretsByPlayerId = Object.fromEntries(STAGE6_SEATS.map((seat) => [
    seat.playerId,
    STAGE6_SEAT_SECRETS[seat.seatId]
  ]));
  return Object.fromEntries(STAGE6_SEATS.map((localSeat) => {
    const requiredPeers = STAGE6_SEATS.filter((seat) =>
      localSeat.playerId === hostPlayerId
        ? seat.playerId !== localSeat.playerId
        : seat.playerId === hostPlayerId
    );
    const pairScopes = Object.fromEntries(requiredPeers
      .map((seat) => [
        seat.playerId,
        `stage6-pair-${[localSeat.playerId, seat.playerId].sort().join("-")}`
      ]));
    const remoteSeatProofs = Object.fromEntries(requiredPeers.map((seat) => [
      seat.playerId,
      proofsByPlayerId[seat.playerId]
    ]));
    const seats = STAGE6_SEATS.map((seat) => ({ ...seat }));
    return [localSeat.seatId, Object.freeze({
      version: 1,
      matchId,
      localSeatId: localSeat.seatId,
      localPlayerId: localSeat.playerId,
      hostPlayerId,
      seats,
      roomSecret: STAGE6_ROOM_SECRET,
      seatSecret: STAGE6_SEAT_SECRETS[localSeat.seatId],
      ...(localSeat.playerId === hostPlayerId
        ? { seatSecretById: secretsByPlayerId }
        : {}),
      localSeatProof: proofsByPlayerId[localSeat.playerId],
      remoteSeatProofs,
      pairScopes,
      engineSchemaVersion: SCHEMA_VERSION,
      rulesVersion: RULES_VERSION,
      transportProtocolVersion: DEFAULT_TRANSPORT_PROTOCOL_VERSION
    })];
  }));
}

export function createControlledTopologyNetwork({
  playerIds = STAGE6_SEATS.map((seat) => seat.playerId)
} = {}) {
  const queue = [];
  const endpoints = new Map();
  const delivered = [];

  function endpoint(localPlayerId) {
    if (endpoints.has(localPlayerId)) return endpoints.get(localPlayerId);
    let state = PEER_STATE.IDLE;
    const connectionStates = new Map();
    let receiver = () => {};
    const stateListeners = new Set();
    let resumeCount = 0;
    const value = Object.freeze({
      async start() {
        state = PEER_STATE.CONNECTED;
        const snapshot = value.getSnapshot();
        for (const listener of stateListeners) listener(snapshot);
        return snapshot;
      },
      send(destinationPlayerId, payload) {
        if (state !== PEER_STATE.CONNECTED) throw new Error("Controlled topology is not connected.");
        queue.push({
          fromPlayerId: localPlayerId,
          destinationPlayerId,
          payload: clone(payload)
        });
        return Promise.resolve();
      },
      onMessage(listener) {
        receiver = listener;
        return () => {
          if (receiver === listener) receiver = () => {};
        };
      },
      subscribe(listener) {
        stateListeners.add(listener);
        return () => stateListeners.delete(listener);
      },
      getSnapshot() {
        return Object.freeze({
          state,
          localPlayerId,
          connections: playerIds
            .filter((playerId) => playerId !== localPlayerId)
            .map((playerId) => Object.freeze({
              playerId,
              state: connectionStates.get(playerId) ?? state
            }))
        });
      },
      async close() {
        state = PEER_STATE.CLOSED;
        const snapshot = value.getSnapshot();
        for (const listener of stateListeners) listener(snapshot);
      },
      async resume() {
        resumeCount += 1;
        value._setState(PEER_STATE.DISCONNECTED);
        await Promise.resolve();
        value._setState(PEER_STATE.CONNECTED);
        return value.getSnapshot();
      },
      _receive(message) {
        return receiver(clone(message.payload), Object.freeze({
          sourcePlayerId: message.fromPlayerId,
          destinationPlayerId: localPlayerId
        }));
      },
      _setState(nextState, nextConnections = {}) {
        state = nextState;
        connectionStates.clear();
        for (const [playerId, connectionState] of Object.entries(nextConnections)) {
          connectionStates.set(playerId, connectionState);
        }
        const snapshot = value.getSnapshot();
        for (const listener of stateListeners) listener(snapshot);
        return snapshot;
      },
      _resumeCount() { return resumeCount; }
    });
    endpoints.set(localPlayerId, value);
    return value;
  }

  for (const playerId of playerIds) endpoint(playerId);

  function deliverAt(index = 0) {
    if (index < 0 || index >= queue.length) return null;
    const [message] = queue.splice(index, 1);
    const result = endpoints.get(message.destinationPlayerId)?._receive(message);
    delivered.push({ ...clone(message), result: clone(result) });
    return { message, result };
  }

  return Object.freeze({
    endpoint,
    queue,
    delivered,
    deliverAt,
    deliverWhere(predicate) {
      const index = queue.findIndex(predicate);
      return index < 0 ? null : deliverAt(index);
    },
    dropWhere(predicate) {
      const index = queue.findIndex(predicate);
      return index < 0 ? null : queue.splice(index, 1)[0];
    },
    duplicateWhere(predicate) {
      const index = queue.findIndex(predicate);
      if (index < 0) return false;
      queue.splice(index + 1, 0, clone(queue[index]));
      return true;
    },
    inject(fromPlayerId, destinationPlayerId, payload) {
      queue.push({ fromPlayerId, destinationPlayerId, payload: clone(payload) });
    },
    flush(limit = 20_000) {
      let count = 0;
      while (queue.length) {
        deliverAt(0);
        count += 1;
        if (count > limit) throw new Error("Controlled topology did not settle.");
      }
      return count;
    }
  });
}

export function withoutPrivateHand(view) {
  const result = clone(view);
  if (result?.hand) {
    delete result.hand.ownHandCardIds;
    if (result.hand.result) delete result.hand.result.ownScoreEntry;
  }
  for (const hand of result?.completedHands ?? []) {
    if (hand?.result) delete hand.result.ownScoreEntry;
  }
  return result;
}

export function createOnlineMatchFixture({
  state = createThreeSeatState(),
  network = createControlledTopologyNetwork(),
  visibilityBySeat = {},
  clock = () => Date.now()
} = {}) {
  const bootstraps = createStage6Bootstraps({ matchId: state.gameId });
  const sessions = {};
  const clientSchedulers = {};
  const sessionSchedulers = {};
  let hostSync = null;
  const clientSyncs = {};
  const storage = noopRecoveryStorage();

  for (const seat of STAGE6_SEATS) {
    const scheduler = quietScheduler();
    const sessionScheduler = quietScheduler();
    clientSchedulers[seat.seatId] = scheduler;
    sessionSchedulers[seat.seatId] = sessionScheduler;
    sessions[seat.seatId] = createOnlineMatchSession({
      bootstrap: bootstraps[seat.seatId],
      playerId: seat.playerId,
      initialState: seat.seatId === "a" ? state : undefined,
      transport: network.endpoint(seat.playerId),
      visibility: visibilityBySeat[seat.seatId],
      clock,
      scheduler: sessionScheduler,
      recoveryStorage: storage,
      createHostSession(options) {
        hostSync = createHostSyncSession(options);
        return hostSync;
      },
      createClientSession(options) {
        const sync = createClientSyncSession({ ...options, scheduler });
        clientSyncs[seat.seatId] = sync;
        return sync;
      }
    });
  }

  return Object.freeze({
    state,
    bootstraps,
    sessions,
    network,
    recoveryStorage: storage,
    clientSchedulers,
    sessionSchedulers,
    get hostSync() { return hostSync; },
    clientSyncs,
    async start({ flush = true } = {}) {
      await Promise.all(Object.values(sessions).map((session) => session.start()));
      if (flush) network.flush();
      return this;
    },
    authoritativeState() {
      return hostSync.getState();
    },
    sessionForSeat(seatId) {
      return sessions[seatId];
    },
    submit(seatId, type, payload = {}, { flush = true } = {}) {
      const authoritative = hostSync.getState();
      const result = sessions[seatId].submit(type, {
        expectedRevision: authoritative.revision,
        ...(authoritative.hand ? { handId: authoritative.hand.id } : {}),
        ...payload
      });
      if (flush) network.flush();
      return result;
    },
    assertableConvergence() {
      const authoritative = hostSync.getState();
      return Object.fromEntries(STAGE6_SEATS.map(({ seatId }) => {
        const view = sessions[seatId].getSnapshot().view;
        return [seatId, {
          publicProjection: withoutPrivateHand(view),
          expectedPublicProjection: publicView(authoritative),
          ownHandCardIds: view?.hand?.ownHandCardIds ?? [],
          expectedOwnHandCardIds: authoritative.hand?.handsBySeat?.[seatId] ?? []
        }];
      }));
    },
    async dispose() {
      await Promise.all(Object.values(sessions).map((session) => session.dispose()));
    }
  });
}

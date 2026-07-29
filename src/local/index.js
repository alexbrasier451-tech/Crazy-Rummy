import {
  COMMAND_TYPE,
  LIFECYCLE,
  PHASE,
  assertStateInvariants,
  cloneAndFreezeState,
  createLobbyState,
  createSeat,
  executeCommand,
  initialDealerSeatIdFor,
  migrateSnapshot,
  playerView
} from "../engine/index.js";
import {
  createCompletedMatchSummary,
  createCompletedSummaryStorage
} from "./completed-summary.js";

/** Versioned keys deliberately separate recoverable authority from UI settings. */
export const LOCAL_STORAGE_VERSION = 1;
export const LOCAL_STORAGE_KEYS = Object.freeze({
  session: "crazy-rummy.local.v1.session",
  localSeat: "crazy-rummy.local.v1.local-seat",
  identity: "crazy-rummy.local.v1.identity",
  preferences: "crazy-rummy.local.v1.preferences",
  completedSummary: "crazy-rummy.local.v1.completed-summary"
});

export const DEFAULT_LOCAL_SEATS = Object.freeze(["north", "east", "south"]);
export const DEFAULT_LOCAL_GAME_ID = "local-fixture";
export const DEFAULT_LOCAL_SHUFFLE_SEED = "local-fixture-seed";
// Re-export the command/lifecycle vocabulary needed by a local UI without
// making it reach into an engine implementation module.
export { COMMAND_TYPE, LIFECYCLE, PHASE };

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
}

function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (isRecord(value)) Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function storageRecord(value) {
  return { version: LOCAL_STORAGE_VERSION, value };
}

function readRecord(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    if (typeof raw !== "string") return null;
    const record = JSON.parse(raw);
    return isRecord(record) && record.version === LOCAL_STORAGE_VERSION ? record.value : null;
  } catch {
    return null;
  }
}

function writeRecord(storage, key, value) {
  try {
    storage?.setItem?.(key, JSON.stringify(storageRecord(value)));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function removeRecord(storage, key) {
  try {
    storage?.removeItem?.(key);
  } catch {
    // Storage being unavailable must not prevent a purely local game.
  }
}

/** A small browser-localStorage compatible store for tests and local previews. */
export function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); }
  };
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? createMemoryStorage();
  } catch {
    return createMemoryStorage();
  }
}

function normalizeSeats(seats) {
  const source = seats ?? DEFAULT_LOCAL_SEATS.map((seatId) => ({
    seatId,
    playerId: `player-${seatId}`,
    displayName: seatId,
    ready: true
  }));
  if (!Array.isArray(source) || source.length < 2 || source.length > 6) {
    throw new TypeError("The local fixture requires between two and six seats.");
  }
  return source.map((seat) => createSeat({ ...seat, ready: seat.ready ?? true }));
}

function fixtureState({ gameId, shuffleSeed, seats }) {
  const normalizedSeats = normalizeSeats(seats);
  const seatIds = normalizedSeats.map((seat) => seat.seatId);
  const initial = createLobbyState({
    gameId,
    hostSeatId: seatIds[0],
    seats: normalizedSeats
  });
  const start = executeCommand(initial, {
    type: COMMAND_TYPE.START_GAME,
    gameId: initial.gameId,
    actorSeatId: initial.hostSeatId,
    clientCommandId: "local-fixture-start",
    expectedRevision: initial.revision,
    initialDealerSeatId: initialDealerSeatIdFor(shuffleSeed, seatIds),
    shuffleSeed
  });
  if (!start.accepted) throw new Error(`Could not start local fixture: ${start.reason}`);
  return start.state;
}

function restoredState(storage, expectedGameId) {
  const candidate = readRecord(storage, LOCAL_STORAGE_KEYS.session);
  if (!isRecord(candidate) || (expectedGameId && candidate.gameId !== expectedGameId)) return null;
  // The public migration boundary verifies the schema/rules pair before the
  // authoritative invariant boundary validates all private state and ledger.
  if (!migrateSnapshot(candidate).ok) return null;
  try {
    assertStateInvariants(candidate);
    return cloneAndFreezeState(candidate);
  } catch {
    return null;
  }
}

function summaryFor(state, localSeatId) {
  if (state.lifecycle !== LIFECYCLE.COMPLETE) return null;
  return createCompletedMatchSummary(playerView(state, localSeatId));
}

function commandNeedsHand(type) {
  return ![
    COMMAND_TYPE.JOIN_SEAT,
    COMMAND_TYPE.LEAVE_SEAT,
    COMMAND_TYPE.SET_SEAT_READY,
    COMMAND_TYPE.START_GAME
  ].includes(type);
}

/**
 * Create a browser-native local authority harness. Commands always pass through
 * the Phase 2 facade; this layer only fills transport-like envelope fields and
 * persists state after an accepted result.
 */
export function createLocalGameSession(options = {}) {
  const storage = options.storage ?? defaultStorage();
  const completedSummaryStorage = createCompletedSummaryStorage({
    storage,
    key: LOCAL_STORAGE_KEYS.completedSummary,
    storageVersion: LOCAL_STORAGE_VERSION
  });
  const gameId = options.gameId ?? DEFAULT_LOCAL_GAME_ID;
  const shuffleSeed = options.shuffleSeed ?? DEFAULT_LOCAL_SHUFFLE_SEED;
  let persistenceError = null;
  let state = restoredState(storage, options.gameId);
  if (!state) {
    removeRecord(storage, LOCAL_STORAGE_KEYS.session);
    state = fixtureState({ gameId, shuffleSeed, seats: options.seats });
  }

  const seatIds = Object.keys(state.seats);
  let localSeatId = readRecord(storage, LOCAL_STORAGE_KEYS.localSeat) ?? options.localSeatId ?? seatIds[0];
  if (!seatIds.includes(localSeatId)) localSeatId = seatIds[0];
  let identity = readRecord(storage, LOCAL_STORAGE_KEYS.identity) ?? copy(options.identity ?? {
    playerId: state.seats[localSeatId].playerId,
    displayName: state.seats[localSeatId].displayName
  });
  let preferences = readRecord(storage, LOCAL_STORAGE_KEYS.preferences) ?? copy(options.preferences ?? {});
  if (!isRecord(identity)) identity = {};
  if (!isRecord(preferences)) preferences = {};
  let completedSummary = completedSummaryStorage.read();
  const currentSummary = summaryFor(state, localSeatId);
  if (currentSummary) completedSummary = currentSummary;
  const listeners = new Set();
  let commandSequence = 0;
  let lastCommand = null;

  function persistAcceptedState() {
    persistenceError = writeRecord(storage, LOCAL_STORAGE_KEYS.session, state);
    const identityError = writeRecord(storage, LOCAL_STORAGE_KEYS.identity, identity);
    const preferenceError = writeRecord(storage, LOCAL_STORAGE_KEYS.preferences, preferences);
    const seatError = writeRecord(storage, LOCAL_STORAGE_KEYS.localSeat, localSeatId);
    const summaryError = completedSummary
      ? completedSummaryStorage.write(completedSummary)
      : null;
    persistenceError ??= identityError ?? preferenceError ?? seatError ?? summaryError;
  }

  function snapshot() {
    const projection = playerView(state, localSeatId);
    return freeze({
      state,
      authoritativeState: state,
      view: projection,
      player: projection,
      localSeatId,
      identity: copy(identity),
      preferences: copy(preferences),
      completedSummary: completedSummary ? copy(completedSummary) : null,
      status: {
        gameId: state.gameId,
        revision: state.revision,
        lifecycle: state.lifecycle,
        handId: state.hand?.id ?? null,
        handIndex: state.hand?.index ?? null,
        phase: state.hand?.phase ?? null,
        activeSeatId: state.hand?.activeSeatId ?? null,
        localIsActive: state.hand?.activeSeatId === localSeatId,
        persistenceError,
        lastCommand: lastCommand ? copy(lastCommand) : null
      }
    });
  }

  function notify() {
    const next = snapshot();
    for (const listener of listeners) listener(next);
    return next;
  }

  function commandInput(commandOrType, payload = {}) {
    const supplied = typeof commandOrType === "string"
      ? { ...(isRecord(payload) ? payload : {}), type: commandOrType }
      : { ...(isRecord(commandOrType) ? commandOrType : {}), ...(isRecord(payload) ? payload : {}) };
    commandSequence += 1;
    return {
      ...supplied,
      gameId: supplied.gameId ?? state.gameId,
      ...(commandNeedsHand(supplied.type) ? { handId: supplied.handId ?? state.hand?.id } : {}),
      actorSeatId: supplied.actorSeatId ?? supplied.actor ?? localSeatId,
      clientCommandId: supplied.clientCommandId ?? `local-${state.gameId}-${state.revision + 1}-${commandSequence}`,
      expectedRevision: supplied.expectedRevision ?? state.revision
    };
  }

  function execute(commandOrType, payload) {
    const command = commandInput(commandOrType, payload);
    const result = executeCommand(state, command);
    lastCommand = result.accepted
      ? { accepted: true, duplicate: result.duplicate, revision: result.revision, commandId: command.clientCommandId }
      : { accepted: false, reason: result.reason, detail: result.detail ?? null, commandId: command.clientCommandId };
    if (result.accepted && !result.duplicate) {
      state = result.state;
      completedSummary = summaryFor(state, localSeatId) ?? completedSummary;
      persistAcceptedState();
    }
    notify();
    return result;
  }

  function setLocalSeat(seatId) {
    if (!seatIds.includes(seatId)) throw new RangeError(`Unknown local seat: ${seatId}`);
    localSeatId = seatId;
    persistenceError = writeRecord(storage, LOCAL_STORAGE_KEYS.localSeat, localSeatId);
    return notify();
  }

  function setIdentity(nextIdentity) {
    if (!isRecord(nextIdentity)) throw new TypeError("Identity must be a plain record.");
    identity = copy(nextIdentity);
    persistenceError = writeRecord(storage, LOCAL_STORAGE_KEYS.identity, identity);
    return notify();
  }

  function setPreferences(nextPreferences) {
    if (!isRecord(nextPreferences)) throw new TypeError("Preferences must be a plain record.");
    preferences = copy(nextPreferences);
    persistenceError = writeRecord(storage, LOCAL_STORAGE_KEYS.preferences, preferences);
    return notify();
  }

  function reset() {
    removeRecord(storage, LOCAL_STORAGE_KEYS.session);
    state = fixtureState({ gameId, shuffleSeed, seats: options.seats });
    localSeatId = Object.hasOwn(state.seats, localSeatId) ? localSeatId : Object.keys(state.seats)[0];
    lastCommand = null;
    persistAcceptedState();
    return notify();
  }

  /** Clear only browser-local identity, preferences, local fixture, and summaries. */
  function clearDeviceData() {
    removeRecord(storage, LOCAL_STORAGE_KEYS.session);
    removeRecord(storage, LOCAL_STORAGE_KEYS.localSeat);
    removeRecord(storage, LOCAL_STORAGE_KEYS.identity);
    removeRecord(storage, LOCAL_STORAGE_KEYS.preferences);
    completedSummaryStorage.remove();
    state = fixtureState({ gameId, shuffleSeed, seats: options.seats });
    localSeatId = Object.keys(state.seats)[0];
    identity = {};
    preferences = {};
    completedSummary = null;
    lastCommand = null;
    persistenceError = null;
    return notify();
  }

  function runAutomatedMatch() {
    let ordinal = 0;
    const accepted = (type, actorSeatId, fields = {}) => {
      const result = execute(type, {
        ...fields,
        actorSeatId,
        clientCommandId: `local-automation-${state.gameId}-${++ordinal}`
      });
      if (!result.accepted) throw new Error(`Automation command ${type} was rejected: ${result.detail ?? result.reason}`);
    };

    while (state.lifecycle !== LIFECYCLE.COMPLETE) {
      if (state.hand.phase === "DEALER_INITIAL_DISCARD") {
        const dealerSeatId = state.hand.dealerSeatId;
        accepted(COMMAND_TYPE.DEALER_INITIAL_DISCARD, dealerSeatId, {
          cardId: state.hand.handsBySeat[dealerSeatId][0]
        });
      } else if (state.hand.phase === "AWAITING_DRAW") {
        accepted(COMMAND_TYPE.DRAW_STOCK, state.hand.activeSeatId);
      } else if (state.hand.phase === "TABLE_PLAY") {
        accepted(COMMAND_TYPE.FINISH_TABLE_PLAY, state.hand.activeSeatId);
      } else if (state.hand.phase === "AWAITING_DISCARD") {
        accepted(COMMAND_TYPE.DISCARD, state.hand.activeSeatId, { cardId: state.hand.drawnCardId });
      } else if (state.hand.phase === "HAND_COMPLETE") {
        for (const seatId of state.seatOrder) {
          if (!state.hand.result.acknowledgedBySeatIds.includes(seatId)) {
            accepted(COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT, seatId);
          }
        }
      } else {
        throw new Error(`Automation cannot handle phase ${state.hand.phase}`);
      }
    }
    return snapshot();
  }

  persistAcceptedState();
  return Object.freeze({
    getSnapshot: snapshot,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("A subscription listener is required.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    execute,
    setLocalSeat,
    setIdentity,
    setPreferences,
    reset,
    clearDeviceData,
    runAutomatedMatch
  });
}

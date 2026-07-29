import { LIFECYCLE, SCHEMA_VERSION, SYSTEM_ACTOR_SEAT_ID } from "./constants.js";
import { CANONICAL_RULES, createRules } from "./rules.js";

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

export function cloneState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("State must be a plain object.");
  }
  return cloneValue(state);
}

export function cloneAndFreezeState(state) {
  return deepFreeze(cloneState(state));
}

export function createSeat({
  seatId,
  playerId = seatId,
  displayName = playerId,
  ready = false,
  cumulativeScore = 0
} = {}) {
  if (!Number.isFinite(cumulativeScore) || cumulativeScore < 0) {
    throw new RangeError("Seat cumulative score must be a non-negative finite number.");
  }
  if (typeof ready !== "boolean") throw new TypeError("Seat readiness must be boolean.");
  const normalizedSeatId = nonEmptyString(seatId, "Seat ID");
  if (normalizedSeatId === SYSTEM_ACTOR_SEAT_ID) {
    throw new RangeError("Seat ID is reserved for engine system authority.");
  }
  return deepFreeze({
    seatId: normalizedSeatId,
    playerId: nonEmptyString(playerId, "Player ID"),
    displayName: nonEmptyString(displayName, "Display name"),
    ready,
    cumulativeScore
  });
}

function normalizeSeats(seats) {
  const values = Array.isArray(seats)
    ? seats
    : (seats && typeof seats === "object" ? Object.values(seats) : []);
  const normalized = {};
  for (const sourceSeat of values) {
    const seat = createSeat(sourceSeat);
    if (Object.hasOwn(normalized, seat.seatId)) {
      throw new RangeError(`Duplicate seat ID: ${seat.seatId}`);
    }
    normalized[seat.seatId] = seat;
  }
  return normalized;
}

export function createLobbyState({
  gameId,
  rules = CANONICAL_RULES,
  hostSeatId = null,
  seats = [],
  shuffleSeed = null
} = {}) {
  const normalizedSeats = normalizeSeats(seats);
  if (hostSeatId !== null) {
    nonEmptyString(hostSeatId, "Host seat ID");
    if (!Object.hasOwn(normalizedSeats, hostSeatId)) {
      throw new RangeError("Host seat ID must identify a seated host.");
    }
  }
  if (shuffleSeed !== null && typeof shuffleSeed !== "string" && !Number.isFinite(shuffleSeed)) {
    throw new TypeError("Shuffle seed must be null, a string, or a finite number.");
  }
  const immutableRules = createRules(rules);
  return deepFreeze({
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: immutableRules.rulesVersion,
    gameId: nonEmptyString(gameId, "Game ID"),
    lifecycle: LIFECYCLE.LOBBY,
    revision: 0,
    rules: immutableRules,
    hostSeatId,
    seatOrder: [],
    activeSeatOrder: [],
    droppedSeatsById: {},
    seats: normalizedSeats,
    currentHandIndex: null,
    initialDealerSeatId: null,
    dealerSeatId: null,
    hand: null,
    completedHands: [],
    winners: [],
    completion: null,
    shuffleSeed,
    commandLedger: {}
  });
}

export const createInitialState = createLobbyState;

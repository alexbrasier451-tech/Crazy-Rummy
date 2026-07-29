import { RULES_VERSION, SCHEMA_VERSION } from "../engine/index.js";
import { DEFAULT_TRANSPORT_PROTOCOL_VERSION, requireSeatProof, requireTransportIdentifier } from "./transport/index.js";

export const MATCH_BOOTSTRAP_VERSION = 1;
export const ONLINE_MATCH_MODE = "online";

function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (record(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
}

/** Validate the private, recipient-scoped lobby-to-match handoff. */
export function validateMatchBootstrap(value, { playerId, engineSchemaVersion = SCHEMA_VERSION, rulesVersion = RULES_VERSION } = {}) {
  if (!record(value) || value.version !== MATCH_BOOTSTRAP_VERSION) throw new TypeError("Match bootstrap version is unsupported.");
  requireTransportIdentifier(value.matchId, "match ID");
  requireTransportIdentifier(value.localSeatId, "local seat ID");
  requireTransportIdentifier(value.hostPlayerId, "host player ID");
  requireTransportIdentifier(value.localPlayerId, "local player ID");
  if (playerId && value.localPlayerId !== playerId) throw new TypeError("Match bootstrap is for another player.");
  if (!Array.isArray(value.seats) || value.seats.length < 3 || value.seats.length > 6) throw new TypeError("Match bootstrap must contain three to six seats.");
  const seatIds = new Set();
  const playerIds = new Set();
  for (const seat of value.seats) {
    if (!record(seat)) throw new TypeError("Match seat is invalid.");
    requireTransportIdentifier(seat.seatId, "seat ID");
    requireTransportIdentifier(seat.playerId, "player ID");
    if (seatIds.has(seat.seatId) || playerIds.has(seat.playerId)) throw new TypeError("Match bootstrap repeats a seat.");
    seatIds.add(seat.seatId); playerIds.add(seat.playerId);
  }
  if (!seatIds.has(value.localSeatId) || !playerIds.has(value.hostPlayerId)) throw new TypeError("Match bootstrap membership is invalid.");
  if (typeof value.roomSecret !== "string" || value.roomSecret.length < 12 || typeof value.seatSecret !== "string" || value.seatSecret.length < 8) throw new TypeError("Match recovery secrets are invalid.");
  requireSeatProof(value.localSeatProof);
  if (!record(value.pairScopes) || !record(value.remoteSeatProofs)) throw new TypeError("Match peer credentials are required.");
  const requiredPeers = value.localPlayerId === value.hostPlayerId ? [...playerIds].filter((id) => id !== value.localPlayerId) : [value.hostPlayerId];
  for (const remotePlayerId of requiredPeers) {
    if (typeof value.pairScopes[remotePlayerId] !== "string" || value.pairScopes[remotePlayerId].length < 16) throw new TypeError("Match pair scope is invalid.");
    requireSeatProof(value.remoteSeatProofs[remotePlayerId]);
  }
  if (value.localPlayerId === value.hostPlayerId && (!record(value.seatSecretById) || requiredPeers.some((id) => typeof value.seatSecretById[id] !== "string"))) throw new TypeError("Host bootstrap lacks remote recovery secrets.");
  if (value.engineSchemaVersion !== engineSchemaVersion || value.rulesVersion !== rulesVersion || value.transportProtocolVersion !== DEFAULT_TRANSPORT_PROTOCOL_VERSION) {
    throw new TypeError("Match versions are incompatible.");
  }
  return Object.freeze(copy(value));
}

export function publicMatchStatus(bootstrap) {
  return Object.freeze({ matchId: bootstrap.matchId, state: "STARTED", seatCount: bootstrap.seats.length });
}

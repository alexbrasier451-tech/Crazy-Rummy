import { ONLINE_ERROR, OnlineLobbyError } from "./errors.js";

export const TABLE_VISIBILITY = Object.freeze({ OPEN: "OPEN", CLOSED: "CLOSED" });
export const TABLE_STATUS = Object.freeze({ OPEN: "OPEN", STARTING: "STARTING", STARTED: "STARTED", CANCELLED: "CANCELLED" });
export const MIN_TABLE_CAPACITY = 2;
export const MAX_TABLE_CAPACITY = 6;
export const HEARTBEAT_MS = 15_000;
export const LEASE_MS = 45_000;
export const DEFAULT_PROTOCOL_VERSION = "crazy-rummy-lobby-v1";

const PLAYER_ID = /^[A-Za-z0-9_-]{8,128}$/;
const VERSION = /^[A-Za-z0-9._-]{1,80}$/;
const INVITE_CODE = /^[A-Za-z0-9_-]{16,128}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const LINK_LIKE = /(?:https?:\/\/|www\.|@)/iu;

export function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
}

export function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

export function frozenCopy(value) {
  return freeze(copy(value));
}

export function sanitizeDisplayName(value) {
  if (typeof value !== "string") {
    throw new OnlineLobbyError(ONLINE_ERROR.INVALID_DISPLAY_NAME, "Choose a display name.");
  }
  const name = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (name.length < 1 || name.length > 24 || CONTROL_CHARACTERS.test(name) || LINK_LIKE.test(name)) {
    throw new OnlineLobbyError(
      ONLINE_ERROR.INVALID_DISPLAY_NAME,
      "Display names must be 1–24 plain characters and cannot contain links or control characters."
    );
  }
  return name;
}

export function assertPlayerId(value) {
  if (typeof value !== "string" || !PLAYER_ID.test(value)) {
    throw new OnlineLobbyError(ONLINE_ERROR.INVALID_INPUT, "The player identity is invalid.");
  }
  return value;
}

export function assertVersion(value, label = "version") {
  if (typeof value !== "string" || !VERSION.test(value)) {
    throw new OnlineLobbyError(ONLINE_ERROR.INVALID_INPUT, `The ${label} is invalid.`);
  }
  return value;
}

export function assertCapacity(value) {
  if (!Number.isInteger(value) || value < MIN_TABLE_CAPACITY || value > MAX_TABLE_CAPACITY) {
    throw new OnlineLobbyError(ONLINE_ERROR.INVALID_INPUT, "Tables support from two to six players.");
  }
  return value;
}

export function assertVisibility(value) {
  if (value !== TABLE_VISIBILITY.OPEN && value !== TABLE_VISIBILITY.CLOSED) {
    throw new OnlineLobbyError(ONLINE_ERROR.INVALID_INPUT, "Choose an Open or Closed table.");
  }
  return value;
}

export function assertInviteCode(value) {
  if (typeof value !== "string" || !INVITE_CODE.test(value)) {
    throw new OnlineLobbyError(ONLINE_ERROR.INVALID_INPUT, "That table code is not valid.");
  }
  return value.toLowerCase();
}

export function normalizePlayer(value) {
  if (!value || typeof value !== "object") {
    throw new OnlineLobbyError(ONLINE_ERROR.INVALID_INPUT, "Player details are required.");
  }
  return Object.freeze({ playerId: assertPlayerId(value.playerId), displayName: sanitizeDisplayName(value.displayName) });
}

export function compatible(table, { protocolVersion, rulesVersion }) {
  return table.protocolVersion === protocolVersion && table.rulesVersion === rulesVersion;
}

export function incompatibility(table, versions) {
  if (table.protocolVersion !== versions.protocolVersion) {
    return new OnlineLobbyError(ONLINE_ERROR.INCOMPATIBLE_PROTOCOL, "This table uses an incompatible online protocol.");
  }
  if (table.rulesVersion !== versions.rulesVersion) {
    return new OnlineLobbyError(ONLINE_ERROR.INCOMPATIBLE_RULES, "This table uses different rules.");
  }
  return null;
}

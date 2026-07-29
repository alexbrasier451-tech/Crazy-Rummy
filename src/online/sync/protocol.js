export const SYNC_SCHEMA_VERSION = 1;
export const SYNC_PROTOCOL_VERSION = "crazy-rummy-sync/1";
export const SYNC_RECOVERY_VERSION = 1;
export const DEFAULT_DISCONNECT_TIMEOUT_MS = 5 * 60 * 1000;

export const SYNC_MESSAGE = Object.freeze({
  COMMAND: "COMMAND",
  COMMAND_RESULT: "COMMAND_RESULT",
  EVENT: "EVENT",
  ACK: "ACK",
  RESYNC_REQUEST: "RESYNC_REQUEST",
  SNAPSHOT: "SNAPSHOT",
  REBIND_REQUEST: "REBIND_REQUEST",
  REBIND_ACCEPTED: "REBIND_ACCEPTED",
  CONTROL: "CONTROL"
});

export const SYNC_STATUS = Object.freeze({
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  RECONNECTING: "RECONNECTING",
  FORFEIT: "FORFEIT",
  ABANDONED: "ABANDONED"
});

export const SYNC_REJECTION = Object.freeze({
  INVALID_ENVELOPE: "INVALID_ENVELOPE",
  UNSUPPORTED_SCHEMA: "UNSUPPORTED_SCHEMA",
  INVALID_MATCH: "INVALID_MATCH",
  INVALID_MESSAGE: "INVALID_MESSAGE",
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  MATCH_PAUSED: "MATCH_PAUSED",
  MATCH_FINISHED: "MATCH_FINISHED",
  REBIND_DENIED: "REBIND_DENIED",
  REBIND_EXPIRED: "REBIND_EXPIRED",
  COMMAND_ID_CONFLICT: "COMMAND_ID_CONFLICT",
  COMMAND_NOT_COMMITTED: "COMMAND_NOT_COMMITTED",
  RETRY_EXHAUSTED: "RETRY_EXHAUSTED"
});

const MESSAGE_TYPES = new Set(Object.values(SYNC_MESSAGE));

export function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

export function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.length > 0;
}

export function createEnvelope({
  matchId,
  type,
  messageId,
  payload = {},
  sentAt = Date.now(),
  engineSchemaVersion,
  rulesVersion,
  schemaVersion = SYNC_SCHEMA_VERSION,
  protocolVersion = SYNC_PROTOCOL_VERSION
}) {
  if (!nonEmpty(matchId) || !MESSAGE_TYPES.has(type) || !nonEmpty(messageId) || !isRecord(payload)) {
    throw new TypeError("A sync envelope requires a match, known type, message ID, and record payload.");
  }
  if (!Number.isFinite(sentAt)) throw new TypeError("Envelope time must be finite.");
  if (!Number.isInteger(engineSchemaVersion) || typeof rulesVersion !== "string" || !rulesVersion) {
    throw new TypeError("Envelope engine schema and rules versions are required.");
  }
  return freeze({
    schemaVersion,
    protocolVersion,
    engineSchemaVersion,
    rulesVersion,
    matchId,
    type,
    messageId,
    sentAt,
    payload: clone(payload)
  });
}

export function validateEnvelope(envelope, { matchId, engineSchemaVersion, rulesVersion } = {}) {
  if (!isRecord(envelope)) return { ok: false, reason: SYNC_REJECTION.INVALID_ENVELOPE };
  if (
    envelope.schemaVersion !== SYNC_SCHEMA_VERSION
    || envelope.protocolVersion !== SYNC_PROTOCOL_VERSION
  ) {
    return { ok: false, reason: SYNC_REJECTION.UNSUPPORTED_SCHEMA };
  }
  if (!nonEmpty(envelope.matchId) || (matchId !== undefined && envelope.matchId !== matchId)) {
    return { ok: false, reason: SYNC_REJECTION.INVALID_MATCH };
  }
  if (
    !Number.isInteger(envelope.engineSchemaVersion)
    || !nonEmpty(envelope.rulesVersion)
    || (engineSchemaVersion !== undefined && envelope.engineSchemaVersion !== engineSchemaVersion)
    || (rulesVersion !== undefined && envelope.rulesVersion !== rulesVersion)
  ) {
    return { ok: false, reason: SYNC_REJECTION.UNSUPPORTED_SCHEMA };
  }
  if (
    !MESSAGE_TYPES.has(envelope.type)
    || !nonEmpty(envelope.messageId)
    || !Number.isFinite(envelope.sentAt)
    || !isRecord(envelope.payload)
  ) {
    return { ok: false, reason: SYNC_REJECTION.INVALID_MESSAGE };
  }
  return { ok: true, envelope };
}

export function publicSessionStatus(status) {
  const result = {
    state: status.state,
    authoritativeSequence: status.authoritativeSequence,
    activeSeatIds: [...status.activeSeatIds],
    disconnectedSeatIds: [...status.disconnectedSeatIds],
    droppedSeatIds: [...status.droppedSeatIds]
  };
  if (status.pauseReason !== null) result.pauseReason = status.pauseReason;
  if (status.recoveryDeadline !== null) result.recoveryDeadline = status.recoveryDeadline;
  if (status.winnerSeatId !== null) result.winnerSeatId = status.winnerSeatId;
  return freeze(result);
}

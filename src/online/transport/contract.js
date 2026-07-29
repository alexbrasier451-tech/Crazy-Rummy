export const TRANSPORT_SCHEMA_VERSION = "1";
export const DEFAULT_TRANSPORT_PROTOCOL_VERSION = "crazy-rummy-transport-v1";
export const SIGNAL_ENVELOPE_TYPE = "crazy-rummy/peer-signal";
export const WIRE_ENVELOPE_TYPE = "crazy-rummy/peer-transport";

export const SIGNAL_KIND = Object.freeze({
  OFFER: "offer",
  ANSWER: "answer",
  ICE_CANDIDATE: "ice-candidate",
  CLOSE: "close",
});

export const PEER_STATE = Object.freeze({
  IDLE: "idle",
  SIGNALLING: "signalling",
  CONNECTING: "connecting",
  HANDSHAKING: "handshaking",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  FAILED: "failed",
  CLOSED: "closed",
});

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/;
const SIGNAL_KINDS = new Set(Object.values(SIGNAL_KIND));

export class PeerTransportError extends Error {
  constructor(code, message, { retryable = false, details = null, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "PeerTransportError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export function requireTransportIdentifier(value, label = "identifier") {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new PeerTransportError("INVALID_TRANSPORT_INPUT", `A bounded ${label} is required.`);
  }
  return value;
}

export function requireTransportVersion(value, label = "version") {
  if (Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value !== "string" || !VERSION.test(value)) {
    throw new PeerTransportError("INVALID_TRANSPORT_INPUT", `A bounded ${label} is required.`);
  }
  return value;
}

export function requireSeatProof(value) {
  if (typeof value !== "string" || value.length < 16 || value.length > 256
    || !/^[A-Za-z0-9._~-]+$/.test(value)) {
    throw new PeerTransportError("INVALID_TRANSPORT_INPUT", "A bounded opaque seat proof is required.");
  }
  return value;
}

export function encodedBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch (cause) {
    throw new PeerTransportError("INVALID_TRANSPORT_INPUT", "Transport payload must be JSON serializable.", { cause });
  }
}

export function createSignallingEnvelope({
  signalId,
  matchId,
  fromPlayerId,
  toPlayerId,
  kind,
  payload = null,
  createdAt,
  expiresAt,
  schemaVersion = TRANSPORT_SCHEMA_VERSION,
}, { maxBytes = 32_768 } = {}) {
  const envelope = {
    type: SIGNAL_ENVELOPE_TYPE,
    schemaVersion: requireTransportVersion(schemaVersion, "signalling schema version"),
    signalId: requireTransportIdentifier(signalId, "signal ID"),
    matchId: requireTransportIdentifier(matchId, "match ID"),
    fromPlayerId: requireTransportIdentifier(fromPlayerId, "source player ID"),
    toPlayerId: requireTransportIdentifier(toPlayerId, "destination player ID"),
    kind,
    createdAt,
    expiresAt,
    payload,
  };
  if (!SIGNAL_KINDS.has(kind)) {
    throw new PeerTransportError("INVALID_SIGNAL", "The signalling kind is not supported.");
  }
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= createdAt) {
    throw new PeerTransportError("INVALID_SIGNAL", "Signalling timestamps are invalid.");
  }
  if (envelope.fromPlayerId === envelope.toPlayerId) {
    throw new PeerTransportError("INVALID_SIGNAL", "A peer signal cannot target its sender.");
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || encodedBytes(envelope) > maxBytes) {
    throw new PeerTransportError("SIGNAL_TOO_LARGE", "The signalling message exceeds its configured bound.");
  }
  return deepFreeze(copyJson(envelope));
}

export function parseSignallingEnvelope(value, {
  now = Date.now(),
  maxBytes = 32_768,
  schemaVersion = TRANSPORT_SCHEMA_VERSION,
  maxClockSkewMs = 30_000,
} = {}) {
  if (value?.type !== SIGNAL_ENVELOPE_TYPE) {
    throw new PeerTransportError("INVALID_SIGNAL", "The signalling envelope type is invalid.");
  }
  const envelope = createSignallingEnvelope(value || {}, { maxBytes });
  if (envelope.schemaVersion !== schemaVersion) {
    throw new PeerTransportError("INCOMPATIBLE_SCHEMA", "The signalling schema is incompatible.");
  }
  if (envelope.createdAt > now + maxClockSkewMs) {
    throw new PeerTransportError("INVALID_SIGNAL", "The signalling message was created in the future.");
  }
  if (envelope.expiresAt <= now) {
    throw new PeerTransportError("SIGNAL_EXPIRED", "The signalling message has expired.");
  }
  return envelope;
}

export function validateIceServers(value, {
  now = Date.now(),
  maxCredentialTtlMs = 3_600_000,
  allowProviderManagedTurn = false,
} = {}) {
  const result = Array.isArray(value) ? { iceServers: value, expiresAt: null } : value;
  if (!result || !Array.isArray(result.iceServers)) {
    throw new PeerTransportError("INVALID_ICE_CONFIGURATION", "An ICE server array is required.");
  }
  const expiresAt = result.expiresAt ?? null;
  const iceServers = result.iceServers.map((server) => {
    const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
    if (!urls.length || urls.some((url) => typeof url !== "string" || !/^(stun|turn|turns):/i.test(url))) {
      throw new PeerTransportError("INVALID_ICE_CONFIGURATION", "ICE server URLs are invalid.");
    }
    const usesTurn = urls.some((url) => /^turns?:/i.test(url));
    if (usesTurn && (typeof server.username !== "string" || typeof server.credential !== "string")) {
      throw new PeerTransportError("INVALID_TURN_CREDENTIAL", "TURN servers require browser-safe credentials.");
    }
    return {
      urls: Array.isArray(server.urls) ? [...server.urls] : server.urls,
      ...(server.username === undefined ? {} : { username: server.username }),
      ...(server.credential === undefined ? {} : { credential: server.credential }),
    };
  });
  const usesTurn = iceServers.some((server) =>
    (Array.isArray(server.urls) ? server.urls : [server.urls])
      .some((url) => /^turns?:/i.test(url))
  );
  if (
    (usesTurn && !Number.isFinite(expiresAt) && !allowProviderManagedTurn)
    || (expiresAt !== null
      && (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt - now > maxCredentialTtlMs))
  ) {
    throw new PeerTransportError("INVALID_TURN_CREDENTIAL", "TURN credentials must be short-lived and unexpired.");
  }
  return Object.freeze({
    iceServers: deepFreeze(iceServers),
    expiresAt,
  });
}

export function safeError(error) {
  return error ? Object.freeze({
    code: typeof error.code === "string" ? error.code : "TRANSPORT_FAILURE",
    message: typeof error.message === "string" ? error.message : "Peer transport failed.",
    retryable: error.retryable === true,
  }) : null;
}

export function copyJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

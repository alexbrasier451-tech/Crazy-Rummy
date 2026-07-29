export const ONLINE_ERROR = Object.freeze({
  OFFLINE: "OFFLINE",
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_DISPLAY_NAME: "INVALID_DISPLAY_NAME",
  NOT_FOUND: "NOT_FOUND",
  TABLE_FULL: "TABLE_FULL",
  TABLE_EXPIRED: "TABLE_EXPIRED",
  TABLE_CANCELLED: "TABLE_CANCELLED",
  FORBIDDEN: "FORBIDDEN",
  INCOMPATIBLE_PROTOCOL: "INCOMPATIBLE_PROTOCOL",
  INCOMPATIBLE_RULES: "INCOMPATIBLE_RULES",
  STALE_TABLE: "STALE_TABLE",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE"
});

export class OnlineLobbyError extends Error {
  constructor(code, message, { retryable = false, details = null, cause } = {}) {
    super(message ?? code, cause ? { cause } : undefined);
    this.name = "OnlineLobbyError";
    this.code = code;
    this.retryable = Boolean(retryable);
    this.details = details;
  }
}

export function asOnlineLobbyError(error) {
  if (error instanceof OnlineLobbyError) return error;
  const source = error && typeof error === "object" ? error : {};
  return new OnlineLobbyError(
    typeof source.code === "string" ? source.code : ONLINE_ERROR.SERVICE_UNAVAILABLE,
    error instanceof Error ? error.message : "The online service is unavailable.",
    { retryable: source.retryable ?? true, details: source.details ?? null, cause: error }
  );
}

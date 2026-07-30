import { commandFingerprint as defaultCommandFingerprint } from "../../engine/index.js";
import {
  DEFAULT_DISCONNECT_TIMEOUT_MS,
  SYNC_PROTOCOL_VERSION,
  SYNC_RECOVERY_VERSION,
  SYNC_SCHEMA_VERSION,
  SYNC_MESSAGE,
  SYNC_REJECTION,
  SYNC_STATUS,
  clone,
  createEnvelope,
  freeze,
  isRecord,
  validateEnvelope
} from "./protocol.js";

function defaultScheduler() {
  return {
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: (handle) => globalThis.clearTimeout(handle)
  };
}

/**
 * Guest-side reliable protocol. It never reduces private engine state: the
 * host supplies an allowlisted event and a seat-specific projection for each
 * authoritative sequence.
 */
export function createClientSyncSession({
  matchId,
  seatId,
  engineSchemaVersion,
  rulesVersion,
  send,
  clock = () => Date.now(),
  scheduler = defaultScheduler(),
  retry = {},
  disconnectTimeoutMs = DEFAULT_DISCONNECT_TIMEOUT_MS,
  maxBufferedEvents = 32,
  fingerprintCommand = defaultCommandFingerprint,
  onSnapshot,
  onEvent,
  onStatus,
  onCommandResult,
  recoveryRecord = null
} = {}) {
  if (typeof matchId !== "string" || !matchId || typeof seatId !== "string" || !seatId) {
    throw new TypeError("A client sync session requires match and seat IDs.");
  }
  if (typeof send !== "function") throw new TypeError("A client send callback is required.");
  if (typeof fingerprintCommand !== "function") throw new TypeError("A command fingerprint function is required.");
  if (!Number.isInteger(engineSchemaVersion) || typeof rulesVersion !== "string" || !rulesVersion) {
    throw new TypeError("Client engine schema and rules versions are required.");
  }
  const initialRetryMs = Number.isFinite(retry.initialMs) && retry.initialMs > 0 ? retry.initialMs : 250;
  const maximumRetryMs = Number.isFinite(retry.maximumMs) && retry.maximumMs > 0 ? retry.maximumMs : 2_000;
  const maximumAttempts = Number.isInteger(retry.maximumAttempts) && retry.maximumAttempts > 0
    ? retry.maximumAttempts
    : 4;
  const bufferLimit = Number.isInteger(maxBufferedEvents) && maxBufferedEvents > 0 ? maxBufferedEvents : 32;
  const timeout = Number.isFinite(disconnectTimeoutMs) && disconnectTimeoutMs > 0
    ? disconnectTimeoutMs
    : DEFAULT_DISCONNECT_TIMEOUT_MS;

  const recovered = validateRecovery(recoveryRecord, { matchId, seatId, engineSchemaVersion, rulesVersion });
  let messageNumber = 0;
  let authoritativeSequence = recovered?.authoritativeSequence ?? 0;
  let projection = recovered?.projection ?? null;
  let connectionState = SYNC_STATUS.RUNNING;
  let hostRecoveryDeadline = null;
  let terminalReason = null;
  let reconciliationTimer = null;
  const pending = new Map();
  const completedCommands = new Set();
  const eventBuffer = new Map();
  const seenMessages = new Set();
  for (const entry of recovered?.pendingCommands ?? []) {
    pending.set(entry.commandId, {
      commandId: entry.commandId,
      commandFingerprint: entry.commandFingerprint,
      envelope: null,
      attempts: entry.attempts ?? 0,
      timer: null,
      status: "UNCERTAIN",
      reconciliationRequested: false
    });
  }

  function id(prefix) {
    messageNumber += 1;
    return `${seatId}:${prefix}:${messageNumber}`;
  }

  function envelope(type, payload, messageId = id(type.toLowerCase())) {
    return createEnvelope({
      matchId,
      type,
      messageId,
      sentAt: clock(),
      engineSchemaVersion,
      rulesVersion,
      payload
    });
  }

  function transmit(outgoing) {
    try {
      const result = send(outgoing);
      result?.catch?.(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function status(detail = {}) {
    return freeze({
      state: connectionState,
      authoritativeSequence,
      hostRecoveryDeadline,
      terminalReason,
      ...clone(detail)
    });
  }

  function publishStatus(detail = {}) {
    const value = status(detail);
    onStatus?.(value);
    return value;
  }

  function acknowledge(ackType, messageId, sequence = authoritativeSequence) {
    transmit(envelope(SYNC_MESSAGE.ACK, {
      ackType,
      messageId,
      authoritativeSequence: sequence
    }));
  }

  function requestResync(reason = "SEQUENCE_GAP") {
    const pendingCommands = [...pending.values()]
      .filter((record) => record.status === "UNCERTAIN")
      .map((record) => ({
        commandId: record.commandId,
        commandFingerprint: record.commandFingerprint
      }));
    transmit(envelope(SYNC_MESSAGE.RESYNC_REQUEST, {
      lastSequence: authoritativeSequence,
      reason,
      pendingCommands
    }));
    if (pendingCommands.length > 0) scheduleReconciliationRetry();
  }

  function clearReconciliationRetry() {
    if (reconciliationTimer === null) return;
    scheduler.clearTimeout(reconciliationTimer);
    reconciliationTimer = null;
  }

  function scheduleReconciliationRetry() {
    if (
      reconciliationTimer !== null
      || connectionState !== SYNC_STATUS.RUNNING
      || ![...pending.values()].some((record) => record.status === "UNCERTAIN")
    ) return;
    reconciliationTimer = scheduler.setTimeout(() => {
      reconciliationTimer = null;
      if (connectionState !== SYNC_STATUS.RUNNING) return;
      let retryable = false;
      for (const record of pending.values()) {
        if (record.status !== "UNCERTAIN") continue;
        record.reconciliationRequested = false;
        retryable = true;
      }
      if (retryable) reconcilePendingCommands("COMMAND_ACK_STILL_UNKNOWN");
    }, maximumRetryMs);
  }

  function clearPending(commandId) {
    const record = pending.get(commandId);
    if (!record) return null;
    if (record.timer !== null) scheduler.clearTimeout(record.timer);
    pending.delete(commandId);
    if (![...pending.values()].some((entry) => entry.status === "UNCERTAIN")) {
      clearReconciliationRetry();
    }
    return record;
  }

  function suspendPendingRetries() {
    clearReconciliationRetry();
    for (const record of pending.values()) {
      if (record.timer !== null) scheduler.clearTimeout(record.timer);
      record.timer = null;
      record.status = "UNCERTAIN";
      record.reconciliationRequested = false;
    }
  }

  function scheduleRetry(record) {
    if (!pending.has(record.commandId)) return;
    if (record.attempts >= maximumAttempts) {
      record.status = "UNCERTAIN";
      record.reconciliationRequested = true;
      onCommandResult?.(freeze({
        commandId: record.commandId,
        accepted: null,
        reason: SYNC_REJECTION.RETRY_EXHAUSTED,
        uncertain: true
      }));
      requestResync("COMMAND_ACK_UNKNOWN");
      return;
    }
    const delay = Math.min(initialRetryMs * (2 ** (record.attempts - 1)), maximumRetryMs);
    record.timer = scheduler.setTimeout(() => {
      record.timer = null;
      if (connectionState !== SYNC_STATUS.RUNNING) return;
      record.attempts += 1;
      record.status = "PENDING";
      transmit(record.envelope);
      scheduleRetry(record);
    }, delay);
  }

  function submitCommand(command) {
    if (!isRecord(command) || typeof command.clientCommandId !== "string" || !command.clientCommandId) {
      throw new TypeError("A command with a client command ID is required.");
    }
    if (command.actorSeatId !== seatId) {
      throw new TypeError("A client may submit commands only for its bound seat.");
    }
    if (connectionState !== SYNC_STATUS.RUNNING) {
      return freeze({ queued: false, reason: SYNC_REJECTION.MATCH_PAUSED });
    }
    const prior = pending.get(command.clientCommandId);
    if (prior) return freeze({ queued: true, duplicate: true, commandId: prior.commandId });
    const outgoing = envelope(SYNC_MESSAGE.COMMAND, {
      command: clone(command)
    }, `command:${command.clientCommandId}`);
    const fingerprint = fingerprintCommand(command);
    if (typeof fingerprint !== "string" || !fingerprint) {
      throw new TypeError("The command fingerprint must be a non-empty string.");
    }
    const record = {
      commandId: command.clientCommandId,
      commandFingerprint: fingerprint,
      envelope: outgoing,
      attempts: 1,
      timer: null,
      status: "PENDING",
      reconciliationRequested: false
    };
    pending.set(record.commandId, record);
    transmit(outgoing);
    scheduleRetry(record);
    return freeze({ queued: true, duplicate: false, commandId: record.commandId });
  }

  function acceptSnapshot(snapshot, sequence, reason, { drain = true } = {}) {
    if (!isRecord(snapshot) || !Number.isInteger(snapshot.revision) || snapshot.revision !== sequence) {
      requestResync("INVALID_SNAPSHOT");
      return false;
    }
    if (sequence < authoritativeSequence) return false;
    projection = freeze(clone(snapshot));
    authoritativeSequence = sequence;
    for (const bufferedSequence of [...eventBuffer.keys()]) {
      if (bufferedSequence <= sequence) eventBuffer.delete(bufferedSequence);
    }
    onSnapshot?.(projection, freeze({ reason, authoritativeSequence }));
    if (drain) drainBufferedEvents();
    return true;
  }

  function drainBufferedEvents() {
    while (eventBuffer.has(authoritativeSequence + 1)) {
      const next = eventBuffer.get(authoritativeSequence + 1);
      eventBuffer.delete(authoritativeSequence + 1);
      applyEvent(next, { drain: false });
    }
  }

  function applyEvent(incoming, { drain = true } = {}) {
    const sequence = incoming.payload.authoritativeSequence;
    const event = incoming.payload.event;
    const snapshot = incoming.payload.snapshot;
    if (
      !Number.isInteger(sequence)
      || sequence < 1
      || !isRecord(event)
      || event.sequence !== sequence
      || !isRecord(snapshot)
      || snapshot.revision !== sequence
    ) {
      requestResync("INVALID_EVENT");
      return { ok: false, reason: SYNC_REJECTION.INVALID_MESSAGE };
    }
    if (sequence <= authoritativeSequence) {
      acknowledge("EVENT", incoming.messageId, authoritativeSequence);
      return { ok: true, duplicate: true };
    }
    if (sequence > authoritativeSequence + 1) {
      if (eventBuffer.size >= bufferLimit) eventBuffer.clear();
      else eventBuffer.set(sequence, incoming);
      requestResync("SEQUENCE_GAP");
      return { ok: false, gap: true };
    }

    acceptSnapshot(snapshot, sequence, "EVENT", { drain: false });
    onEvent?.(freeze(clone(event)), projection);
    const commandId = event.commandId;
    if (typeof commandId === "string" && pending.has(commandId)) {
      clearPending(commandId);
      completedCommands.add(commandId);
      onCommandResult?.(freeze({
        commandId,
        accepted: true,
        authoritativeSequence: sequence,
        inferredFromEvent: true
      }));
    }
    acknowledge("EVENT", incoming.messageId, sequence);

    if (drain) drainBufferedEvents();
    return { ok: true, applied: true };
  }

  function handleCommandResult(incoming) {
    const result = incoming.payload;
    if (typeof result.commandId !== "string" || typeof result.accepted !== "boolean") {
      return { ok: false, reason: SYNC_REJECTION.INVALID_MESSAGE };
    }
    if (completedCommands.has(result.commandId)) {
      acknowledge("COMMAND_RESULT", incoming.messageId, result.authoritativeSequence);
      return { ok: true, accepted: result.accepted, duplicate: true };
    }
    clearPending(result.commandId);
    completedCommands.add(result.commandId);
    onCommandResult?.(freeze(clone(result)));
    acknowledge("COMMAND_RESULT", incoming.messageId, result.authoritativeSequence);
    if (
      Number.isInteger(result.authoritativeSequence)
      && result.authoritativeSequence > authoritativeSequence
    ) {
      requestResync("COMMAND_RESULT_AHEAD");
    }
    return { ok: true, accepted: result.accepted };
  }

  function handleControl(incoming) {
    const kind = incoming.payload.kind;
    switch (kind) {
      case "PAUSED":
        connectionState = SYNC_STATUS.PAUSED;
        suspendPendingRetries();
        break;
      case "RESUMED":
        connectionState = SYNC_STATUS.RUNNING;
        hostRecoveryDeadline = null;
        reconcilePendingCommands("SESSION_RESUMED");
        break;
      case "SEAT_DROPPED":
        connectionState = incoming.payload.status?.state === SYNC_STATUS.PAUSED
          ? SYNC_STATUS.PAUSED
          : SYNC_STATUS.RUNNING;
        if (connectionState === SYNC_STATUS.RUNNING) hostRecoveryDeadline = null;
        break;
      case "FORFEIT":
        connectionState = SYNC_STATUS.FORFEIT;
        terminalReason = "FORFEIT";
        suspendPendingRetries();
        break;
      case "ABANDONED":
        connectionState = SYNC_STATUS.ABANDONED;
        terminalReason = incoming.payload.reason ?? "HOST_LOST";
        suspendPendingRetries();
        break;
      default:
        return { ok: false, reason: SYNC_REJECTION.INVALID_MESSAGE };
    }
    publishStatus({ control: clone(incoming.payload) });
    acknowledge("CONTROL", incoming.messageId);
    return { ok: true };
  }

  function receive(incoming) {
    const checked = validateEnvelope(incoming, { matchId, engineSchemaVersion, rulesVersion });
    if (!checked.ok) return freeze(checked);
    if (seenMessages.has(incoming.messageId) && incoming.type !== SYNC_MESSAGE.EVENT) {
      return freeze({ ok: true, duplicate: true });
    }
    seenMessages.add(incoming.messageId);
    switch (incoming.type) {
      case SYNC_MESSAGE.COMMAND_RESULT:
        return freeze(handleCommandResult(incoming));
      case SYNC_MESSAGE.EVENT:
        return freeze(applyEvent(incoming));
      case SYNC_MESSAGE.SNAPSHOT: {
        const applied = acceptSnapshot(
          incoming.payload.snapshot,
          incoming.payload.authoritativeSequence,
          incoming.payload.reason ?? "SNAPSHOT"
        );
        if (applied) acknowledge("SNAPSHOT", incoming.messageId);
        return freeze({ ok: applied });
      }
      case SYNC_MESSAGE.REBIND_ACCEPTED:
        if (incoming.payload.accepted) {
          connectionState = incoming.payload.status?.state ?? SYNC_STATUS.RUNNING;
          hostRecoveryDeadline = null;
          terminalReason = null;
          reconcilePendingCommands("REBIND_ACCEPTED");
          publishStatus({ rebind: clone(incoming.payload) });
        } else {
          publishStatus({ rebind: clone(incoming.payload) });
        }
        return freeze({ ok: true, accepted: Boolean(incoming.payload.accepted) });
      case SYNC_MESSAGE.CONTROL:
        return freeze(handleControl(incoming));
      default:
        return freeze({ ok: false, reason: SYNC_REJECTION.INVALID_MESSAGE });
    }
  }

  function markHostDisconnected(at = clock()) {
    if ([SYNC_STATUS.FORFEIT, SYNC_STATUS.ABANDONED].includes(connectionState)) return status();
    connectionState = SYNC_STATUS.RECONNECTING;
    hostRecoveryDeadline = at + timeout;
    suspendPendingRetries();
    return publishStatus({ reason: "HOST_DISCONNECTED" });
  }

  function reconcilePendingCommands(reason) {
    const records = [...pending.values()].filter((record) =>
      record.status === "UNCERTAIN" && !record.reconciliationRequested
    );
    if (records.length === 0) {
      scheduleReconciliationRetry();
      return;
    }
    for (const record of records) record.reconciliationRequested = true;
    requestResync(reason);
  }

  function requestRebind({ roomSecret, seatSecret } = {}) {
    if (typeof roomSecret !== "string" || typeof seatSecret !== "string") {
      throw new TypeError("Room and seat resume secrets are required.");
    }
    connectionState = SYNC_STATUS.RECONNECTING;
    transmit(envelope(SYNC_MESSAGE.REBIND_REQUEST, {
      roomSecret,
      seatSecret,
      lastSequence: authoritativeSequence
    }));
    return publishStatus({ reason: "REBIND_REQUESTED" });
  }

  function sweep(now = clock()) {
    if (
      connectionState === SYNC_STATUS.RECONNECTING
      && hostRecoveryDeadline !== null
      && now >= hostRecoveryDeadline
    ) {
      connectionState = SYNC_STATUS.ABANDONED;
      terminalReason = "HOST_LOST";
      hostRecoveryDeadline = null;
      for (const record of pending.values()) {
        if (record.timer !== null) scheduler.clearTimeout(record.timer);
      }
      clearReconciliationRetry();
      pending.clear();
      return publishStatus({ reason: "HOST_RECOVERY_EXPIRED" });
    }
    return status();
  }

  function inspect() {
    return freeze({
      status: status(),
      projection,
      pendingCommandIds: [...pending.keys()],
      bufferedSequences: [...eventBuffer.keys()].sort((a, b) => a - b)
    });
  }

  function exportRecoveryRecord({ roomSecret, seatSecret } = {}) {
    if (typeof roomSecret !== "string" || typeof seatSecret !== "string") {
      throw new TypeError("Room and seat secrets are required for a recoverable session record.");
    }
    return freeze({
      recoveryVersion: SYNC_RECOVERY_VERSION,
      syncSchemaVersion: SYNC_SCHEMA_VERSION,
      protocolVersion: SYNC_PROTOCOL_VERSION,
      engineSchemaVersion,
      rulesVersion,
      matchId,
      seatId,
      roomSecret,
      seatSecret,
      authoritativeSequence,
      projection,
      connectionState,
      pendingCommands: [...pending.values()].map((record) => ({
        commandId: record.commandId,
        commandFingerprint: record.commandFingerprint,
        attempts: record.attempts,
        status: record.status,
        sentAt: record.envelope?.sentAt ?? null
      }))
    });
  }

  function clearRecovery() {
    clearReconciliationRetry();
    for (const record of pending.values()) {
      if (record.timer !== null) scheduler.clearTimeout(record.timer);
    }
    pending.clear();
    eventBuffer.clear();
    projection = null;
    authoritativeSequence = 0;
    return null;
  }

  function dispose() {
    clearReconciliationRetry();
    for (const record of pending.values()) {
      if (record.timer !== null) scheduler.clearTimeout(record.timer);
      record.timer = null;
    }
  }

  return freeze({
    submitCommand,
    receive,
    requestResync,
    requestRebind,
    markHostDisconnected,
    sweep,
    getProjection: () => projection,
    getStatus: status,
    exportRecoveryRecord,
    shouldClearRecovery: () => [SYNC_STATUS.FORFEIT, SYNC_STATUS.ABANDONED].includes(connectionState),
    clearRecovery,
    dispose,
    inspect
  });
}

function validateRecovery(value, { matchId, seatId, engineSchemaVersion, rulesVersion }) {
  if (value == null) return null;
  if (!isRecord(value) || value.recoveryVersion !== SYNC_RECOVERY_VERSION || value.syncSchemaVersion !== SYNC_SCHEMA_VERSION || value.protocolVersion !== SYNC_PROTOCOL_VERSION || value.matchId !== matchId || value.seatId !== seatId || value.engineSchemaVersion !== engineSchemaVersion || value.rulesVersion !== rulesVersion) throw new TypeError("Client recovery record is incompatible.");
  if (!Number.isInteger(value.authoritativeSequence) || value.authoritativeSequence < 0 || !isRecord(value.projection) || value.projection.revision !== value.authoritativeSequence) throw new TypeError("Client recovery record is invalid.");
  const pendingCommands = Array.isArray(value.pendingCommands) ? value.pendingCommands.map((entry) => {
    if (!isRecord(entry) || typeof entry.commandId !== "string" || !entry.commandId || typeof entry.commandFingerprint !== "string" || !entry.commandFingerprint) throw new TypeError("Client recovery pending command is invalid.");
    return { commandId: entry.commandId, commandFingerprint: entry.commandFingerprint, attempts: Number.isInteger(entry.attempts) ? entry.attempts : 0 };
  }) : [];
  return freeze({ authoritativeSequence: value.authoritativeSequence, projection: freeze(clone(value.projection)), pendingCommands });
}

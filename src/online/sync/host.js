import {
  commandFingerprint as defaultCommandFingerprint,
  executeCommand as defaultExecuteCommand,
  projectEvent as defaultProjectEvent,
  snapshotFor as defaultSnapshotFor
} from "../../engine/index.js";
import {
  DEFAULT_DISCONNECT_TIMEOUT_MS,
  SYNC_MESSAGE,
  SYNC_PROTOCOL_VERSION,
  SYNC_RECOVERY_VERSION,
  SYNC_REJECTION,
  SYNC_SCHEMA_VERSION,
  SYNC_STATUS,
  clone,
  createEnvelope,
  freeze,
  isRecord,
  publicSessionStatus,
  validateEnvelope
} from "./protocol.js";

function finiteInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeSeats(state, seats) {
  const seatIds = Object.keys(state?.seats ?? {});
  if (!seatIds.includes(state?.hostSeatId)) {
    throw new TypeError("The authoritative state must contain a host seat.");
  }
  const source = isRecord(seats) ? seats : {};
  const engineActiveSeatIds = new Set(
    Array.isArray(state.activeSeatOrder) && state.activeSeatOrder.length > 0
      ? state.activeSeatOrder
      : seatIds
  );
  return new Map(seatIds.map((seatId) => {
    const provided = source[seatId];
    const seatSecret = typeof provided === "string" ? provided : provided?.seatSecret;
    if (seatId !== state.hostSeatId && (typeof seatSecret !== "string" || seatSecret.length < 8)) {
      throw new TypeError(`Seat ${seatId} requires an opaque resume secret of at least eight characters.`);
    }
    const dropped = !engineActiveSeatIds.has(seatId) || provided?.dropped === true;
    return [seatId, {
      seatId,
      seatSecret: seatId === state.hostSeatId ? (seatSecret ?? null) : seatSecret,
      connected: !dropped && (typeof provided?.connected === "boolean" ? provided.connected : true),
      disconnectedAt: Number.isFinite(provided?.disconnectedAt) ? provided.disconnectedAt : null,
      recoveryDeadline: Number.isFinite(provided?.recoveryDeadline) ? provided.recoveryDeadline : null,
      dropped,
      lastAcknowledgedSequence: Number.isInteger(provided?.lastAcknowledgedSequence)
        ? provided.lastAcknowledgedSequence
        : 0
    }];
  }));
}

/**
 * Host-authoritative synchronisation over an injected transport. `send`
 * receives `(seatId, envelope)`. `broadcast`, when supplied, receives one
 * array of `{ seatId, envelope }` deliveries so every seat can have a distinct
 * redacted payload.
 */
export function createHostSyncSession({
  state: initialState,
  roomSecret,
  seats,
  send,
  broadcast,
  executeCommand = defaultExecuteCommand,
  fingerprintCommand = defaultCommandFingerprint,
  projectEvent = defaultProjectEvent,
  snapshotFor = defaultSnapshotFor,
  notCommittedCommands = [],
  clock = () => Date.now(),
  disconnectTimeoutMs = DEFAULT_DISCONNECT_TIMEOUT_MS,
  eventHistoryLimit = 128,
  onStateChange,
  onForfeit,
  onAbandon
} = {}) {
  if (!isRecord(initialState) || typeof initialState.gameId !== "string") {
    throw new TypeError("A host sync session requires authoritative engine state.");
  }
  if (typeof roomSecret !== "string" || roomSecret.length < 12) {
    throw new TypeError("A room resume secret of at least twelve characters is required.");
  }
  if (typeof send !== "function" && typeof broadcast !== "function") {
    throw new TypeError("A send or broadcast callback is required.");
  }
  if (
    typeof executeCommand !== "function"
    || typeof fingerprintCommand !== "function"
    || typeof projectEvent !== "function"
    || typeof snapshotFor !== "function"
  ) {
    throw new TypeError("Engine command and projection callbacks are required.");
  }

  let state = initialState;
  let messageNumber = 0;
  const seatRecords = normalizeSeats(state, seats);
  const droppedSeatIds = new Set(
    [...seatRecords.values()].filter((seat) => seat.dropped).map((seat) => seat.seatId)
  );
  const initiallyDisconnected = [...seatRecords.values()].filter((seat) => !seat.dropped && !seat.connected);
  const initialRecoveryDeadlines = initiallyDisconnected
    .map((seat) => seat.recoveryDeadline)
    .filter(Number.isFinite);
  let statusState = state.completion?.reason === "FORFEIT"
    ? SYNC_STATUS.FORFEIT
    : initiallyDisconnected.length > 0 ? SYNC_STATUS.PAUSED : SYNC_STATUS.RUNNING;
  let pauseReason = initiallyDisconnected.length > 0 ? "SEAT_DISCONNECTED" : null;
  let recoveryDeadline = initialRecoveryDeadlines.length > 0
    ? Math.min(...initialRecoveryDeadlines)
    : null;
  let winnerSeatId = state.completion?.reason === "FORFEIT"
    ? state.completion.winnerSeatId
    : null;
  const notCommittedBySeat = new Map([...seatRecords.keys()].map((seatId) => [seatId, new Map()]));
  const history = [];
  const historyLimit = finiteInteger(eventHistoryLimit, 128);
  const timeout = finiteInteger(disconnectTimeoutMs, DEFAULT_DISCONNECT_TIMEOUT_MS);
  for (const record of Array.isArray(notCommittedCommands) ? notCommittedCommands : []) {
    if (
      seatRecords.has(record?.seatId)
      && typeof record.commandId === "string"
      && record.commandId.length > 0
      && typeof record.commandFingerprint === "string"
      && record.commandFingerprint.length > 0
    ) {
      notCommittedBySeat.get(record.seatId).set(record.commandId, record.commandFingerprint);
    }
  }

  function id(prefix) {
    messageNumber += 1;
    return `host:${prefix}:${messageNumber}`;
  }

  function envelope(type, payload, prefix = type.toLowerCase()) {
    return createEnvelope({
      matchId: state.gameId,
      type,
      messageId: id(prefix),
      sentAt: clock(),
      engineSchemaVersion: state.schemaVersion,
      rulesVersion: state.rulesVersion,
      payload
    });
  }

  function activeSeatIds() {
    return [...seatRecords.values()].filter((seat) => !seat.dropped).map((seat) => seat.seatId);
  }

  function disconnectedSeatIds() {
    return [...seatRecords.values()]
      .filter((seat) => !seat.dropped && !seat.connected)
      .map((seat) => seat.seatId);
  }

  function status() {
    return publicSessionStatus({
      state: statusState,
      authoritativeSequence: state.revision,
      activeSeatIds: activeSeatIds(),
      disconnectedSeatIds: disconnectedSeatIds(),
      droppedSeatIds: [...droppedSeatIds],
      pauseReason,
      recoveryDeadline,
      winnerSeatId
    });
  }

  function emitStateChange(kind, detail = {}) {
    onStateChange?.(freeze({ kind, ...clone(detail), status: status() }));
  }

  function deliverOne(seatId, outgoing) {
    if (seatId === state.hostSeatId) return;
    try {
      const result = typeof send === "function"
        ? send(seatId, outgoing)
        : broadcast([{ seatId, envelope: outgoing }]);
      result?.catch?.(() => {});
    } catch {
      // The authoritative transition must not depend on a transient transport
      // callback. Retry/resync uses the retained command ledger and history.
    }
  }

  function deliverMany(deliveries) {
    const filtered = deliveries.filter(({ seatId }) => seatId !== state.hostSeatId);
    if (filtered.length === 0) return;
    if (typeof broadcast === "function") {
      try {
        const result = broadcast(filtered);
        result?.catch?.(() => {});
      } catch {
        // Each recipient can recover by sequence using RESYNC_REQUEST.
      }
    } else {
      for (const delivery of filtered) deliverOne(delivery.seatId, delivery.envelope);
    }
  }

  function control(kind, detail = {}) {
    const outgoing = envelope(SYNC_MESSAGE.CONTROL, {
      kind,
      ...detail,
      status: status()
    }, `control:${kind.toLowerCase()}`);
    deliverMany(
      [...seatRecords.values()]
        .filter((seat) => seat.connected && !seat.dropped)
        .map((seat) => ({ seatId: seat.seatId, envelope: outgoing }))
    );
    emitStateChange(kind, detail);
  }

  function snapshotMessage(seatId, reason) {
    return envelope(SYNC_MESSAGE.SNAPSHOT, {
      authoritativeSequence: state.revision,
      reason,
      snapshot: snapshotFor(state, seatId)
    }, `snapshot:${seatId}`);
  }

  function eventMessage(entry, seatId) {
    const delivery = entry.deliveries.get(seatId);
    if (!delivery) return null;
    return envelope(SYNC_MESSAGE.EVENT, {
      authoritativeSequence: entry.sequence,
      event: delivery.event,
      snapshot: delivery.snapshot
    }, `event:${entry.sequence}:${seatId}`);
  }

  function commandResult(seatId, commandId, result) {
    const payload = result.accepted
      ? {
          commandId,
          accepted: true,
          duplicate: Boolean(result.duplicate),
          authoritativeSequence: result.revision
        }
      : {
          commandId,
          accepted: false,
          reason: result.reason,
          ...(result.detail === undefined ? {} : { detail: result.detail }),
          authoritativeSequence: state.revision
        };
    deliverOne(seatId, envelope(SYNC_MESSAGE.COMMAND_RESULT, payload, `result:${commandId}`));
  }

  function recordAccepted(result) {
    const deliveries = new Map();
    for (const seatId of seatRecords.keys()) {
      deliveries.set(seatId, freeze({
        event: projectEvent(result.event, seatId),
        snapshot: snapshotFor(result.state, seatId)
      }));
    }
    const entry = {
      sequence: result.event.sequence,
      commandId: result.event.commandId,
      deliveries
    };
    history.push(entry);
    while (history.length > historyLimit) history.shift();
    return entry;
  }

  function publishAccepted(result) {
    state = result.state;
    if (result.event?.type === "SEAT_DROPPED") {
      const droppedSeat = seatRecords.get(result.event.payload?.seatId);
      if (droppedSeat) {
        droppedSeat.dropped = true;
        droppedSeat.connected = false;
        droppedSeat.disconnectedAt = null;
        droppedSeat.recoveryDeadline = null;
        droppedSeatIds.add(droppedSeat.seatId);
      }
      if (state.completion?.reason === "FORFEIT") {
        statusState = SYNC_STATUS.FORFEIT;
        pauseReason = null;
        recoveryDeadline = null;
        winnerSeatId = state.completion.winnerSeatId;
      }
    }
    const entry = recordAccepted(result);
    deliverMany([...seatRecords.values()]
      .filter((seat) => seat.connected && !seat.dropped)
      .map((seat) => ({ seatId: seat.seatId, envelope: eventMessage(entry, seat.seatId) })));
    return entry;
  }

  function rejectProtocolCommand(seatId, commandId, reason) {
    commandResult(seatId, commandId, {
      accepted: false,
      reason,
      state
    });
    return freeze({ ok: false, reason });
  }

  function handleCommand(seatId, payload) {
    const command = payload.command;
    const commandId = command?.clientCommandId;
    if (!isRecord(command) || typeof commandId !== "string" || commandId.length === 0) {
      return rejectProtocolCommand(seatId, commandId ?? "", SYNC_REJECTION.INVALID_MESSAGE);
    }
    const tombstone = notCommittedBySeat.get(seatId)?.get(commandId);
    if (tombstone) {
      let fingerprint;
      try {
        fingerprint = fingerprintCommand(command);
      } catch {
        return rejectProtocolCommand(seatId, commandId, SYNC_REJECTION.INVALID_MESSAGE);
      }
      return rejectProtocolCommand(
        seatId,
        commandId,
        fingerprint === tombstone
          ? SYNC_REJECTION.COMMAND_NOT_COMMITTED
          : SYNC_REJECTION.COMMAND_ID_CONFLICT
      );
    }
    if ([SYNC_STATUS.FORFEIT, SYNC_STATUS.ABANDONED].includes(statusState)) {
      return rejectProtocolCommand(seatId, commandId, SYNC_REJECTION.MATCH_FINISHED);
    }
    if (statusState !== SYNC_STATUS.RUNNING) {
      return rejectProtocolCommand(seatId, commandId, SYNC_REJECTION.MATCH_PAUSED);
    }
    if (command.actorSeatId !== seatId) {
      return rejectProtocolCommand(seatId, commandId, SYNC_REJECTION.NOT_AUTHORIZED);
    }
    const seat = seatRecords.get(seatId);
    if (!seat || seat.dropped || !seat.connected) {
      return rejectProtocolCommand(seatId, commandId, SYNC_REJECTION.NOT_AUTHORIZED);
    }

    const result = executeCommand(state, command);
    if (!result.accepted) {
      commandResult(seatId, commandId, result);
      return freeze({ ok: true, accepted: false, reason: result.reason });
    }

    if (result.duplicate) {
      const prior = history.find((entry) => entry.sequence === result.event.sequence);
      if (prior) {
        const outgoing = eventMessage(prior, seatId);
        if (outgoing) deliverOne(seatId, outgoing);
      } else {
        deliverOne(seatId, snapshotMessage(seatId, "DUPLICATE_COMMAND_RECOVERY"));
      }
      commandResult(seatId, commandId, result);
      return freeze({ ok: true, accepted: true, duplicate: true, sequence: result.revision });
    }

    publishAccepted(result);
    commandResult(seatId, commandId, result);
    emitStateChange("COMMAND_ACCEPTED", {
      commandId,
      seatId,
      sequence: result.revision
    });
    return freeze({ ok: true, accepted: true, duplicate: false, sequence: result.revision });
  }

  function handleAck(seatId, payload) {
    const seat = seatRecords.get(seatId);
    const sequence = payload.authoritativeSequence;
    if (seat && Number.isInteger(sequence) && sequence >= seat.lastAcknowledgedSequence && sequence <= state.revision) {
      seat.lastAcknowledgedSequence = sequence;
    }
    return freeze({ ok: true, acknowledgedSequence: seat?.lastAcknowledgedSequence ?? 0 });
  }

  function catchUp(seatId, lastSequence, reason) {
    const sequence = Number.isInteger(lastSequence) && lastSequence >= 0 ? lastSequence : -1;
    const earliest = history[0]?.sequence ?? (state.revision + 1);
    const canReplay = sequence <= state.revision && sequence >= earliest - 1;
    if (!canReplay) {
      deliverOne(seatId, snapshotMessage(seatId, reason));
      return "SNAPSHOT";
    }
    const missed = history.filter((entry) => entry.sequence > sequence);
    for (const entry of missed) {
      const outgoing = eventMessage(entry, seatId);
      if (outgoing) deliverOne(seatId, outgoing);
    }
    if (missed.length === 0 && sequence !== state.revision) {
      deliverOne(seatId, snapshotMessage(seatId, reason));
      return "SNAPSHOT";
    }
    return "EVENTS";
  }

  function handleResync(seatId, payload) {
    const mode = catchUp(seatId, payload.lastSequence, "SEQUENCE_GAP");
    const pendingCommands = Array.isArray(payload.pendingCommands)
      ? payload.pendingCommands
        .filter((record) =>
          typeof record?.commandId === "string"
          && record.commandId.length > 0
          && record.commandId.length <= 128
          && typeof record.commandFingerprint === "string"
          && record.commandFingerprint.length > 0
          && record.commandFingerprint.length <= 16_384
        )
        .filter((record, index, records) =>
          records.findIndex((candidate) => candidate.commandId === record.commandId) === index
        )
        .slice(0, 32)
      : [];
    for (const { commandId, commandFingerprint } of pendingCommands) {
      const prior = state.commandLedger?.[commandId];
      if (prior?.event?.sequence) {
        if (prior.commandFingerprint === commandFingerprint) {
          commandResult(seatId, commandId, {
            accepted: true,
            duplicate: true,
            revision: prior.event.sequence
          });
        } else {
          commandResult(seatId, commandId, {
            accepted: false,
            reason: SYNC_REJECTION.COMMAND_ID_CONFLICT
          });
        }
      } else {
        const tombstones = notCommittedBySeat.get(seatId);
        if (tombstones.size >= 256) tombstones.delete(tombstones.keys().next().value);
        tombstones.set(commandId, commandFingerprint);
        commandResult(seatId, commandId, {
          accepted: false,
          reason: SYNC_REJECTION.COMMAND_NOT_COMMITTED
        });
      }
    }
    return freeze({
      ok: true,
      mode,
      reconciledCommandIds: pendingCommands.map((record) => record.commandId)
    });
  }

  function handleRebind(seatId, payload) {
    const seat = seatRecords.get(seatId);
    if (!seat || seat.dropped) {
      const reason = seat?.dropped ? SYNC_REJECTION.REBIND_EXPIRED : SYNC_REJECTION.REBIND_DENIED;
      deliverOne(seatId, envelope(SYNC_MESSAGE.REBIND_ACCEPTED, {
        accepted: false,
        reason
      }, `rebind-denied:${seatId}`));
      return freeze({ ok: false, reason });
    }
    if (payload.roomSecret !== roomSecret || payload.seatSecret !== seat.seatSecret) {
      deliverOne(seatId, envelope(SYNC_MESSAGE.REBIND_ACCEPTED, {
        accepted: false,
        reason: SYNC_REJECTION.REBIND_DENIED
      }, `rebind-denied:${seatId}`));
      return freeze({ ok: false, reason: SYNC_REJECTION.REBIND_DENIED });
    }
    const now = clock();
    if (seat.recoveryDeadline !== null && now >= seat.recoveryDeadline) {
      dropExpiredSeats(now);
      deliverOne(seatId, envelope(SYNC_MESSAGE.REBIND_ACCEPTED, {
        accepted: false,
        reason: SYNC_REJECTION.REBIND_EXPIRED
      }, `rebind-expired:${seatId}`));
      return freeze({ ok: false, reason: SYNC_REJECTION.REBIND_EXPIRED });
    }

    seat.connected = true;
    seat.disconnectedAt = null;
    seat.recoveryDeadline = null;
    const mode = catchUp(seatId, payload.lastSequence, "REBIND");
    deliverOne(seatId, envelope(SYNC_MESSAGE.REBIND_ACCEPTED, {
      accepted: true,
      authoritativeSequence: state.revision,
      catchUp: mode,
      status: status()
    }, `rebind-accepted:${seatId}`));
    recomputePause("SEAT_REBOUND", seatId);
    return freeze({ ok: true, mode });
  }

  function receiveFromSeat(seatId, incoming) {
    const checked = validateEnvelope(incoming, {
      matchId: state.gameId,
      engineSchemaVersion: state.schemaVersion,
      rulesVersion: state.rulesVersion
    });
    if (!checked.ok) return freeze(checked);
    if (!seatRecords.has(seatId) || seatId === state.hostSeatId) {
      return freeze({ ok: false, reason: SYNC_REJECTION.NOT_AUTHORIZED });
    }
    switch (incoming.type) {
      case SYNC_MESSAGE.COMMAND: return handleCommand(seatId, incoming.payload);
      case SYNC_MESSAGE.ACK: return handleAck(seatId, incoming.payload);
      case SYNC_MESSAGE.RESYNC_REQUEST: return handleResync(seatId, incoming.payload);
      case SYNC_MESSAGE.REBIND_REQUEST: return handleRebind(seatId, incoming.payload);
      default: return freeze({ ok: false, reason: SYNC_REJECTION.INVALID_MESSAGE });
    }
  }

  function submitHostCommand(command) {
    if (!isRecord(command) || command.actorSeatId !== state.hostSeatId) {
      return freeze({ ok: false, reason: SYNC_REJECTION.NOT_AUTHORIZED });
    }
    return handleCommand(state.hostSeatId, { command });
  }

  function recomputePause(kind, seatId = null) {
    if ([SYNC_STATUS.FORFEIT, SYNC_STATUS.ABANDONED].includes(statusState)) return;
    const disconnected = disconnectedSeatIds();
    if (disconnected.length > 0) {
      statusState = SYNC_STATUS.PAUSED;
      pauseReason = "SEAT_DISCONNECTED";
      recoveryDeadline = Math.min(...disconnected.map((id) => seatRecords.get(id).recoveryDeadline));
      return;
    }
    const wasPaused = statusState === SYNC_STATUS.PAUSED;
    statusState = SYNC_STATUS.RUNNING;
    pauseReason = null;
    recoveryDeadline = null;
    if (wasPaused) control("RESUMED", { reason: kind, ...(seatId === null ? {} : { seatId }) });
  }

  function disconnectSeat(seatId, at = clock()) {
    const seat = seatRecords.get(seatId);
    if (!seat || seat.dropped || seatId === state.hostSeatId || !seat.connected) {
      return freeze({ ok: false, reason: SYNC_REJECTION.NOT_AUTHORIZED });
    }
    seat.connected = false;
    seat.disconnectedAt = at;
    seat.recoveryDeadline = at + timeout;
    statusState = SYNC_STATUS.PAUSED;
    pauseReason = "SEAT_DISCONNECTED";
    recoveryDeadline = Math.min(
      ...disconnectedSeatIds().map((id) => seatRecords.get(id).recoveryDeadline)
    );
    control("PAUSED", { reason: pauseReason, seatId, recoveryDeadline: seat.recoveryDeadline });
    return freeze({ ok: true, recoveryDeadline: seat.recoveryDeadline });
  }

  function dropExpiredSeats(now = clock()) {
    if ([SYNC_STATUS.FORFEIT, SYNC_STATUS.ABANDONED].includes(statusState)) return [];
    const expired = [...seatRecords.values()].filter((seat) =>
      seat.seatId !== state.hostSeatId
      && !seat.connected
      && !seat.dropped
      && seat.recoveryDeadline !== null
      && now >= seat.recoveryDeadline
    );
    for (const seat of expired) {
      // Stage 6 owns the gameplay consequence of expiry. The engine reducer
      // creates the replayable dead-hand/next-active-seat transition; sync
      // only supplies the authoritative deadline and delivery.
      const drop = executeCommand(state, {
        type: "DROP_SEAT",
        gameId: state.gameId,
        handId: state.hand?.id,
        actorSeatId: state.hostSeatId,
        seatId: seat.seatId,
        reason: "RECONNECT_EXPIRED",
        droppedAt: now,
        clientCommandId: `${state.gameId}:drop:${seat.seatId}:${now}`,
        expectedRevision: state.revision
      });
      if (!drop.accepted) {
        abandon("DROP_SEAT_REJECTED");
        return [];
      }
      publishAccepted(drop);
      seat.dropped = true;
      seat.recoveryDeadline = null;
      droppedSeatIds.add(seat.seatId);
    }
    if (expired.length === 0) return [];

    const active = activeSeatIds();
    if (active.length === 1) {
      statusState = SYNC_STATUS.FORFEIT;
      pauseReason = null;
      recoveryDeadline = null;
      winnerSeatId = active[0];
      control("FORFEIT", {
        winnerSeatId,
        droppedSeatIds: expired.map((seat) => seat.seatId)
      });
      onForfeit?.(freeze({
        winnerSeatId,
        droppedSeatIds: [...droppedSeatIds],
        authoritativeState: state
      }));
    } else {
      recomputePause("SEAT_DROPPED");
      control("SEAT_DROPPED", {
        seatIds: expired.map((seat) => seat.seatId),
        deadHandSeatIds: expired.map((seat) => seat.seatId)
      });
    }
    return expired.map((seat) => seat.seatId);
  }

  function sendSnapshot(seatId, reason = "INITIAL") {
    const seat = seatRecords.get(seatId);
    if (!seat || seat.dropped) return false;
    deliverOne(seatId, snapshotMessage(seatId, reason));
    return true;
  }

  function abandon(reason = "HOST_LEFT") {
    if ([SYNC_STATUS.FORFEIT, SYNC_STATUS.ABANDONED].includes(statusState)) return status();
    statusState = SYNC_STATUS.ABANDONED;
    pauseReason = null;
    recoveryDeadline = null;
    control("ABANDONED", { reason });
    onAbandon?.(freeze({ reason, authoritativeState: state }));
    return status();
  }

  function inspect() {
    return freeze({
      state,
      status: status(),
      history: history.map((entry) => ({
        sequence: entry.sequence,
        commandId: entry.commandId
      })),
      acknowledgements: Object.fromEntries([...seatRecords].map(([seatId, seat]) => [
        seatId,
        seat.lastAcknowledgedSequence
      ]))
    });
  }

  function exportRecoveryRecord() {
    return freeze({
      recoveryVersion: SYNC_RECOVERY_VERSION,
      syncSchemaVersion: SYNC_SCHEMA_VERSION,
      protocolVersion: SYNC_PROTOCOL_VERSION,
      engineSchemaVersion: state.schemaVersion,
      rulesVersion: state.rulesVersion,
      matchId: state.gameId,
      roomSecret,
      authoritativeState: state,
      sessionStatus: status(),
      seats: Object.fromEntries([...seatRecords].map(([seatId, seat]) => [seatId, {
        seatSecret: seat.seatSecret,
        connected: seat.connected,
        disconnectedAt: seat.disconnectedAt,
        recoveryDeadline: seat.recoveryDeadline,
        dropped: seat.dropped,
        lastAcknowledgedSequence: seat.lastAcknowledgedSequence
      }])),
      notCommittedCommands: [...notCommittedBySeat].flatMap(([seatId, commands]) =>
        [...commands].map(([commandId, commandFingerprint]) => ({
          seatId,
          commandId,
          commandFingerprint
        }))
      )
    });
  }

  return freeze({
    receiveFromSeat,
    submitHostCommand,
    disconnectSeat,
    sweep: dropExpiredSeats,
    abandon,
    sendSnapshot,
    getState: () => state,
    getStatus: status,
    exportRecoveryRecord,
    shouldClearRecovery: () => [SYNC_STATUS.FORFEIT, SYNC_STATUS.ABANDONED].includes(statusState),
    inspect
  });
}

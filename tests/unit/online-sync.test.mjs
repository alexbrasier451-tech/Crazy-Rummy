import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMAND_TYPE,
  SCHEMA_VERSION,
  RULES_VERSION,
  createLobbyState,
  createSeat,
  executeCommand,
  initialDealerSeatIdFor,
  publicView
} from "../../src/engine/index.js";
import {
  DEFAULT_DISCONNECT_TIMEOUT_MS,
  SYNC_MESSAGE,
  SYNC_PROTOCOL_VERSION,
  SYNC_SCHEMA_VERSION,
  SYNC_STATUS,
  createClientSyncSession,
  createEnvelope,
  createHostSyncSession
} from "../../src/online/sync/index.js";

const ROOM_SECRET = "room-secret-opaque-123";
const SEAT_SECRETS = Object.freeze({
  a: "seat-secret-a",
  b: "seat-secret-b",
  c: "seat-secret-c"
});

function fixture() {
  const seatIds = ["a", "b", "c"];
  const seats = seatIds.map((seatId) => createSeat({
    seatId,
    playerId: `player-${seatId}`,
    displayName: seatId.toUpperCase(),
    ready: true
  }));
  const initial = createLobbyState({
    gameId: "sync-match",
    hostSeatId: "a",
    seats
  });
  let seedNumber = 0;
  let seed;
  do {
    seed = `sync-seed-${++seedNumber}`;
  } while (initialDealerSeatIdFor(seed, seatIds) !== "b");
  const started = executeCommand(initial, {
    type: COMMAND_TYPE.START_GAME,
    gameId: initial.gameId,
    actorSeatId: "a",
    clientCommandId: "start-sync",
    expectedRevision: initial.revision,
    initialDealerSeatId: "b",
    shuffleSeed: seed
  });
  assert.equal(started.accepted, true);
  return started.state;
}

function command(state, type, actorSeatId, clientCommandId, fields = {}) {
  return {
    type,
    gameId: state.gameId,
    handId: state.hand?.id,
    actorSeatId,
    clientCommandId,
    expectedRevision: state.revision,
    ...fields
  };
}

function publicPart(snapshot) {
  const result = structuredClone(snapshot);
  if (result.hand) delete result.hand.ownHandCardIds;
  return result;
}

function manualScheduler() {
  const tasks = [];
  return {
    setTimeout(callback) {
      const task = { callback, cancelled: false };
      tasks.push(task);
      return task;
    },
    clearTimeout(task) {
      task.cancelled = true;
    },
    runAll(limit = 30) {
      let count = 0;
      while (tasks.some((task) => !task.cancelled && !task.ran)) {
        const task = tasks.find((candidate) => !candidate.cancelled && !candidate.ran);
        task.ran = true;
        task.callback();
        if (++count > limit) throw new Error("Scheduler did not settle.");
      }
    }
  };
}

function networkFixture({ state = fixture(), historyLimit = 128 } = {}) {
  const uplink = [];
  const downlink = { b: [], c: [] };
  let now = 10_000;
  const host = createHostSyncSession({
    state,
    roomSecret: ROOM_SECRET,
    seats: Object.fromEntries(Object.entries(SEAT_SECRETS).map(([seatId, seatSecret]) => [
      seatId,
      { seatSecret }
    ])),
    eventHistoryLimit: historyLimit,
    clock: () => now,
    send(seatId, envelope) {
      downlink[seatId]?.push(envelope);
    }
  });
  const clients = Object.fromEntries(["b", "c"].map((seatId) => [seatId, createClientSyncSession({
    matchId: state.gameId,
    seatId,
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    clock: () => now,
    scheduler: manualScheduler(),
    send(envelope) {
      uplink.push({ seatId, envelope });
    }
  })]));
  return {
    host,
    clients,
    uplink,
    downlink,
    now: () => now,
    setNow(value) { now = value; },
    deliverInitialSnapshots() {
      for (const seatId of Object.keys(clients)) {
        host.sendSnapshot(seatId);
        clients[seatId].receive(downlink[seatId].shift());
      }
      uplink.length = 0;
    },
    deliverUplink(index = 0) {
      const [{ seatId, envelope }] = uplink.splice(index, 1);
      return host.receiveFromSeat(seatId, envelope);
    }
  };
}

test("versioned envelopes keep transport, engine schema, and rules compatibility separate", () => {
  const valid = createEnvelope({
    matchId: "sync-match",
    type: SYNC_MESSAGE.ACK,
    messageId: "ack-1",
    sentAt: 1,
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    payload: { authoritativeSequence: 0 }
  });
  assert.equal(valid.schemaVersion, SYNC_SCHEMA_VERSION);
  assert.equal(valid.protocolVersion, SYNC_PROTOCOL_VERSION);
  assert.equal(valid.engineSchemaVersion, SCHEMA_VERSION);
  assert.equal(valid.rulesVersion, RULES_VERSION);

  const sent = [];
  const client = createClientSyncSession({
    matchId: "sync-match",
    seatId: "b",
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    send: (message) => sent.push(message)
  });
  assert.equal(client.receive({ ...valid, protocolVersion: "other-protocol" }).reason, "UNSUPPORTED_SCHEMA");
  assert.equal(client.receive({ ...valid, engineSchemaVersion: SCHEMA_VERSION + 1 }).reason, "UNSUPPORTED_SCHEMA");
  assert.equal(client.receive({ ...valid, rulesVersion: "other-rules" }).reason, "UNSUPPORTED_SCHEMA");
});

test("duplicate, delayed, and reordered delivery cannot duplicate moves, diverge public state, or leak another hand", () => {
  const network = networkFixture();
  network.deliverInitialSnapshots();
  const openingState = network.host.getState();
  const dealerCard = openingState.hand.handsBySeat.b[0];

  network.clients.b.submitCommand(command(
    openingState,
    COMMAND_TYPE.DEALER_INITIAL_DISCARD,
    "b",
    "b-opening",
    { cardId: dealerCard }
  ));
  const originalCommandEnvelope = network.uplink[0].envelope;
  assert.equal(network.deliverUplink().accepted, true);
  assert.equal(network.host.getState().revision, 2);

  const drawState = network.host.getState();
  assert.equal(drawState.hand.activeSeatId, "c");
  network.clients.c.submitCommand(command(
    drawState,
    COMMAND_TYPE.DRAW_STOCK,
    "c",
    "c-draw"
  ));
  assert.equal(network.deliverUplink().accepted, true);
  assert.equal(network.host.getState().revision, 3);

  // The exact first command is retried after later state has already arrived.
  // Engine command-ledger idempotency must win before stale-revision handling.
  const duplicate = network.host.receiveFromSeat("b", originalCommandEnvelope);
  assert.equal(duplicate.duplicate, true);
  assert.equal(network.host.getState().revision, 3);
  assert.deepEqual(Object.keys(network.host.getState().commandLedger).sort(), [
    "b-opening",
    "c-draw",
    "start-sync"
  ]);

  const projectedDraws = {};
  for (const seatId of ["b", "c"]) {
    const messages = network.downlink[seatId].splice(0);
    const events = messages.filter((message) => message.type === SYNC_MESSAGE.EVENT);
    const others = messages.filter((message) => message.type !== SYNC_MESSAGE.EVENT);
    for (const message of others) network.clients[seatId].receive(message);
    events.sort((left, right) =>
      right.payload.authoritativeSequence - left.payload.authoritativeSequence
    );
    for (const message of events) {
      if (message.payload.authoritativeSequence === 3) projectedDraws[seatId] = message;
      network.clients[seatId].receive(message);
    }
    // A late duplicate is harmless.
    network.clients[seatId].receive(events[0]);
  }

  const authoritative = network.host.getState();
  for (const seatId of ["b", "c"]) {
    assert.equal(network.clients[seatId].inspect().bufferedSequences.length, 0);
    assert.equal(network.clients[seatId].getStatus().authoritativeSequence, authoritative.revision);
    assert.deepEqual(publicPart(network.clients[seatId].getProjection()), publicView(authoritative));
  }

  assert.equal(Object.hasOwn(projectedDraws.b.payload.event.payload, "cardId"), false);
  assert.equal(Object.hasOwn(projectedDraws.c.payload.event.payload, "cardId"), true);
  const bWire = JSON.stringify(network.clients.b.getProjection());
  for (const privateCardId of authoritative.hand.handsBySeat.c) {
    assert.equal(bWire.includes(privateCardId), false, `b received c private card ${privateCardId}`);
  }
  assert.deepEqual(
    network.clients.b.getProjection().hand.ownHandCardIds,
    authoritative.hand.handsBySeat.b
  );
});

test("commands retry with one stable ID, stop at a bound, and resynchronise an uncertain acknowledgement", () => {
  const scheduler = manualScheduler();
  const sent = [];
  const results = [];
  const client = createClientSyncSession({
    matchId: "sync-match",
    seatId: "b",
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    scheduler,
    retry: { initialMs: 10, maximumMs: 20, maximumAttempts: 3 },
    send: (message) => sent.push(message),
    onCommandResult: (result) => results.push(result)
  });
  const state = fixture();
  client.submitCommand(command(
    state,
    COMMAND_TYPE.DEALER_INITIAL_DISCARD,
    "b",
    "retry-one-id",
    { cardId: state.hand.handsBySeat.b[0] }
  ));
  scheduler.runAll();

  const attempts = sent.filter((message) => message.type === SYNC_MESSAGE.COMMAND);
  assert.equal(attempts.length, 3);
  assert.deepEqual(new Set(attempts.map((message) => message.messageId)).size, 1);
  assert.deepEqual(new Set(attempts.map((message) => message.payload.command.clientCommandId)).size, 1);
  assert.equal(sent.at(-1).type, SYNC_MESSAGE.RESYNC_REQUEST);
  assert.deepEqual(results.at(-1), {
    commandId: "retry-one-id",
    accepted: null,
    reason: "RETRY_EXHAUSTED",
    uncertain: true
  });
});

test("disconnect and terminal control suspend pending retries until authoritative reconciliation", () => {
  const scheduler = manualScheduler();
  const sent = [];
  const state = fixture();
  const client = createClientSyncSession({
    matchId: state.gameId,
    seatId: "b",
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    scheduler,
    retry: { initialMs: 10, maximumMs: 20, maximumAttempts: 3 },
    send: (message) => sent.push(message),
  });
  client.submitCommand(command(
    state,
    COMMAND_TYPE.DEALER_INITIAL_DISCARD,
    "b",
    "disconnect-pending",
    { cardId: state.hand.handsBySeat.b[0] }
  ));
  client.markHostDisconnected();
  scheduler.runAll();
  assert.equal(sent.filter((message) => message.type === SYNC_MESSAGE.COMMAND).length, 1);

  client.receive(createEnvelope({
    matchId: state.gameId,
    type: SYNC_MESSAGE.CONTROL,
    messageId: "host-abandoned",
    sentAt: 10,
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    payload: { kind: "ABANDONED", reason: "HOST_LOST" },
  }));
  scheduler.runAll();
  assert.equal(sent.filter((message) => message.type === SYNC_MESSAGE.COMMAND).length, 1);
  assert.equal(client.getStatus().state, SYNC_STATUS.ABANDONED);
});

test("successful rebind reconciles an uncertain command through the host ledger", () => {
  const network = networkFixture();
  network.deliverInitialSnapshots();
  const results = [];
  const state = network.host.getState();
  const client = createClientSyncSession({
    matchId: state.gameId,
    seatId: "b",
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    scheduler: manualScheduler(),
    send(envelope) {
      network.uplink.push({ seatId: "b", envelope });
    },
    onCommandResult(result) {
      results.push(result);
    },
  });
  client.submitCommand(command(
    state,
    COMMAND_TYPE.DEALER_INITIAL_DISCARD,
    "b",
    "lost-before-authority",
    { cardId: state.hand.handsBySeat.b[0] }
  ));
  const delayedCommand = network.uplink[0].envelope;
  // The command was lost before reaching the host, so it is uncertain but not
  // committed. Rebind must query that command ID instead of retrying it.
  network.uplink.length = 0;
  client.markHostDisconnected();
  network.host.disconnectSeat("b");
  client.requestRebind({ roomSecret: ROOM_SECRET, seatSecret: SEAT_SECRETS.b });
  network.deliverUplink();
  for (const message of network.downlink.b.splice(0)) client.receive(message);

  const reconciliation = network.uplink.find(({ envelope }) =>
    envelope.type === SYNC_MESSAGE.RESYNC_REQUEST
  );
  assert.deepEqual(
    reconciliation.envelope.payload.pendingCommands.map(({ commandId }) => commandId),
    ["lost-before-authority"]
  );
  network.deliverUplink(network.uplink.indexOf(reconciliation));
  for (const message of network.downlink.b.splice(0)) client.receive(message);

  assert.deepEqual(client.inspect().pendingCommandIds, []);
  assert.equal(results.at(-1).commandId, "lost-before-authority");
  assert.equal(results.at(-1).accepted, false);
  assert.equal(results.at(-1).reason, "COMMAND_NOT_COMMITTED");

  const revisionBeforeDelay = network.host.getState().revision;
  const delayedResult = network.host.receiveFromSeat("b", delayedCommand);
  assert.equal(delayedResult.ok, false);
  assert.equal(delayedResult.reason, "COMMAND_NOT_COMMITTED");
  assert.equal(network.host.getState().revision, revisionBeforeDelay);
  const conflictingCommand = structuredClone(delayedCommand);
  conflictingCommand.messageId = "delayed-command-conflict";
  conflictingCommand.payload.command.cardId = state.hand.handsBySeat.b[1];
  const conflictingResult = network.host.receiveFromSeat("b", conflictingCommand);
  assert.equal(conflictingResult.reason, "COMMAND_ID_CONFLICT");
  assert.equal(network.host.getState().revision, revisionBeforeDelay);
  assert.deepEqual(
    network.host.exportRecoveryRecord().notCommittedCommands.map(({ seatId, commandId }) => [
      seatId,
      commandId,
    ]),
    [["b", "lost-before-authority"]]
  );
});

test("an accepted snapshot drains the next contiguous buffered event", () => {
  const network = networkFixture();
  network.deliverInitialSnapshots();
  const opening = network.host.getState();
  network.clients.b.submitCommand(command(
    opening,
    COMMAND_TYPE.DEALER_INITIAL_DISCARD,
    "b",
    "snapshot-drain-opening",
    { cardId: opening.hand.handsBySeat.b[0] }
  ));
  network.deliverUplink();
  const afterOpening = network.host.getState();
  network.clients.c.submitCommand(command(
    afterOpening,
    COMMAND_TYPE.DRAW_STOCK,
    "c",
    "snapshot-drain-draw"
  ));
  network.deliverUplink();

  const events = network.downlink.b
    .filter((message) => message.type === SYNC_MESSAGE.EVENT)
    .sort((left, right) =>
      left.payload.authoritativeSequence - right.payload.authoritativeSequence
    );
  const eventTwo = events.find((message) => message.payload.authoritativeSequence === 2);
  const eventThree = events.find((message) => message.payload.authoritativeSequence === 3);
  const client = createClientSyncSession({
    matchId: opening.gameId,
    seatId: "b",
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    send() {},
  });
  assert.equal(client.receive(eventThree).gap, true);
  assert.deepEqual(client.inspect().bufferedSequences, [3]);
  client.receive(createEnvelope({
    matchId: opening.gameId,
    type: SYNC_MESSAGE.SNAPSHOT,
    messageId: "snapshot-at-two",
    sentAt: 20,
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    payload: {
      authoritativeSequence: 2,
      snapshot: eventTwo.payload.snapshot,
      reason: "SEQUENCE_GAP",
    },
  }));
  assert.equal(client.getStatus().authoritativeSequence, 3);
  assert.deepEqual(client.inspect().bufferedSequences, []);
  assert.deepEqual(publicPart(client.getProjection()), publicView(network.host.getState()));
});

test("seat-secret rebind catches up missed events or falls back to a redacted snapshot", () => {
  const network = networkFixture();
  network.deliverInitialSnapshots();
  const start = network.host.getState();
  network.clients.b.submitCommand(command(
    start,
    COMMAND_TYPE.DEALER_INITIAL_DISCARD,
    "b",
    "rebind-opening",
    { cardId: start.hand.handsBySeat.b[0] }
  ));
  network.deliverUplink();
  const afterOpening = network.host.getState();
  network.clients.c.submitCommand(command(
    afterOpening,
    COMMAND_TYPE.DRAW_STOCK,
    "c",
    "rebind-draw"
  ));
  network.deliverUplink();
  network.downlink.c.length = 0;

  network.host.disconnectSeat("c");
  assert.equal(network.host.getStatus().state, SYNC_STATUS.PAUSED);
  const denied = createEnvelope({
    matchId: start.gameId,
    type: SYNC_MESSAGE.REBIND_REQUEST,
    messageId: "bad-rebind",
    sentAt: network.now(),
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    payload: {
      roomSecret: ROOM_SECRET,
      seatSecret: "wrong-seat-secret",
      lastSequence: 1
    }
  });
  assert.equal(network.host.receiveFromSeat("c", denied).reason, "REBIND_DENIED");

  const accepted = createEnvelope({
    matchId: start.gameId,
    type: SYNC_MESSAGE.REBIND_REQUEST,
    messageId: "good-rebind",
    sentAt: network.now(),
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    payload: {
      roomSecret: ROOM_SECRET,
      seatSecret: SEAT_SECRETS.c,
      lastSequence: 1
    }
  });
  assert.equal(network.host.receiveFromSeat("c", accepted).mode, "EVENTS");
  assert.equal(network.host.getStatus().state, SYNC_STATUS.RUNNING);
  const rebindMessages = network.downlink.c.splice(0);
  assert.deepEqual(
    rebindMessages.filter((message) => message.type === SYNC_MESSAGE.EVENT)
      .map((message) => message.payload.authoritativeSequence),
    [2, 3]
  );
  assert.equal(JSON.stringify(rebindMessages).includes(ROOM_SECRET), false);
  assert.equal(JSON.stringify(rebindMessages).includes(SEAT_SECRETS.c), false);

  const fallback = networkFixture({ state: network.host.getState(), historyLimit: 1 });
  fallback.host.disconnectSeat("b");
  fallback.downlink.b.length = 0;
  const fallbackRequest = createEnvelope({
    matchId: start.gameId,
    type: SYNC_MESSAGE.REBIND_REQUEST,
    messageId: "fallback-rebind",
    sentAt: fallback.now(),
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    payload: {
      roomSecret: ROOM_SECRET,
      seatSecret: SEAT_SECRETS.b,
      lastSequence: 0
    }
  });
  assert.equal(fallback.host.receiveFromSeat("b", fallbackRequest).mode, "SNAPSHOT");
  const snapshot = fallback.downlink.b.find((message) => message.type === SYNC_MESSAGE.SNAPSHOT);
  assert.ok(snapshot);
  assert.deepEqual(snapshot.payload.snapshot.hand.ownHandCardIds, fallback.host.getState().hand.handsBySeat.b);
  for (const privateCardId of fallback.host.getState().hand.handsBySeat.c) {
    assert.equal(JSON.stringify(snapshot).includes(privateCardId), false);
  }
});

test("five-minute guest expiry drops dead hands or forfeits, while host loss abandons without a result", () => {
  const beforeDeadline = networkFixture();
  const beforeExpiry = beforeDeadline.now() + DEFAULT_DISCONNECT_TIMEOUT_MS;
  beforeDeadline.host.disconnectSeat("b");
  beforeDeadline.setNow(beforeExpiry - 1);
  assert.deepEqual(beforeDeadline.host.sweep(), []);
  const justInTime = createEnvelope({
    matchId: beforeDeadline.host.getState().gameId,
    type: SYNC_MESSAGE.REBIND_REQUEST,
    messageId: "just-in-time-rebind",
    sentAt: beforeDeadline.now(),
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    payload: {
      roomSecret: ROOM_SECRET,
      seatSecret: SEAT_SECRETS.b,
      lastSequence: beforeDeadline.host.getState().revision,
    },
  });
  assert.equal(beforeDeadline.host.receiveFromSeat("b", justInTime).ok, true);

  const atDeadline = networkFixture();
  const exactExpiry = atDeadline.now() + DEFAULT_DISCONNECT_TIMEOUT_MS;
  atDeadline.host.disconnectSeat("b");
  atDeadline.setNow(exactExpiry);
  const tooLate = createEnvelope({
    ...justInTime,
    messageId: "at-deadline-rebind",
    sentAt: exactExpiry,
  });
  assert.equal(atDeadline.host.receiveFromSeat("b", tooLate).reason, "REBIND_EXPIRED");
  assert.deepEqual(atDeadline.host.getStatus().droppedSeatIds, ["b"]);

  const continued = networkFixture();
  const deadline = continued.now() + DEFAULT_DISCONNECT_TIMEOUT_MS;
  continued.host.disconnectSeat("b");
  continued.setNow(deadline);
  assert.deepEqual(continued.host.sweep(), ["b"]);
  assert.equal(continued.host.getStatus().state, SYNC_STATUS.RUNNING);
  assert.deepEqual(continued.host.getStatus().activeSeatIds, ["a", "c"]);
  assert.deepEqual(continued.host.getStatus().droppedSeatIds, ["b"]);
  const restoredAfterDrop = networkFixture({ state: continued.host.getState() });
  assert.deepEqual(restoredAfterDrop.host.getStatus().activeSeatIds, ["a", "c"]);
  assert.deepEqual(restoredAfterDrop.host.getStatus().droppedSeatIds, ["b"]);
  assert.equal(restoredAfterDrop.host.sendSnapshot("b"), false);
  const directDrop = networkFixture();
  const directState = directDrop.host.getState();
  const directResult = directDrop.host.submitHostCommand(command(
    directState,
    COMMAND_TYPE.DROP_SEAT,
    "a",
    "direct-host-drop",
    { seatId: "b", reason: "LEFT_MATCH" }
  ));
  assert.equal(directResult.accepted, true);
  assert.deepEqual(directDrop.host.getStatus().activeSeatIds, ["a", "c"]);
  assert.deepEqual(directDrop.host.getStatus().droppedSeatIds, ["b"]);
  assert.equal(directDrop.host.sendSnapshot("b"), false);
  assert.equal(continued.host.abandon("HOST_LEFT").state, SYNC_STATUS.ABANDONED);
  assert.equal(continued.host.getState().lifecycle, "IN_PROGRESS");

  const forfeited = networkFixture();
  const forfeitDeadline = forfeited.now() + DEFAULT_DISCONNECT_TIMEOUT_MS;
  forfeited.host.disconnectSeat("b");
  forfeited.host.disconnectSeat("c");
  forfeited.setNow(forfeitDeadline);
  assert.deepEqual(forfeited.host.sweep(), ["b", "c"]);
  assert.equal(forfeited.host.getStatus().state, SYNC_STATUS.FORFEIT);
  assert.equal(forfeited.host.getStatus().winnerSeatId, "a");
  assert.equal(forfeited.host.shouldClearRecovery(), true);
  // Stage 6 applies the replayable engine drop events before the terminal
  // control, completing by forfeit without fabricating a normal hand score.
  assert.equal(forfeited.host.getState().lifecycle, "COMPLETE");
  assert.equal(forfeited.host.getState().completion.reason, "FORFEIT");

  let now = 50_000;
  const guest = createClientSyncSession({
    matchId: "sync-match",
    seatId: "b",
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    clock: () => now,
    send() {}
  });
  guest.markHostDisconnected();
  assert.equal(guest.getStatus().state, SYNC_STATUS.RECONNECTING);
  now += DEFAULT_DISCONNECT_TIMEOUT_MS - 1;
  guest.sweep();
  assert.equal(guest.getStatus().state, SYNC_STATUS.RECONNECTING);
  now += 1;
  guest.sweep();
  assert.equal(guest.getStatus().state, SYNC_STATUS.ABANDONED);
  assert.equal(guest.getStatus().terminalReason, "HOST_LOST");
  assert.equal(guest.shouldClearRecovery(), true);

  const recordClient = createClientSyncSession({
    matchId: "sync-match",
    seatId: "c",
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    send() {}
  });
  const recovery = recordClient.exportRecoveryRecord({
    roomSecret: ROOM_SECRET,
    seatSecret: SEAT_SECRETS.c
  });
  assert.equal(recovery.recoveryVersion, 1);
  assert.equal(recovery.roomSecret, ROOM_SECRET);
  assert.equal(recovery.seatSecret, SEAT_SECRETS.c);
  assert.equal(recordClient.clearRecovery(), null);
});

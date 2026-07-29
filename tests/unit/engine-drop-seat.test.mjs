import assert from "node:assert/strict";
import test from "node:test";

import {
  CARD_IDS,
  COMMAND_TYPE,
  EVENT_TYPE,
  LIFECYCLE,
  PHASE,
  SYSTEM_ACTOR_SEAT_ID,
  createLobbyState,
  createSeat,
  executeCommand,
  initialDealerSeatIdFor,
  migrateSnapshot,
  playerView,
  projectEvent,
  publicView,
  replayEvents,
  validateStateInvariants
} from "../../src/engine/index.js";

const SEAT_ORDER = Object.freeze(["a", "b", "c"]);

function command(state, type, actorSeatId, id, fields = {}) {
  return {
    type,
    gameId: state.gameId,
    handId: state.hand?.id,
    actorSeatId,
    clientCommandId: id,
    expectedRevision: state.revision,
    ...fields
  };
}

function accept(state, type, actorSeatId, id, fields = {}) {
  const result = executeCommand(state, command(state, type, actorSeatId, id, fields));
  assert.equal(result.accepted, true, `${type}: ${result.reason} ${result.detail ?? ""}`);
  return result;
}

function startedFixture(label = "drop") {
  const seats = SEAT_ORDER.map((seatId) => createSeat({
    seatId,
    playerId: `player-${seatId}`,
    displayName: seatId.toUpperCase(),
    ready: true
  }));
  const initial = createLobbyState({
    gameId: `${label}-game`,
    hostSeatId: "a",
    seats
  });
  let suffix = 0;
  let seed;
  do {
    seed = `${label}-seed-${++suffix}`;
  } while (initialDealerSeatIdFor(seed, SEAT_ORDER) !== "b");
  const start = accept(initial, COMMAND_TYPE.START_GAME, "a", `${label}-start`, {
    initialDealerSeatId: "b",
    shuffleSeed: seed
  });
  return { initial, start, state: start.state, events: [start.event] };
}

function openingDiscard(fixture, label = "opening") {
  const state = fixture.state;
  const result = accept(state, COMMAND_TYPE.DEALER_INITIAL_DISCARD, "b", label, {
    cardId: state.hand.handsBySeat.b[0]
  });
  fixture.state = result.state;
  fixture.events.push(result.event);
  return result;
}

function drop(fixture, seatId, label, fields = {}) {
  const result = accept(fixture.state, COMMAND_TYPE.DROP_SEAT, "a", label, {
    seatId,
    reason: "RECONNECT_EXPIRED",
    droppedAt: 123_456,
    ...fields
  });
  fixture.state = result.state;
  fixture.events.push(result.event);
  return result;
}

function allCardsInHand(state) {
  return [
    ...state.hand.stockCardIds,
    ...state.hand.discardCardIds,
    ...Object.values(state.hand.handsBySeat).flat(),
    ...state.hand.melds.flatMap((meld) => meld.slots.map((slot) => slot.cardId)),
    ...state.hand.deadHandCardIds
  ];
}

function exhaustHand(fixture, label) {
  const actor = fixture.state.hand.activeSeatId;
  const mutable = structuredClone(fixture.state);
  const finalStockCardId = mutable.hand.stockCardIds.at(-1);
  const moved = mutable.hand.stockCardIds.slice(0, -1);
  mutable.hand.stockCardIds = [finalStockCardId];
  mutable.hand.handsBySeat[actor].push(...moved);
  fixture.state = mutable;

  let result = accept(fixture.state, COMMAND_TYPE.DRAW_STOCK, actor, `${label}-draw`);
  fixture.state = result.state;
  fixture.events.push(result.event);
  result = accept(fixture.state, COMMAND_TYPE.FINISH_TABLE_PLAY, actor, `${label}-finish`);
  fixture.state = result.state;
  fixture.events.push(result.event);
  result = accept(fixture.state, COMMAND_TYPE.DISCARD, actor, `${label}-discard`, {
    cardId: fixture.state.hand.drawnCardId
  });
  fixture.state = result.state;
  fixture.events.push(result.event);
}

test("DROP_SEAT is host/system-authorized, revisioned, replayable, and conserves all cards", () => {
  const fixture = startedFixture("replay");
  const rejected = executeCommand(fixture.state, command(
    fixture.state,
    COMMAND_TYPE.DROP_SEAT,
    "c",
    "guest-drop",
    { seatId: "b" }
  ));
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, "NOT_AUTHORIZED");

  openingDiscard(fixture, "replay-opening");
  const deadCards = [...fixture.state.hand.handsBySeat.b];
  const result = drop(fixture, "b", "host-drop");
  assert.equal(result.event.type, EVENT_TYPE.SEAT_DROPPED);
  assert.equal(result.event.sequence, 3);
  assert.deepEqual(result.state.seatOrder, SEAT_ORDER);
  assert.deepEqual(result.state.activeSeatOrder, ["a", "c"]);
  assert.deepEqual(result.state.hand.handsBySeat.b, []);
  assert.deepEqual(result.state.hand.deadHandCardIds, deadCards);
  assert.equal(new Set(allCardsInHand(result.state)).size, CARD_IDS.length);
  assert.deepEqual(replayEvents(fixture.initial, fixture.events), result.state);
  assert.equal(validateStateInvariants(result.state).ok, true);

  const systemFixture = startedFixture("system");
  const systemDrop = accept(
    systemFixture.state,
    COMMAND_TYPE.DROP_SEAT,
    SYSTEM_ACTOR_SEAT_ID,
    "system-drop",
    { seatId: "c", reason: "SYSTEM_POLICY" }
  );
  assert.deepEqual(systemDrop.state.activeSeatOrder, ["a", "b"]);
});

test("reserved system identity cannot be seated and the host cannot be dropped", () => {
  assert.throws(
    () => createSeat({ seatId: SYSTEM_ACTOR_SEAT_ID, playerId: "ordinary-player" }),
    /reserved/i
  );
  const fixture = startedFixture("host-protection");
  const result = executeCommand(fixture.state, command(
    fixture.state,
    COMMAND_TYPE.DROP_SEAT,
    fixture.state.hostSeatId,
    "drop-host",
    { seatId: fixture.state.hostSeatId }
  ));
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "NOT_AUTHORIZED");
});

test("dealer-opening drop starts the next active draw without inventing a discard", () => {
  const fixture = startedFixture("dealer-opening");
  const dealerCards = [...fixture.state.hand.handsBySeat.b];
  drop(fixture, "b", "drop-opening-dealer");
  assert.equal(fixture.state.hand.phase, PHASE.AWAITING_DRAW);
  assert.equal(fixture.state.hand.activeSeatId, "c");
  assert.equal(fixture.state.hand.turnNumber, 1);
  assert.deepEqual(fixture.state.hand.discardCardIds, []);
  assert.deepEqual(fixture.state.hand.deadHandCardIds, dealerCards);
  assert.equal(validateStateInvariants(fixture.state).ok, true);

  const draw = accept(fixture.state, COMMAND_TYPE.DRAW_STOCK, "c", "post-drop-stock");
  assert.equal(draw.state.hand.phase, PHASE.TABLE_PLAY);
});

test("active turns skip a dropped seat from awaiting draw, table play, and awaiting discard", async (t) => {
  for (const phase of [PHASE.AWAITING_DRAW, PHASE.TABLE_PLAY, PHASE.AWAITING_DISCARD]) {
    await t.test(phase, () => {
      const fixture = startedFixture(`phase-${phase}`);
      openingDiscard(fixture, `${phase}-opening`);
      assert.equal(fixture.state.hand.activeSeatId, "c");
      if (phase !== PHASE.AWAITING_DRAW) {
        const draw = accept(fixture.state, COMMAND_TYPE.DRAW_STOCK, "c", `${phase}-draw`);
        fixture.state = draw.state;
        fixture.events.push(draw.event);
      }
      if (phase === PHASE.AWAITING_DISCARD) {
        const finish = accept(fixture.state, COMMAND_TYPE.FINISH_TABLE_PLAY, "c", `${phase}-finish`);
        fixture.state = finish.state;
        fixture.events.push(finish.event);
      }
      const cardsBeforeDrop = [...fixture.state.hand.handsBySeat.c];
      drop(fixture, "c", `${phase}-drop`);
      assert.equal(fixture.state.hand.activeSeatId, "a");
      assert.equal(fixture.state.hand.phase, PHASE.AWAITING_DRAW);
      assert.equal(fixture.state.hand.drawnCardId, null);
      assert.equal(fixture.state.hand.drawSource, null);
      assert.deepEqual(fixture.state.hand.deadHandCardIds, cardsBeforeDrop);
      assert.equal(new Set(allCardsInHand(fixture.state)).size, 52);
      assert.equal(validateStateInvariants(fixture.state).ok, true);
    });
  }
});

test("dropping the player who drew the final stock card completes stock exhaustion with active-only scoring", () => {
  const fixture = startedFixture("final-stock-drop");
  openingDiscard(fixture, "final-stock-drop-opening");
  const actor = fixture.state.hand.activeSeatId;
  const mutable = structuredClone(fixture.state);
  const finalStockCardId = mutable.hand.stockCardIds.at(-1);
  mutable.hand.handsBySeat[actor].push(...mutable.hand.stockCardIds.slice(0, -1));
  mutable.hand.stockCardIds = [finalStockCardId];
  fixture.state = mutable;
  const draw = accept(fixture.state, COMMAND_TYPE.DRAW_STOCK, actor, "final-stock-drop-draw");
  fixture.state = draw.state;
  fixture.events.push(draw.event);
  assert.equal(fixture.state.hand.drewFinalStock, true);

  drop(fixture, actor, "final-stock-drop-seat");
  assert.equal(fixture.state.hand.phase, PHASE.HAND_COMPLETE);
  assert.equal(fixture.state.hand.result.reason, "STOCK_EXHAUSTED");
  assert.deepEqual(Object.keys(fixture.state.hand.result.scoreEntriesBySeat).sort(), ["a", "b"]);
  assert.equal(Object.hasOwn(fixture.state.hand.result.scoreEntriesBySeat, actor), false);
  assert.equal(new Set(allCardsInHand(fixture.state)).size, 52);
  assert.equal(validateStateInvariants(fixture.state).ok, true);
  const factTypes = fixture.events.at(-1).facts.map(({ type }) => type);
  assert.deepEqual(factTypes, [
    "SEAT_DROPPED",
    "STOCK_EXHAUSTED",
    "HAND_SCORED",
    "HAND_COMPLETED"
  ]);
});

test("completed-hand acknowledgement and dealer rotation use active seats only", () => {
  const fixture = startedFixture("ack");
  openingDiscard(fixture, "ack-opening");
  drop(fixture, "c", "ack-drop-c");
  exhaustHand(fixture, "ack-exhaust");
  assert.equal(fixture.state.hand.phase, PHASE.HAND_COMPLETE);
  assert.deepEqual(Object.keys(fixture.state.hand.result.scoreEntriesBySeat).sort(), ["a", "b"]);

  let result = accept(fixture.state, COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT, "a", "ack-a");
  fixture.state = result.state;
  fixture.events.push(result.event);
  assert.equal(fixture.state.hand.index, 1);
  result = accept(fixture.state, COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT, "b", "ack-b");
  fixture.state = result.state;
  fixture.events.push(result.event);
  assert.equal(fixture.state.hand.index, 2);
  assert.equal(fixture.state.dealerSeatId, "a", "rotation skips dropped c after dealer b");
  assert.deepEqual(fixture.state.hand.participantSeatIds, ["a", "b"]);
  assert.equal(fixture.state.hand.handsBySeat.c.length, 0);
  assert.equal(validateStateInvariants(fixture.state).ok, true);
});

test("dropping during result acknowledgement retains the completed score and removes only the future obligation", () => {
  const fixture = startedFixture("result-drop");
  openingDiscard(fixture, "result-drop-opening");
  exhaustHand(fixture, "result-drop-exhaust");
  const retainedScore = fixture.state.hand.result.scoreEntriesBySeat.c.total;
  const retainedCumulative = fixture.state.seats.c.cumulativeScore;

  let result = accept(fixture.state, COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT, "a", "result-ack-a");
  fixture.state = result.state;
  fixture.events.push(result.event);
  drop(fixture, "c", "result-drop-c");
  assert.equal(fixture.state.hand.index, 1);
  assert.equal(fixture.state.hand.result.scoreEntriesBySeat.c.total, retainedScore);
  assert.equal(fixture.state.seats.c.cumulativeScore, retainedCumulative);
  const droppedAck = executeCommand(fixture.state, command(
    fixture.state,
    COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT,
    "c",
    "dropped-ack-c"
  ));
  assert.equal(droppedAck.accepted, false);
  assert.equal(droppedAck.reason, "NOT_AUTHORIZED");

  result = accept(fixture.state, COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT, "b", "result-ack-b");
  fixture.state = result.state;
  fixture.events.push(result.event);
  assert.equal(fixture.state.hand.index, 2);
  assert.equal(fixture.state.dealerSeatId, "a");
  assert.deepEqual(fixture.state.hand.participantSeatIds, ["a", "b"]);
  assert.equal(validateStateInvariants(fixture.state).ok, true);
});

test("a drop that satisfies the final acknowledgement reports the complete next-hand transition", () => {
  const fixture = startedFixture("drop-starts-next");
  openingDiscard(fixture, "drop-starts-next-opening");
  exhaustHand(fixture, "drop-starts-next-exhaust");
  for (const seatId of ["a", "b"]) {
    const result = accept(
      fixture.state,
      COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT,
      seatId,
      `drop-starts-next-${seatId}`
    );
    fixture.state = result.state;
    fixture.events.push(result.event);
  }
  const result = drop(fixture, "c", "drop-starts-next-c");
  assert.equal(result.state.hand.index, 2);
  assert.deepEqual(result.event.facts.map(({ type }) => type), [
    "SEAT_DROPPED",
    "DEALER_ADVANCED",
    "NEXT_HAND_STARTED",
    "SHUFFLE_COMMITTED",
    "HAND_DEALT",
    "TURN_STARTED"
  ]);
});

test("projections expose drop status/counts but never dead-hand card identities", () => {
  const fixture = startedFixture("projection");
  openingDiscard(fixture, "projection-opening");
  const deadCards = [...fixture.state.hand.handsBySeat.c];
  const dropped = drop(fixture, "c", "projection-drop");

  for (const view of [publicView(fixture.state), playerView(fixture.state, "a"), playerView(fixture.state, "c")]) {
    assert.deepEqual(view.activeSeatOrder, ["a", "b"]);
    assert.equal(view.hand.deadHandCount, deadCards.length);
    assert.equal(view.droppedSeatsById.c.reason, "RECONNECT_EXPIRED");
    assert.equal(view.seats.c.status, "DROPPED");
    assert.equal(view.seats.a.status, "ACTIVE");
    assert.equal(Object.hasOwn(view.hand, "deadHandCardIds"), false);
    for (const cardId of deadCards) assert.equal(JSON.stringify(view).includes(cardId), false);
  }
  const event = projectEvent(dropped.event, "c");
  assert.deepEqual(event.payload, {
    seatId: "c",
    reason: "RECONNECT_EXPIRED",
    droppedAt: 123_456
  });
  for (const cardId of deadCards) assert.equal(JSON.stringify(event).includes(cardId), false);
});

test("schema migration fails closed for pre-drop persisted snapshots", () => {
  const fixture = startedFixture("migration");
  assert.deepEqual(migrateSnapshot({
    ...publicView(fixture.state),
    schemaVersion: 1
  }), {
    ok: false,
    reason: "UNSUPPORTED_SCHEMA",
    detail: "SCHEMA_VERSION"
  });
});

test("one remaining active seat completes by forfeit without a fabricated hand score", () => {
  const fixture = startedFixture("forfeit");
  drop(fixture, "b", "forfeit-b");
  const completedBefore = fixture.state.completedHands.length;
  const scoresBefore = Object.fromEntries(Object.entries(fixture.state.seats).map(([seatId, seat]) => [
    seatId,
    seat.cumulativeScore
  ]));
  drop(fixture, "c", "forfeit-c");

  assert.equal(fixture.state.lifecycle, LIFECYCLE.COMPLETE);
  assert.deepEqual(fixture.state.winners, ["a"]);
  assert.deepEqual(fixture.state.completion, {
    reason: "FORFEIT",
    winnerSeatId: "a",
    droppedSeatIds: ["b", "c"]
  });
  assert.equal(fixture.state.completedHands.length, completedBefore);
  assert.deepEqual(Object.fromEntries(Object.entries(fixture.state.seats).map(([seatId, seat]) => [
    seatId,
    seat.cumulativeScore
  ])), scoresBefore);
  assert.equal(fixture.state.hand.result, null);
  assert.equal(fixture.state.hand.activeSeatId, null);
  assert.equal(validateStateInvariants(fixture.state).ok, true);
});

test("invariants reject a dealer that did not rotate through the active participants", () => {
  const fixture = startedFixture("dealer-invariant");
  openingDiscard(fixture, "dealer-invariant-opening");
  drop(fixture, "c", "dealer-invariant-drop");
  exhaustHand(fixture, "dealer-invariant-exhaust");
  for (const seatId of ["a", "b"]) {
    const result = accept(
      fixture.state,
      COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT,
      seatId,
      `dealer-invariant-${seatId}`
    );
    fixture.state = result.state;
    fixture.events.push(result.event);
  }
  const corrupt = structuredClone(fixture.state);
  corrupt.dealerSeatId = "b";
  corrupt.hand.dealerSeatId = "b";
  const validation = validateStateInvariants(corrupt);
  assert.equal(validation.ok, false);
  assert.match(validation.violations.join(" "), /dealer.*clockwise|rotation/i);
});

test("fresh six-seat drops retain clockwise order, replay, and card conservation", () => {
  const seatOrder = ["a", "b", "c", "d", "e", "f"];
  const initial = createLobbyState({
    gameId: "fresh-six-seat-drop",
    hostSeatId: "a",
    seats: seatOrder.map((seatId) => createSeat({
      seatId,
      playerId: `player-${seatId}`,
      displayName: seatId.toUpperCase(),
      ready: true
    }))
  });
  const seed = "fresh-six-seat-drop-seed";
  const dealerSeatId = initialDealerSeatIdFor(seed, seatOrder);
  const started = accept(initial, COMMAND_TYPE.START_GAME, "a", "fresh-six-start", {
    initialDealerSeatId: dealerSeatId,
    shuffleSeed: seed
  });
  const events = [started.event];
  let state = started.state;
  for (const seatId of ["f", "e"]) {
    const result = accept(state, COMMAND_TYPE.DROP_SEAT, "a", `fresh-six-drop-${seatId}`, {
      seatId,
      reason: "RECONNECT_EXPIRED",
      droppedAt: 200_000 + events.length
    });
    state = result.state;
    events.push(result.event);
  }
  assert.deepEqual(state.activeSeatOrder, ["a", "b", "c", "d"]);
  assert.equal(new Set(allCardsInHand(state)).size, CARD_IDS.length);
  assert.equal(validateStateInvariants(state).ok, true);
  assert.deepEqual(replayEvents(initial, events), state);
});

import assert from "node:assert/strict";
import test from "node:test";

import { COMMAND_TYPE, EVENT_TYPE, LIFECYCLE, PHASE, REJECTION, SCHEMA_VERSION } from "../../src/engine/constants.js";
import { applyCommand, executeCommand } from "../../src/engine/commands.js";
import { reduceEvent, replayEvents } from "../../src/engine/events.js";
import { createLobbyState } from "../../src/engine/state.js";
import { CARD_IDS } from "../../src/engine/cards.js";
import { deterministicIndex, initialDealerSeatIdFor } from "../../src/engine/deck.js";

function command(state, type, actorSeatId, fields = {}) {
  return {
    type,
    gameId: state.gameId,
    actorSeatId,
    clientCommandId: `${type}-${state.revision}-${actorSeatId}-${fields.id ?? "x"}`,
    expectedRevision: state.revision,
    ...(state.hand ? { handId: state.hand.id } : {}),
    ...fields
  };
}

function apply(state, type, actorSeatId, fields) {
  const result = executeCommand(state, command(state, type, actorSeatId, fields));
  assert.equal(result.accepted, true, result.detail ?? result.reason);
  return result;
}

function startedGame() {
  let state = createLobbyState({ gameId: "command-game" });
  for (const [seatId, playerId] of [["a", "p-a"], ["b", "p-b"], ["c", "p-c"]]) {
    state = apply(state, COMMAND_TYPE.JOIN_SEAT, seatId, {
      seat: { seatId, playerId, displayName: seatId }
    }).state;
  }
  state = apply(state, COMMAND_TYPE.SET_SEAT_READY, "a", { ready: true }).state;
  state = apply(state, COMMAND_TYPE.SET_SEAT_READY, "b", { ready: true }).state;
  state = apply(state, COMMAND_TYPE.SET_SEAT_READY, "c", { ready: true }).state;
  const initialDealerSeatId = initialDealerSeatIdFor("commands-fixture", ["a", "b", "c"]);
  return apply(state, COMMAND_TYPE.START_GAME, "a", {
    initialDealerSeatId,
    shuffleSeed: "commands-fixture"
  }).state;
}

test("lobby join, leave, readiness, and start are revisioned and replayable", () => {
  const initial = createLobbyState({ gameId: "lobby-game" });
  const joined = apply(initial, COMMAND_TYPE.JOIN_SEAT, "a", {
    seat: { seatId: "a", playerId: "p-a", displayName: "A" }
  });
  const duplicate = executeCommand(joined.state, command(initial, COMMAND_TYPE.JOIN_SEAT, "a", {
    seat: { seatId: "a", playerId: "p-a", displayName: "A" }
  }));
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.strictEqual(duplicate.state, joined.state);
  const conflict = executeCommand(joined.state, { ...command(initial, COMMAND_TYPE.JOIN_SEAT, "a", {
    seat: { seatId: "a", playerId: "other", displayName: "A" }
  }), clientCommandId: joined.event.commandId });
  assert.equal(conflict.reason, REJECTION.COMMAND_ID_CONFLICT);

  let state = joined.state;
  state = apply(state, COMMAND_TYPE.JOIN_SEAT, "b", { seat: { seatId: "b", playerId: "p-b", displayName: "B" } }).state;
  const left = apply(state, COMMAND_TYPE.LEAVE_SEAT, "b");
  assert.equal(left.state.seats.b, undefined);
  assert.deepEqual(replayEvents(initial, [joined.event]), joined.state);
  assert.throws(() => reduceEvent(initial, { ...joined.event, sequence: 2 }), /REVISION_GAP/);
});

test("two ready players can start a game", () => {
  let state = createLobbyState({ gameId: "two-player-game" });
  for (const seatId of ["a", "b"]) {
    state = apply(state, COMMAND_TYPE.JOIN_SEAT, seatId, {
      seat: { seatId, playerId: `p-${seatId}`, displayName: seatId }
    }).state;
    state = apply(state, COMMAND_TYPE.SET_SEAT_READY, seatId, { ready: true }).state;
  }
  state = apply(state, COMMAND_TYPE.START_GAME, "a", {
    initialDealerSeatId: initialDealerSeatIdFor("two-player-fixture", ["a", "b"]),
    shuffleSeed: "two-player-fixture"
  }).state;
  assert.equal(state.lifecycle, LIFECYCLE.IN_PROGRESS);
  assert.deepEqual(state.seatOrder, ["a", "b"]);
});

test("a normal discard ends table play atomically in one accepted revision", () => {
  let state = startedGame();
  assert.equal(state.lifecycle, LIFECYCLE.IN_PROGRESS);
  assert.equal(state.hand.phase, PHASE.DEALER_INITIAL_DISCARD);
  const dealerSeatId = state.hand.activeSeatId;
  const dealerCard = state.hand.handsBySeat[dealerSeatId][0];
  state = apply(state, COMMAND_TYPE.DEALER_INITIAL_DISCARD, dealerSeatId, { cardId: dealerCard }).state;
  const actor = state.hand.activeSeatId;
  state = apply(state, COMMAND_TYPE.DRAW_STOCK, actor).state;
  assert.equal(state.hand.phase, PHASE.TABLE_PLAY);

  const cards = state.hand.handsBySeat[actor];
  const rank = cards.find((cardId) => !cardId.endsWith(`:${state.hand.wildRank}`))?.split(":")[1];
  const sameRank = cards.filter((cardId) => cardId.endsWith(`:${rank}`)).slice(0, 3);
  if (sameRank.length === 3) {
    state = apply(state, COMMAND_TYPE.CREATE_MELD, actor, {
      meld: {
        id: "opening", type: "SET", originatingSeatId: actor,
        slots: sameRank.map((cardId, index) => ({ slotId: `s${index}`, cardId }))
      }
    }).state;
    assert.equal(state.hand.openedBySeat[actor], true);
  }
  const discardCard = state.hand.handsBySeat[actor][0];
  const beforeDiscardRevision = state.revision;
  const discard = apply(state, COMMAND_TYPE.DISCARD, actor, { cardId: discardCard });
  assert.equal(discard.revision, beforeDiscardRevision + 1);
  assert.equal(discard.events.length, 1);
  assert.equal(discard.event.type, EVENT_TYPE.CARD_DISCARDED);
  state = discard.state;
  assert.ok([PHASE.AWAITING_DRAW, PHASE.HAND_COMPLETE].includes(state.hand.phase));
});

test("rejections retain identity and table play cannot consume the final discard", () => {
  let state = startedGame();
  const wrong = executeCommand(state, command(state, COMMAND_TYPE.DRAW_STOCK, "a"));
  assert.equal(wrong.accepted, false);
  assert.strictEqual(wrong.state, state);

  const dealerSeatId = state.hand.activeSeatId;
  state = apply(state, COMMAND_TYPE.DEALER_INITIAL_DISCARD, dealerSeatId, {
    cardId: state.hand.handsBySeat[dealerSeatId][0]
  }).state;
  const actor = state.hand.activeSeatId;
  state = apply(state, COMMAND_TYPE.DRAW_STOCK, actor).state;
  const allCards = state.hand.handsBySeat[actor];
  const rejected = executeCommand(state, command(state, COMMAND_TYPE.CREATE_MELD, actor, {
    meld: { id: "too-many", type: "RUN", originatingSeatId: actor, slots: allCards.map((cardId, index) => ({ slotId: String(index), cardId })) }
  }));
  assert.equal(rejected.accepted, false);
  assert.strictEqual(rejected.state, state);
});

test("applyCommand aliases executeCommand and stale revisions are safe", () => {
  const state = createLobbyState({ gameId: "alias-game" });
  const stale = applyCommand(state, {
    ...command(state, COMMAND_TYPE.JOIN_SEAT, "a", { seat: { seatId: "a", playerId: "p-a", displayName: "A" } }),
    expectedRevision: 4
  });
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, REJECTION.STALE_REVISION);
});

test("a complete committed deck is accepted as reproducible opening evidence", () => {
  let state = createLobbyState({ gameId: "committed-deck-game" });
  for (const seatId of ["a", "b", "c"]) {
    state = apply(state, COMMAND_TYPE.JOIN_SEAT, seatId, {
      seat: { seatId, playerId: `p-${seatId}`, displayName: seatId }
    }).state;
    state = apply(state, COMMAND_TYPE.SET_SEAT_READY, seatId, { ready: true }).state;
  }
  const deckCardIds = [...CARD_IDS].reverse();
  const started = apply(state, COMMAND_TYPE.START_GAME, "a", {
    initialDealerSeatId: initialDealerSeatIdFor(`committed:${deckCardIds.join("|")}`, ["a", "b", "c"]),
    deckCardIds
  }).state;
  assert.match(started.shuffleSeed, /^committed:/);
  assert.equal(started.hand.stockCardIds.length, 30);
});

test("dealer selection is derived without modulo bias and host mismatches are rejected", () => {
  assert.equal(deterministicIndex("dealer-fixture", 3), deterministicIndex("dealer-fixture", 3));
  assert.equal(initialDealerSeatIdFor("dealer-fixture", ["north", "east", "south"]), "north");
  let state = createLobbyState({ gameId: "dealer-mismatch" });
  for (const seatId of ["north", "east", "south"]) {
    state = apply(state, COMMAND_TYPE.JOIN_SEAT, seatId, {
      seat: { seatId, playerId: `p-${seatId}`, displayName: seatId }
    }).state;
    state = apply(state, COMMAND_TYPE.SET_SEAT_READY, seatId, { ready: true }).state;
  }
  const incorrect = executeCommand(state, command(state, COMMAND_TYPE.START_GAME, "north", {
    initialDealerSeatId: "east",
    shuffleSeed: "dealer-fixture"
  }));
  assert.equal(incorrect.accepted, false);
  assert.equal(incorrect.reason, REJECTION.INVALID_COMMAND);
});

test("invalid draw sources are rejected before transition and accepted facts are public-safe", () => {
  let state = startedGame();
  state = apply(state, COMMAND_TYPE.DEALER_INITIAL_DISCARD, state.hand.activeSeatId, {
    cardId: state.hand.handsBySeat[state.hand.activeSeatId][0]
  }).state;
  const invalidDraw = {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: state.rulesVersion,
    gameId: state.gameId,
    handId: state.hand.id,
    sequence: state.revision + 1,
    type: "CARD_DRAWN",
    commandId: "invalid-source",
    commandFingerprint: "invalid-source",
    actorSeatId: state.hand.activeSeatId,
    payload: { source: "from-the-moon" },
    facts: []
  };
  assert.throws(
    () => reduceEvent(state, invalidDraw),
    (error) => error.reason === REJECTION.INVALID_COMMAND
  );

  const initial = startedGame();
  const startEvent = initial.commandLedger["START_GAME-6-a-x"].event;
  assert.ok(startEvent.facts.some((fact) => fact.type === "SHUFFLE_COMMITTED"));
  assert.ok(startEvent.facts.some((fact) => fact.type === "HAND_DEALT"));
  assert.equal(JSON.stringify(startEvent.facts).includes("commands-fixture"), false);
  assert.equal(JSON.stringify(startEvent.facts).includes("clubs:"), false);
});

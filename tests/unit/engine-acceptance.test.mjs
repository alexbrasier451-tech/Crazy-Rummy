import assert from "node:assert/strict";
import test from "node:test";

import { CARD_IDS } from "../../src/engine/cards.js";
import { COMMAND_TYPE, LIFECYCLE, PHASE, REJECTION } from "../../src/engine/constants.js";
import {
  committedDeckEvidence,
  createSeededDeck,
  initialDealerSeatIdFor
} from "../../src/engine/deck.js";
import { reduceEvent, replayEvents } from "../../src/engine/events.js";
import { assertStateInvariants } from "../../src/engine/invariants.js";
import { HAND_END_REASON, acknowledgeHandResult, completeHand, startHand, startNextHand } from "../../src/engine/lifecycle.js";
import { validateMeld, validateWildReplacement } from "../../src/engine/melds.js";
import { playerView, projectEvent, publicView, snapshotFor } from "../../src/engine/projections.js";
import { scoreCard, scoreHand } from "../../src/engine/scoring.js";
import { cloneState, createLobbyState, createSeat } from "../../src/engine/state.js";
import { executeCommand } from "../../src/engine/commands.js";

const SEAT_ORDER = Object.freeze(["a", "b", "c", "dealer"]);

function lobbyState() {
  return createLobbyState({
    gameId: "acceptance-game",
    hostSeatId: "a",
    seats: SEAT_ORDER.map((seatId) => createSeat({
      seatId,
      playerId: `player-${seatId}`,
      displayName: `Player ${seatId}`,
      ready: true
    }))
  });
}

function command(state, type, actorSeatId, clientCommandId, fields = {}) {
  return {
    type,
    gameId: state.gameId,
    actorSeatId,
    clientCommandId,
    expectedRevision: state.revision,
    ...(state.hand ? { handId: state.hand.id } : {}),
    ...fields
  };
}

function accept(state, input) {
  const result = executeCommand(state, input);
  assert.equal(result.accepted, true, result.detail ?? result.reason);
  return result;
}

function startGame({
  deckCardIds = createSeededDeck("acceptance-start"),
  shuffleSeed = "seed-1"
} = {}) {
  const initial = lobbyState();
  const evidence = shuffleSeed ?? committedDeckEvidence(deckCardIds);
  const initialDealerSeatId = initialDealerSeatIdFor(evidence, SEAT_ORDER);
  const result = accept(initial, command(initial, COMMAND_TYPE.START_GAME, "a", "start-1", {
    initialDealerSeatId,
    ...(shuffleSeed === undefined ? {} : { shuffleSeed }),
    deckCardIds
  }));
  return { initial, result, state: result.state };
}

function firstNormalTurn(options) {
  const started = startGame(options);
  const dealerCard = started.state.hand.handsBySeat.dealer[0];
  const discarded = accept(started.state, command(
    started.state,
    COMMAND_TYPE.DEALER_INITIAL_DISCARD,
    "dealer",
    "dealer-discard-1",
    { cardId: dealerCard }
  ));
  return { initial: started.initial, events: [started.result.event, discarded.event], state: discarded.state };
}

function deckWithCardsAtPositions(assignments) {
  const deck = [...CARD_IDS];
  for (const [position, cardId] of assignments) {
    const current = deck.indexOf(cardId);
    assert.notEqual(current, -1, `Unknown fixture card ${cardId}`);
    [deck[position], deck[current]] = [deck[current], deck[position]];
  }
  return deck;
}

function meld(id, type, cardIds, extra = {}) {
  return {
    id,
    type,
    ...extra,
    slots: cardIds.map((cardId, index) => ({ slotId: `${id}:${index}`, cardId }))
  };
}

function lifecycleState() {
  const lobby = cloneState(lobbyState());
  Object.assign(lobby, {
    lifecycle: LIFECYCLE.IN_PROGRESS,
    seatOrder: [...SEAT_ORDER],
    currentHandIndex: 1,
    initialDealerSeatId: "dealer",
    dealerSeatId: "dealer"
  });
  return startHand(lobby, createSeededDeck("lifecycle-start"), "dealer");
}

function finalStockLifecycleState(state) {
  const finalStockTurn = cloneState(state);
  const hand = finalStockTurn.hand;
  const handsBySeat = Object.fromEntries(SEAT_ORDER.map((seatId) => [
    seatId,
    hand.handsBySeat[seatId].slice(0, 7)
  ]));
  const retained = new Set(Object.values(handsBySeat).flat());
  const finalStockCardId = hand.stockCardIds.at(-1);
  const allCardIds = [
    ...hand.stockCardIds,
    ...hand.discardCardIds,
    ...Object.values(hand.handsBySeat).flat()
  ];
  assert.equal(retained.has(finalStockCardId), false);
  finalStockTurn.hand = {
    ...hand,
    activeSeatId: "c",
    phase: PHASE.AWAITING_DISCARD,
    turnNumber: 23,
    stockCardIds: [],
    discardCardIds: [
      ...allCardIds.filter((cardId) => cardId !== finalStockCardId && !retained.has(cardId)),
      finalStockCardId
    ],
    handsBySeat,
    drawnCardId: finalStockCardId,
    drawSource: "stock",
    drewFinalStock: true
  };
  return finalStockTurn;
}

function allZoneCardIds(hand) {
  return [
    ...hand.stockCardIds,
    ...hand.discardCardIds,
    ...Object.values(hand.handsBySeat).flat(),
    ...hand.melds.flatMap((entry) => entry.slots.map((slot) => slot.cardId))
  ];
}

function assertConserved(state) {
  const cards = allZoneCardIds(state.hand);
  assert.equal(cards.length, CARD_IDS.length);
  assert.equal(new Set(cards).size, CARD_IDS.length);
  assertStateInvariants(state);
}

/**
 * After the dealer discard and 22 ordinary stock-draw/discard turns, seat c
 * is next (turn 23), the discard holds those 22 draws plus the opening card,
 * and exactly one stock card remains. This is a compact reachable recovery
 * fixture rather than an impossible mutation of the immediate opening state.
 */
function lateAwaitingDrawState({
  actorSeatId = "c",
  actorCardIds = null,
  stockCardIds = ["clubs:K"]
} = {}) {
  const state = cloneState(firstNormalTurn().state);
  const actorCards = actorCardIds ?? CARD_IDS.filter((cardId) => !stockCardIds.includes(cardId)).slice(0, 7);
  const reserved = new Set([...actorCards, ...stockCardIds]);
  assert.equal(reserved.size, actorCards.length + stockCardIds.length);
  const remaining = CARD_IDS.filter((cardId) => !reserved.has(cardId));
  const handsBySeat = {};
  for (const seatId of SEAT_ORDER) {
    handsBySeat[seatId] = seatId === actorSeatId
      ? [...actorCards]
      : remaining.splice(0, 7);
  }
  state.hand = {
    ...state.hand,
    stockCardIds: [...stockCardIds],
    discardCardIds: remaining,
    handsBySeat,
    openedBySeat: Object.fromEntries(SEAT_ORDER.map((seatId) => [seatId, false])),
    melds: [],
    activeSeatId: actorSeatId,
    phase: PHASE.AWAITING_DRAW,
    turnNumber: 23,
    drawnCardId: null,
    drawSource: null,
    drewFinalStock: false,
    result: null
  };
  assert.equal(state.hand.discardCardIds.length, 23);
  assertConserved(state);
  return state;
}

test("acceptance A: deal, dealer-only opening discard, and first normal turn", () => {
  const { state: started } = startGame();
  assert.equal(started.hand.phase, PHASE.DEALER_INITIAL_DISCARD);
  assert.equal(started.hand.activeSeatId, "dealer");
  assert.deepEqual(Object.values(started.hand.handsBySeat).map((cards) => cards.length), [7, 7, 7, 8]);
  assert.equal(started.hand.stockCardIds.length, 23);

  const dealerCard = started.hand.handsBySeat.dealer[0];
  const afterOpening = accept(started, command(started, COMMAND_TYPE.DEALER_INITIAL_DISCARD, "dealer", "a-opening", { cardId: dealerCard })).state;
  assert.equal(afterOpening.hand.handsBySeat.dealer.length, 7);
  assert.equal(afterOpening.hand.stockCardIds.length, 23);
  assert.deepEqual(afterOpening.hand.discardCardIds, [dealerCard]);
  assert.equal(afterOpening.hand.activeSeatId, "a");
  assert.equal(afterOpening.hand.phase, PHASE.AWAITING_DRAW);
});

test("a complete committed deck is an alternative to a shuffle seed at game start", () => {
  const initial = lobbyState();
  const deckCardIds = createSeededDeck("committed-deck-only");
  const result = executeCommand(initial, command(initial, COMMAND_TYPE.START_GAME, "a", "deck-only-start", {
    initialDealerSeatId: initialDealerSeatIdFor(
      committedDeckEvidence(deckCardIds),
      SEAT_ORDER
    ),
    deckCardIds
  }));
  assert.equal(result.accepted, true, result.detail ?? result.reason);
});

test("acceptance B, C, E, and F: moving wilds, Ace-low runs, opening wilds, and reclaimed wilds", () => {
  assert.equal(scoreCard("clubs:6", "6"), 50);
  assert.equal(scoreCard("clubs:6", "7"), 6);
  assert.equal(scoreCard("clubs:7", "7"), 50);

  assert.equal(validateMeld(meld("ace-low", "RUN", ["clubs:A", "clubs:2", "clubs:3"]), { wildRank: "4" }).ok, true);
  assert.equal(validateMeld(meld("queen-high", "RUN", ["clubs:Q", "clubs:K", "clubs:A"]), { wildRank: "4" }).ok, false);
  assert.equal(validateMeld(meld("wrap", "RUN", ["clubs:K", "clubs:A", "clubs:2"]), { wildRank: "4" }).ok, false);

  const openingWithWild = validateMeld({
    ...meld("opening-wild", "SET", ["clubs:8", "diamonds:8", "spades:4"], { rank: "8" }),
    slots: [
      { slotId: "opening-wild:0", cardId: "clubs:8" },
      { slotId: "opening-wild:1", cardId: "diamonds:8" },
      { slotId: "opening-wild:2", cardId: "spades:4", represented: { rank: "8" } }
    ]
  }, { wildRank: "4" });
  assert.equal(openingWithWild.ok, true);

  const existing = validateMeld({
    ...meld("run-wild", "RUN", ["hearts:7", "clubs:3", "hearts:9"], { suit: "hearts" }),
    slots: [
      { slotId: "run-wild:0", cardId: "hearts:7" },
      { slotId: "run-wild:1", cardId: "clubs:3", represented: { rank: "8", suit: "hearts" } },
      { slotId: "run-wild:2", cardId: "hearts:9" }
    ]
  }, { wildRank: "3" });
  assert.equal(existing.ok, true);
  const replacement = validateWildReplacement(existing.meld, {
    wildCardId: "clubs:3",
    naturalCardId: "hearts:8"
  }, { wildRank: "3" });
  assert.equal(replacement.ok, true);
  assert.equal(replacement.reclaimedWildCardId, "clubs:3");
  assert.equal(replacement.meld.slots.find((slot) => slot.slotId === "run-wild:1").cardId, "hearts:8");
});

test("acceptance D and G: opening succeeds only with a complete meld and cannot consume the final discard", () => {
  const openingDeck = deckWithCardsAtPositions([
    [0, "clubs:9"], [4, "diamonds:9"], [8, "hearts:9"]
  ]);
  let { state } = firstNormalTurn({ deckCardIds: openingDeck });
  const beforeOpening = executeCommand(state, command(state, COMMAND_TYPE.LAY_OFF, "a", "layoff-before-opening", {
    meldId: "missing",
    slots: [{ slotId: "unopened:0", cardId: state.hand.handsBySeat.a[0] }],
    placement: "END"
  }));
  assert.equal(beforeOpening.accepted, false);
  assert.strictEqual(beforeOpening.state, state);

  state = accept(state, command(state, COMMAND_TYPE.DRAW_STOCK, "a", "opening-draw")).state;
  const opened = accept(state, command(state, COMMAND_TYPE.CREATE_MELD, "a", "open-nine-set", {
    meld: meld("nine-set", "SET", ["clubs:9", "diamonds:9", "hearts:9"], { rank: "9", originatingSeatId: "a" })
  })).state;
  assert.equal(opened.hand.openedBySeat.a, true);
  assert.equal(opened.hand.melds.length, 1);

  const runDeck = deckWithCardsAtPositions([
    [0, "clubs:3"], [4, "clubs:4"], [8, "clubs:5"], [12, "clubs:6"],
    [16, "clubs:7"], [20, "clubs:8"], [24, "clubs:9"], [29, "clubs:10"]
  ]);
  let finalDiscardState = firstNormalTurn({ deckCardIds: runDeck }).state;
  finalDiscardState = accept(finalDiscardState, command(finalDiscardState, COMMAND_TYPE.DRAW_STOCK, "a", "final-discard-draw")).state;
  const rejected = executeCommand(finalDiscardState, command(finalDiscardState, COMMAND_TYPE.CREATE_MELD, "a", "all-cards-run", {
    meld: meld("all-cards", "RUN", ["clubs:3", "clubs:4", "clubs:5", "clubs:6", "clubs:7", "clubs:8", "clubs:9", "clubs:10"], { suit: "clubs", originatingSeatId: "a" })
  }));
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, REJECTION.FINAL_DISCARD_REQUIRED);
  assert.strictEqual(rejected.state, finalDiscardState);
});

test("commands atomically create, extend, replace, and reclaim a wild without losing card ownership", () => {
  const integrationDeck = deckWithCardsAtPositions([
    [0, "hearts:7"], [4, "clubs:A"], [8, "hearts:9"], [12, "hearts:8"],
    [16, "hearts:10"], [20, "clubs:2"], [24, "diamonds:3"]
  ]);
  let state = firstNormalTurn({ deckCardIds: integrationDeck }).state;
  state = accept(state, command(state, COMMAND_TYPE.DRAW_STOCK, "a", "integrated-draw")).state;
  assertConserved(state);

  state = accept(state, command(state, COMMAND_TYPE.CREATE_MELD, "a", "integrated-open", {
    meld: {
      ...meld("wild-run", "RUN", ["hearts:7", "clubs:A", "hearts:9"], { suit: "hearts", originatingSeatId: "a" }),
      slots: [
        { slotId: "wild-run:0", cardId: "hearts:7" },
        { slotId: "wild-run:1", cardId: "clubs:A", represented: { rank: "8", suit: "hearts" } },
        { slotId: "wild-run:2", cardId: "hearts:9" }
      ]
    }
  })).state;
  assert.equal(state.hand.openedBySeat.a, true);
  assert.equal(state.hand.handsBySeat.a.includes("clubs:A"), false);
  assert.deepEqual(state.hand.melds[0].slots.map((slot) => slot.cardId), ["hearts:7", "clubs:A", "hearts:9"]);
  assertConserved(state);

  state = accept(state, command(state, COMMAND_TYPE.REPLACE_WILD, "a", "integrated-replace", {
    meldId: "wild-run",
    wildCardId: "clubs:A",
    naturalCardId: "hearts:8"
  })).state;
  const replacementSlot = state.hand.melds[0].slots.find((slot) => slot.slotId === "wild-run:1");
  assert.equal(replacementSlot.cardId, "hearts:8");
  assert.deepEqual(replacementSlot.represented, { rank: "8", suit: "hearts" });
  assert.equal(state.hand.handsBySeat.a.includes("clubs:A"), true);
  assertConserved(state);

  state = accept(state, command(state, COMMAND_TYPE.LAY_OFF, "a", "integrated-layoff", {
    meldId: "wild-run",
    slots: [{ slotId: "wild-run:3", cardId: "hearts:10" }],
    placement: "END"
  })).state;
  assert.deepEqual(state.hand.melds[0].slots.map((slot) => slot.cardId), ["hearts:7", "hearts:8", "hearts:9", "hearts:10"]);
  assert.equal(state.hand.handsBySeat.a.includes("hearts:10"), false);
  assertConserved(state);

  state = accept(state, command(state, COMMAND_TYPE.FINISH_TABLE_PLAY, "a", "integrated-finish")).state;
  state = accept(state, command(state, COMMAND_TYPE.DISCARD, "a", "integrated-discard-reclaimed-wild", {
    cardId: "clubs:A"
  })).state;
  assert.equal(state.hand.discardCardIds.at(-1), "clubs:A");
  assert.equal(state.hand.handsBySeat.a.includes("clubs:A"), false);
  assertConserved(state);
});

test("drawing the only stock card then discarding completes STOCK_EXHAUSTED without starting a next turn", () => {
  const rigged = lateAwaitingDrawState({ stockCardIds: ["clubs:K"] });
  const actorSeatId = rigged.hand.activeSeatId;
  assert.equal(actorSeatId, "c");
  assert.equal(rigged.hand.turnNumber, 23);
  assert.equal(rigged.hand.stockCardIds.length, 1);
  assert.equal(rigged.hand.discardCardIds.length, 23);

  let state = accept(rigged, command(rigged, COMMAND_TYPE.DRAW_STOCK, actorSeatId, "last-stock-draw")).state;
  assert.equal(state.hand.drewFinalStock, true);
  assert.equal(state.hand.stockCardIds.length, 0);
  assertConserved(state);
  state = accept(state, command(state, COMMAND_TYPE.FINISH_TABLE_PLAY, actorSeatId, "last-stock-finish")).state;
  const discardCardId = state.hand.handsBySeat[actorSeatId][0];
  const expectedScores = Object.fromEntries(Object.entries(state.hand.handsBySeat).map(([seatId, cards]) => [
    seatId,
    scoreHand(cards.filter((cardId) => cardId !== discardCardId || seatId !== actorSeatId), state.hand.wildRank).total
  ]));
  state = accept(state, command(state, COMMAND_TYPE.DISCARD, actorSeatId, "last-stock-discard", { cardId: discardCardId })).state;
  assert.equal(state.hand.phase, PHASE.HAND_COMPLETE);
  assert.equal(state.hand.result.reason, HAND_END_REASON.STOCK_EXHAUSTED);
  assert.equal(state.hand.result.winnerSeatId, null);
  assert.equal(state.hand.activeSeatId, actorSeatId);
  assert.equal(state.hand.result.scoreEntriesBySeat[actorSeatId].total, expectedScores[actorSeatId]);
  assertConserved(state);
});

test("a legal final discard goes out through commands and records a zero winner score", () => {
  const runCardIds = ["clubs:3", "clubs:4", "clubs:5", "clubs:6", "clubs:7", "clubs:8", "clubs:9"];
  const rigged = lateAwaitingDrawState({
    actorCardIds: runCardIds,
    stockCardIds: ["clubs:10"]
  });
  const actorSeatId = rigged.hand.activeSeatId;

  let state = accept(rigged, command(rigged, COMMAND_TYPE.DRAW_STOCK, actorSeatId, "go-out-draw")).state;
  assert.deepEqual(state.hand.handsBySeat[actorSeatId], [...runCardIds, "clubs:10"]);
  state = accept(state, command(state, COMMAND_TYPE.CREATE_MELD, actorSeatId, "go-out-meld", {
    meld: meld("go-out-run", "RUN", runCardIds, { suit: "clubs", originatingSeatId: actorSeatId })
  })).state;
  assert.equal(state.hand.openedBySeat[actorSeatId], true);
  assert.deepEqual(state.hand.handsBySeat[actorSeatId], ["clubs:10"]);
  assertConserved(state);
  state = accept(state, command(state, COMMAND_TYPE.FINISH_TABLE_PLAY, actorSeatId, "go-out-finish")).state;
  state = accept(state, command(state, COMMAND_TYPE.DISCARD, actorSeatId, "go-out-discard", { cardId: "clubs:10" })).state;
  assert.equal(state.hand.phase, PHASE.HAND_COMPLETE);
  assert.equal(state.hand.result.reason, HAND_END_REASON.WENT_OUT);
  assert.equal(state.hand.result.winnerSeatId, actorSeatId);
  assert.equal(state.hand.result.scoreEntriesBySeat[actorSeatId].total, 0);
  assert.equal(state.hand.handsBySeat[actorSeatId].length, 0);
  assertConserved(state);
});

test("acceptance H and K: score precedence and final stock completion", () => {
  assert.equal(scoreHand(["spades:A", "diamonds:7", "clubs:Q", "hearts:K"], "Q").total, 68);

  const state = finalStockLifecycleState(lifecycleState());
  const completed = completeHand(state, { reason: HAND_END_REASON.STOCK_EXHAUSTED });
  assert.equal(completed.hand.phase, PHASE.HAND_COMPLETE);
  assert.equal(completed.hand.result.reason, HAND_END_REASON.STOCK_EXHAUSTED);
  assert.equal(completed.hand.result.winnerSeatId, null);
  assert.equal(completed.hand.activeSeatId, "c");
  assert.equal(completed.completedHands.length, 1);
});

test("acceptance I: accepted commands are idempotent and stale commands do not mutate", () => {
  const { state } = firstNormalTurn();
  const draw = command(state, COMMAND_TYPE.DRAW_STOCK, "a", "draw-once");
  const first = accept(state, draw);
  const duplicate = executeCommand(first.state, draw);
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.strictEqual(duplicate.state, first.state);
  assert.equal(duplicate.revision, first.revision);

  const stale = executeCommand(first.state, command(state, COMMAND_TYPE.DRAW_STOCK, "a", "stale-draw"));
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, REJECTION.STALE_REVISION);
  assert.strictEqual(stale.state, first.state);
});

test("acceptance J: public and player projections redact all other private hands and stock order", () => {
  const { state } = firstNormalTurn();
  const publicSnapshot = publicView(state);
  const aSnapshot = playerView(state, "a");
  const opponentCard = state.hand.handsBySeat.b[0];
  const ownCard = state.hand.handsBySeat.a[0];

  assert.equal(JSON.stringify(publicSnapshot).includes("stockCardIds"), false);
  assert.equal(JSON.stringify(publicSnapshot).includes("commandLedger"), false);
  assert.equal(JSON.stringify(publicSnapshot).includes(opponentCard), false);
  assert.equal(JSON.stringify(aSnapshot).includes(opponentCard), false);
  assert.equal(JSON.stringify(aSnapshot).includes(ownCard), true);
  assert.deepEqual(snapshotFor(state, "a"), aSnapshot);

  const { event } = accept(state, command(state, COMMAND_TYPE.DRAW_STOCK, "a", "private-draw"));
  const publicEvent = projectEvent(event);
  const playerEvent = projectEvent(event, "a");
  assert.equal(JSON.stringify(publicEvent).includes("stockCardIds"), false);
  assert.equal(JSON.stringify(publicEvent).includes(state.hand.stockCardIds[0]), false);
  assert.equal(JSON.stringify(playerEvent).includes(opponentCard), false);
});

test("authoritative events replay in order and reject delayed delivery gaps", () => {
  const flow = firstNormalTurn();
  const drawResult = accept(flow.state, command(flow.state, COMMAND_TYPE.DRAW_STOCK, "a", "replay-draw"));
  const replayed = replayEvents(flow.initial, [...flow.events, drawResult.event]);
  assert.deepEqual(replayed, drawResult.state);
  assert.throws(() => reduceEvent(flow.initial, drawResult.event), /revision|sequence|gap/i);
});

test("all thirteen hands retain the schedule, rotate dealer, and only then complete", () => {
  let state = lifecycleState();
  for (let index = 1; index <= 13; index += 1) {
    assert.equal(state.hand.index, index);
    const completed = completeHand(finalStockLifecycleState(state), { reason: HAND_END_REASON.STOCK_EXHAUSTED });
    if (index === 13) {
      assert.equal(completed.lifecycle, LIFECYCLE.COMPLETE);
      assert.equal(completed.completedHands.length, 13);
      assert.equal(completed.hand.wildRank, "K");
      break;
    }
    const acknowledged = SEAT_ORDER.reduce((current, seatId) => acknowledgeHandResult(current, seatId), completed);
    state = startNextHand(acknowledged, createSeededDeck(`acceptance-hand-${index + 1}`));
  }
});

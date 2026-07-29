import assert from "node:assert/strict";
import test from "node:test";

import { LIFECYCLE, PHASE } from "../../src/engine/constants.js";
import {
  HAND_END_REASON,
  acknowledgeHandResult,
  completeHand,
  createHand,
  finalWinnerSeatIds,
  isReadyForNextHand,
  nextSeatId,
  startNextHand
} from "../../src/engine/lifecycle.js";
import { scoreCard, scoreHand } from "../../src/engine/scoring.js";

const seats = Object.freeze({
  north: Object.freeze({ playerId: "p0", cumulativeScore: 0 }),
  east: Object.freeze({ playerId: "p1", cumulativeScore: 0 }),
  south: Object.freeze({ playerId: "p2", cumulativeScore: 0 }),
  west: Object.freeze({ playerId: "p3", cumulativeScore: 0 })
});
const seatOrder = Object.freeze(["north", "east", "south", "west"]);
const deck = Object.freeze([
  ...["clubs", "diamonds", "hearts", "spades"].flatMap((suit) => ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map((rank) => `${suit}:${rank}`))
]);

function stateFor(hand, overrides = {}) {
  return Object.freeze({
    gameId: "game-1",
    lifecycle: LIFECYCLE.IN_PROGRESS,
    currentHandIndex: hand.index,
    dealerSeatId: hand.dealerSeatId,
    seatOrder,
    seats,
    hand,
    completedHands: Object.freeze([]),
    winners: Object.freeze([]),
    rules: Object.freeze({ cardsPerPlayer: 7 }),
    ...overrides
  });
}

function handAfterFinalStockDrawAndDiscard(hand, handsBySeat = Object.fromEntries(
  seatOrder.map((seatId) => [seatId, hand.handsBySeat[seatId].slice(0, 7)])
)) {
  const retainedCardIds = Object.values(handsBySeat).flat();
  const retained = new Set(retainedCardIds);
  const allCardIds = [
    ...hand.stockCardIds,
    ...hand.discardCardIds,
    ...Object.values(hand.handsBySeat).flat()
  ];
  const finalStockCardId = hand.stockCardIds.at(-1);
  assert.equal(retained.has(finalStockCardId), false, "The final stock card must have been discarded.");
  const discardedBeforeFinal = allCardIds.filter((cardId) => cardId !== finalStockCardId && !retained.has(cardId));

  return Object.freeze({
    ...hand,
    activeSeatId: "south",
    phase: PHASE.AWAITING_DISCARD,
    turnNumber: 23,
    stockCardIds: Object.freeze([]),
    discardCardIds: Object.freeze([...discardedBeforeFinal, finalStockCardId]),
    handsBySeat: Object.freeze(Object.fromEntries(Object.entries(handsBySeat).map(([seatId, cards]) => [
      seatId,
      Object.freeze([...cards])
    ]))),
    drawnCardId: finalStockCardId,
    drawSource: "stock",
    drewFinalStock: true
  });
}

test("scores current wilds before their natural values", () => {
  assert.equal(scoreCard("clubs:A", "A"), 50);
  assert.equal(scoreCard("clubs:Q", "Q"), 50);
  assert.equal(scoreCard("clubs:K", "K"), 50);
  assert.throws(() => scoreCard("not-a-suit:K", "K"), /Unknown card ID/);
  assert.equal(scoreCard("clubs:K", "Q"), 10);
  assert.deepEqual(scoreHand(["spades:A", "diamonds:7", "clubs:Q", "hearts:K"], "Q"), {
    cardIds: ["spades:A", "diamonds:7", "clubs:Q", "hearts:K"],
    cards: [
      { cardId: "spades:A", value: 1 },
      { cardId: "diamonds:7", value: 7 },
      { cardId: "clubs:Q", value: 50 },
      { cardId: "hearts:K", value: 10 }
    ],
    total: 68
  });
});

test("deals top-first deck deterministically and gives the dealer eight cards", () => {
  const hand = createHand({
    gameId: "game-1",
    handIndex: 1,
    dealerSeatId: "south",
    seatOrder,
    deckCardIds: deck,
    rules: { cardsPerPlayer: 7 }
  });

  assert.equal(hand.phase, PHASE.DEALER_INITIAL_DISCARD);
  assert.equal(hand.activeSeatId, "south");
  assert.equal(hand.wildRank, "A");
  assert.equal(hand.handsBySeat.north.length, 7);
  assert.equal(hand.handsBySeat.south.length, 8);
  assert.equal(hand.stockCardIds.length, 23);
  assert.equal(hand.stockCardIds[0], deck[29]);
  assert.equal(new Set([...Object.values(hand.handsBySeat).flat(), ...hand.stockCardIds]).size, 52);
  assert.equal(nextSeatId(seatOrder, "south"), "west");
});

test("completes a winning hand atomically, preserving zero for the winner", () => {
  const hand = createHand({ gameId: "game-1", handIndex: 12, dealerSeatId: "north", seatOrder, deckCardIds: deck, rules: { cardsPerPlayer: 7 } });
  const scoredHand = Object.freeze({
    ...hand,
    handsBySeat: Object.freeze({
      north: Object.freeze([]),
      east: Object.freeze(["spades:A", "diamonds:7", "clubs:Q", "hearts:K"]),
      south: Object.freeze(["clubs:2"]),
      west: Object.freeze(["diamonds:Q"])
    })
  });

  const completed = completeHand(stateFor(scoredHand), {
    reason: HAND_END_REASON.WENT_OUT,
    winnerSeatId: "north"
  });

  assert.equal(completed.hand.phase, PHASE.HAND_COMPLETE);
  assert.equal(completed.hand.result.scoreEntriesBySeat.north.total, 0);
  assert.equal(completed.hand.result.scoreEntriesBySeat.east.total, 68);
  assert.equal(completed.seats.east.cumulativeScore, 68);
  assert.equal(completed.completedHands.length, 1);
});

test("rejects stock exhaustion unless the final stock draw is recorded", () => {
  const hand = createHand({ gameId: "game-1", handIndex: 6, dealerSeatId: "north", seatOrder, deckCardIds: deck, rules: { cardsPerPlayer: 7 } });
  assert.throws(
    () => completeHand(stateFor(hand), { reason: HAND_END_REASON.STOCK_EXHAUSTED }),
    /final stock draw/i
  );
});

test("stock exhaustion has no winner and readiness advances dealer and wild rank", () => {
  const hand = createHand({ gameId: "game-1", handIndex: 6, dealerSeatId: "north", seatOrder, deckCardIds: deck, rules: { cardsPerPlayer: 7 } });
  const finalStockTurn = handAfterFinalStockDrawAndDiscard(hand, {
    north: ["clubs:6"], east: ["diamonds:6"], south: ["hearts:6"], west: ["spades:6"]
  });
  const completed = completeHand(stateFor(finalStockTurn), { reason: HAND_END_REASON.STOCK_EXHAUSTED });

  assert.equal(completed.hand.result.winnerSeatId, null);
  assert.deepEqual(Object.values(completed.hand.result.scoreEntriesBySeat).map((entry) => entry.total), [50, 50, 50, 50]);
  const acknowledged = seatOrder.reduce((state, seatId) => acknowledgeHandResult(state, seatId), completed);
  assert.equal(isReadyForNextHand(acknowledged), true);
  const next = startNextHand(acknowledged, deck);
  assert.equal(next.currentHandIndex, 7);
  assert.equal(next.dealerSeatId, "east");
  assert.equal(next.hand.wildRank, "7");
});

test("hand thirteen completes the game and reports joint lowest winners", () => {
  const hand = createHand({ gameId: "game-1", handIndex: 13, dealerSeatId: "west", seatOrder, deckCardIds: deck, rules: { cardsPerPlayer: 7 } });
  const final = completeHand(stateFor(Object.freeze({
    ...hand,
    handsBySeat: Object.freeze({ north: Object.freeze([]), east: Object.freeze(["clubs:2"]), south: Object.freeze(["diamonds:2"]), west: Object.freeze(["hearts:2"]) })
  }), { seats: Object.freeze({
    north: Object.freeze({ playerId: "p0", cumulativeScore: 10 }),
    east: Object.freeze({ playerId: "p1", cumulativeScore: 8 }),
    south: Object.freeze({ playerId: "p2", cumulativeScore: 11 }),
    west: Object.freeze({ playerId: "p3", cumulativeScore: 12 })
  }) }), { reason: HAND_END_REASON.WENT_OUT, winnerSeatId: "north" });

  assert.equal(final.lifecycle, LIFECYCLE.COMPLETE);
  assert.deepEqual(final.winners, ["north", "east"]);
  assert.deepEqual(finalWinnerSeatIds(final.seats, seatOrder), ["north", "east"]);
});

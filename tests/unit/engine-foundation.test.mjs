import assert from "node:assert/strict";
import test from "node:test";

import { CARD_CATALOG, CARD_IDS, cardForId, cardIdFor, isWildCard } from "../../src/engine/cards.js";
import { createSeededDeck, dealInitialHands, shuffleDeck } from "../../src/engine/deck.js";
import { assertStateInvariants, validateStateInvariants } from "../../src/engine/invariants.js";
import { CANONICAL_RULES, createRules, handForIndex, naturalCardValue, wildRankForHand } from "../../src/engine/rules.js";
import { cloneAndFreezeState, cloneState, createLobbyState, createSeat } from "../../src/engine/state.js";
import { LIFECYCLE, PHASE } from "../../src/engine/constants.js";

test("the card catalogue is an immutable complete single pack with stable identities", () => {
  assert.equal(CARD_IDS.length, 52);
  assert.equal(new Set(CARD_IDS).size, 52);
  assert.equal(cardIdFor("HEARTS", "q"), "hearts:Q");
  assert.deepEqual(cardForId("hearts:Q"), { id: "hearts:Q", suit: "hearts", rank: "Q" });
  assert.equal(CARD_CATALOG["hearts:Q"].id, "hearts:Q");
  assert.equal(Object.isFrozen(CARD_CATALOG["hearts:Q"]), true);
  assert.equal(isWildCard("clubs:6", "6"), true);
  assert.equal(isWildCard("clubs:6", "7"), false);
  assert.throws(() => cardForId("jokers:WILD"), /Unknown card ID/);
});

test("seeded shuffles are deterministic and retain all card identities", () => {
  const first = createSeededDeck("fixture-a");
  assert.deepEqual(first, shuffleDeck("fixture-a"));
  assert.notDeepEqual(first, createSeededDeck("fixture-b"));
  assert.deepEqual(new Set(first), new Set(CARD_IDS));
  assert.equal(Object.isFrozen(first), true);
});

test("the initial deal gives the dealer eight cards and preserves the stock order", () => {
  const deck = createSeededDeck("initial-deal");
  const deal = dealInitialHands({
    deckCardIds: deck,
    seatOrder: ["s0", "s1", "s2", "s3"],
    dealerSeatId: "s2"
  });
  assert.deepEqual(Object.values(deal.handsBySeat).map((hand) => hand.length), [7, 7, 8, 7]);
  assert.equal(deal.stockCardIds.length, 23);
  assert.equal(deal.handsBySeat.s3[0], deck[0], "deal starts left of the dealer");
  assert.equal(deal.handsBySeat.s0[0], deck[1]);
  assert.equal(deal.handsBySeat.s1[0], deck[2]);
  assert.equal(deal.handsBySeat.s2[0], deck[3]);
  assert.equal(new Set([...Object.values(deal.handsBySeat).flat(), ...deal.stockCardIds]).size, 52);
});

test("rules are immutable and retain the fixed hand schedule and score semantics", () => {
  assert.equal(CANONICAL_RULES.handCount, 13);
  assert.equal(wildRankForHand(6), "6");
  assert.equal(handForIndex(13).wildRank, "K");
  assert.equal(naturalCardValue("A"), 1);
  assert.equal(naturalCardValue("Q"), 10);
  assert.equal(Object.isFrozen(createRules()), true);
  assert.throws(() => createRules({ handCount: 12 }), /fixed thirteen-hand schedule/);
});

test("lobby state has the canonical frozen shape and clone helpers do not alias it", () => {
  const host = createSeat({ seatId: "host", playerId: "player-host", displayName: "Host" });
  const state = createLobbyState({ gameId: "game-1", seats: [host], hostSeatId: "host" });
  assert.equal(state.lifecycle, LIFECYCLE.LOBBY);
  assert.equal(state.rulesVersion, CANONICAL_RULES.rulesVersion);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(validateStateInvariants(state).ok, true);

  const clone = cloneState(state);
  clone.seats.host.displayName = "Changed";
  assert.equal(state.seats.host.displayName, "Host");
  assert.equal(Object.isFrozen(cloneAndFreezeState(clone)), true);
});

test("invariants accept a complete dealt hand and reject duplicate card ownership", () => {
  const seatOrder = ["s0", "s1", "s2", "s3"];
  const deal = dealInitialHands({
    deckCardIds: createSeededDeck("state-fixture"),
    seatOrder,
    dealerSeatId: "s2"
  });
  const lobby = createLobbyState({
    gameId: "game-2",
    hostSeatId: "s0",
    seats: seatOrder.map((seatId) => createSeat({ seatId, playerId: `p-${seatId}`, displayName: seatId }))
  });
  const state = cloneState(lobby);
  Object.assign(state, {
    lifecycle: LIFECYCLE.IN_PROGRESS,
    seatOrder,
    currentHandIndex: 1,
    initialDealerSeatId: "s2",
    dealerSeatId: "s2",
    shuffleSeed: "state-fixture",
    hand: {
      id: "hand-1",
      index: 1,
      wildRank: "A",
      dealerSeatId: "s2",
      activeSeatId: "s2",
      phase: PHASE.DEALER_INITIAL_DISCARD,
      turnNumber: 0,
      stockCardIds: deal.stockCardIds,
      discardCardIds: [],
      handsBySeat: deal.handsBySeat,
      openedBySeat: Object.fromEntries(seatOrder.map((seatId) => [seatId, false])),
      melds: [],
      drawnCardId: null,
      drawSource: null,
      drewFinalStock: false,
      result: null
    }
  });
  assert.doesNotThrow(() => assertStateInvariants(state));
  state.hand.discardCardIds.push(state.hand.stockCardIds[0]);
  assert.equal(validateStateInvariants(state).ok, false);
  assert.match(validateStateInvariants(state).violations.join(" "), /more than one zone/);
});

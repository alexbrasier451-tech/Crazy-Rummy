import assert from "node:assert/strict";
import test from "node:test";

import { CARD_IDS } from "../../src/engine/cards.js";
import { COMMAND_TYPE, LIFECYCLE, PHASE } from "../../src/engine/constants.js";
import { executeCommand } from "../../src/engine/commands.js";
import { createSeededDeck } from "../../src/engine/deck.js";
import {
  acknowledgeHandResult,
  completeHand,
  HAND_END_REASON,
  startNextHand
} from "../../src/engine/lifecycle.js";
import { cloneState, createLobbyState, createSeat } from "../../src/engine/state.js";
import { validateStateInvariants } from "../../src/engine/invariants.js";

const SEAT_ORDER = Object.freeze(["a", "b", "c", "dealer"]);

function lobbyState() {
  return createLobbyState({
    gameId: "invariant-game",
    hostSeatId: "a",
    seats: SEAT_ORDER.map((seatId) => createSeat({
      seatId,
      playerId: `player-${seatId}`,
      displayName: seatId,
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

function accepted(state, input) {
  const result = executeCommand(state, input);
  assert.equal(result.accepted, true, result.detail ?? result.reason);
  return result.state;
}

function deckWithCardsAtPositions(assignments) {
  const deck = [...CARD_IDS];
  for (const [position, cardId] of assignments) {
    const current = deck.indexOf(cardId);
    [deck[position], deck[current]] = [deck[current], deck[position]];
  }
  return deck;
}

function normalState(deckCardIds = createSeededDeck("invariant-normal")) {
  const initial = lobbyState();
  const started = accepted(initial, command(initial, COMMAND_TYPE.START_GAME, "a", "invariant-start", {
    initialDealerSeatId: "dealer",
    shuffleSeed: "invariant-normal",
    deckCardIds
  }));
  return accepted(started, command(started, COMMAND_TYPE.DEALER_INITIAL_DISCARD, "dealer", "invariant-opening", {
    cardId: started.hand.handsBySeat.dealer[0]
  }));
}

function finalStockTurn(state) {
  const fixture = cloneState(state);
  const hand = fixture.hand;
  const finalStockCardId = hand.stockCardIds.at(-1);
  const allCardIds = [
    ...hand.stockCardIds,
    ...hand.discardCardIds,
    ...Object.values(hand.handsBySeat).flat()
  ];
  const handsBySeat = Object.fromEntries(SEAT_ORDER.map((seatId) => [seatId, hand.handsBySeat[seatId].slice(0, 7)]));
  const retained = new Set(Object.values(handsBySeat).flat());
  fixture.hand = {
    ...hand,
    activeSeatId: "c",
    phase: PHASE.AWAITING_DISCARD,
    turnNumber: 23,
    stockCardIds: [],
    discardCardIds: allCardIds.filter((cardId) => cardId !== finalStockCardId && !retained.has(cardId)),
    handsBySeat,
    drawnCardId: finalStockCardId,
    drawSource: "stock",
    drewFinalStock: true
  };
  fixture.hand.discardCardIds.push(finalStockCardId);
  return fixture;
}

function completedState() {
  return completeHand(finalStockTurn(normalState()), { reason: HAND_END_REASON.STOCK_EXHAUSTED });
}

function finalState() {
  let state = normalState();
  for (let handIndex = 1; handIndex <= 13; handIndex += 1) {
    state = completeHand(finalStockTurn(state), {
      reason: HAND_END_REASON.STOCK_EXHAUSTED
    });
    if (handIndex < 13) {
      state = SEAT_ORDER.reduce(
        (current, seatId) => acknowledgeHandResult(current, seatId),
        state
      );
      state = startNextHand(state, createSeededDeck(`invariant-hand-${handIndex + 1}`));
    }
  }
  return state;
}

function expectInvalid(state, label) {
  const result = validateStateInvariants(state);
  assert.equal(result.ok, false, `${label} was accepted: ${result.violations.join("; ")}`);
}

test("the invariant boundary rejects semantically invalid recovered states", () => {
  const valid = normalState();
  assert.equal(validateStateInvariants(valid).ok, true);

  const invalidSetDeck = deckWithCardsAtPositions([
    [0, "clubs:9"], [4, "diamonds:9"], [8, "hearts:8"]
  ]);
  const illegalMeld = cloneState(normalState(invalidSetDeck));
  illegalMeld.hand.handsBySeat.a = illegalMeld.hand.handsBySeat.a.filter((cardId) => ![
    "clubs:9", "diamonds:9", "hearts:8"
  ].includes(cardId));
  illegalMeld.hand.melds = [{
    id: "illegal-set",
    type: "SET",
    originatingSeatId: "a",
    rank: "9",
    slots: [
      { slotId: "illegal:0", cardId: "clubs:9", represented: { rank: "9" } },
      { slotId: "illegal:1", cardId: "diamonds:9", represented: { rank: "9" } },
      { slotId: "illegal:2", cardId: "hearts:8", represented: { rank: "9" } }
    ]
  }];
  expectInvalid(illegalMeld, "illegal natural set");

  const phaseMetadata = cloneState(valid);
  phaseMetadata.hand.drawnCardId = phaseMetadata.hand.stockCardIds[0];
  phaseMetadata.hand.drawSource = "stock";
  expectInvalid(phaseMetadata, "draw metadata in AWAITING_DRAW");

  const postOpeningCount = cloneState(valid);
  const movedCard = postOpeningCount.hand.handsBySeat.a.pop();
  postOpeningCount.hand.stockCardIds.push(movedCard);
  expectInvalid(postOpeningCount, "incorrect immediate post-dealer-discard counts");

  const openedWithoutMeld = cloneState(valid);
  openedWithoutMeld.hand.openedBySeat.a = true;
  expectInvalid(openedWithoutMeld, "opened seat without an originating complete meld");

  const wrongDealerEvidence = cloneState(valid);
  wrongDealerEvidence.shuffleSeed = "acceptance-start";
  expectInvalid(wrongDealerEvidence, "initial dealer not derived from shuffle evidence");

  const missingResult = cloneState(completedState());
  missingResult.hand.result = null;
  expectInvalid(missingResult, "completed hand missing result");

  const scoreMismatch = cloneState(completedState());
  scoreMismatch.hand.result.scoreEntriesBySeat.a.cards[0].value += 1;
  expectInvalid(scoreMismatch, "score entry card value mismatch");

  const scoreCardMismatch = cloneState(completedState());
  scoreCardMismatch.completedHands[0].result.scoreEntriesBySeat.a.cardIds[0] = "clubs:K";
  expectInvalid(scoreCardMismatch, "immutable completed score card mismatch");

  const scoreTotalMismatch = cloneState(completedState());
  scoreTotalMismatch.completedHands[0].result.scoreEntriesBySeat.a.total += 1;
  expectInvalid(scoreTotalMismatch, "immutable completed score total mismatch");

  const cumulativeMismatch = cloneState(completedState());
  cumulativeMismatch.seats.a.cumulativeScore += 1;
  expectInvalid(cumulativeMismatch, "cumulative score mismatch");

  const invalidWinners = cloneState(finalState());
  invalidWinners.winners = ["not-a-seat"];
  expectInvalid(invalidWinners, "invalid final winners");

  const missingHistoricHand = cloneState(finalState());
  missingHistoricHand.completedHands.splice(4, 1);
  expectInvalid(missingHistoricHand, "non-contiguous completed-hand history");

  const malformedLedger = cloneState(valid);
  const ledgerEntry = malformedLedger.commandLedger[Object.keys(malformedLedger.commandLedger)[0]];
  delete ledgerEntry.event.commandFingerprint;
  expectInvalid(malformedLedger, "malformed accepted command ledger entry");
});

test("valid command state, completed result, and final completion remain accepted", () => {
  assert.equal(validateStateInvariants(normalState()).ok, true);
  assert.equal(validateStateInvariants(completedState()).ok, true);
  const final = finalState();
  assert.equal(final.lifecycle, LIFECYCLE.COMPLETE);
  assert.equal(final.hand.phase, PHASE.HAND_COMPLETE);
  assert.equal(validateStateInvariants(final).ok, true);
});

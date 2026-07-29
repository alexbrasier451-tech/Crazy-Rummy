import { HAND_SCHEDULE, LIFECYCLE, PHASE } from "./constants.js";
import { scoreHand } from "./scoring.js";

export const HAND_END_REASON = Object.freeze({
  WENT_OUT: "WENT_OUT",
  STOCK_EXHAUSTED: "STOCK_EXHAUSTED"
});

function requireSeatOrder(seatOrder) {
  if (!Array.isArray(seatOrder) || seatOrder.length === 0) {
    throw new TypeError("seatOrder must contain at least one seat ID.");
  }

  if (new Set(seatOrder).size !== seatOrder.length) {
    throw new TypeError("seatOrder must not contain duplicate seat IDs.");
  }
}

function requireCardIds(cardIds) {
  if (!Array.isArray(cardIds)) {
    throw new TypeError("deckCardIds must be an array in top-first order.");
  }
  if (new Set(cardIds).size !== cardIds.length) {
    throw new TypeError("deckCardIds must not contain duplicate card IDs.");
  }
}

function cloneSeatsWithScores(seats, scoreEntriesBySeat) {
  return Object.fromEntries(Object.entries(seats).map(([seatId, seat]) => {
    const handScore = scoreEntriesBySeat[seatId]?.total ?? 0;
    const priorScore = Number.isFinite(seat.cumulativeScore)
      ? seat.cumulativeScore
      : 0;

    return [seatId, Object.freeze({
      ...seat,
      cumulativeScore: priorScore + handScore
    })];
  }));
}

function makeScoreEntries(hand, winnerSeatId, eligibleSeatIds) {
  return Object.freeze(Object.fromEntries(eligibleSeatIds.map((seatId) => {
    const cardIds = hand.handsBySeat[seatId];
    const score = scoreHand(cardIds, hand.wildRank);
    const total = seatId === winnerSeatId ? 0 : score.total;

    if (seatId === winnerSeatId && cardIds.length !== 0) {
      throw new TypeError("A hand winner must have no cards after the final discard.");
    }

    return [seatId, Object.freeze({
      ...score,
      total
    })];
  })));
}

function makeCompletedHand(hand, result) {
  return Object.freeze({
    handId: hand.id,
    index: hand.index,
    wildRank: hand.wildRank,
    dealerSeatId: hand.dealerSeatId,
    participantSeatIds: Object.freeze([...(hand.participantSeatIds ?? Object.keys(hand.handsBySeat))]),
    result
  });
}

function allAcknowledged(result, seatOrder) {
  return seatOrder.every((seatId) => result.acknowledgedBySeatIds.includes(seatId));
}

/** Return the next occupied clockwise seat. */
export function nextSeatId(seatOrder, seatId) {
  requireSeatOrder(seatOrder);
  const index = seatOrder.indexOf(seatId);
  if (index === -1) {
    throw new RangeError(`Unknown seat ID: ${seatId}`);
  }
  return seatOrder[(index + 1) % seatOrder.length];
}

/** Return the next active seat while retaining the match's original order. */
export function nextActiveSeatId(seatOrder, activeSeatOrder, seatId) {
  requireSeatOrder(seatOrder);
  requireSeatOrder(activeSeatOrder);
  if (!seatOrder.includes(seatId)) throw new RangeError(`Unknown seat ID: ${seatId}`);
  const active = new Set(activeSeatOrder);
  for (let offset = 1; offset <= seatOrder.length; offset += 1) {
    const candidate = seatOrder[(seatOrder.indexOf(seatId) + offset) % seatOrder.length];
    if (active.has(candidate)) return candidate;
  }
  throw new RangeError("No active seat is available.");
}

export function handScheduleEntry(handIndex) {
  if (!Number.isInteger(handIndex) || handIndex < 1 || handIndex > HAND_SCHEDULE.length) {
    throw new RangeError(`Hand index must be between 1 and ${HAND_SCHEDULE.length}.`);
  }
  return HAND_SCHEDULE[handIndex - 1];
}

/**
 * Deal an already-shuffled deck. `deckCardIds[0]` is the next card dealt and
 * every remaining card keeps that top-first order in the returned stock.
 */
export function createHand({
  gameId,
  handIndex,
  dealerSeatId,
  seatOrder,
  allSeatOrder = seatOrder,
  deckCardIds,
  rules
}) {
  requireSeatOrder(seatOrder);
  requireSeatOrder(allSeatOrder);
  requireCardIds(deckCardIds);
  if (!seatOrder.includes(dealerSeatId)) {
    throw new RangeError(`Dealer is not seated: ${dealerSeatId}`);
  }

  const schedule = handScheduleEntry(handIndex);
  const cardsPerPlayer = rules?.cardsPerPlayer ?? 7;
  const requiredCardCount = (seatOrder.length * cardsPerPlayer) + 1;
  if (deckCardIds.length < requiredCardCount) {
    throw new RangeError("The deck does not contain enough cards for the initial deal.");
  }

  const handsBySeat = Object.fromEntries(allSeatOrder.map((seatId) => [seatId, []]));
  let cursor = 0;
  const firstRecipient = nextSeatId(seatOrder, dealerSeatId);
  const dealOrder = [...seatOrder.slice(seatOrder.indexOf(firstRecipient)), ...seatOrder.slice(0, seatOrder.indexOf(firstRecipient))];

  for (let round = 0; round < cardsPerPlayer; round += 1) {
    for (const seatId of dealOrder) {
      handsBySeat[seatId].push(deckCardIds[cursor]);
      cursor += 1;
    }
  }
  handsBySeat[dealerSeatId].push(deckCardIds[cursor]);
  cursor += 1;

  return Object.freeze({
    id: `${gameId}:hand:${handIndex}`,
    index: handIndex,
    wildRank: schedule.wildRank,
    dealerSeatId,
    participantSeatIds: Object.freeze([...seatOrder]),
    activeSeatId: dealerSeatId,
    phase: PHASE.DEALER_INITIAL_DISCARD,
    turnNumber: 0,
    stockCardIds: Object.freeze(deckCardIds.slice(cursor)),
    discardCardIds: Object.freeze([]),
    handsBySeat: Object.freeze(Object.fromEntries(Object.entries(handsBySeat).map(([seatId, cards]) => [
      seatId,
      Object.freeze(cards)
    ]))),
    openedBySeat: Object.freeze(Object.fromEntries(allSeatOrder.map((seatId) => [seatId, false]))),
    melds: Object.freeze([]),
    deadHandCardIds: Object.freeze([]),
    drawnCardId: null,
    drawSource: null,
    drewFinalStock: false,
    result: null
  });
}

/** Start a hand on a copied game state, without producing any randomness. */
export function startHand(state, deckCardIds, dealerSeatId = state.dealerSeatId) {
  const handIndex = state.currentHandIndex;
  if (!Number.isInteger(handIndex)) {
    throw new TypeError("state.currentHandIndex must be an integer.");
  }

  const activeSeatOrder = state.activeSeatOrder?.length ? state.activeSeatOrder : state.seatOrder;
  return Object.freeze({
    ...state,
    lifecycle: LIFECYCLE.IN_PROGRESS,
    dealerSeatId,
    hand: createHand({
      gameId: state.gameId,
      handIndex,
      dealerSeatId,
      seatOrder: activeSeatOrder,
      allSeatOrder: state.seatOrder,
      deckCardIds,
      rules: state.rules
    })
  });
}

/**
 * Atomically score a completed hand and update all cumulative totals. A winner
 * is valid only after their final discard left their hand empty.
 */
export function completeHand(state, { reason, winnerSeatId = null } = {}) {
  const hand = state?.hand;
  if (!hand || hand.result) {
    throw new TypeError("An uncompleted hand is required.");
  }
  if (!Object.values(HAND_END_REASON).includes(reason)) {
    throw new TypeError("A recognised hand end reason is required.");
  }
  if (reason === HAND_END_REASON.WENT_OUT && !winnerSeatId) {
    throw new TypeError("A winning hand requires a winner seat ID.");
  }
  if (reason === HAND_END_REASON.STOCK_EXHAUSTED && winnerSeatId !== null) {
    throw new TypeError("Stock exhaustion has no hand winner.");
  }
  if (reason === HAND_END_REASON.STOCK_EXHAUSTED && (
    hand.stockCardIds.length !== 0
    || hand.drewFinalStock !== true
    || hand.drawSource !== "stock"
  )) {
    throw new TypeError("Stock exhaustion requires the recorded final stock draw.");
  }
  if (winnerSeatId !== null && !state.seatOrder.includes(winnerSeatId)) {
    throw new RangeError(`Winner is not seated: ${winnerSeatId}`);
  }

  const eligibleSeatIds = state.activeSeatOrder?.length ? state.activeSeatOrder : state.seatOrder;
  if (winnerSeatId !== null && !eligibleSeatIds.includes(winnerSeatId)) {
    throw new RangeError(`Winner is not active: ${winnerSeatId}`);
  }
  const scoreEntriesBySeat = makeScoreEntries(hand, winnerSeatId, eligibleSeatIds);
  const result = Object.freeze({
    reason,
    winnerSeatId,
    scoreEntriesBySeat,
    acknowledgedBySeatIds: Object.freeze([])
  });
  const completedHand = makeCompletedHand(hand, result);
  const finalHand = hand.index === HAND_SCHEDULE.length;
  const seats = cloneSeatsWithScores(state.seats, scoreEntriesBySeat);
  const winners = finalHand ? finalWinnerSeatIds(seats, eligibleSeatIds) : [];

  return Object.freeze({
    ...state,
    lifecycle: finalHand ? LIFECYCLE.COMPLETE : state.lifecycle,
    seats: Object.freeze(seats),
    hand: Object.freeze({ ...hand, phase: PHASE.HAND_COMPLETE, result }),
    completedHands: Object.freeze([...(state.completedHands ?? []), completedHand]),
    winners: Object.freeze(winners)
  });
}

/** Record one seat's readiness after a hand without mutating the prior state. */
export function acknowledgeHandResult(state, seatId) {
  const result = state?.hand?.result;
  if (!result) {
    throw new TypeError("A completed hand result is required.");
  }
  if (!(state.activeSeatOrder?.length ? state.activeSeatOrder : state.seatOrder).includes(seatId)) {
    throw new RangeError(`Unknown seat ID: ${seatId}`);
  }
  if (result.acknowledgedBySeatIds.includes(seatId)) {
    return state;
  }

  const acknowledgedBySeatIds = Object.freeze([...result.acknowledgedBySeatIds, seatId]);
  const updatedResult = Object.freeze({ ...result, acknowledgedBySeatIds });
  const completedHands = state.completedHands.map((completedHand, index) => (
    index === state.completedHands.length - 1
      ? Object.freeze({ ...completedHand, result: updatedResult })
      : completedHand
  ));

  return Object.freeze({
    ...state,
    hand: Object.freeze({ ...state.hand, result: updatedResult }),
    completedHands: Object.freeze(completedHands)
  });
}

export function isReadyForNextHand(state) {
  const result = state?.hand?.result;
  return Boolean(
    result
    && state.lifecycle === LIFECYCLE.IN_PROGRESS
    && state.hand.index < HAND_SCHEDULE.length
    && allAcknowledged(result, state.activeSeatOrder?.length ? state.activeSeatOrder : state.seatOrder)
  );
}

/** Advance clockwise after every non-final, fully acknowledged hand. */
export function startNextHand(state, deckCardIds) {
  if (!isReadyForNextHand(state)) {
    throw new TypeError("Every seat must acknowledge a non-final completed hand before the next hand starts.");
  }

  const dealerSeatId = nextActiveSeatId(
    state.seatOrder,
    state.activeSeatOrder?.length ? state.activeSeatOrder : state.seatOrder,
    state.dealerSeatId
  );
  return startHand(Object.freeze({
    ...state,
    currentHandIndex: state.hand.index + 1,
    dealerSeatId
  }), deckCardIds, dealerSeatId);
}

/** Return every seat tied for the lowest cumulative total, in clockwise order. */
export function finalWinnerSeatIds(seats, seatOrder) {
  requireSeatOrder(seatOrder);
  const totals = seatOrder.map((seatId) => {
    const score = seats?.[seatId]?.cumulativeScore;
    if (!Number.isFinite(score)) {
      throw new TypeError(`Seat ${seatId} has no cumulative score.`);
    }
    return score;
  });
  const lowest = Math.min(...totals);
  return seatOrder.filter((seatId) => seats[seatId].cumulativeScore === lowest);
}

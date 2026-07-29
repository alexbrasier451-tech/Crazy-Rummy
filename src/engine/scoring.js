import { cardForId, normalizeRank } from "./cards.js";

const FACE_CARD_RANKS = new Set(["J", "Q", "K"]);

/**
 * Return the penalty for a card left in a hand.  Wild rank takes precedence
 * over its printed natural value (including A, J, Q, and K).
 */
export function scoreCard(cardId, wildRank) {
  const rank = cardForId(cardId).rank;
  const resolvedWildRank = normalizeRank(wildRank);

  if (rank === resolvedWildRank) {
    return 50;
  }

  if (rank === "A") {
    return 1;
  }

  if (FACE_CARD_RANKS.has(rank)) {
    return 10;
  }

  const value = Number(rank);
  if (!Number.isInteger(value) || value < 2 || value > 10) {
    throw new TypeError(`Invalid card rank: ${rank}`);
  }

  return value;
}

/**
 * Score a complete remaining hand without changing the supplied card order.
 */
export function scoreHand(cardIds, wildRank) {
  if (!Array.isArray(cardIds)) {
    throw new TypeError("cardIds must be an array.");
  }

  const cards = cardIds.map((cardId) => Object.freeze({
    cardId,
    value: scoreCard(cardId, wildRank)
  }));
  const total = cards.reduce((sum, card) => sum + card.value, 0);

  return Object.freeze({
    cardIds: Object.freeze([...cardIds]),
    cards: Object.freeze(cards),
    total
  });
}

export function scoreHands(handsBySeat, wildRank) {
  if (!handsBySeat || typeof handsBySeat !== "object" || Array.isArray(handsBySeat)) {
    throw new TypeError("handsBySeat must be an object keyed by seat ID.");
  }

  return Object.freeze(Object.fromEntries(
    Object.entries(handsBySeat).map(([seatId, cardIds]) => [
      seatId,
      scoreHand(cardIds, wildRank)
    ])
  ));
}

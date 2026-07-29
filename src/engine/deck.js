import { CARD_IDS, cardForId } from "./cards.js";

function seedToUint32(seed) {
  const text = typeof seed === "number" && Number.isFinite(seed)
    ? String(seed)
    : (typeof seed === "string" ? seed : null);
  if (!text) throw new TypeError("Shuffle seed must be a non-empty string or finite number.");

  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function seededUint32(seed) {
  let state = seedToUint32(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };
}

function seededRandom(seed) {
  const nextUint32 = seededUint32(seed);
  return () => nextUint32() / 0x100000000;
}

function validateDeck(cardIds) {
  if (!Array.isArray(cardIds)) throw new TypeError("Deck must be an array of card IDs.");
  const unique = new Set();
  for (const cardId of cardIds) {
    cardForId(cardId);
    if (unique.has(cardId)) throw new RangeError(`Deck contains duplicate card ID: ${cardId}`);
    unique.add(cardId);
  }
  return [...cardIds];
}

function freezeDeal(value) {
  for (const hand of Object.values(value.handsBySeat)) Object.freeze(hand);
  Object.freeze(value.handsBySeat);
  Object.freeze(value.stockCardIds);
  return Object.freeze(value);
}

export function shuffleDeck(seed, cardIds = CARD_IDS) {
  const shuffled = validateDeck(cardIds);
  const random = seededRandom(seed);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return Object.freeze(shuffled);
}

export function createSeededDeck(seed) {
  return shuffleDeck(seed, CARD_IDS);
}

/**
 * Select an integer using rejection sampling, avoiding modulo bias when the
 * requested range does not divide the 32-bit generator range.
 */
export function deterministicIndex(seedOrEvidence, upperBound) {
  if (!Number.isInteger(upperBound) || upperBound < 1 || upperBound > 0x100000000) {
    throw new RangeError("Index upper bound must be an integer between 1 and 2^32.");
  }
  const nextUint32 = seededUint32(seedOrEvidence);
  const range = 0x100000000;
  const limit = range - (range % upperBound);
  let value;
  do {
    value = nextUint32();
  } while (value >= limit);
  return value % upperBound;
}

/** Return the deterministically selected initial dealer from accepted evidence. */
export function initialDealerSeatIdFor(seedOrEvidence, seatOrder) {
  if (!Array.isArray(seatOrder) || seatOrder.length === 0
    || new Set(seatOrder).size !== seatOrder.length
    || seatOrder.some((seatId) => typeof seatId !== "string" || seatId.length === 0)) {
    throw new TypeError("Seat order must contain unique non-empty seat IDs.");
  }
  return seatOrder[deterministicIndex(seedOrEvidence, seatOrder.length)];
}

/** Preserve an exact, deterministic private evidence string for a committed pack order. */
export function committedDeckEvidence(deckCardIds) {
  const deck = validateDeck(deckCardIds);
  if (deck.length !== CARD_IDS.length || deck.some((cardId) => !CARD_IDS.includes(cardId))) {
    throw new RangeError("Committed deck evidence requires the complete 52-card pack.");
  }
  return `committed:${deck.join("|")}`;
}

export function dealInitialHands({
  deckCardIds,
  seatOrder,
  dealerSeatId,
  cardsPerPlayer = 7
} = {}) {
  const deck = validateDeck(deckCardIds);
  if (!Array.isArray(seatOrder) || seatOrder.length < 1) {
    throw new RangeError("Initial deal requires at least one occupied seat.");
  }
  if (new Set(seatOrder).size !== seatOrder.length || seatOrder.some((seatId) =>
    typeof seatId !== "string" || seatId.length === 0
  )) {
    throw new TypeError("Seat order must contain unique non-empty seat IDs.");
  }
  if (!seatOrder.includes(dealerSeatId)) {
    throw new RangeError("Dealer must be an occupied seat.");
  }
  if (!Number.isInteger(cardsPerPlayer) || cardsPerPlayer < 1) {
    throw new RangeError("Cards per player must be a positive integer.");
  }

  const requiredCards = (seatOrder.length * cardsPerPlayer) + 1;
  if (deck.length < requiredCards) {
    throw new RangeError("Deck does not contain enough cards for the initial deal.");
  }

  const handsBySeat = Object.fromEntries(seatOrder.map((seatId) => [seatId, []]));
  const dealerIndex = seatOrder.indexOf(dealerSeatId);
  const dealOrder = [
    ...seatOrder.slice(dealerIndex + 1),
    ...seatOrder.slice(0, dealerIndex + 1)
  ];
  let cursor = 0;
  for (let round = 0; round < cardsPerPlayer; round += 1) {
    for (const seatId of dealOrder) handsBySeat[seatId].push(deck[cursor++]);
  }
  handsBySeat[dealerSeatId].push(deck[cursor++]);

  return freezeDeal({
    handsBySeat,
    stockCardIds: deck.slice(cursor)
  });
}

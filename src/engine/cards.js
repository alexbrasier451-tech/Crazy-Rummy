import { RANKS, SUITS } from "./constants.js";

const suitSet = new Set(SUITS);
const rankSet = new Set(RANKS);

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

export function normalizeSuit(suit) {
  const normalized = requiredString(suit, "Suit").toLowerCase();
  if (!suitSet.has(normalized)) {
    throw new RangeError(`Unknown suit: ${suit}`);
  }
  return normalized;
}

export function normalizeRank(rank) {
  const normalized = requiredString(rank, "Rank").toUpperCase();
  if (!rankSet.has(normalized)) {
    throw new RangeError(`Unknown rank: ${rank}`);
  }
  return normalized;
}

export function cardIdFor(suit, rank) {
  return `${normalizeSuit(suit)}:${normalizeRank(rank)}`;
}

const catalogueEntries = [];
for (const suit of SUITS) {
  for (const rank of RANKS) {
    const id = `${suit}:${rank}`;
    catalogueEntries.push([id, Object.freeze({ id, suit, rank })]);
  }
}

export const CARD_CATALOG = Object.freeze(Object.fromEntries(catalogueEntries));
export const CARD_IDS = Object.freeze(catalogueEntries.map(([id]) => id));

export function isCardId(value) {
  return typeof value === "string"
    && Object.hasOwn(CARD_CATALOG, value);
}

export function cardForId(cardId) {
  if (!isCardId(cardId)) {
    throw new RangeError(`Unknown card ID: ${String(cardId)}`);
  }
  return CARD_CATALOG[cardId];
}

export function parseCardId(cardId) {
  return cardForId(cardId);
}

export function cardIdOf(card) {
  if (typeof card === "string") return cardForId(card).id;
  if (!card || typeof card !== "object") {
    throw new TypeError("Card must be a card ID or a card record.");
  }
  return cardIdFor(card.suit, card.rank);
}

export function rankIndex(rank) {
  return RANKS.indexOf(normalizeRank(rank));
}

export function isWildCard(card, wildRank) {
  return cardForId(cardIdOf(card)).rank === normalizeRank(wildRank);
}

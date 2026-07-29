const SUITS = Object.freeze(["clubs", "diamonds", "hearts", "spades"]);
const RANKS = Object.freeze(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);
const SUIT_SYMBOLS = Object.freeze({ clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" });

const SUIT_ORDER = new Map(SUITS.map((suit, index) => [suit, index]));
const RANK_ORDER = new Map(RANKS.map((rank, index) => [rank, index]));

export function cardParts(cardId) {
  if (typeof cardId !== "string") return null;
  const [suit, rank, ...rest] = cardId.split(":");
  if (rest.length || !SUIT_ORDER.has(suit) || !RANK_ORDER.has(rank)) return null;
  return { id: cardId, suit, rank, symbol: SUIT_SYMBOLS[suit] };
}

export function cardDisplayName(cardId) {
  const card = cardParts(cardId);
  if (!card) return "Unknown card";
  const names = { A: "Ace", J: "Jack", Q: "Queen", K: "King" };
  return `${names[card.rank] ?? card.rank} of ${card.suit}`;
}

export function sortCardIds(cardIds, mode = "custom") {
  const cards = Array.isArray(cardIds) ? [...cardIds] : [];
  if (mode === "custom") return cards;
  const primary = mode === "suit" ? SUIT_ORDER : RANK_ORDER;
  const secondary = mode === "suit" ? RANK_ORDER : SUIT_ORDER;
  const primaryKey = mode === "suit" ? "suit" : "rank";
  const secondaryKey = mode === "suit" ? "rank" : "suit";
  return cards.sort((left, right) => {
    const a = cardParts(left);
    const b = cardParts(right);
    const first = (primary.get(a?.[primaryKey]) ?? Infinity) - (primary.get(b?.[primaryKey]) ?? Infinity);
    if (first) return first;
    return (secondary.get(a?.[secondaryKey]) ?? Infinity) - (secondary.get(b?.[secondaryKey]) ?? Infinity);
  });
}

export function phaseCopy(phase, isLocalTurn) {
  const mine = Boolean(isLocalTurn);
  switch (phase) {
    case "DEALER_INITIAL_DISCARD":
      return mine
        ? { title: "Opening discard", detail: "You are the dealer. Select exactly one card to begin the hand.", step: "discard" }
        : { title: "Opening discard", detail: "The dealer is choosing the opening discard.", step: "wait" };
    case "AWAITING_DRAW":
      return mine
        ? { title: "Your turn · draw", detail: "Draw from the stock or take the visible discard before playing.", step: "draw" }
        : { title: "Waiting for draw", detail: "Another player is choosing a draw.", step: "wait" };
    case "TABLE_PLAY":
      return mine
        ? { title: "Your turn · table play", detail: "Make a meld, add to the table, replace a wild, then finish table play.", step: "play" }
        : { title: "Table play", detail: "Another player is deciding what to play.", step: "wait" };
    case "AWAITING_DISCARD":
      return mine
        ? { title: "Your turn · discard", detail: "Finish your turn with one deliberate discard.", step: "discard" }
        : { title: "Waiting for discard", detail: "Another player is choosing a discard.", step: "wait" };
    case "HAND_COMPLETE":
      return { title: "Hand complete", detail: "The hand result is ready to acknowledge.", step: "complete" };
    default:
      return { title: "Table status", detail: "Waiting for the current hand to begin.", step: "wait" };
  }
}

const REJECTIONS = Object.freeze({
  WRONG_PHASE: "That action is not available at this point in the turn.",
  NOT_ACTIVE_PLAYER: "It is no longer your turn. The latest table is shown.",
  STALE_REVISION: "Your turn changed. The latest table has been loaded.",
  CARD_UNAVAILABLE: "That card is no longer available in your hand.",
  STOCK_EMPTY: "The stock is empty.",
  DISCARD_EMPTY: "There is no discard to take.",
  INVALID_MELD: "That meld is not legal. Check its cards and wild identity.",
  OPENING_REQUIRED: "Open with a complete set or run before adding to the table.",
  PLAYER_NOT_OPENED: "Open with a complete set or run before adding to the table.",
  FINAL_DISCARD_REQUIRED: "Keep one card for the required final discard.",
  MELD_NOT_FOUND: "That table meld changed. Choose a current meld.",
  WILD_NOT_REPLACEABLE: "That wild cannot be replaced with the selected card.",
  NOT_AUTHORIZED: "You are not allowed to make that table action.",
  INVALID_HAND: "This hand has changed. Review the latest table.",
  INVALID_GAME: "This match is no longer available in the local harness."
});

export function rejectionCopy(reason, detail) {
  const base = REJECTIONS[reason] ?? "The table could not accept that action.";
  return detail ? `${base} ${String(detail).replaceAll("_", " ").toLowerCase()}.` : base;
}

export function buildMeld({ id, type, cardIds, actorSeatId, wildRank, representations = {} }) {
  const cards = Array.isArray(cardIds) ? cardIds : [];
  const slots = cards.map((cardId, index) => {
    const card = cardParts(cardId);
    const represented = card?.rank === wildRank ? representations[cardId] : undefined;
    return {
      slotId: `${id}:${index + 1}`,
      cardId,
      ...(represented ? { represented } : {})
    };
  });
  const meld = { id, type, originatingSeatId: actorSeatId, slots };
  if (type === "SET") {
    const natural = slots.map((slot) => cardParts(slot.cardId)).find((card) => card?.rank !== wildRank);
    if (natural) meld.rank = natural.rank;
  } else {
    const natural = slots.map((slot) => cardParts(slot.cardId)).find((card) => card?.rank !== wildRank);
    if (natural) meld.suit = natural.suit;
  }
  return meld;
}

export function buildLayoffSlots({ meld, cardIds, wildRank, representations = {} }) {
  return (Array.isArray(cardIds) ? cardIds : []).map((cardId, index) => {
    const card = cardParts(cardId);
    const representation = card?.rank === wildRank ? representations[cardId] : undefined;
    return {
      slotId: `${meld.id}:add:${index + 1}`,
      cardId,
      ...(representation ? { represented: representation } : {})
    };
  });
}

export function representedLabel(represented) {
  if (!represented?.rank) return "unassigned";
  return represented.suit ? `${represented.rank} of ${represented.suit}` : represented.rank;
}

export { RANKS, SUITS };

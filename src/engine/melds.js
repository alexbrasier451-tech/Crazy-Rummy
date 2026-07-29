import { MELD_TYPE, RANKS, REJECTION, SUITS } from "./constants.js";

const RANK_INDEX = new Map(RANKS.map((rank, index) => [rank, index]));
const SUIT_SET = new Set(SUITS);
const START_PLACEMENTS = new Set(["START", "start", "BEFORE", "before"]);
const END_PLACEMENTS = new Set(["END", "end", "AFTER", "after"]);

function rejected(detail, reason = REJECTION.INVALID_MELD) {
  return { ok: false, reason, detail };
}

function parseCardId(cardId) {
  if (typeof cardId !== "string") return null;
  const separator = cardId.indexOf(":");
  if (separator <= 0 || separator !== cardId.lastIndexOf(":")) return null;

  const suit = cardId.slice(0, separator);
  const rank = cardId.slice(separator + 1);
  if (!SUIT_SET.has(suit) || !RANK_INDEX.has(rank)) return null;
  return { suit, rank };
}

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function cloneRepresentation(represented) {
  return represented.suit == null
    ? { rank: represented.rank }
    : { rank: represented.rank, suit: represented.suit };
}

function cloneSlot(slot) {
  return {
    slotId: slot.slotId,
    cardId: slot.cardId,
    represented: cloneRepresentation(slot.represented)
  };
}

function freezeMeld(meld) {
  const slots = meld.slots.map((slot) => Object.freeze({
    ...slot,
    represented: Object.freeze(slot.represented)
  }));
  return Object.freeze({ ...meld, slots: Object.freeze(slots) });
}

function permutations(values) {
  if (values.length < 2) return [values];
  return values.flatMap((value, index) => (
    permutations(values.filter((_, candidateIndex) => candidateIndex !== index))
      .map((tail) => [value, ...tail])
  ));
}

function hasExactRepresentation(represented, expected) {
  if (!isRecord(represented) || represented.rank !== expected.rank) return false;
  return expected.suit == null
    ? represented.suit == null
    : represented.suit === expected.suit;
}

function hasSetRepresentation(represented, rank, naturalSuit) {
  if (!isRecord(represented) || represented.rank !== rank) return false;
  return represented.suit == null || naturalSuit == null || represented.suit === naturalSuit;
}

function normaliseSlot(slot, { wildRank, meldType, setRank, runSuit }) {
  if (!isRecord(slot) || typeof slot.slotId !== "string" || slot.slotId.length === 0) {
    return rejected("INVALID_SLOT");
  }

  const card = parseCardId(slot.cardId);
  if (!card) return rejected("INVALID_CARD_ID");

  const wild = card.rank === wildRank;
  const supplied = slot.represented;
  let represented;

  if (meldType === MELD_TYPE.SET) {
    if (!setRank) return rejected("SET_RANK_REQUIRED");
    const expected = { rank: setRank };
    if (wild) {
      if (!hasSetRepresentation(supplied, setRank)) {
        return rejected("WILD_REPRESENTATION_REQUIRED");
      }
    } else if (card.rank !== setRank) {
      return rejected("SET_NATURAL_RANK_MISMATCH");
    } else if (supplied != null && !hasSetRepresentation(supplied, setRank, card.suit)) {
      return rejected("NATURAL_REPRESENTATION_MISMATCH");
    }
    represented = expected;
  } else {
    const expected = { rank: card.rank, suit: card.suit };
    if (wild) {
      if (!isRecord(supplied) || !RANK_INDEX.has(supplied.rank) || !SUIT_SET.has(supplied.suit)) {
        return rejected("WILD_REPRESENTATION_REQUIRED");
      }
      represented = { rank: supplied.rank, suit: supplied.suit };
      if (runSuit && represented.suit !== runSuit) {
        return rejected("RUN_SUIT_MISMATCH");
      }
    } else {
      if (supplied != null && !hasExactRepresentation(supplied, expected)) {
        return rejected("NATURAL_REPRESENTATION_MISMATCH");
      }
      if (runSuit && card.suit !== runSuit) return rejected("RUN_SUIT_MISMATCH");
      represented = expected;
    }
  }

  return {
    ok: true,
    slot: {
      slotId: slot.slotId,
      cardId: slot.cardId,
      represented
    }
  };
}

function findSetRank(meld, wildRank) {
  if (RANK_INDEX.has(meld.rank)) return meld.rank;
  for (const slot of meld.slots ?? []) {
    const card = parseCardId(slot?.cardId);
    if (card && card.rank !== wildRank) return card.rank;
  }
  for (const slot of meld.slots ?? []) {
    if (RANK_INDEX.has(slot?.represented?.rank)) return slot.represented.rank;
  }
  return null;
}

function findRunSuit(meld, wildRank) {
  if (SUIT_SET.has(meld.suit)) return meld.suit;
  for (const slot of meld.slots ?? []) {
    const card = parseCardId(slot?.cardId);
    if (card && card.rank !== wildRank) return card.suit;
    if (SUIT_SET.has(slot?.represented?.suit)) return slot.represented.suit;
  }
  return null;
}

function validateSet(meld, wildRank) {
  if (meld.slots.length < 3) return rejected("MELD_TOO_SMALL");
  if (meld.slots.length > 4) return rejected("SET_TOO_LARGE");

  const rank = findSetRank(meld, wildRank);
  if (!rank) return rejected("SET_RANK_REQUIRED");

  const slotIds = new Set();
  const cardIds = new Set();
  const naturalSuits = new Set();
  const slots = [];
  for (const slot of meld.slots) {
    const validated = normaliseSlot(slot, { wildRank, meldType: MELD_TYPE.SET, setRank: rank });
    if (!validated.ok) return validated;
    if (slotIds.has(validated.slot.slotId)) return rejected("DUPLICATE_SLOT_ID");
    if (cardIds.has(validated.slot.cardId)) return rejected("DUPLICATE_CARD_ID");
    slotIds.add(validated.slot.slotId);
    cardIds.add(validated.slot.cardId);

    const card = parseCardId(validated.slot.cardId);
    if (card.rank !== wildRank) {
      if (naturalSuits.has(card.suit)) return rejected("DUPLICATE_SET_SUIT");
      naturalSuits.add(card.suit);
    }
    slots.push(validated.slot);
  }

  return {
    ok: true,
    meld: freezeMeld({
      id: meld.id,
      type: MELD_TYPE.SET,
      originatingSeatId: meld.originatingSeatId,
      rank,
      slots
    })
  };
}

function validateRun(meld, wildRank) {
  if (meld.slots.length < 3) return rejected("MELD_TOO_SMALL");
  const suit = findRunSuit(meld, wildRank);
  if (!suit) return rejected("RUN_SUIT_REQUIRED");

  const slotIds = new Set();
  const cardIds = new Set();
  const representedRanks = new Set();
  const slots = [];
  for (const slot of meld.slots) {
    const validated = normaliseSlot(slot, { wildRank, meldType: MELD_TYPE.RUN, runSuit: suit });
    if (!validated.ok) return validated;
    if (slotIds.has(validated.slot.slotId)) return rejected("DUPLICATE_SLOT_ID");
    if (cardIds.has(validated.slot.cardId)) return rejected("DUPLICATE_CARD_ID");
    const rank = validated.slot.represented.rank;
    if (representedRanks.has(rank)) return rejected("DUPLICATE_RUN_POSITION");
    slotIds.add(validated.slot.slotId);
    cardIds.add(validated.slot.cardId);
    representedRanks.add(rank);
    slots.push(validated.slot);
  }

  slots.sort((first, second) => (
    RANK_INDEX.get(first.represented.rank) - RANK_INDEX.get(second.represented.rank)
  ));
  for (let index = 1; index < slots.length; index += 1) {
    const previous = RANK_INDEX.get(slots[index - 1].represented.rank);
    const current = RANK_INDEX.get(slots[index].represented.rank);
    if (current !== previous + 1) return rejected("RUN_NOT_CONSECUTIVE");
  }

  return {
    ok: true,
    meld: freezeMeld({
      id: meld.id,
      type: MELD_TYPE.RUN,
      originatingSeatId: meld.originatingSeatId,
      suit,
      slots
    })
  };
}

/**
 * Validates a complete public meld and returns a canonical immutable meld.
 * Wild slots require their declared represented position; natural slots are
 * normalised to their printed identity. `wildRank` is the hand's moving rank.
 */
export function validateMeld(meld, { wildRank } = {}) {
  if (!isRecord(meld) || !Array.isArray(meld.slots) || !RANK_INDEX.has(wildRank)) {
    return rejected("INVALID_MELD_INPUT");
  }
  if (meld.type !== MELD_TYPE.SET && meld.type !== MELD_TYPE.RUN) {
    return rejected("INVALID_MELD_TYPE");
  }
  if (typeof meld.id !== "string" || meld.id.length === 0) return rejected("MELD_ID_REQUIRED");

  return meld.type === MELD_TYPE.SET
    ? validateSet(meld, wildRank)
    : validateRun(meld, wildRank);
}

/**
 * Uses the same authoritative validation rules as CREATE_MELD to identify an
 * untyped complete meld. Exactly one legal interpretation must exist.
 */
export function inferMeldType(meld, { wildRank } = {}) {
  if (!isRecord(meld) || !Array.isArray(meld.slots) || !RANK_INDEX.has(wildRank)) {
    return rejected("INVALID_MELD_INPUT");
  }

  const candidates = [MELD_TYPE.SET, MELD_TYPE.RUN]
    .map((type) => ({
      type,
      result: validateMeld({ ...meld, type }, { wildRank })
    }));
  const valid = candidates.filter(({ result }) => result.ok);

  if (valid.length === 1) {
    return {
      ok: true,
      type: valid[0].type,
      meld: valid[0].result.meld
    };
  }
  if (valid.length > 1) return rejected("AMBIGUOUS_MELD_TYPE");

  const needsWildMeaning = candidates.some(({ result }) => (
    result.detail === "WILD_REPRESENTATION_REQUIRED"
    || result.detail === "SET_RANK_REQUIRED"
    || result.detail === "RUN_SUIT_REQUIRED"
  ));
  return rejected(needsWildMeaning ? "MELD_DETAILS_REQUIRED" : "MELD_TYPE_NOT_INFERRED");
}

/**
 * Derives every legal complete interpretation available from a group of
 * selected cards. Natural cards determine a set rank or run suit; the caller
 * never needs to offer ranks or suits that authoritative validation rejects.
 */
export function legalMeldInterpretations(meld, { wildRank } = {}) {
  if (!isRecord(meld) || !Array.isArray(meld.slots) || !RANK_INDEX.has(wildRank)) {
    return Object.freeze([]);
  }

  const slots = meld.slots.map((slot) => ({
    slotId: slot?.slotId,
    cardId: slot?.cardId
  }));
  const parsed = slots.map((slot) => ({ slot, card: parseCardId(slot.cardId) }));
  if (parsed.some(({ card }) => !card)) return Object.freeze([]);

  const wilds = parsed.filter(({ card }) => card.rank === wildRank);
  const naturals = parsed.filter(({ card }) => card.rank !== wildRank);
  const interpretations = [];
  const seen = new Set();
  const accept = (result) => {
    if (!result.ok) return;
    const identity = result.meld.slots
      .filter(({ cardId }) => parseCardId(cardId)?.rank === wildRank)
      .map(({ cardId, represented }) => `${cardId}:${represented.rank}:${represented.suit ?? ""}`)
      .sort()
      .join("|");
    const key = `${result.meld.type}:${identity}`;
    if (seen.has(key)) return;
    seen.add(key);
    interpretations.push(Object.freeze({
      type: result.meld.type,
      meld: result.meld
    }));
  };

  if (naturals.length) {
    const setRank = naturals[0].card.rank;
    if (naturals.every(({ card }) => card.rank === setRank)) {
      accept(validateMeld({
        ...meld,
        type: MELD_TYPE.SET,
        rank: setRank,
        slots: slots.map((slot) => (
          parseCardId(slot.cardId).rank === wildRank
            ? { ...slot, represented: { rank: setRank } }
            : slot
        ))
      }, { wildRank }));
    }

    const runSuit = naturals[0].card.suit;
    if (naturals.every(({ card }) => card.suit === runSuit)) {
      const naturalRanks = new Set(naturals.map(({ card }) => card.rank));
      for (let start = 0; start <= RANKS.length - slots.length; start += 1) {
        const window = RANKS.slice(start, start + slots.length);
        if (!naturals.every(({ card }) => window.includes(card.rank))) continue;
        const missingRanks = window.filter((rank) => !naturalRanks.has(rank));
        if (missingRanks.length !== wilds.length) continue;

        for (const assignedRanks of permutations(missingRanks)) {
          const wildRanksByCard = new Map(
            wilds.map(({ slot }, index) => [slot.cardId, assignedRanks[index]])
          );
          accept(validateMeld({
            ...meld,
            type: MELD_TYPE.RUN,
            suit: runSuit,
            slots: slots.map((slot) => (
              wildRanksByCard.has(slot.cardId)
                ? {
                    ...slot,
                    represented: {
                      rank: wildRanksByCard.get(slot.cardId),
                      suit: runSuit
                    }
                  }
                : slot
            ))
          }, { wildRank }));
        }
      }
    }
  }

  return Object.freeze(interpretations);
}

function normalisePlacement(placement) {
  if (START_PLACEMENTS.has(placement)) return "START";
  if (END_PLACEMENTS.has(placement)) return "END";
  return null;
}

/**
 * Validates an atomic lay-off. A run can only be extended at one declared end;
 * a set can grow only to four cards. Existing slots are retained unchanged.
 */
export function validateLayoff(meld, addedSlots, { wildRank, placement } = {}) {
  const current = validateMeld(meld, { wildRank });
  if (!current.ok) return current;
  if (!Array.isArray(addedSlots) || addedSlots.length === 0) {
    return rejected("LAYOFF_CARDS_REQUIRED");
  }

  const canonical = current.meld;
  let candidateSlots;
  if (canonical.type === MELD_TYPE.SET) {
    if (canonical.slots.length + addedSlots.length > 4) return rejected("SET_TOO_LARGE");
    candidateSlots = [...canonical.slots.map(cloneSlot), ...addedSlots];
  } else {
    const side = normalisePlacement(placement);
    if (!side) return rejected("INVALID_PLACEMENT");
    candidateSlots = side === "START"
      ? [...addedSlots, ...canonical.slots.map(cloneSlot)]
      : [...canonical.slots.map(cloneSlot), ...addedSlots];
  }

  const result = validateMeld({ ...canonical, slots: candidateSlots }, { wildRank });
  if (!result.ok) return result;

  if (canonical.type === MELD_TYPE.RUN) {
    const previousRanks = canonical.slots.map((slot) => RANK_INDEX.get(slot.represented.rank));
    const addedRanks = result.meld.slots
      .filter((slot) => !canonical.slots.some((currentSlot) => currentSlot.slotId === slot.slotId))
      .map((slot) => RANK_INDEX.get(slot.represented.rank));
    const side = normalisePlacement(placement);
    const min = Math.min(...previousRanks);
    const max = Math.max(...previousRanks);
    const legalEnd = side === "START"
      ? addedRanks.every((rank) => rank < min)
      : addedRanks.every((rank) => rank > max);
    if (!legalEnd) return rejected("RUN_EXTENSION_MUST_USE_END");
  }
  return result;
}

/**
 * Replaces one existing wild with a natural card. The returned slot keeps its
 * stable ID and represented identity, while `reclaimedWildCardId` identifies
 * the card which must move back to the actor's hand transactionally.
 */
export function validateWildReplacement(
  meld,
  { wildCardId, naturalCardId } = {},
  { wildRank } = {}
) {
  const current = validateMeld(meld, { wildRank });
  if (!current.ok) return { ...current, reason: REJECTION.WILD_NOT_REPLACEABLE };

  const canonical = current.meld;
  const target = canonical.slots.find((slot) => slot.cardId === wildCardId);
  const replacement = parseCardId(naturalCardId);
  const targetCard = parseCardId(wildCardId);
  if (!target || !targetCard || targetCard.rank !== wildRank || !replacement) {
    return rejected("WILD_NOT_FOUND", REJECTION.WILD_NOT_REPLACEABLE);
  }
  if (replacement.rank === wildRank) {
    return rejected("REPLACEMENT_MUST_BE_NATURAL", REJECTION.WILD_NOT_REPLACEABLE);
  }
  if (canonical.slots.some((slot) => slot.cardId === naturalCardId)) {
    return rejected("REPLACEMENT_CARD_ALREADY_IN_MELD", REJECTION.WILD_NOT_REPLACEABLE);
  }

  if (canonical.type === MELD_TYPE.RUN) {
    if (
      replacement.suit !== canonical.suit
      || replacement.rank !== target.represented.rank
    ) {
      return rejected("RUN_REPLACEMENT_MISMATCH", REJECTION.WILD_NOT_REPLACEABLE);
    }
  } else {
    if (replacement.rank !== canonical.rank) {
      return rejected("SET_REPLACEMENT_RANK_MISMATCH", REJECTION.WILD_NOT_REPLACEABLE);
    }
    const usedNaturalSuits = new Set(
      canonical.slots
        .filter((slot) => slot.slotId !== target.slotId)
        .map((slot) => parseCardId(slot.cardId))
        .filter((card) => card.rank !== wildRank)
        .map((card) => card.suit)
    );
    if (usedNaturalSuits.has(replacement.suit)) {
      return rejected("SET_REPLACEMENT_SUIT_USED", REJECTION.WILD_NOT_REPLACEABLE);
    }
  }

  const slots = canonical.slots.map((slot) => (
    slot.slotId === target.slotId
      ? { slotId: slot.slotId, cardId: naturalCardId, represented: cloneRepresentation(slot.represented) }
      : cloneSlot(slot)
  ));
  const result = validateMeld({ ...canonical, slots }, { wildRank });
  if (!result.ok) return { ...result, reason: REJECTION.WILD_NOT_REPLACEABLE };
  return { ...result, reclaimedWildCardId: wildCardId };
}

export const validateMeldExtension = validateLayoff;

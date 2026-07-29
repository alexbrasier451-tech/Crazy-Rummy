import { EVENT_TYPE, REJECTION, RULES_VERSION, SCHEMA_VERSION } from "./constants.js";

const PUBLIC_RULE_KEYS = Object.freeze([
  "rulesVersion",
  "minimumPlayers",
  "maximumPlayers",
  "cardsPerPlayer",
  "handCount",
  "clockwise",
  "aceLowRuns",
  "aceHighRuns",
  "wildsAllowedInOpeningMeld",
  "reclaimedWildMayBeHeld",
  "stockExhaustionEndsAfterTurn",
  "jointLowestScoreWins"
]);

const PUBLIC_EVENT_KEYS = Object.freeze([
  "schemaVersion",
  "rulesVersion",
  "gameId",
  "handId",
  "sequence",
  "type",
  "commandId",
  "actorSeatId"
]);

const PUBLIC_FACT_SCALAR_KEYS = Object.freeze([
  "seatId",
  "actorSeatId",
  "handId",
  "handIndex",
  "sequence",
  "revision",
  "lifecycle",
  "phase",
  "activeSeatId",
  "dealerSeatId",
  "wildRank",
  "ready",
  "opened",
  "reason",
  "winnerSeatId",
  "source",
  "stockCount",
  "turnNumber",
  "drewFinalStock",
  "cumulativeScore",
  "handTotal",
  "total",
  "activeSeatCount"
]);

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function assignDefined(target, key, value) {
  if (value !== undefined) target[key] = value;
  return target;
}

function freeze(value) {
  if (Array.isArray(value)) {
    value.forEach(freeze);
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }
  return value;
}

function copyRules(rules) {
  if (!isRecord(rules)) return undefined;
  const projection = {};
  for (const key of PUBLIC_RULE_KEYS) assignDefined(projection, key, rules[key]);
  if (Array.isArray(rules.handSchedule)) {
    projection.handSchedule = rules.handSchedule.map((hand) => ({
      index: hand?.index,
      wildRank: hand?.wildRank,
      label: hand?.label
    }));
  }
  return projection;
}

function copySeat(seat, fallbackSeatId, status) {
  if (!isRecord(seat)) return undefined;
  return {
    seatId: seat.seatId ?? fallbackSeatId,
    displayName: seat.displayName,
    ready: seat.ready,
    cumulativeScore: seat.cumulativeScore,
    status
  };
}

function copySeats(snapshot) {
  const seats = snapshot.seats;
  if (!isRecord(seats)) return {};
  return Object.fromEntries(Object.entries(seats).map(([seatId, seat]) => [
    seatId,
    copySeat(
      seat,
      seatId,
      Object.hasOwn(snapshot.droppedSeatsById ?? {}, seatId)
        ? "DROPPED"
        : (snapshot.lifecycle === "LOBBY" ? "SEATED" : "ACTIVE")
    )
  ]));
}

function copyDroppedSeats(droppedSeatsById) {
  if (!isRecord(droppedSeatsById)) return {};
  return Object.fromEntries(Object.entries(droppedSeatsById).map(([seatId, metadata]) => [
    seatId,
    {
      seatId,
      droppedByActorSeatId: metadata?.droppedByActorSeatId,
      droppedAtRevision: metadata?.droppedAtRevision,
      ...(metadata?.reason !== undefined ? { reason: metadata.reason } : {}),
      ...(metadata?.droppedAt !== undefined ? { droppedAt: metadata.droppedAt } : {})
    }
  ]));
}

function copyRepresentation(represented) {
  if (!isRecord(represented)) return undefined;
  const copy = { rank: represented.rank };
  assignDefined(copy, "suit", represented.suit);
  return copy;
}

function copyMeld(meld) {
  if (!isRecord(meld)) return undefined;
  const copy = {
    id: meld.id,
    type: meld.type,
    originatingSeatId: meld.originatingSeatId,
    slots: Array.isArray(meld.slots) ? meld.slots.map((slot) => ({
      slotId: slot?.slotId,
      cardId: slot?.cardId,
      represented: copyRepresentation(slot?.represented)
    })) : []
  };
  assignDefined(copy, "rank", meld.rank);
  assignDefined(copy, "suit", meld.suit);
  return copy;
}

function copyScoreEntries(scoreEntriesBySeat) {
  if (!isRecord(scoreEntriesBySeat)) return {};
  return Object.fromEntries(Object.entries(scoreEntriesBySeat).map(([seatId, entry]) => [
    seatId,
    { total: entry?.total }
  ]));
}

function copyOwnScoreEntry(scoreEntriesBySeat, seatId) {
  if (typeof seatId !== "string" || !isRecord(scoreEntriesBySeat)) return undefined;
  const entry = scoreEntriesBySeat[seatId];
  if (!isRecord(entry)) return undefined;
  return {
    total: entry.total,
    cards: Array.isArray(entry.cards)
      ? entry.cards.map((card) => ({ cardId: card?.cardId, value: card?.value }))
      : []
  };
}

function copyResult(result, ownSeatId = null) {
  if (!isRecord(result)) return result ?? null;
  const copy = {
    reason: result.reason,
    winnerSeatId: result.winnerSeatId ?? null,
    scoreEntriesBySeat: copyScoreEntries(result.scoreEntriesBySeat),
    acknowledgedBySeatIds: Array.isArray(result.acknowledgedBySeatIds)
      ? [...result.acknowledgedBySeatIds]
      : []
  };
  const ownScoreEntry = copyOwnScoreEntry(result.scoreEntriesBySeat, ownSeatId);
  if (ownScoreEntry) copy.ownScoreEntry = ownScoreEntry;
  return copy;
}

function copyCompletedHands(completedHands, ownSeatId = null) {
  if (!Array.isArray(completedHands)) return [];
  return completedHands.map((hand) => ({
    handId: hand?.handId,
    index: hand?.index,
    wildRank: hand?.wildRank,
    dealerSeatId: hand?.dealerSeatId,
    participantSeatIds: Array.isArray(hand?.participantSeatIds) ? [...hand.participantSeatIds] : [],
    result: copyResult(hand?.result, ownSeatId)
  }));
}

function copyHandCounts(hand) {
  if (isRecord(hand.handsBySeat)) {
    return Object.fromEntries(Object.entries(hand.handsBySeat).map(([seatId, cards]) => [
      seatId,
      Array.isArray(cards) ? cards.length : 0
    ]));
  }
  if (isRecord(hand.handCountsBySeat)) {
    return Object.fromEntries(Object.entries(hand.handCountsBySeat).map(([seatId, count]) => [
      seatId,
      Number.isInteger(count) && count >= 0 ? count : 0
    ]));
  }
  return {};
}

function copyPublicHand(hand, ownSeatId = null) {
  if (!isRecord(hand)) return null;
  return {
    id: hand.id,
    index: hand.index,
    wildRank: hand.wildRank,
    dealerSeatId: hand.dealerSeatId,
    participantSeatIds: Array.isArray(hand.participantSeatIds) ? [...hand.participantSeatIds] : [],
    activeSeatId: hand.activeSeatId,
    phase: hand.phase,
    turnNumber: hand.turnNumber,
    stockCount: Array.isArray(hand.stockCardIds) ? hand.stockCardIds.length : hand.stockCount,
    discardCardIds: Array.isArray(hand.discardCardIds) ? [...hand.discardCardIds] : [],
    handCountsBySeat: copyHandCounts(hand),
    openedBySeat: Object.fromEntries(Object.entries(hand.openedBySeat ?? {}).map(([seatId, opened]) => [
      seatId,
      Boolean(opened)
    ])),
    melds: Array.isArray(hand.melds) ? hand.melds.map(copyMeld) : [],
    deadHandCount: Array.isArray(hand.deadHandCardIds) ? hand.deadHandCardIds.length : (hand.deadHandCount ?? 0),
    drawSource: hand.drawSource ?? null,
    drewFinalStock: Boolean(hand.drewFinalStock),
    result: copyResult(hand.result, ownSeatId)
  };
}

function copyPublicSnapshot(snapshot, ownSeatId = null) {
  const copy = {
    schemaVersion: snapshot.schemaVersion,
    rulesVersion: snapshot.rulesVersion,
    gameId: snapshot.gameId,
    lifecycle: snapshot.lifecycle,
    revision: snapshot.revision,
    rules: copyRules(snapshot.rules),
    hostSeatId: snapshot.hostSeatId ?? null,
    seatOrder: Array.isArray(snapshot.seatOrder) ? [...snapshot.seatOrder] : [],
    activeSeatOrder: Array.isArray(snapshot.activeSeatOrder)
      ? [...snapshot.activeSeatOrder]
      : (Array.isArray(snapshot.seatOrder) ? [...snapshot.seatOrder] : []),
    droppedSeatsById: copyDroppedSeats(snapshot.droppedSeatsById),
    seats: copySeats(snapshot),
    currentHandIndex: snapshot.currentHandIndex ?? null,
    initialDealerSeatId: snapshot.initialDealerSeatId ?? null,
    dealerSeatId: snapshot.dealerSeatId ?? null,
    hand: copyPublicHand(snapshot.hand, ownSeatId),
    completedHands: copyCompletedHands(snapshot.completedHands, ownSeatId),
    winners: Array.isArray(snapshot.winners) ? [...snapshot.winners] : [],
    completion: isRecord(snapshot.completion) ? {
      reason: snapshot.completion.reason,
      winnerSeatId: snapshot.completion.winnerSeatId ?? null,
      droppedSeatIds: Array.isArray(snapshot.completion.droppedSeatIds)
        ? [...snapshot.completion.droppedSeatIds]
        : []
    } : null
  };
  if (isRecord(snapshot.hand) && Array.isArray(snapshot.hand.ownHandCardIds)) {
    copy.hand.ownHandCardIds = [...snapshot.hand.ownHandCardIds];
  }
  if (isRecord(snapshot.hand?.result?.ownScoreEntry)) {
    copy.hand.result.ownScoreEntry = {
      total: snapshot.hand.result.ownScoreEntry.total,
      cards: Array.isArray(snapshot.hand.result.ownScoreEntry.cards)
        ? snapshot.hand.result.ownScoreEntry.cards.map((card) => ({ cardId: card?.cardId, value: card?.value }))
        : []
    };
  }
  copy.completedHands.forEach((hand, index) => {
    const source = snapshot.completedHands?.[index]?.result?.ownScoreEntry;
    if (!isRecord(source)) return;
    hand.result.ownScoreEntry = {
      total: source.total,
      cards: Array.isArray(source.cards)
        ? source.cards.map((card) => ({ cardId: card?.cardId, value: card?.value }))
        : []
    };
  });
  return copy;
}

/**
 * Produces a public-only game projection. It intentionally constructs a new
 * object from a fixed allowlist instead of removing secrets from state.
 */
export function publicView(state) {
  if (!isRecord(state)) throw new TypeError("State must be a record.");
  return freeze(copyPublicSnapshot(state));
}

/** Add exactly one authenticated seat's ordered cards to a public projection. */
export function playerView(state, seatId) {
  const view = copyPublicSnapshot(state, seatId);
  if (view.hand && typeof seatId === "string" && Array.isArray(state.hand?.handsBySeat?.[seatId])) {
    view.hand.ownHandCardIds = [...state.hand.handsBySeat[seatId]];
  }
  return freeze(view);
}

export const snapshotFor = playerView;

function copyEventPayload(event, seatId) {
  const payload = isRecord(event.payload) ? event.payload : {};
  switch (event.type) {
    case EVENT_TYPE.SEAT_JOINED:
      return { seat: copySeat(payload.seat, payload.seat?.seatId, "SEATED") };
    case EVENT_TYPE.SEAT_READY_CHANGED:
      return { ready: Boolean(payload.ready) };
    case EVENT_TYPE.GAME_STARTED:
      return { initialDealerSeatId: payload.initialDealerSeatId };
    case EVENT_TYPE.SEAT_DROPPED:
      return {
        seatId: payload.seatId,
        ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
        ...(payload.droppedAt !== undefined ? { droppedAt: payload.droppedAt } : {})
      };
    case EVENT_TYPE.DEALER_INITIAL_DISCARDED:
    case EVENT_TYPE.CARD_DISCARDED:
      return { cardId: payload.cardId };
    case EVENT_TYPE.CARD_DRAWN: {
      const source = payload.source ?? payload.drawSource;
      const projected = { source };
      if (source === "discard" || event.actorSeatId === seatId) {
        assignDefined(projected, "cardId", payload.cardId);
      }
      return projected;
    }
    case EVENT_TYPE.MELD_CREATED:
      return { meld: copyMeld(payload.meld) };
    case EVENT_TYPE.CARDS_LAID_OFF:
      return {
        meldId: payload.meldId,
        slots: Array.isArray(payload.slots) ? payload.slots.map((slot) => ({
          slotId: slot?.slotId,
          cardId: slot?.cardId,
          represented: copyRepresentation(slot?.represented)
        })) : [],
        placement: payload.placement
      };
    case EVENT_TYPE.WILD_REPLACED:
      return {
        meldId: payload.meldId,
        wildCardId: payload.wildCardId,
        naturalCardId: payload.naturalCardId
      };
    default:
      return {};
  }
}

function copyPublicFact(fact) {
  if (!isRecord(fact) || typeof fact.type !== "string" || fact.type.length === 0) return null;
  const projection = { type: fact.type };
  for (const key of PUBLIC_FACT_SCALAR_KEYS) {
    const value = fact[key];
    if (
      value === null
      || typeof value === "string"
      || typeof value === "boolean"
      || (typeof value === "number" && Number.isFinite(value))
    ) {
      projection[key] = value;
    }
  }
  return projection;
}

/**
 * Projects an accepted event for a seat. Fact values use a strict scalar
 * allowlist, excluding card IDs, decks, seeds, and command fingerprints.
 */
export function projectEvent(event, seatId = null) {
  if (!isRecord(event)) throw new TypeError("Event must be a record.");
  const projection = {};
  for (const key of PUBLIC_EVENT_KEYS) assignDefined(projection, key, event[key]);
  projection.payload = copyEventPayload(event, seatId);
  projection.facts = Array.isArray(event.facts)
    ? event.facts.map(copyPublicFact).filter(Boolean)
    : [];
  return freeze(projection);
}

/**
 * Current Phase 2 has no older schema to transform. This boundary therefore
 * validates the version pair and re-allowlists the received snapshot so a
 * caller cannot smuggle authoritative/private fields through persistence.
 */
export function migrateSnapshot(snapshot) {
  if (!isRecord(snapshot)) {
    return Object.freeze({ ok: false, reason: REJECTION.INVALID_STATE, detail: "SNAPSHOT_REQUIRED" });
  }
  if (snapshot.schemaVersion !== SCHEMA_VERSION) {
    return Object.freeze({ ok: false, reason: REJECTION.UNSUPPORTED_SCHEMA, detail: "SCHEMA_VERSION" });
  }
  if (snapshot.rulesVersion !== RULES_VERSION || snapshot.rules?.rulesVersion !== RULES_VERSION) {
    return Object.freeze({ ok: false, reason: REJECTION.UNSUPPORTED_SCHEMA, detail: "RULES_VERSION" });
  }
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0) {
    return Object.freeze({ ok: false, reason: REJECTION.INVALID_STATE, detail: "INVALID_REVISION" });
  }
  return freeze({ ok: true, snapshot: copyPublicSnapshot(snapshot) });
}

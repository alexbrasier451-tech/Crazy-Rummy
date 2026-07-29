import {
  EVENT_TYPE,
  LIFECYCLE,
  MELD_TYPE,
  PHASE,
  SCHEMA_VERSION,
  SYSTEM_ACTOR_SEAT_ID
} from "./constants.js";
import { cardForId, isCardId, isWildCard, normalizeRank, normalizeSuit } from "./cards.js";
import { initialDealerSeatIdFor } from "./deck.js";
import { validateMeld as validateDomainMeld } from "./melds.js";
import { handForIndex, isHandIndex } from "./rules.js";
import { scoreHand } from "./scoring.js";
import { nextActiveSeatId } from "./lifecycle.js";

export class StateInvariantError extends Error {
  constructor(violations) {
    super(`State invariant violation: ${violations.join("; ")}`);
    this.name = "StateInvariantError";
    this.violations = Object.freeze([...violations]);
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function add(violations, condition, message) {
  if (!condition) violations.push(message);
}

function cardZone(violations, seen, cardId, zone) {
  if (!isCardId(cardId)) {
    violations.push(`${zone} contains an unknown card ID.`);
    return;
  }
  if (seen.has(cardId)) violations.push(`Card ${cardId} appears in more than one zone.`);
  seen.add(cardId);
}

function validateMeldZone(violations, meld, wildRank, seatIds) {
  if (!isRecord(meld)) {
    violations.push("Hand meld must be a record.");
    return [];
  }
  add(violations, typeof meld.id === "string" && meld.id.length > 0, "Meld requires an ID.");
  add(violations, Object.values(MELD_TYPE).includes(meld.type), "Meld has an invalid type.");
  add(violations, seatIds.includes(meld.originatingSeatId), "Meld must retain an occupied originating seat.");
  add(violations, Array.isArray(meld.slots), "Meld slots must be an array.");
  if (!Array.isArray(meld.slots)) return [];

  const slotIds = new Set();
  const cardIds = meld.slots.map((slot) => {
    if (!isRecord(slot)) {
      violations.push("Meld slot must be a record.");
      return null;
    }
    add(violations, typeof slot.slotId === "string" && slot.slotId.length > 0, "Meld slot requires an ID.");
    if (slotIds.has(slot.slotId)) violations.push(`Meld ${meld.id} repeats a slot ID.`);
    slotIds.add(slot.slotId);
    add(violations, isRecord(slot.represented), "Meld slot requires represented identity.");
    try {
      normalizeRank(slot.represented?.rank);
      if (meld.type === MELD_TYPE.RUN) normalizeSuit(slot.represented?.suit);
      if (isWildCard(slot.cardId, wildRank) && !slot.represented) {
        violations.push("Wild meld slot lacks represented identity.");
      }
    } catch {
      violations.push(`Meld ${meld.id} has an invalid represented identity.`);
    }
    return slot.cardId;
  }).filter(Boolean);
  const semantic = validateDomainMeld(meld, { wildRank });
  if (!semantic.ok) violations.push(`Meld ${meld.id ?? "unknown"} violates the rules contract: ${semantic.reason}.`);
  return cardIds;
}

function scoreEntriesValid(
  violations,
  scoreEntriesBySeat,
  handsBySeat,
  wildRank,
  seatIds,
  activeSeatIds,
  winnerSeatId
) {
  add(violations, isRecord(scoreEntriesBySeat), "Hand result must contain score entries by seat.");
  if (!isRecord(scoreEntriesBySeat)) return;
  const scoredSeatIds = Object.keys(scoreEntriesBySeat);
  add(violations, scoredSeatIds.every((seatId) => seatIds.includes(seatId)), "Hand result scores an unknown seat.");
  add(violations, activeSeatIds.every((seatId) => scoredSeatIds.includes(seatId)), "Hand result must score every active seat.");

  for (const seatId of scoredSeatIds) {
    const entry = scoreEntriesBySeat[seatId];
    add(violations, isRecord(entry), `Hand result lacks a score entry for seat ${seatId}.`);
    if (!isRecord(entry)) continue;
    const cards = activeSeatIds.includes(seatId) ? handsBySeat?.[seatId] : entry.cardIds;
    add(violations, Array.isArray(cards), `Cannot verify score entry for seat ${seatId}.`);
    if (!Array.isArray(cards)) continue;
    let expected;
    try {
      expected = scoreHand(cards, wildRank);
    } catch {
      violations.push(`Score entry for seat ${seatId} contains invalid cards.`);
      continue;
    }
    const expectedTotal = seatId === winnerSeatId ? 0 : expected.total;
    add(violations, Array.isArray(entry.cardIds) && entry.cardIds.length === expected.cardIds.length
      && entry.cardIds.every((cardId, index) => cardId === expected.cardIds[index]), `Score entry cards do not match hand ${seatId}.`);
    add(violations, Array.isArray(entry.cards) && entry.cards.length === expected.cards.length
      && entry.cards.every((card, index) => card?.cardId === expected.cards[index].cardId
        && card?.value === expected.cards[index].value), `Score entry values do not match hand ${seatId}.`);
    add(violations, entry.total === expectedTotal, `Score entry total does not match hand ${seatId}.`);
    if (seatId === winnerSeatId) {
      add(violations, cards.length === 0, "A hand winner must have no cards after the final discard.");
    }
  }
}

function validateHandResult(violations, hand, seatIds, activeSeatIds) {
  const result = hand.result;
  add(violations, isRecord(result), "A completed hand requires a result.");
  if (!isRecord(result)) return;
  add(violations, ["WENT_OUT", "STOCK_EXHAUSTED"].includes(result.reason), "Hand result has an invalid end reason.");
  const winnerSeatId = result.winnerSeatId ?? null;
  if (result.reason === "WENT_OUT") add(violations, activeSeatIds.includes(winnerSeatId), "A winning hand requires an active winner.");
  if (result.reason === "STOCK_EXHAUSTED") add(violations, winnerSeatId === null, "Stock exhaustion cannot name a hand winner.");
  scoreEntriesValid(
    violations,
    result.scoreEntriesBySeat,
    hand.handsBySeat,
    hand.wildRank,
    seatIds,
    activeSeatIds,
    winnerSeatId
  );
  add(violations, Array.isArray(result.acknowledgedBySeatIds)
    && new Set(result.acknowledgedBySeatIds).size === result.acknowledgedBySeatIds.length
    && result.acknowledgedBySeatIds.every((seatId) => seatIds.includes(seatId)), "Hand-result acknowledgements must be unique occupied seats.");
}

function validateStoredScoreEntries(violations, result, wildRank, seatIds) {
  const winnerSeatId = result.winnerSeatId ?? null;
  add(violations, ["WENT_OUT", "STOCK_EXHAUSTED"].includes(result.reason), "Completed hand has an invalid end reason.");
  if (result.reason === "WENT_OUT") add(violations, seatIds.includes(winnerSeatId), "Completed winning hand requires an occupied winner.");
  if (result.reason === "STOCK_EXHAUSTED") add(violations, winnerSeatId === null, "Completed stock-exhausted hand cannot name a winner.");
  add(violations, isRecord(result.scoreEntriesBySeat), "Completed hand result lacks score entries.");
  if (!isRecord(result.scoreEntriesBySeat)) return;
  const scoredSeatIds = Object.keys(result.scoreEntriesBySeat);
  add(violations, scoredSeatIds.length > 0 && scoredSeatIds.every((seatId) => seatIds.includes(seatId)), "Completed hand scores an unknown seat.");
  for (const seatId of scoredSeatIds) {
    const entry = result.scoreEntriesBySeat[seatId];
    add(violations, isRecord(entry), `Completed hand lacks a score for ${seatId}.`);
    if (!isRecord(entry) || !Array.isArray(entry.cardIds)) continue;
    let expected;
    try {
      expected = scoreHand(entry.cardIds, wildRank);
    } catch {
      violations.push(`Completed hand has invalid score cards for ${seatId}.`);
      continue;
    }
    const expectedTotal = seatId === winnerSeatId ? 0 : expected.total;
    add(violations, Array.isArray(entry.cards) && entry.cards.length === expected.cards.length
      && entry.cards.every((card, index) => card?.cardId === expected.cards[index].cardId
        && card?.value === expected.cards[index].value), `Completed score values do not match cards for ${seatId}.`);
    add(violations, entry.total === expectedTotal, `Completed score total does not match cards for ${seatId}.`);
    if (seatId === winnerSeatId) {
      add(violations, entry.cardIds.length === 0, "Completed winning score must have no remaining cards.");
    }
  }
}

function validateCompletedHands(violations, state, seatIds) {
  const completedHands = state.completedHands;
  if (!Array.isArray(completedHands)) return;
  const indexes = new Set();
  const totalBySeat = Object.fromEntries(seatIds.map((seatId) => [seatId, 0]));
  let previousDealerSeatId = null;
  for (const [position, completed] of completedHands.entries()) {
    add(violations, isRecord(completed), "Completed hand must be a record.");
    if (!isRecord(completed)) continue;
    add(violations, isHandIndex(completed.index), "Completed hand has an invalid index.");
    add(violations, completed.index === position + 1, "Completed hands must contain every hand once in schedule order.");
    if (indexes.has(completed.index)) violations.push("A hand may be scored only once.");
    indexes.add(completed.index);
    if (isHandIndex(completed.index)) {
      add(violations, completed.wildRank === handForIndex(completed.index).wildRank, "Completed hand has the wrong wild rank.");
    }
    add(violations, typeof completed.handId === "string" && completed.handId.length > 0, "Completed hand requires an ID.");
    add(violations, seatIds.includes(completed.dealerSeatId), "Completed hand dealer must be occupied.");
    const participants = completed.participantSeatIds;
    add(violations, Array.isArray(participants)
      && participants.length >= 1
      && new Set(participants).size === participants.length
      && participants.every((seatId) => seatIds.includes(seatId)), "Completed hand participants are invalid.");
    if (Array.isArray(participants) && participants.length > 0) {
      try {
        const expectedDealer = position === 0
          ? state.initialDealerSeatId
          : nextActiveSeatId(state.seatOrder, participants, previousDealerSeatId);
        add(violations, completed.dealerSeatId === expectedDealer, "Completed hand dealer must follow clockwise active-seat rotation.");
      } catch {
        violations.push("Completed hand dealer rotation could not be validated.");
      }
    }
    previousDealerSeatId = completed.dealerSeatId;
    const result = completed.result;
    add(violations, isRecord(result), "Completed hand requires an immutable result.");
    if (!isRecord(result)) continue;
    validateStoredScoreEntries(violations, result, completed.wildRank, seatIds);
    if (!isRecord(result.scoreEntriesBySeat)) continue;
    for (const seatId of Object.keys(result.scoreEntriesBySeat)) {
      const entry = result.scoreEntriesBySeat[seatId];
      add(violations, isRecord(entry) && Number.isFinite(entry.total) && entry.total >= 0, `Completed hand has an invalid score for ${seatId}.`);
      if (isRecord(entry) && Number.isFinite(entry.total) && entry.total >= 0) totalBySeat[seatId] += entry.total;
    }
  }
  if (state.hand && state.hand.phase !== PHASE.HAND_COMPLETE) {
    const participants = state.hand.participantSeatIds;
    if (Array.isArray(participants) && participants.length > 0) {
      try {
        const expectedDealer = completedHands.length === 0
          ? state.initialDealerSeatId
          : nextActiveSeatId(state.seatOrder, participants, previousDealerSeatId);
        add(violations, state.hand.dealerSeatId === expectedDealer, "Current hand dealer must follow clockwise active-seat rotation.");
      } catch {
        violations.push("Current hand dealer rotation could not be validated.");
      }
    }
  }
  for (const seatId of seatIds) {
    add(violations, state.seats[seatId]?.cumulativeScore === totalBySeat[seatId], `Cumulative score does not equal completed-hand totals for ${seatId}.`);
  }

  if (state.hand?.phase === PHASE.HAND_COMPLETE && state.hand.result) {
    const completed = completedHands.find((entry) => entry?.handId === state.hand.id);
    add(violations, isRecord(completed) && completed.index === state.hand.index, "Completed hand result must be recorded exactly once.");
    if (isRecord(completed)) {
      add(violations, JSON.stringify(completed.result) === JSON.stringify(state.hand.result), "Active completed-hand result must match its immutable record.");
    }
  }
  if (isHandIndex(state.hand?.index)) {
    const expectedCount = state.hand.phase === PHASE.HAND_COMPLETE
      ? state.hand.index
      : state.hand.index - 1;
    add(violations, completedHands.length === expectedCount, "Completed-hand history must be contiguous with the current hand.");
  }
}

function validateCommandLedger(violations, state) {
  if (!isRecord(state.commandLedger)) return;
  const entries = Object.entries(state.commandLedger);
  add(violations, entries.length === state.revision, "Command ledger must contain one entry for every accepted revision.");
  const sequences = new Set();
  for (const [commandId, entry] of entries) {
    add(violations, isRecord(entry), "Command ledger entry must be a record.");
    if (!isRecord(entry)) continue;
    add(violations, typeof entry.commandFingerprint === "string" && entry.commandFingerprint.length > 0, "Command ledger entry requires a fingerprint.");
    const event = entry.event;
    add(violations, isRecord(event), "Command ledger entry requires its accepted event.");
    if (!isRecord(event)) continue;
    add(violations, event.schemaVersion === state.schemaVersion && event.rulesVersion === state.rulesVersion, "Ledger event schema/rules version mismatch.");
    add(violations, event.gameId === state.gameId, "Ledger event belongs to another game.");
    add(violations, event.commandId === commandId && event.commandFingerprint === entry.commandFingerprint, "Ledger event does not match its command entry.");
    add(violations, Object.values(EVENT_TYPE).includes(event.type), "Ledger event has an invalid type.");
    add(violations, Number.isInteger(event.sequence) && event.sequence >= 1 && event.sequence <= state.revision, "Ledger event has an invalid sequence.");
    if (Number.isInteger(event.sequence)) sequences.add(event.sequence);
    add(violations, typeof event.actorSeatId === "string" && event.actorSeatId.length > 0, "Ledger event requires an actor.");
    add(violations, isRecord(event.payload) && Array.isArray(event.facts), "Ledger event has malformed payload or facts.");
  }
  add(violations, sequences.size === entries.length, "Ledger event sequences must be unique.");
}

function validateSeatRecords(violations, state) {
  add(violations, isRecord(state.seats), "Seats must be keyed by seat ID.");
  if (!isRecord(state.seats)) return [];
  const seatIds = Object.keys(state.seats);
  for (const seatId of seatIds) {
    const seat = state.seats[seatId];
    add(violations, isRecord(seat), `Seat ${seatId} must be a record.`);
    add(violations, seatId !== SYSTEM_ACTOR_SEAT_ID, "The engine system authority identifier cannot be occupied.");
    add(violations, seat?.seatId === seatId, `Seat ${seatId} must retain its stable ID.`);
    add(violations, typeof seat?.playerId === "string" && seat.playerId.length > 0, `Seat ${seatId} needs player identity.`);
    add(violations, typeof seat?.displayName === "string" && seat.displayName.length > 0, `Seat ${seatId} needs display name.`);
    add(violations, typeof seat?.ready === "boolean", `Seat ${seatId} readiness must be boolean.`);
    add(violations, Number.isFinite(seat?.cumulativeScore) && seat.cumulativeScore >= 0, `Seat ${seatId} has invalid score.`);
  }
  return seatIds;
}

function validateHand(violations, state, seatIds, activeSeatIds) {
  const hand = state.hand;
  add(violations, isRecord(hand), "An in-progress game requires a hand.");
  if (!isRecord(hand)) return;
  add(violations, typeof hand.id === "string" && hand.id.length > 0, "Hand requires an ID.");
  add(violations, hand.index === state.currentHandIndex, "Hand index must match current hand index.");
  add(violations, hand.wildRank === handForIndex(state.currentHandIndex).wildRank, "Hand wild rank must follow the fixed schedule.");
  add(violations, hand.dealerSeatId === state.dealerSeatId, "Hand dealer must match game dealer.");
  const isForfeit = state.lifecycle === LIFECYCLE.COMPLETE && state.completion?.reason === "FORFEIT";
  add(violations, isForfeit ? hand.activeSeatId === null : activeSeatIds.includes(hand.activeSeatId), "Active seat must be active.");
  add(violations, Object.values(PHASE).includes(hand.phase), "Hand has an invalid phase.");
  add(violations, Number.isInteger(hand.turnNumber) && hand.turnNumber >= 0, "Turn number must be a non-negative integer.");
  add(violations, Array.isArray(hand.stockCardIds), "Stock must be an ordered card ID array.");
  add(violations, Array.isArray(hand.discardCardIds), "Discard must be an ordered card ID array.");
  add(violations, isRecord(hand.handsBySeat), "Hands must be keyed by seat ID.");
  add(violations, isRecord(hand.openedBySeat), "Opened flags must be keyed by seat ID.");
  add(violations, Array.isArray(hand.melds), "Melds must be an array.");
  add(violations, hand.deadHandCardIds === undefined || Array.isArray(hand.deadHandCardIds), "Dead hands must be held in one private card zone.");
  add(violations, hand.participantSeatIds === undefined || (Array.isArray(hand.participantSeatIds)
    && new Set(hand.participantSeatIds).size === hand.participantSeatIds.length
    && hand.participantSeatIds.every((seatId) => seatIds.includes(seatId))), "Hand participants must be unique original seats.");
  add(violations, hand.drawnCardId === null || isCardId(hand.drawnCardId), "Drawn card must be null or a valid card ID.");
  add(violations, hand.drawSource === null || ["stock", "discard"].includes(hand.drawSource), "Draw source is invalid.");
  add(violations, typeof hand.drewFinalStock === "boolean", "Final-stock marker must be boolean.");

  if (!isForfeit && hand.phase === PHASE.DEALER_INITIAL_DISCARD) {
    add(violations, hand.activeSeatId === state.dealerSeatId, "Dealer must act in the initial discard phase.");
    add(violations, hand.discardCardIds?.length === 0, "Initial dealer phase cannot have a discard pile.");
    add(violations, hand.drawnCardId === null && hand.drawSource === null, "Dealer initial phase cannot contain a draw.");
    add(violations, hand.drewFinalStock === false, "Dealer initial phase cannot mark final stock.");
  }

  if (hand.phase === PHASE.AWAITING_DRAW) {
    add(violations, hand.drawnCardId === null && hand.drawSource === null && hand.drewFinalStock === false, "Awaiting draw cannot retain draw metadata.");
  }
  if ([PHASE.TABLE_PLAY, PHASE.AWAITING_DISCARD].includes(hand.phase)) {
    add(violations, isCardId(hand.drawnCardId) && ["stock", "discard"].includes(hand.drawSource), "A table/discard phase requires one authoritative draw.");
  }
  if (hand.drewFinalStock) {
    add(violations, hand.drawSource === "stock" && hand.stockCardIds?.length === 0, "Final-stock marker must follow a stock draw that emptied the stock.");
  }

  const seen = new Set();
  for (const cardId of hand.stockCardIds ?? []) cardZone(violations, seen, cardId, "Stock");
  for (const cardId of hand.discardCardIds ?? []) cardZone(violations, seen, cardId, "Discard");
  for (const seatId of seatIds) {
    const cards = hand.handsBySeat?.[seatId];
    add(violations, Array.isArray(cards), `Hand cards missing for seat ${seatId}.`);
    add(violations, typeof hand.openedBySeat?.[seatId] === "boolean", `Opened flag missing for seat ${seatId}.`);
    for (const cardId of cards ?? []) cardZone(violations, seen, cardId, `Hand ${seatId}`);
  }
  for (const cardId of hand.deadHandCardIds ?? []) cardZone(violations, seen, cardId, "Dead hands");
  for (const meld of hand.melds ?? []) {
    for (const cardId of validateMeldZone(violations, meld, hand.wildRank, seatIds)) {
      cardZone(violations, seen, cardId, `Meld ${meld?.id ?? "unknown"}`);
    }
    add(violations, hand.openedBySeat?.[meld?.originatingSeatId] === true, "A meld's originating seat must be opened.");
  }
  add(violations, seen.size === 52, `Current hand must contain all 52 cards exactly once; found ${seen.size}.`);

  if (!isForfeit && hand.phase === PHASE.DEALER_INITIAL_DISCARD) {
    for (const seatId of activeSeatIds) {
      const expectedCount = seatId === state.dealerSeatId
        ? state.rules.cardsPerPlayer + 1
        : state.rules.cardsPerPlayer;
      add(violations, hand.handsBySeat?.[seatId]?.length === expectedCount, "Initial deal card counts are incorrect.");
    }
    const participantCount = hand.participantSeatIds?.length ?? seatIds.length;
    add(violations, hand.stockCardIds?.length === 52 - (participantCount * state.rules.cardsPerPlayer) - 1, "Initial deal stock count is incorrect.");
  }
  if (!isForfeit && hand.phase === PHASE.AWAITING_DRAW && hand.turnNumber === 1) {
    for (const seatId of activeSeatIds) {
      add(violations, hand.handsBySeat?.[seatId]?.length === state.rules.cardsPerPlayer, "Post-dealer-discard hand counts are incorrect.");
    }
    add(violations, [0, 1].includes(hand.discardCardIds?.length), "Post-dealer-discard has an invalid discard count.");
    const participantCount = hand.participantSeatIds?.length ?? seatIds.length;
    add(violations, hand.stockCardIds?.length === 52 - (participantCount * state.rules.cardsPerPlayer) - 1, "Post-dealer-discard stock count is incorrect.");
  }

  for (const seatId of seatIds) {
    if (hand.openedBySeat?.[seatId]) {
      const openingMeld = hand.melds?.some((meld) => (
        meld?.originatingSeatId === seatId && validateDomainMeld(meld, { wildRank: hand.wildRank }).ok
      ));
      add(violations, openingMeld, `Opened seat ${seatId} requires an originating complete meld.`);
    }
  }

  if (hand.phase === PHASE.HAND_COMPLETE) validateHandResult(violations, hand, seatIds, activeSeatIds);
  else add(violations, hand.result === null, "Only a completed hand may contain a result.");
}

export function validateStateInvariants(state) {
  const violations = [];
  add(violations, isRecord(state), "State must be a record.");
  if (!isRecord(state)) return Object.freeze({ ok: false, violations: Object.freeze(violations) });

  add(violations, state.schemaVersion === SCHEMA_VERSION, "Unsupported schema version.");
  add(violations, typeof state.gameId === "string" && state.gameId.length > 0, "Game requires an ID.");
  add(violations, Object.values(LIFECYCLE).includes(state.lifecycle), "Game has an invalid lifecycle.");
  add(violations, Number.isInteger(state.revision) && state.revision >= 0, "Revision must be a non-negative integer.");
  add(violations, isRecord(state.rules) && state.rulesVersion === state.rules?.rulesVersion, "Rules version must match the immutable rule configuration.");
  add(violations, Array.isArray(state.seatOrder), "Seat order must be an array.");
  add(violations, Array.isArray(state.activeSeatOrder), "Active seat order must be an array.");
  add(violations, isRecord(state.droppedSeatsById), "Dropped-seat metadata must be a record.");
  add(violations, Array.isArray(state.completedHands), "Completed hands must be an array.");
  add(violations, Array.isArray(state.winners), "Winners must be an array.");
  add(violations, isRecord(state.commandLedger), "Command ledger must be a record.");

  const seatIds = validateSeatRecords(violations, state);
  if (state.hostSeatId !== null) add(violations, seatIds.includes(state.hostSeatId), "Host seat must be occupied.");
  if (Array.isArray(state.seatOrder)) {
    add(violations, new Set(state.seatOrder).size === state.seatOrder.length, "Seat order cannot repeat seats.");
    add(violations, state.seatOrder.every((seatId) => seatIds.includes(seatId)), "Seat order references an unoccupied seat.");
  }
  const hasExplicitActiveSeats = Array.isArray(state.activeSeatOrder) && state.activeSeatOrder.length > 0;
  const activeSeatIds = hasExplicitActiveSeats
    ? state.activeSeatOrder
    : (state.lifecycle === LIFECYCLE.LOBBY ? [] : state.seatOrder);
  if (hasExplicitActiveSeats) {
    add(violations, new Set(activeSeatIds).size === activeSeatIds.length, "Active seat order cannot repeat seats.");
    add(violations, activeSeatIds.every((seatId) => state.seatOrder.includes(seatId)), "Active seat order references an original seat that does not exist.");
    add(violations, activeSeatIds.every((seatId, index) => (
      index === 0 || state.seatOrder.indexOf(activeSeatIds[index - 1]) < state.seatOrder.indexOf(seatId)
    )), "Active seats must retain their original clockwise order.");
  }
  if (isRecord(state.droppedSeatsById)) {
    const droppedSeatIds = Object.keys(state.droppedSeatsById);
    add(violations, droppedSeatIds.every((seatId) => state.seatOrder.includes(seatId)), "Dropped-seat metadata references an unknown seat.");
    add(violations, droppedSeatIds.every((seatId) => !activeSeatIds.includes(seatId)), "A dropped seat cannot remain active.");
    add(violations, !hasExplicitActiveSeats || state.seatOrder.every((seatId) => (
      activeSeatIds.includes(seatId) !== droppedSeatIds.includes(seatId)
    )), "Every original seat must be exactly active or dropped.");
    for (const [seatId, metadata] of Object.entries(state.droppedSeatsById)) {
      add(violations, isRecord(metadata) && metadata.seatId === seatId, `Dropped seat ${seatId} has malformed metadata.`);
      add(violations, Number.isInteger(metadata?.droppedAtRevision)
        && metadata.droppedAtRevision >= 1
        && metadata.droppedAtRevision <= state.revision, `Dropped seat ${seatId} has an invalid revision.`);
      add(violations, typeof metadata?.droppedByActorSeatId === "string"
        && metadata.droppedByActorSeatId.length > 0, `Dropped seat ${seatId} lacks an actor.`);
      add(violations, metadata?.reason === undefined
        || (typeof metadata.reason === "string" && metadata.reason.length > 0), `Dropped seat ${seatId} has an invalid reason.`);
      add(violations, metadata?.droppedAt === undefined || Number.isFinite(metadata.droppedAt), `Dropped seat ${seatId} has an invalid timestamp.`);
    }
  }

  if (state.lifecycle === LIFECYCLE.LOBBY) {
    add(violations, state.hand === null, "Lobby cannot contain an active hand.");
    add(violations, state.currentHandIndex === null, "Lobby cannot have a current hand index.");
    add(violations, state.dealerSeatId === null && state.initialDealerSeatId === null, "Lobby cannot assign a dealer.");
    add(violations, state.seatOrder?.length === 0, "Lobby seat order is fixed only when play starts.");
    add(violations, activeSeatIds.length === 0 && Object.keys(state.droppedSeatsById ?? {}).length === 0, "Lobby cannot contain active/drop match metadata.");
    add(violations, seatIds.length <= state.rules?.maximumPlayers, "Lobby exceeds the maximum player count.");
  } else {
    add(violations, seatIds.length >= state.rules?.minimumPlayers && seatIds.length <= state.rules?.maximumPlayers, "Started game needs the configured number of original players.");
    add(violations, state.seatOrder?.length === seatIds.length, "Started game seat order must contain every occupied seat.");
    add(violations, activeSeatIds.length >= 1, "Started game must retain at least one active seat.");
    add(violations, isHandIndex(state.currentHandIndex), "Started game must have a valid current hand index.");
    add(violations, state.seatOrder?.includes(state.initialDealerSeatId), "Initial dealer must be occupied.");
    add(violations, state.seatOrder?.includes(state.dealerSeatId), "Dealer must be occupied.");
    add(violations, typeof state.shuffleSeed === "string" && state.shuffleSeed.length > 0, "Started game requires reproducible shuffle evidence.");
    if (typeof state.shuffleSeed === "string" && state.shuffleSeed.length > 0 && state.seatOrder?.length > 0) {
      try {
        add(
          violations,
          initialDealerSeatIdFor(state.shuffleSeed, state.seatOrder) === state.initialDealerSeatId,
          "Initial dealer does not match the recorded shuffle evidence."
        );
      } catch {
        violations.push("Initial dealer evidence is invalid.");
      }
    }
    if (isHandIndex(state.currentHandIndex)) validateHand(violations, state, seatIds, activeSeatIds);
    validateCompletedHands(violations, state, seatIds);
  }

  validateCommandLedger(violations, state);

  if (state.lifecycle === LIFECYCLE.COMPLETE) {
    const forfeit = state.completion?.reason === "FORFEIT";
    if (forfeit) {
      add(violations, activeSeatIds.length === 1, "Forfeit completion requires one active seat.");
      add(violations, state.completion?.winnerSeatId === activeSeatIds[0], "Forfeit winner must be the remaining active seat.");
      add(violations, Array.isArray(state.winners)
        && state.winners.length === 1
        && state.winners[0] === activeSeatIds[0], "Forfeit winners must contain only the remaining active seat.");
      add(violations, Array.isArray(state.completion?.droppedSeatIds)
        && state.completion.droppedSeatIds.length === state.seatOrder.length - 1
        && state.completion.droppedSeatIds.every((seatId) => Object.hasOwn(state.droppedSeatsById, seatId)), "Forfeit completion must identify every dropped seat.");
    } else {
      add(violations, state.completion === null, "Normal completion cannot contain forfeit metadata.");
      add(violations, state.currentHandIndex === state.rules?.handCount, "Game can complete only after hand thirteen.");
      add(violations, state.completedHands?.some((hand) => hand?.index === state.rules?.handCount), "Completed game must score the final hand.");
      add(violations, state.completedHands?.length === state.rules?.handCount, "Completed game must retain all thirteen scored hands.");
      add(violations, state.hand?.phase === PHASE.HAND_COMPLETE && isRecord(state.hand?.result), "Completed game must retain its final hand result.");
      const expectedWinners = activeSeatIds.filter((seatId) => {
      const totals = activeSeatIds.map((candidate) => state.seats[candidate]?.cumulativeScore);
      return state.seats[seatId]?.cumulativeScore === Math.min(...totals);
      });
      add(violations, Array.isArray(state.winners)
        && state.winners.length > 0
        && state.winners.length === expectedWinners.length
        && state.winners.every((seatId, index) => seatId === expectedWinners[index]), "Final winners must be exactly the active lowest-score seats.");
    }
  } else {
    add(violations, state.winners?.length === 0, "Only a completed game may name winners.");
    add(violations, state.completion === null, "Only a completed game may contain completion metadata.");
  }

  return Object.freeze({ ok: violations.length === 0, violations: Object.freeze(violations) });
}

export function assertStateInvariants(state) {
  const result = validateStateInvariants(state);
  if (!result.ok) throw new StateInvariantError(result.violations);
  return state;
}

export const validateInvariants = validateStateInvariants;
export const assertInvariants = assertStateInvariants;

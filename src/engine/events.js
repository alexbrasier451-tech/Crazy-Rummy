import {
  COMMAND_TYPE,
  EVENT_TYPE,
  LIFECYCLE,
  PHASE,
  REJECTION,
  RULES_VERSION,
  SCHEMA_VERSION,
  SYSTEM_ACTOR_SEAT_ID
} from "./constants.js";
import { CARD_IDS, cardForId } from "./cards.js";
import { committedDeckEvidence, createSeededDeck, initialDealerSeatIdFor } from "./deck.js";
import { assertStateInvariants } from "./invariants.js";
import {
  acknowledgeHandResult,
  completeHand,
  createHand,
  isReadyForNextHand,
  nextActiveSeatId,
  startNextHand,
  HAND_END_REASON
} from "./lifecycle.js";
import { validateLayoff, validateMeld, validateWildReplacement } from "./melds.js";
import { cloneState, createSeat, deepFreeze } from "./state.js";

const EVENT_FOR_COMMAND = Object.freeze({
  [COMMAND_TYPE.JOIN_SEAT]: EVENT_TYPE.SEAT_JOINED,
  [COMMAND_TYPE.LEAVE_SEAT]: EVENT_TYPE.SEAT_LEFT,
  [COMMAND_TYPE.SET_SEAT_READY]: EVENT_TYPE.SEAT_READY_CHANGED,
  [COMMAND_TYPE.START_GAME]: EVENT_TYPE.GAME_STARTED,
  [COMMAND_TYPE.DEALER_INITIAL_DISCARD]: EVENT_TYPE.DEALER_INITIAL_DISCARDED,
  [COMMAND_TYPE.DRAW_STOCK]: EVENT_TYPE.CARD_DRAWN,
  [COMMAND_TYPE.DRAW_DISCARD]: EVENT_TYPE.CARD_DRAWN,
  [COMMAND_TYPE.CREATE_MELD]: EVENT_TYPE.MELD_CREATED,
  [COMMAND_TYPE.LAY_OFF]: EVENT_TYPE.CARDS_LAID_OFF,
  [COMMAND_TYPE.REPLACE_WILD]: EVENT_TYPE.WILD_REPLACED,
  [COMMAND_TYPE.FINISH_TABLE_PLAY]: EVENT_TYPE.TABLE_PLAY_FINISHED,
  [COMMAND_TYPE.DISCARD]: EVENT_TYPE.CARD_DISCARDED,
  [COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT]: EVENT_TYPE.HAND_RESULT_ACKNOWLEDGED,
  [COMMAND_TYPE.DROP_SEAT]: EVENT_TYPE.SEAT_DROPPED
});

export class EventApplicationError extends Error {
  constructor(reason, detail) {
    super(detail ?? reason);
    this.name = "EventApplicationError";
    this.reason = reason;
    this.detail = detail;
  }
}

function fail(reason, detail) {
  throw new EventApplicationError(reason, detail);
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value, reason = REJECTION.INVALID_COMMAND, detail = "A non-empty string is required.") {
  if (typeof value !== "string" || value.length === 0) fail(reason, detail);
  return value;
}

function expectedHand(state, event) {
  if (!state.hand || event.handId !== state.hand.id) fail(REJECTION.INVALID_HAND);
  return state.hand;
}

function requireActorSeat(state, actorSeatId) {
  if (!Object.hasOwn(state.seats, actorSeatId)) fail(REJECTION.NOT_AUTHORIZED);
}

function requireActive(state, event, phase) {
  const hand = expectedHand(state, event);
  requireActorSeat(state, event.actorSeatId);
  if (hand.activeSeatId !== event.actorSeatId) fail(REJECTION.NOT_ACTIVE_PLAYER);
  const acceptedPhases = Array.isArray(phase) ? phase : [phase];
  if (!acceptedPhases.includes(hand.phase)) fail(REJECTION.WRONG_PHASE);
  return hand;
}

function requireInProgress(state, event) {
  if (state.lifecycle !== LIFECYCLE.IN_PROGRESS) fail(REJECTION.WRONG_LIFECYCLE);
  return expectedHand(state, event);
}

function cardInHand(hand, seatId, cardId) {
  cardForId(cardId);
  if (!hand.handsBySeat[seatId]?.includes(cardId)) fail(REJECTION.CARD_UNAVAILABLE);
}

function withoutCard(cards, cardId) {
  const index = cards.indexOf(cardId);
  if (index < 0) fail(REJECTION.CARD_UNAVAILABLE);
  return [...cards.slice(0, index), ...cards.slice(index + 1)];
}

function replaceHand(hand, seatId, cards) {
  return {
    ...hand,
    handsBySeat: { ...hand.handsBySeat, [seatId]: cards }
  };
}

function handDeckFor(state, handIndex, committedDeckCardIds = null) {
  if (committedDeckCardIds !== null && committedDeckCardIds !== undefined) {
    if (!Array.isArray(committedDeckCardIds) || committedDeckCardIds.length !== CARD_IDS.length
      || new Set(committedDeckCardIds).size !== CARD_IDS.length) {
      fail(REJECTION.INVALID_COMMAND, "A committed deck must be a complete unique pack.");
    }
    for (const cardId of committedDeckCardIds) cardForId(cardId);
    return committedDeckCardIds;
  }
  if (state.shuffleSeed === null || state.shuffleSeed === undefined) {
    fail(REJECTION.INVALID_STATE, "A reproducible shuffle seed is required.");
  }
  return createSeededDeck(`${state.shuffleSeed}:hand:${handIndex}`);
}

function immutableCandidate(candidate) {
  const frozen = deepFreeze(candidate);
  try {
    assertStateInvariants(frozen);
  } catch (error) {
    fail(REJECTION.INVALID_STATE, error.message);
  }
  return frozen;
}

function joinSeat(state, event) {
  if (state.lifecycle !== LIFECYCLE.LOBBY) fail(REJECTION.WRONG_LIFECYCLE);
  const seat = createSeat(event.payload.seat);
  if (seat.seatId !== event.actorSeatId) fail(REJECTION.NOT_AUTHORIZED);
  if (Object.hasOwn(state.seats, seat.seatId)) fail(REJECTION.SEAT_OCCUPIED);
  if (Object.values(state.seats).some((existing) => existing.playerId === seat.playerId)) {
    fail(REJECTION.PLAYER_ALREADY_SEATED);
  }
  if (Object.keys(state.seats).length >= state.rules.maximumPlayers) fail(REJECTION.SEAT_LIMIT);
  return {
    ...state,
    seats: { ...state.seats, [seat.seatId]: seat },
    hostSeatId: state.hostSeatId ?? seat.seatId
  };
}

function leaveSeat(state, event) {
  if (state.lifecycle !== LIFECYCLE.LOBBY) fail(REJECTION.WRONG_LIFECYCLE);
  requireActorSeat(state, event.actorSeatId);
  if (state.hostSeatId === event.actorSeatId) fail(REJECTION.NOT_AUTHORIZED, "Host seat cannot leave a lobby.");
  const seats = { ...state.seats };
  delete seats[event.actorSeatId];
  return { ...state, seats };
}

function setSeatReady(state, event) {
  if (state.lifecycle !== LIFECYCLE.LOBBY) fail(REJECTION.WRONG_LIFECYCLE);
  requireActorSeat(state, event.actorSeatId);
  if (typeof event.payload.ready !== "boolean") fail(REJECTION.INVALID_COMMAND);
  return {
    ...state,
    seats: {
      ...state.seats,
      [event.actorSeatId]: { ...state.seats[event.actorSeatId], ready: event.payload.ready }
    }
  };
}

function startGame(state, event) {
  if (state.lifecycle !== LIFECYCLE.LOBBY) fail(REJECTION.WRONG_LIFECYCLE);
  if (event.actorSeatId !== state.hostSeatId) fail(REJECTION.NOT_AUTHORIZED);
  const seatOrder = Object.keys(state.seats);
  if (seatOrder.length < state.rules.minimumPlayers || seatOrder.length > state.rules.maximumPlayers) {
    fail(REJECTION.NOT_ENOUGH_PLAYERS);
  }
  if (seatOrder.some((seatId) => state.seats[seatId].ready !== true)) fail(REJECTION.PLAYERS_NOT_READY);
  const dealerSeatId = event.payload.initialDealerSeatId;
  if (!seatOrder.includes(dealerSeatId)) fail(REJECTION.INVALID_COMMAND, "Initial dealer must be seated.");
  const hasDeck = event.payload.deckCardIds !== undefined;
  const shuffleSeed = event.payload.shuffleSeed;
  if (!hasDeck && (typeof shuffleSeed !== "string" || shuffleSeed.length === 0)) {
    fail(REJECTION.INVALID_COMMAND, "Start requires a reproducible shuffle seed or complete committed deck.");
  }
  // A committed opening deck is itself reproducible shuffle evidence. Keep an
  // exact private encoding so later hands derive deterministically without
  // treating the opening deck as ambient randomness.
  let seed;
  try {
    seed = shuffleSeed ?? committedDeckEvidence(event.payload.deckCardIds);
  } catch (error) {
    fail(REJECTION.INVALID_COMMAND, error instanceof Error ? error.message : String(error));
  }
  let expectedDealerSeatId;
  try {
    expectedDealerSeatId = initialDealerSeatIdFor(seed, seatOrder);
  } catch (error) {
    fail(REJECTION.INVALID_COMMAND, error instanceof Error ? error.message : String(error));
  }
  if (dealerSeatId !== expectedDealerSeatId) {
    fail(REJECTION.INVALID_COMMAND, "Initial dealer does not match deterministic shuffle evidence.");
  }
  const seedState = { ...state, shuffleSeed: seed };
  const deckCardIds = handDeckFor(seedState, 1, event.payload.deckCardIds ?? null);
  const hand = createHand({
    gameId: state.gameId,
    handIndex: 1,
    dealerSeatId,
    seatOrder,
    deckCardIds,
    rules: state.rules
  });
  return {
    ...state,
    lifecycle: LIFECYCLE.IN_PROGRESS,
    seatOrder,
    activeSeatOrder: [...seatOrder],
    droppedSeatsById: {},
    currentHandIndex: 1,
    initialDealerSeatId: dealerSeatId,
    dealerSeatId,
    hand,
    shuffleSeed: seed
  };
}

function dealerInitialDiscard(state, event) {
  const hand = requireActive(state, event, PHASE.DEALER_INITIAL_DISCARD);
  const cardId = event.payload.cardId;
  cardInHand(hand, event.actorSeatId, cardId);
  const remaining = withoutCard(hand.handsBySeat[event.actorSeatId], cardId);
  const next = nextActiveSeatId(state.seatOrder, state.activeSeatOrder, event.actorSeatId);
  return {
    ...state,
    hand: {
      ...replaceHand(hand, event.actorSeatId, remaining),
      discardCardIds: [...hand.discardCardIds, cardId],
      activeSeatId: next,
      phase: PHASE.AWAITING_DRAW,
      turnNumber: 1
    }
  };
}

function draw(state, event, source) {
  const hand = requireActive(state, event, PHASE.AWAITING_DRAW);
  if (source !== "stock" && source !== "discard") {
    fail(REJECTION.INVALID_COMMAND, "Draw source must be exactly stock or discard.");
  }
  let cardId;
  let stockCardIds = hand.stockCardIds;
  let discardCardIds = hand.discardCardIds;
  if (source === "stock") {
    if (stockCardIds.length === 0) fail(REJECTION.STOCK_EMPTY);
    [cardId, ...stockCardIds] = stockCardIds;
  } else {
    if (discardCardIds.length === 0) fail(REJECTION.DISCARD_EMPTY);
    cardId = discardCardIds.at(-1);
    discardCardIds = discardCardIds.slice(0, -1);
  }
  if (event.payload.cardId !== undefined && event.payload.cardId !== cardId) {
    fail(REJECTION.INVALID_COMMAND, "Draw event card does not match the authoritative source.");
  }
  return {
    ...state,
    hand: {
      ...replaceHand(hand, event.actorSeatId, [...hand.handsBySeat[event.actorSeatId], cardId]),
      stockCardIds,
      discardCardIds,
      drawnCardId: cardId,
      drawSource: source,
      drewFinalStock: source === "stock" && stockCardIds.length === 0,
      phase: PHASE.TABLE_PLAY
    }
  };
}

function createMeld(state, event) {
  const hand = requireActive(state, event, PHASE.TABLE_PLAY);
  const checked = validateMeld(event.payload.meld, { wildRank: hand.wildRank });
  if (!checked.ok) fail(checked.reason, checked.detail);
  const meld = checked.meld;
  if (hand.melds.some((existing) => existing.id === meld.id)) fail(REJECTION.INVALID_MELD, "Meld ID already exists.");
  if (meld.originatingSeatId !== event.actorSeatId) fail(REJECTION.NOT_AUTHORIZED);
  for (const slot of meld.slots) cardInHand(hand, event.actorSeatId, slot.cardId);
  const selected = new Set(meld.slots.map((slot) => slot.cardId));
  if (selected.size !== meld.slots.length) fail(REJECTION.INVALID_MELD);
  const remaining = hand.handsBySeat[event.actorSeatId].filter((cardId) => !selected.has(cardId));
  if (remaining.length === 0) fail(REJECTION.FINAL_DISCARD_REQUIRED);
  return {
    ...state,
    hand: {
      ...replaceHand(hand, event.actorSeatId, remaining),
      openedBySeat: { ...hand.openedBySeat, [event.actorSeatId]: true },
      melds: [...hand.melds, meld]
    }
  };
}

function layOff(state, event) {
  const hand = requireActive(state, event, PHASE.TABLE_PLAY);
  if (!hand.openedBySeat[event.actorSeatId]) fail(REJECTION.PLAYER_NOT_OPENED);
  const targetIndex = hand.melds.findIndex((meld) => meld.id === event.payload.meldId);
  if (targetIndex < 0) fail(REJECTION.MELD_NOT_FOUND);
  const slots = event.payload.slots;
  if (!Array.isArray(slots)) fail(REJECTION.INVALID_COMMAND);
  for (const slot of slots) cardInHand(hand, event.actorSeatId, slot?.cardId);
  const checked = validateLayoff(hand.melds[targetIndex], slots, {
    wildRank: hand.wildRank,
    placement: event.payload.placement
  });
  if (!checked.ok) fail(checked.reason, checked.detail);
  const selected = new Set(slots.map((slot) => slot.cardId));
  if (selected.size !== slots.length) fail(REJECTION.INVALID_MELD);
  const remaining = hand.handsBySeat[event.actorSeatId].filter((cardId) => !selected.has(cardId));
  if (remaining.length === 0) fail(REJECTION.FINAL_DISCARD_REQUIRED);
  const melds = [...hand.melds];
  melds[targetIndex] = checked.meld;
  return { ...state, hand: { ...replaceHand(hand, event.actorSeatId, remaining), melds } };
}

function replaceWild(state, event) {
  const hand = requireActive(state, event, PHASE.TABLE_PLAY);
  if (!hand.openedBySeat[event.actorSeatId]) fail(REJECTION.PLAYER_NOT_OPENED);
  const targetIndex = hand.melds.findIndex((meld) => meld.id === event.payload.meldId);
  if (targetIndex < 0) fail(REJECTION.MELD_NOT_FOUND);
  cardInHand(hand, event.actorSeatId, event.payload.naturalCardId);
  const checked = validateWildReplacement(hand.melds[targetIndex], event.payload, { wildRank: hand.wildRank });
  if (!checked.ok) fail(checked.reason, checked.detail);
  const replacedHand = withoutCard(hand.handsBySeat[event.actorSeatId], event.payload.naturalCardId);
  replacedHand.push(checked.reclaimedWildCardId);
  const melds = [...hand.melds];
  melds[targetIndex] = checked.meld;
  return { ...state, hand: { ...replaceHand(hand, event.actorSeatId, replacedHand), melds } };
}

function finishTablePlay(state, event) {
  const hand = requireActive(state, event, PHASE.TABLE_PLAY);
  return { ...state, hand: { ...hand, phase: PHASE.AWAITING_DISCARD } };
}

function discard(state, event) {
  const hand = requireActive(state, event, [PHASE.TABLE_PLAY, PHASE.AWAITING_DISCARD]);
  const cardId = event.payload.cardId;
  cardInHand(hand, event.actorSeatId, cardId);
  const remaining = withoutCard(hand.handsBySeat[event.actorSeatId], cardId);
  const base = {
    ...state,
    hand: {
      ...replaceHand(hand, event.actorSeatId, remaining),
      discardCardIds: [...hand.discardCardIds, cardId]
    }
  };
  if (remaining.length === 0) {
    return cloneState(completeHand(deepFreeze(base), {
      reason: HAND_END_REASON.WENT_OUT,
      winnerSeatId: event.actorSeatId
    }));
  }
  if (hand.drewFinalStock) {
    return cloneState(completeHand(deepFreeze(base), { reason: HAND_END_REASON.STOCK_EXHAUSTED }));
  }
  return {
    ...base,
    hand: {
      ...base.hand,
      activeSeatId: nextActiveSeatId(state.seatOrder, state.activeSeatOrder, event.actorSeatId),
      phase: PHASE.AWAITING_DRAW,
      turnNumber: hand.turnNumber + 1,
      drawnCardId: null,
      drawSource: null,
      drewFinalStock: false
    }
  };
}

function acknowledgeResult(state, event) {
  const hand = requireInProgress(state, event);
  requireActorSeat(state, event.actorSeatId);
  if (!state.activeSeatOrder.includes(event.actorSeatId)) fail(REJECTION.NOT_AUTHORIZED);
  if (hand.phase !== PHASE.HAND_COMPLETE || !hand.result) fail(REJECTION.WRONG_PHASE);
  if (hand.result.acknowledgedBySeatIds.includes(event.actorSeatId)) fail(REJECTION.ALREADY_ACKNOWLEDGED);
  let next = cloneState(acknowledgeHandResult(deepFreeze(state), event.actorSeatId));
  if (isReadyForNextHand(next)) {
    const nextIndex = next.currentHandIndex + 1;
    next = cloneState(startNextHand(deepFreeze(next), handDeckFor(next, nextIndex)));
  }
  return next;
}

function dropSeat(state, event) {
  if (state.lifecycle !== LIFECYCLE.IN_PROGRESS) fail(REJECTION.WRONG_LIFECYCLE);
  const targetSeatId = requiredString(event.payload.seatId);
  if (event.actorSeatId !== state.hostSeatId && event.actorSeatId !== SYSTEM_ACTOR_SEAT_ID) {
    fail(REJECTION.NOT_AUTHORIZED);
  }
  if (!state.activeSeatOrder.includes(targetSeatId)) {
    fail(REJECTION.NOT_AUTHORIZED, "Seat is not active.");
  }
  if (targetSeatId === state.hostSeatId) {
    fail(REJECTION.NOT_AUTHORIZED, "The authoritative host cannot be dropped.");
  }
  if (event.payload.reason !== undefined && (
    typeof event.payload.reason !== "string" || event.payload.reason.length === 0
  )) {
    fail(REJECTION.INVALID_COMMAND, "Drop reason must be a non-empty string when supplied.");
  }
  if (event.payload.droppedAt !== undefined && !Number.isFinite(event.payload.droppedAt)) {
    fail(REJECTION.INVALID_COMMAND, "Drop timestamp must be finite when supplied.");
  }

  const activeSeatOrder = state.activeSeatOrder.filter((seatId) => seatId !== targetSeatId);
  const droppedSeatsById = {
    ...state.droppedSeatsById,
    [targetSeatId]: {
      seatId: targetSeatId,
      droppedByActorSeatId: event.actorSeatId,
      droppedAtRevision: event.sequence,
      ...(event.payload.reason !== undefined ? { reason: event.payload.reason } : {}),
      ...(event.payload.droppedAt !== undefined ? { droppedAt: event.payload.droppedAt } : {})
    }
  };
  const hand = state.hand;
  const deadCards = hand.handsBySeat[targetSeatId] ?? [];
  const handsBySeat = { ...hand.handsBySeat, [targetSeatId]: [] };
  let nextHand = {
    ...hand,
    handsBySeat,
    deadHandCardIds: [...(hand.deadHandCardIds ?? []), ...deadCards]
  };
  let next = { ...state, activeSeatOrder, droppedSeatsById, hand: nextHand };

  if (activeSeatOrder.length === 1) {
    const winnerSeatId = activeSeatOrder[0];
    return {
      ...next,
      lifecycle: LIFECYCLE.COMPLETE,
      winners: [winnerSeatId],
      hand: {
        ...nextHand,
        activeSeatId: null
      },
      completion: {
        reason: "FORFEIT",
        winnerSeatId,
        droppedSeatIds: state.seatOrder.filter((seatId) => !activeSeatOrder.includes(seatId))
      }
    };
  }

  if (hand.phase === PHASE.HAND_COMPLETE) {
    if (hand.activeSeatId === targetSeatId) {
      next = {
        ...next,
        hand: {
          ...nextHand,
          activeSeatId: nextActiveSeatId(state.seatOrder, activeSeatOrder, targetSeatId)
        }
      };
    }
    if (isReadyForNextHand(deepFreeze(next))) {
      const nextIndex = next.currentHandIndex + 1;
      next = cloneState(startNextHand(deepFreeze(next), handDeckFor(next, nextIndex)));
    }
    return next;
  }

  if (hand.activeSeatId !== targetSeatId) return next;
  const successor = nextActiveSeatId(state.seatOrder, activeSeatOrder, targetSeatId);
  if (hand.phase === PHASE.DEALER_INITIAL_DISCARD) {
    return {
      ...next,
      hand: {
        ...nextHand,
        activeSeatId: successor,
        phase: PHASE.AWAITING_DRAW,
        turnNumber: 1,
        drawnCardId: null,
        drawSource: null,
        drewFinalStock: false
      }
    };
  }
  if ([PHASE.TABLE_PLAY, PHASE.AWAITING_DISCARD].includes(hand.phase) && hand.drewFinalStock) {
    return cloneState(completeHand(deepFreeze({
      ...next,
      hand: { ...nextHand, activeSeatId: successor }
    }), { reason: HAND_END_REASON.STOCK_EXHAUSTED }));
  }
  return {
    ...next,
    hand: {
      ...nextHand,
      activeSeatId: successor,
      phase: PHASE.AWAITING_DRAW,
      turnNumber: hand.turnNumber + 1,
      drawnCardId: null,
      drawSource: null,
      drewFinalStock: false
    }
  };
}

function transition(state, event) {
  switch (event.type) {
    case EVENT_TYPE.SEAT_JOINED: return joinSeat(state, event);
    case EVENT_TYPE.SEAT_LEFT: return leaveSeat(state, event);
    case EVENT_TYPE.SEAT_READY_CHANGED: return setSeatReady(state, event);
    case EVENT_TYPE.GAME_STARTED: return startGame(state, event);
    case EVENT_TYPE.DEALER_INITIAL_DISCARDED: return dealerInitialDiscard(state, event);
    case EVENT_TYPE.CARD_DRAWN:
      return draw(state, event, event.payload.source);
    case EVENT_TYPE.MELD_CREATED: return createMeld(state, event);
    case EVENT_TYPE.CARDS_LAID_OFF: return layOff(state, event);
    case EVENT_TYPE.WILD_REPLACED: return replaceWild(state, event);
    case EVENT_TYPE.TABLE_PLAY_FINISHED: return finishTablePlay(state, event);
    case EVENT_TYPE.CARD_DISCARDED: return discard(state, event);
    case EVENT_TYPE.HAND_RESULT_ACKNOWLEDGED: return acknowledgeResult(state, event);
    case EVENT_TYPE.SEAT_DROPPED: return dropSeat(state, event);
    default: fail(REJECTION.INVALID_COMMAND, "Unknown event type.");
  }
}

function checkEnvelope(state, event) {
  if (!record(event)) fail(REJECTION.INVALID_COMMAND, "Event must be a record.");
  if (event.schemaVersion !== SCHEMA_VERSION) fail(REJECTION.UNSUPPORTED_SCHEMA);
  if (event.rulesVersion !== RULES_VERSION || event.rulesVersion !== state.rulesVersion) {
    fail(REJECTION.UNSUPPORTED_SCHEMA);
  }
  if (event.gameId !== state.gameId) fail(REJECTION.INVALID_GAME);
  if (!Number.isInteger(event.sequence) || event.sequence !== state.revision + 1) {
    fail(REJECTION.REVISION_GAP);
  }
  requiredString(event.type);
  requiredString(event.commandId, REJECTION.COMMAND_ID_REQUIRED);
  requiredString(event.commandFingerprint, REJECTION.INVALID_COMMAND);
  requiredString(event.actorSeatId, REJECTION.NOT_AUTHORIZED);
  if (!record(event.payload)) fail(REJECTION.INVALID_COMMAND, "Event payload must be a record.");
  if (!Array.isArray(event.facts)) fail(REJECTION.INVALID_COMMAND, "Event facts must be an array.");
  if (Object.hasOwn(state.commandLedger, event.commandId)) fail(REJECTION.COMMAND_ID_CONFLICT);
}

/** Apply exactly one pre-validated ordered event, rejecting schema and revision gaps. */
export function reduceEvent(state, event) {
  checkEnvelope(state, event);
  const candidate = cloneState(transition(state, event));
  candidate.revision = event.sequence;
  candidate.commandLedger = {
    ...candidate.commandLedger,
    [event.commandId]: {
      commandFingerprint: event.commandFingerprint,
      event: deepFreeze({ ...event, payload: { ...event.payload }, facts: [...event.facts] })
    }
  };
  return immutableCandidate(candidate);
}

/** Apply an ordered sequence; the supplied initial state is never mutated. */
export function replayEvents(initialState, events) {
  if (!Array.isArray(events)) throw new TypeError("Events must be an array.");
  return events.reduce((state, event) => reduceEvent(state, event), initialState);
}

export function eventTypeForCommand(commandType) {
  return EVENT_FOR_COMMAND[commandType] ?? null;
}

function scoreTotals(result) {
  return Object.fromEntries(Object.entries(result?.scoreEntriesBySeat ?? {}).map(([seatId, entry]) => [
    seatId,
    entry?.total
  ]));
}

function appendHandCompletionFacts(facts, afterHand, after) {
  const result = afterHand?.result;
  if (!result) return;
  if (result.reason === HAND_END_REASON.WENT_OUT) {
    facts.push({ type: "PLAYER_WENT_OUT", seatId: result.winnerSeatId });
  } else {
    facts.push({ type: "STOCK_EXHAUSTED" });
  }
  facts.push(
    { type: "HAND_SCORED", handIndex: afterHand.index, totalsBySeat: scoreTotals(result) },
    { type: "HAND_COMPLETED", handIndex: afterHand.index, reason: result.reason }
  );
  if (after.lifecycle === LIFECYCLE.COMPLETE) {
    facts.push({ type: "GAME_COMPLETED", winners: [...after.winners] });
  }
}

function appendNextHandFacts(facts, afterHand, after) {
  facts.push(
    { type: "DEALER_ADVANCED", dealerSeatId: after.dealerSeatId },
    { type: "NEXT_HAND_STARTED", handIndex: afterHand.index },
    { type: "SHUFFLE_COMMITTED" },
    {
      type: "HAND_DEALT",
      handIndex: afterHand.index,
      dealerSeatId: afterHand.dealerSeatId,
      playerCount: afterHand.participantSeatIds?.length ?? after.activeSeatOrder.length,
      stockCount: afterHand.stockCardIds.length
    },
    { type: "TURN_STARTED", seatId: afterHand.activeSeatId, phase: afterHand.phase }
  );
}

/**
 * Describe accepted state changes without exposing deck evidence or private
 * card identities. The command facade calls this only after a successful
 * preview reduction, then stores the returned facts in the canonical event.
 */
export function safeEventFacts(before, event, after) {
  const facts = [];
  const beforeHand = before.hand;
  const afterHand = after.hand;
  switch (event.type) {
    case EVENT_TYPE.GAME_STARTED:
      facts.push(
        { type: "SHUFFLE_COMMITTED" },
        {
          type: "HAND_DEALT",
          handIndex: afterHand.index,
          dealerSeatId: afterHand.dealerSeatId,
          playerCount: after.seatOrder.length,
          stockCount: afterHand.stockCardIds.length
        },
        { type: "TURN_STARTED", seatId: afterHand.activeSeatId, phase: afterHand.phase }
      );
      break;
    case EVENT_TYPE.DEALER_INITIAL_DISCARDED:
      facts.push(
        { type: "DEALER_INITIAL_DISCARDED" },
        { type: "TURN_STARTED", seatId: afterHand.activeSeatId, phase: afterHand.phase }
      );
      break;
    case EVENT_TYPE.CARD_DRAWN:
      facts.push({ type: "CARD_DRAWN", source: event.payload.source });
      break;
    case EVENT_TYPE.MELD_CREATED:
      facts.push({ type: "TABLE_PLAY_APPLIED" });
      if (!beforeHand.openedBySeat[event.actorSeatId] && afterHand.openedBySeat[event.actorSeatId]) {
        facts.push({ type: "PLAYER_OPENED", seatId: event.actorSeatId });
      }
      break;
    case EVENT_TYPE.CARDS_LAID_OFF:
    case EVENT_TYPE.WILD_REPLACED:
      facts.push({ type: "TABLE_PLAY_APPLIED" });
      break;
    case EVENT_TYPE.TABLE_PLAY_FINISHED:
      facts.push({ type: "TABLE_PLAY_FINISHED", seatId: event.actorSeatId });
      break;
    case EVENT_TYPE.CARD_DISCARDED: {
      facts.push({ type: "TURN_FINISHED", seatId: event.actorSeatId });
      const result = afterHand.result;
      if (result) {
        appendHandCompletionFacts(facts, afterHand, after);
      } else {
        facts.push({ type: "TURN_STARTED", seatId: afterHand.activeSeatId, phase: afterHand.phase });
      }
      break;
    }
    case EVENT_TYPE.HAND_RESULT_ACKNOWLEDGED:
      facts.push({ type: "HAND_RESULT_ACKNOWLEDGED", seatId: event.actorSeatId });
      if (afterHand.index !== beforeHand.index) {
        appendNextHandFacts(facts, afterHand, after);
      }
      break;
    case EVENT_TYPE.SEAT_DROPPED:
      facts.push({
        type: "SEAT_DROPPED",
        seatId: event.payload.seatId,
        activeSeatCount: after.activeSeatOrder.length,
        reason: event.payload.reason ?? null
      });
      if (after.lifecycle === LIFECYCLE.COMPLETE && after.completion?.reason === "FORFEIT") {
        facts.push({
          type: "GAME_COMPLETED",
          reason: "FORFEIT",
          winnerSeatId: after.completion.winnerSeatId
        });
      } else if (!beforeHand?.result && afterHand?.result) {
        appendHandCompletionFacts(facts, afterHand, after);
      } else if (afterHand?.index !== beforeHand?.index) {
        appendNextHandFacts(facts, afterHand, after);
      } else if (beforeHand?.activeSeatId === event.payload.seatId
        && afterHand?.activeSeatId !== beforeHand.activeSeatId
        && afterHand?.phase !== PHASE.HAND_COMPLETE) {
        facts.push({ type: "TURN_STARTED", seatId: afterHand.activeSeatId, phase: afterHand.phase });
      }
      break;
    default:
      facts.push({ type: event.type });
  }
  return facts;
}

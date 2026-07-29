import {
  COMMAND_TYPE,
  REJECTION,
  RULES_VERSION,
  SCHEMA_VERSION
} from "./constants.js";
import {
  eventTypeForCommand,
  EventApplicationError,
  reduceEvent,
  safeEventFacts
} from "./events.js";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

/** Stable structural fingerprint used to recognise an idempotent command retry. */
export function commandFingerprint(command) {
  return JSON.stringify(canonical(command));
}

function rejected(state, reason, detail) {
  return detail === undefined
    ? { accepted: false, state, reason }
    : { accepted: false, state, reason, detail };
}

function commandPayload(command) {
  switch (command.type) {
    case COMMAND_TYPE.JOIN_SEAT: return { seat: command.seat };
    case COMMAND_TYPE.LEAVE_SEAT:
    case COMMAND_TYPE.FINISH_TABLE_PLAY:
    case COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT:
      return {};
    case COMMAND_TYPE.DROP_SEAT:
      return {
        seatId: command.seatId,
        ...(command.reason !== undefined ? { reason: command.reason } : {}),
        ...(command.droppedAt !== undefined ? { droppedAt: command.droppedAt } : {})
      };
    case COMMAND_TYPE.DRAW_STOCK: return { source: "stock" };
    case COMMAND_TYPE.DRAW_DISCARD: return { source: "discard" };
    case COMMAND_TYPE.SET_SEAT_READY: return { ready: command.ready };
    case COMMAND_TYPE.START_GAME: return {
      initialDealerSeatId: command.initialDealerSeatId,
      ...(command.shuffleSeed !== undefined ? { shuffleSeed: command.shuffleSeed } : {}),
      ...(command.deckCardIds !== undefined ? { deckCardIds: command.deckCardIds } : {})
    };
    case COMMAND_TYPE.DEALER_INITIAL_DISCARD:
    case COMMAND_TYPE.DISCARD: return { cardId: command.cardId };
    case COMMAND_TYPE.CREATE_MELD: return { meld: command.meld };
    case COMMAND_TYPE.LAY_OFF: return {
      meldId: command.meldId,
      slots: command.slots,
      placement: command.placement
    };
    case COMMAND_TYPE.REPLACE_WILD: return {
      meldId: command.meldId,
      wildCardId: command.wildCardId,
      naturalCardId: command.naturalCardId
    };
    default: return null;
  }
}

function requiresHand(commandType) {
  return ![
    COMMAND_TYPE.JOIN_SEAT,
    COMMAND_TYPE.LEAVE_SEAT,
    COMMAND_TYPE.SET_SEAT_READY,
    COMMAND_TYPE.START_GAME
  ].includes(commandType);
}

/**
 * Validate, atomically apply, and envelope a command. Rejections preserve the
 * exact original state object. Accepted commands advance revision once.
 */
export function executeCommand(state, command) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return rejected(state, REJECTION.INVALID_STATE);
  }
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    return rejected(state, REJECTION.INVALID_COMMAND);
  }
  if (!Object.values(COMMAND_TYPE).includes(command.type)) {
    return rejected(state, REJECTION.INVALID_COMMAND);
  }
  if (command.gameId !== state.gameId) return rejected(state, REJECTION.INVALID_GAME);
  if (typeof command.clientCommandId !== "string" || command.clientCommandId.length === 0) {
    return rejected(state, REJECTION.COMMAND_ID_REQUIRED);
  }

  const fingerprint = commandFingerprint(command);
  const prior = state.commandLedger?.[command.clientCommandId];
  if (prior) {
    if (prior.commandFingerprint !== fingerprint) return rejected(state, REJECTION.COMMAND_ID_CONFLICT);
    return {
      accepted: true,
      duplicate: true,
      state,
      event: prior.event,
      events: [prior.event],
      revision: prior.event.sequence
    };
  }
  if (!Number.isInteger(command.expectedRevision) || command.expectedRevision !== state.revision) {
    return rejected(state, REJECTION.STALE_REVISION);
  }
  if (typeof command.actorSeatId !== "string" || command.actorSeatId.length === 0) {
    return rejected(state, REJECTION.NOT_AUTHORIZED);
  }
  if (requiresHand(command.type)) {
    if (!state.hand || command.handId !== state.hand.id) return rejected(state, REJECTION.INVALID_HAND);
  }
  const payload = commandPayload(command);
  const type = eventTypeForCommand(command.type);
  if (!payload || !type) return rejected(state, REJECTION.INVALID_COMMAND);
  if (command.type === COMMAND_TYPE.DRAW_STOCK) {
    payload.cardId = state.hand.stockCardIds[0];
  }
  if (command.type === COMMAND_TYPE.DRAW_DISCARD) {
    payload.cardId = state.hand.discardCardIds.at(-1);
  }

  const event = {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    gameId: state.gameId,
    handId: requiresHand(command.type) ? command.handId : null,
    sequence: state.revision + 1,
    type,
    commandId: command.clientCommandId,
    commandFingerprint: fingerprint,
    actorSeatId: command.actorSeatId,
    payload,
    facts: []
  };
  try {
    const previewState = reduceEvent(state, event);
    event.facts = safeEventFacts(state, event, previewState);
    const nextState = reduceEvent(state, event);
    return {
      accepted: true,
      duplicate: false,
      state: nextState,
      event: nextState.commandLedger[command.clientCommandId].event,
      events: [nextState.commandLedger[command.clientCommandId].event],
      revision: nextState.revision
    };
  } catch (error) {
    if (error instanceof EventApplicationError) return rejected(state, error.reason, error.detail);
    return rejected(state, REJECTION.INVALID_STATE, error instanceof Error ? error.message : String(error));
  }
}

export const applyCommand = executeCommand;

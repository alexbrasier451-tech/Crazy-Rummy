import assert from "node:assert/strict";
import test from "node:test";

import { COMMAND_TYPE, HAND_SCHEDULE, LIFECYCLE, PHASE } from "../../src/engine/constants.js";
import { executeCommand } from "../../src/engine/commands.js";
import { initialDealerSeatIdFor } from "../../src/engine/deck.js";
import { replayEvents } from "../../src/engine/events.js";
import { assertStateInvariants } from "../../src/engine/invariants.js";
import { createLobbyState, createSeat } from "../../src/engine/state.js";

const SEAT_ORDER = Object.freeze(["north", "east", "south"]);

function input(state, type, actorSeatId, commandNumber, fields = {}) {
  return {
    type,
    gameId: state.gameId,
    actorSeatId,
    clientCommandId: `full-match-${commandNumber}`,
    expectedRevision: state.revision,
    ...(state.hand ? { handId: state.hand.id } : {}),
    ...fields
  };
}

function accept(state, events, type, actorSeatId, commandNumber, fields) {
  const result = executeCommand(
    state,
    input(state, type, actorSeatId, commandNumber, fields)
  );
  assert.equal(result.accepted, true, result.detail ?? result.reason);
  events.push(result.event);
  return result.state;
}

test("a complete thirteen-hand match converges through commands and ordered events", () => {
  const seed = "full-match-seed";
  const initial = createLobbyState({
    gameId: "full-match",
    hostSeatId: SEAT_ORDER[0],
    seats: SEAT_ORDER.map((seatId) => createSeat({
      seatId,
      playerId: `player-${seatId}`,
      displayName: seatId,
      ready: true
    }))
  });
  const events = [];
  let commandNumber = 1;
  let state = accept(
    initial,
    events,
    COMMAND_TYPE.START_GAME,
    SEAT_ORDER[0],
    commandNumber++,
    {
      initialDealerSeatId: initialDealerSeatIdFor(seed, SEAT_ORDER),
      shuffleSeed: seed
    }
  );

  for (const scheduled of HAND_SCHEDULE) {
    assert.equal(state.lifecycle, LIFECYCLE.IN_PROGRESS);
    assert.equal(state.hand.index, scheduled.index);
    assert.equal(state.hand.wildRank, scheduled.wildRank);
    assert.equal(state.hand.phase, PHASE.DEALER_INITIAL_DISCARD);

    const dealerSeatId = state.hand.dealerSeatId;
    state = accept(
      state,
      events,
      COMMAND_TYPE.DEALER_INITIAL_DISCARD,
      dealerSeatId,
      commandNumber++,
      { cardId: state.hand.handsBySeat[dealerSeatId][0] }
    );

    while (state.hand.stockCardIds.length > 0) {
      const actorSeatId = state.hand.activeSeatId;
      state = accept(
        state,
        events,
        COMMAND_TYPE.DRAW_STOCK,
        actorSeatId,
        commandNumber++
      );
      const drawnCardId = state.hand.drawnCardId;
      state = accept(
        state,
        events,
        COMMAND_TYPE.FINISH_TABLE_PLAY,
        actorSeatId,
        commandNumber++
      );
      state = accept(
        state,
        events,
        COMMAND_TYPE.DISCARD,
        actorSeatId,
        commandNumber++,
        { cardId: drawnCardId }
      );
    }

    assert.equal(state.hand.phase, PHASE.HAND_COMPLETE);
    assert.equal(state.hand.result.reason, "STOCK_EXHAUSTED");
    assert.equal(state.completedHands.length, scheduled.index);
    assertStateInvariants(state);

    if (scheduled.index < HAND_SCHEDULE.length) {
      for (const seatId of SEAT_ORDER) {
        state = accept(
          state,
          events,
          COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT,
          seatId,
          commandNumber++
        );
      }
    }
  }

  assert.equal(state.lifecycle, LIFECYCLE.COMPLETE);
  assert.equal(state.completedHands.length, HAND_SCHEDULE.length);
  assert.ok(state.winners.length >= 1);
  assertStateInvariants(state);
  assert.deepEqual(replayEvents(initial, events), state);
});

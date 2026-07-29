import assert from "node:assert/strict";
import test from "node:test";

import { CARD_IDS } from "../../src/engine/cards.js";
import { COMMAND_TYPE, PHASE } from "../../src/engine/constants.js";
import { createSeededDeck, initialDealerSeatIdFor } from "../../src/engine/deck.js";
import { assertStateInvariants, validateStateInvariants } from "../../src/engine/invariants.js";
import { replayEvents } from "../../src/engine/events.js";
import { publicView } from "../../src/engine/projections.js";
import { createLobbyState, createSeat } from "../../src/engine/state.js";
import { executeCommand } from "../../src/engine/commands.js";

const SEAT_ORDER = Object.freeze(["p0", "p1", "p2", "p3"]);

function lobby(seed) {
  return createLobbyState({
    gameId: `generated-${seed}`,
    hostSeatId: "p0",
    seats: SEAT_ORDER.map((seatId) => createSeat({
      seatId,
      playerId: `player-${seatId}`,
      displayName: seatId,
      ready: true
    }))
  });
}

function command(state, type, actorSeatId, clientCommandId, fields = {}) {
  return {
    type,
    gameId: state.gameId,
    actorSeatId,
    clientCommandId,
    expectedRevision: state.revision,
    ...(state.hand ? { handId: state.hand.id } : {}),
    ...fields
  };
}

function accepted(state, input) {
  const result = executeCommand(state, input);
  assert.equal(result.accepted, true, result.detail ?? result.reason);
  return result;
}

function allCardsInZones(hand) {
  return [
    ...hand.stockCardIds,
    ...hand.discardCardIds,
    ...Object.values(hand.handsBySeat).flat(),
    ...hand.melds.flatMap((meld) => meld.slots.map((slot) => slot.cardId))
  ];
}

test("fresh generated seeded games conserve the single pack through a complete ordinary turn", () => {
  for (let index = 0; index < 24; index += 1) {
    const seed = `fresh-${index}`;
    const initial = lobby(seed);
    const initialDealerSeatId = initialDealerSeatIdFor(seed, SEAT_ORDER);
    const start = accepted(initial, command(initial, COMMAND_TYPE.START_GAME, "p0", `start-${seed}`, {
      initialDealerSeatId,
      shuffleSeed: seed
    }));
    let state = start.state;
    assertStateInvariants(state);
    assert.equal(state.hand.phase, PHASE.DEALER_INITIAL_DISCARD);
    assert.equal(new Set(allCardsInZones(state.hand)).size, CARD_IDS.length);

    const dealerDiscard = accepted(state, command(state, COMMAND_TYPE.DEALER_INITIAL_DISCARD, initialDealerSeatId, `opening-${seed}`, {
      cardId: state.hand.handsBySeat[initialDealerSeatId][0]
    }));
    state = dealerDiscard.state;
    assertStateInvariants(state);
    assert.equal(state.hand.phase, PHASE.AWAITING_DRAW);

    const actorSeatId = state.hand.activeSeatId;
    const draw = accepted(state, command(state, COMMAND_TYPE.DRAW_STOCK, actorSeatId, `draw-${seed}`));
    state = draw.state;
    assertStateInvariants(state);
    assert.equal(state.hand.phase, PHASE.TABLE_PLAY);

    const discard = accepted(state, command(state, COMMAND_TYPE.DISCARD, actorSeatId, `discard-${seed}`, {
      cardId: state.hand.handsBySeat[actorSeatId][0]
    }));
    state = discard.state;
    const check = validateStateInvariants(state);
    assert.equal(check.ok, true, check.violations.join("; "));
    assert.equal(new Set(allCardsInZones(state.hand)).size, CARD_IDS.length);
    assert.equal(allCardsInZones(state.hand).length, CARD_IDS.length);

    const publicState = publicView(state);
    assert.equal(JSON.stringify(publicState).includes(state.hand.stockCardIds[0]), false);

    const replayed = replayEvents(initial, [
      start.event,
      dealerDiscard.event,
      draw.event,
      discard.event
    ]);
    assert.deepEqual(replayed, state);
  }
});

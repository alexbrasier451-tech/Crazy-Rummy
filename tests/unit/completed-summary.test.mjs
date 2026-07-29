import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMAND_TYPE,
  LIFECYCLE,
  executeCommand,
  playerView
} from "../../src/engine/index.js";
import {
  createCompletedMatchSummary,
  createCompletedSummaryStorage,
  validateCompletedMatchSummary
} from "../../src/local/completed-summary.js";
import {
  LOCAL_STORAGE_KEYS,
  createLocalGameSession,
  createMemoryStorage
} from "../../src/local/index.js";
import { createOnlineMatchSession } from "../../src/online/index.js";
import {
  createControlledTopologyNetwork,
  createStage6Bootstraps,
  createThreeSeatState
} from "../support/online-match-fixture.mjs";

function completeThreeSeatState() {
  let state = createThreeSeatState();
  let commandNumber = 0;
  const run = (type, actorSeatId, fields = {}) => {
    const result = executeCommand(state, {
      type,
      gameId: state.gameId,
      handId: state.hand?.id,
      actorSeatId,
      clientCommandId: `completed-summary-${++commandNumber}`,
      expectedRevision: state.revision,
      ...fields
    });
    assert.equal(result.accepted, true, result.detail ?? result.reason);
    state = result.state;
  };
  while (state.lifecycle !== LIFECYCLE.COMPLETE) {
    if (state.hand.phase === "DEALER_INITIAL_DISCARD") run(COMMAND_TYPE.DEALER_INITIAL_DISCARD, state.hand.dealerSeatId, { cardId: state.hand.handsBySeat[state.hand.dealerSeatId][0] });
    else if (state.hand.phase === "AWAITING_DRAW") run(COMMAND_TYPE.DRAW_STOCK, state.hand.activeSeatId);
    else if (state.hand.phase === "TABLE_PLAY") run(COMMAND_TYPE.FINISH_TABLE_PLAY, state.hand.activeSeatId);
    else if (state.hand.phase === "AWAITING_DISCARD") run(COMMAND_TYPE.DISCARD, state.hand.activeSeatId, { cardId: state.hand.drawnCardId });
    else if (state.hand.phase === "HAND_COMPLETE") {
      for (const seatId of state.seatOrder) {
        if (!state.hand.result.acknowledgedBySeatIds.includes(seatId)) run(COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT, seatId);
      }
    } else throw new Error(`Unexpected phase ${state.hand.phase}`);
  }
  return state;
}

test("completed summaries are public-only allowlists and malformed data fails closed", () => {
  const state = completeThreeSeatState();
  const view = playerView(state, "a");
  const summary = createCompletedMatchSummary(view);
  assert.equal(summary.mode, "LOCAL");
  assert.equal(summary.completedHands.length, 13);
  assert.equal(summary.seats.length, 3);
  const wire = JSON.stringify(summary);
  for (const cards of Object.values(state.hand.handsBySeat)) {
    for (const cardId of cards) assert.equal(wire.includes(cardId), false);
  }
  assert.equal(wire.includes("cardIds"), false);
  assert.equal(wire.includes("roomSecret"), false);
  assert.equal(wire.includes("seatSecret"), false);
  assert.equal(validateCompletedMatchSummary({ ...summary, summaryVersion: 99 }), null);
  assert.equal(validateCompletedMatchSummary({ ...summary, completedHands: summary.completedHands.slice(1) }), null);
});

test("versioned completed-summary storage ignores corrupt records", () => {
  const storage = createMemoryStorage();
  const summaries = createCompletedSummaryStorage({ storage, key: "summary-test" });
  storage.setItem("summary-test", "not json");
  assert.equal(summaries.read(), null);
  assert.equal(summaries.write({}), "Completed-match summary is invalid.");

  const summary = createCompletedMatchSummary(playerView(completeThreeSeatState(), "a"));
  assert.equal(summaries.write(summary), null);
  assert.deepEqual(summaries.read(), summary);
});

test("local completion stores a public-only summary and clearDeviceData removes its scoped records", () => {
  const storage = createMemoryStorage();
  const session = createLocalGameSession({ storage });
  session.setIdentity({ playerId: "local-player", displayName: "Local player" });
  session.runAutomatedMatch();
  const summary = session.getSnapshot().completedSummary;
  assert.equal(summary.completedHands.length, 13);
  assert.equal(JSON.stringify(summary).includes("cardIds"), false);
  assert.ok(storage.getItem(LOCAL_STORAGE_KEYS.completedSummary));

  session.reset();
  assert.equal(session.getSnapshot().completedSummary.completedHands.length, 13);
  assert.ok(storage.getItem(LOCAL_STORAGE_KEYS.completedSummary));

  session.clearDeviceData();
  assert.equal(storage.getItem(LOCAL_STORAGE_KEYS.completedSummary), null);
  assert.equal(storage.getItem(LOCAL_STORAGE_KEYS.identity), null);
  assert.equal(storage.getItem(LOCAL_STORAGE_KEYS.preferences), null);
  assert.equal(session.getSnapshot().completedSummary, null);
});

test("forfeit summaries retain only accepted public history and active standings", () => {
  let state = createThreeSeatState();
  for (const [index, seatId] of ["b", "c"].entries()) {
    const result = executeCommand(state, {
      type: COMMAND_TYPE.DROP_SEAT,
      gameId: state.gameId,
      handId: state.hand.id,
      actorSeatId: state.hostSeatId,
      seatId,
      clientCommandId: `completed-summary-drop-${index + 1}`,
      expectedRevision: state.revision,
      reason: "RECONNECT_EXPIRED"
    });
    assert.equal(result.accepted, true, result.detail ?? result.reason);
    state = result.state;
  }
  assert.equal(state.lifecycle, LIFECYCLE.COMPLETE);
  const summary = createCompletedMatchSummary(playerView(state, "a"));
  assert.equal(summary.completion.reason, "FORFEIT");
  assert.equal(summary.completion.duringHandIndex, 1);
  assert.deepEqual(summary.activeSeatOrder, ["a"]);
  assert.deepEqual(summary.winners, ["a"]);
  assert.equal(summary.completedHands.length, 0);
  assert.equal(JSON.stringify(summary).includes("deadHandCardIds"), false);
});

test("online terminal stores the public summary before removing private recovery", async () => {
  const state = completeThreeSeatState();
  const network = createControlledTopologyNetwork();
  const boot = createStage6Bootstraps({ matchId: state.gameId }).a;
  const writes = [];
  const removals = [];
  const operations = [];
  const session = createOnlineMatchSession({
    bootstrap: boot,
    playerId: "player-a",
    initialState: state,
    transport: network.endpoint("player-a"),
    recoveryStorage: { write() {}, writeComposition() {}, remove(matchId) { operations.push("recovery-remove"); removals.push(matchId); } },
    completedSummaryStorage: { write(summary) { operations.push("summary-write"); writes.push(summary); return null; } }
  });
  await session.start();
  assert.equal(writes.length, 1);
  assert.deepEqual(removals, [state.gameId]);
  assert.deepEqual(operations, ["summary-write", "recovery-remove"]);
  assert.equal(JSON.stringify(writes[0]).includes("roomSecret"), false);
  assert.equal(writes[0].mode, "ONLINE");
  assert.equal(session.getSnapshot().completedSummary.gameId, state.gameId);
  await session.dispose();
});

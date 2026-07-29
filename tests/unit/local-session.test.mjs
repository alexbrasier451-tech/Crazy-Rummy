import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMAND_TYPE,
  LIFECYCLE,
  LOCAL_STORAGE_KEYS,
  createLocalGameSession,
  createMemoryStorage
} from "../../src/local/index.js";

function parsed(storage, key) {
  return JSON.parse(storage.getItem(key)).value;
}

test("local sessions enrich commands, keep projections private, and expose accepted status", () => {
  const storage = createMemoryStorage();
  const session = createLocalGameSession({ storage });
  const initial = session.getSnapshot();
  assert.equal(initial.status.phase, "DEALER_INITIAL_DISCARD");
  assert.equal(initial.view.hand.ownHandCardIds.length, initial.localSeatId === initial.state.hand.dealerSeatId ? 8 : 7);
  assert.equal(initial.player, initial.view);
  assert.equal("handsBySeat" in initial.view.hand, false);
  assert.equal(JSON.stringify(initial.view).includes(initial.state.hand.handsBySeat.east[0]), false);

  const opening = session.execute(COMMAND_TYPE.DEALER_INITIAL_DISCARD, {
    cardId: initial.state.hand.handsBySeat[initial.state.hand.dealerSeatId][0],
    actorSeatId: initial.state.hand.dealerSeatId
  });
  assert.equal(opening.accepted, true, opening.detail ?? opening.reason);
  assert.equal(opening.state.revision, 2);
  assert.equal(session.getSnapshot().status.lastCommand.accepted, true);

  session.setLocalSeat("east");
  const east = session.getSnapshot();
  assert.equal(east.localSeatId, "east");
  assert.deepEqual(east.view.hand.ownHandCardIds, east.state.hand.handsBySeat.east);
  assert.equal(JSON.stringify(east.view).includes(east.state.hand.handsBySeat.south[0]), false);
});

test("accepted authority persists by revision and restores without replaying an accepted command", () => {
  const storage = createMemoryStorage();
  const first = createLocalGameSession({ storage });
  const before = first.getSnapshot();
  const command = {
    type: COMMAND_TYPE.DEALER_INITIAL_DISCARD,
    actorSeatId: before.state.hand.dealerSeatId,
    cardId: before.state.hand.handsBySeat[before.state.hand.dealerSeatId][0],
    clientCommandId: "opening-once"
  };
  assert.equal(first.execute(command).accepted, true);
  const persisted = parsed(storage, LOCAL_STORAGE_KEYS.session);
  assert.equal(persisted.revision, 2);

  const reloaded = createLocalGameSession({ storage });
  assert.equal(reloaded.getSnapshot().state.revision, 2);
  assert.equal(reloaded.getSnapshot().status.phase, "AWAITING_DRAW");
  assert.equal(reloaded.execute(command).accepted, false);
  assert.equal(reloaded.getSnapshot().state.revision, 2);
});

test("refresh restores every local turn phase at its accepted revision without applying a command twice", () => {
  const storage = createMemoryStorage();
  let session = createLocalGameSession({ storage });
  let commandNumber = 0;
  const command = (type, actorSeatId, fields = {}) => ({
    type,
    gameId: session.getSnapshot().state.gameId,
    handId: session.getSnapshot().state.hand?.id,
    actorSeatId,
    clientCommandId: `phase-${++commandNumber}`,
    expectedRevision: session.getSnapshot().state.revision,
    ...fields
  });
  const restore = (phase, acceptedCommand) => {
    const before = session.getSnapshot();
    assert.equal(before.status.phase, phase);
    const reloaded = createLocalGameSession({ storage });
    assert.equal(reloaded.getSnapshot().status.phase, phase);
    assert.equal(reloaded.getSnapshot().state.revision, before.state.revision);
    assert.equal(reloaded.getSnapshot().state.hand.id, before.state.hand.id);
    const duplicate = reloaded.execute(acceptedCommand);
    assert.equal(duplicate.accepted, true);
    assert.equal(duplicate.duplicate, true);
    assert.equal(reloaded.getSnapshot().state.revision, before.state.revision);
    session = reloaded;
  };

  const start = {
    type: COMMAND_TYPE.START_GAME,
    gameId: session.getSnapshot().state.gameId,
    actorSeatId: session.getSnapshot().state.hostSeatId,
    clientCommandId: "local-fixture-start",
    expectedRevision: 0,
    initialDealerSeatId: session.getSnapshot().state.initialDealerSeatId,
    shuffleSeed: session.getSnapshot().state.shuffleSeed
  };
  restore("DEALER_INITIAL_DISCARD", start);

  let state = session.getSnapshot().state;
  const opening = command(COMMAND_TYPE.DEALER_INITIAL_DISCARD, state.hand.dealerSeatId, {
    cardId: state.hand.handsBySeat[state.hand.dealerSeatId][0]
  });
  assert.equal(session.execute(opening).accepted, true);
  restore("AWAITING_DRAW", opening);

  state = session.getSnapshot().state;
  const draw = command(COMMAND_TYPE.DRAW_STOCK, state.hand.activeSeatId);
  assert.equal(session.execute(draw).accepted, true);
  restore("TABLE_PLAY", draw);

  state = session.getSnapshot().state;
  const finish = command(COMMAND_TYPE.FINISH_TABLE_PLAY, state.hand.activeSeatId);
  assert.equal(session.execute(finish).accepted, true);
  restore("AWAITING_DISCARD", finish);

  let finalDiscard = null;
  while (session.getSnapshot().state.hand.phase !== "HAND_COMPLETE") {
    state = session.getSnapshot().state;
    if (state.hand.phase === "AWAITING_DISCARD") {
      finalDiscard = command(COMMAND_TYPE.DISCARD, state.hand.activeSeatId, { cardId: state.hand.drawnCardId });
      assert.equal(session.execute(finalDiscard).accepted, true);
    } else if (state.hand.phase === "AWAITING_DRAW") {
      const nextDraw = command(COMMAND_TYPE.DRAW_STOCK, state.hand.activeSeatId);
      assert.equal(session.execute(nextDraw).accepted, true);
    } else if (state.hand.phase === "TABLE_PLAY") {
      const nextFinish = command(COMMAND_TYPE.FINISH_TABLE_PLAY, state.hand.activeSeatId);
      assert.equal(session.execute(nextFinish).accepted, true);
    }
  }
  restore("HAND_COMPLETE", finalDiscard);
});

test("corrupt or incompatible persisted authority fails closed to a deterministic fixture", () => {
  const storage = createMemoryStorage({
    [LOCAL_STORAGE_KEYS.session]: "not-json",
    [LOCAL_STORAGE_KEYS.localSeat]: JSON.stringify({ version: 1, value: "south" })
  });
  const session = createLocalGameSession({ storage });
  assert.equal(session.getSnapshot().state.revision, 1);
  assert.equal(session.getSnapshot().localSeatId, "south");

  storage.setItem(LOCAL_STORAGE_KEYS.session, JSON.stringify({ version: 99, value: {} }));
  const recovered = createLocalGameSession({ storage });
  assert.equal(recovered.getSnapshot().state.revision, 1);
  assert.equal(recovered.getSnapshot().state.lifecycle, LIFECYCLE.IN_PROGRESS);
});

test("identity, preferences, and a completed-match summary survive local storage", () => {
  const storage = createMemoryStorage();
  const session = createLocalGameSession({ storage });
  session.setIdentity({ playerId: "alex", displayName: "Alex" });
  session.setPreferences({ reducedMotion: true, theme: "night" });
  const complete = session.runAutomatedMatch();
  assert.equal(complete.status.lifecycle, LIFECYCLE.COMPLETE);
  assert.equal(parsed(storage, LOCAL_STORAGE_KEYS.identity).displayName, "Alex");
  assert.equal(parsed(storage, LOCAL_STORAGE_KEYS.preferences).reducedMotion, true);
  assert.equal(parsed(storage, LOCAL_STORAGE_KEYS.completedSummary).completedHands.length, 13);

  const reloaded = createLocalGameSession({ storage });
  assert.deepEqual(reloaded.getSnapshot().identity, { playerId: "alex", displayName: "Alex" });
  assert.deepEqual(reloaded.getSnapshot().preferences, { reducedMotion: true, theme: "night" });
  assert.equal(reloaded.getSnapshot().completedSummary.completedHands.length, 13);
});

test("accepted-command automation traverses all thirteen hands through the engine", () => {
  const session = createLocalGameSession({ storage: createMemoryStorage() });
  const final = session.runAutomatedMatch();
  assert.equal(final.state.lifecycle, LIFECYCLE.COMPLETE);
  assert.equal(final.state.completedHands.length, 13);
  assert.ok(final.state.winners.length >= 1);
  assert.ok(final.state.revision > 13);
});

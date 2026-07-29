import assert from "node:assert/strict";
import test from "node:test";

import * as engine from "../../src/engine/index.js";

test("the Phase 2 engine barrel exposes the stable deterministic API", () => {
  for (const name of [
    "CARD_IDS",
    "COMMAND_TYPE",
    "EVENT_TYPE",
    "HAND_SCHEDULE",
    "PHASE",
    "REJECTION",
    "SCHEMA_VERSION",
    "applyCommand",
    "assertStateInvariants",
    "createLobbyState",
    "createSeededDeck",
    "executeCommand",
    "migrateSnapshot",
    "playerView",
    "projectEvent",
    "publicView",
    "reduceEvent",
    "replayEvents",
    "scoreHand",
    "snapshotFor",
    "validateMeld",
    "validateWildReplacement"
  ]) {
    assert.ok(Object.hasOwn(engine, name), `missing engine export ${name}`);
  }
  assert.equal(engine.CARD_IDS.length, 52);
  assert.equal(engine.HAND_SCHEDULE.length, 13);
});

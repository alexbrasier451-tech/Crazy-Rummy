import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_RULES, HAND_SCHEDULE } from "../../src/engine/index.js";
import {
  completedSummaryReference,
  normalizeSettingsPreferences,
  playerStatisticsReference,
  rulesReference
} from "../../src/screens/reference.js";

test("rules reference covers the full fixed wild schedule and essential contract topics", () => {
  const reference = rulesReference({ ...DEFAULT_RULES, rulesVersion: "table-rules-v2" });
  assert.equal(reference.version, "table-rules-v2");
  assert.deepEqual(reference.schedule, HAND_SCHEDULE);
  const text = reference.sections.flat().join(" ").toLowerCase();
  for (const required of ["table additions", "replacement", "going out", "stock exhaustion", "final ties", "13 hands"]) {
    assert.match(text, new RegExp(required));
  }
});

test("settings presents the latest public completed summary without private history", () => {
  const presented = completedSummaryReference({
    seats: [
      { seatId: "a", displayName: "Alex", cumulativeScore: 42, status: "ACTIVE" },
      { seatId: "b", displayName: "Blair", cumulativeScore: 61, status: "ACTIVE" }
    ],
    activeSeatOrder: ["a", "b"],
    winners: ["a"],
    completedHands: [{ index: 1 }],
    completion: null,
    roomSecret: "must-not-appear"
  });
  assert.deepEqual(presented, {
    outcome: "Alex won.",
    handCount: 1,
    standings: [
      { name: "Alex", total: 42, winner: true },
      { name: "Blair", total: 61, winner: false }
    ]
  });
  assert.equal(JSON.stringify(presented).includes("must-not-appear"), false);
});

test("settings reduces stored statistics to a compact player record", () => {
  assert.deepEqual(playerStatisticsReference({
    matchesRecorded: 5,
    matchesFinished: 4,
    matchesEndedEarly: 1,
    matchWins: 2,
    forfeitWins: 1,
    handsWon: 17,
    bestFinalTotal: 83,
    appliedEventIds: ["must-not-appear"]
  }), {
    matchesRecorded: 5,
    wins: 3,
    winRate: 60,
    handsWon: 17,
    bestFinalTotal: 83,
    matchesFinished: 4,
    matchesEndedEarly: 1
  });
  assert.equal(playerStatisticsReference({ matchesRecorded: 0 }), null);
});

test("settings normalization preserves declared preferences and disables unavailable haptics", () => {
  const values = new Map([
    ["settings-seat-marker", "▲"],
    ["card-size", "Large"],
    ["hand-sort", "Suit"],
    ["motion", "Reduced"],
    ["confirm-discard", "Quick confirm"],
    ["high-contrast", "on"],
    ["auto-refresh", "on"],
    ["haptics", "on"]
  ]);
  const unavailable = normalizeSettingsPreferences(values, { unrelated: "kept" });
  assert.deepEqual(unavailable, {
    unrelated: "kept",
    marker: "▲",
    cardSize: "Large",
    handSort: "Suit",
    motion: "Reduced",
    confirmDiscard: "Quick confirm",
    highContrast: true,
    autoRefresh: true,
    haptics: false
  });
  assert.equal(normalizeSettingsPreferences(values, {}, { hapticsAvailable: true }).haptics, true);
});

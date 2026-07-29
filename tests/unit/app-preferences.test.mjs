import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PREFERENCES,
  applyPreferencesToRoot,
  normalizePreferences
} from "../../src/app/preferences.js";

test("device preferences normalize to conservative Stage 7 defaults", () => {
  assert.deepEqual(normalizePreferences(), DEFAULT_PREFERENCES);
  assert.deepEqual(normalizePreferences({
    cardSize: "Huge",
    handSort: "random",
    motion: "Full",
    confirmDiscard: "Never",
    highContrast: "yes",
    autoRefresh: 0,
    haptics: "on"
  }), DEFAULT_PREFERENCES);
});

test("device preferences apply only supported root presentation attributes", () => {
  const root = { dataset: {} };
  const preferences = applyPreferencesToRoot({
    cardSize: "Large",
    handSort: "rank",
    motion: "Reduced",
    confirmDiscard: "Quick confirm",
    highContrast: true,
    autoRefresh: false,
    haptics: true
  }, root);

  assert.equal(preferences.handSort, "rank");
  assert.deepEqual(root.dataset, {
    cardSize: "large",
    motion: "reduced",
    contrast: "high",
    haptics: "on"
  });
});


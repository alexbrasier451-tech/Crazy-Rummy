import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [resultsSource, referenceSource, stylesheet] = await Promise.all([
  readFile(new URL("../../src/screens/results.js", import.meta.url), "utf8"),
  readFile(new URL("../../src/screens/reference.js", import.meta.url), "utf8"),
  readFile(new URL("../../src/styles/v11-results-reference.css", import.meta.url), "utf8")
]);

test("Stage 1.1.5 assigns distinct authored compositions without weakening result truth", () => {
  for (const hook of [
    "result-score-ticket",
    "result-private-ticket",
    "result-terminus-standings",
    "result-unavailable-ticket",
    "dataset.resultState"
  ]) {
    assert.match(resultsSource, new RegExp(hook.replace(".", "\\.")));
  }
  assert.match(resultsSource, /No standings have been invented/);
  assert.match(resultsSource, /excludes private card history and match credentials/);
  assert.match(stylesheet, /\[data-screen="final-result"\]\[data-result-state="forfeit"\]/);
});

test("Stage 1.1.5 preserves native settings controls and focusable rules destinations", () => {
  for (const hook of [
    "rules-timetable",
    "rules-entry",
    "settings-ticket--seat",
    "settings-ticket--comfort",
    "settings-install-ticket--offline",
    "settings-danger-ticket"
  ]) {
    assert.match(referenceSource, new RegExp(hook));
  }
  assert.match(referenceSource, /destination\?\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(stylesheet, /appearance\s*:/);
  assert.match(stylesheet, /@media \(forced-colors: active\)/);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/);
});

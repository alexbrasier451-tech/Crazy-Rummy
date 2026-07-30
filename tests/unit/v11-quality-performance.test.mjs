import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPresentationQuality,
  presentationQuality
} from "../../src/app/quality.js";
import {
  V11_BUDGETS,
  classifyV11Budget
} from "../../tools/report-v11-budgets.mjs";

test("data-saving requests select the deterministic degraded presentation", () => {
  assert.equal(presentationQuality({
    navigatorLike: { connection: { saveData: true } },
    matchMediaLike: () => ({ matches: false })
  }), "degraded");
  assert.equal(presentationQuality({
    navigatorLike: {},
    matchMediaLike: () => ({ matches: true })
  }), "degraded");
  assert.equal(presentationQuality({
    navigatorLike: { connection: { saveData: false } },
    matchMediaLike: () => ({ matches: false })
  }), "full");

  const root = { dataset: {} };
  assert.equal(applyPresentationQuality({ explicit: "degraded" }, root), "degraded");
  assert.equal(root.dataset.quality, "degraded");
});

test("budget classification measures compressed transfer and decoded decorative weight", () => {
  const report = classifyV11Budget([
    { path: "index.html", bytes: 1_000, brotliBytes: 400 },
    { path: "assets/index-a.css", bytes: 40_000, brotliBytes: 8_000 },
    { path: "assets/index-b.js", bytes: 300_000, brotliBytes: 90_000 },
    { path: "assets/cards/card-back.v1.svg", bytes: 1_400, brotliBytes: 600 },
    { path: "icons/app.v1.svg", bytes: 700, brotliBytes: 300 }
  ]);
  assert.equal(report.passed, true);
  assert.equal(report.criticalFirstPaint.brotliBytes, 98_400);
  assert.equal(report.initialShell.brotliBytes, 99_300);
  assert.equal(report.largestDecorative.path, "assets/cards/card-back.v1.svg");
  assert.equal(report.largestDecorative.limit, V11_BUDGETS.singleDecorativeAssetBytes);
});

test("an oversized decorative asset fails the v1.1 release budget", () => {
  const report = classifyV11Budget([
    {
      path: "assets/art/oversized.v1.png",
      bytes: V11_BUDGETS.singleDecorativeAssetBytes + 1,
      brotliBytes: 1_000
    }
  ]);
  assert.equal(report.passed, false);
});

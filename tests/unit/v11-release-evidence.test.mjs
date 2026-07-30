import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  V11_HIGH_RISK_MATRIX,
  V11_ROUTE_STATES,
  V11_VISUAL_MATRIX,
  V11_VISUAL_VIEWPORTS
} from "../browser/v11-visual-matrix.mjs";

const harnessPath = new URL("../browser/v11-visual-matrix.mjs", import.meta.url);

test("visual evidence matrix covers every route at compact, baseline, and tablet sizes", () => {
  assert.deepEqual(
    V11_VISUAL_VIEWPORTS.map(({ width, height }) => `${width}x${height}`),
    ["320x568", "390x844", "768x900"]
  );
  assert.deepEqual(
    V11_ROUTE_STATES.map(({ route }) => route),
    [
      "/",
      "/identity",
      "/lobby",
      "/waiting-room",
      "/game",
      "/hand-result",
      "/final-result",
      "/rules",
      "/settings"
    ]
  );
  assert.equal(
    V11_VISUAL_MATRIX.length,
    V11_VISUAL_VIEWPORTS.length * V11_ROUTE_STATES.length
  );
  for (const viewport of V11_VISUAL_VIEWPORTS) {
    assert.equal(
      V11_VISUAL_MATRIX.filter(({ width, height }) =>
        width === viewport.width && height === viewport.height
      ).length,
      V11_ROUTE_STATES.length
    );
  }
});

test("high-risk matrix includes reduced motion, forced colours, and a compact decision sheet", () => {
  assert.equal(
    V11_HIGH_RISK_MATRIX.some(({ reducedMotion }) => reducedMotion === "reduce"),
    true
  );
  assert.equal(
    V11_HIGH_RISK_MATRIX.some(({ forcedColors }) => forcedColors === "active"),
    true
  );
  assert.equal(
    V11_HIGH_RISK_MATRIX.some(({ prepare, width, height }) =>
      prepare === "decision-sheet" && width === 320 && height === 568
    ),
    true
  );
});

test("release harness is write-bounded, privacy-aware, and cannot self-approve a baseline", async () => {
  const source = await readFile(harnessPath, "utf8");

  assert.match(source, /--out <fresh-output-directory>/);
  assert.match(source, /Refusing to update an approved or baseline directory/);
  assert.match(source, /baselineUpdate:\s*false/);
  assert.match(source, /automatedEvidenceOnly:\s*true/);
  assert.match(source, /No human art-direction or owner approval is implied/);
  assert.match(source, /No physical-device/);
  assert.match(source, /legacy raster splash must not load/);
  assert.match(source, /visual evidence must use local runtime assets only/);
  assert.match(source, /has an undersized primary\/card target/);
  assert.match(source, /overflows horizontally/);
  assert.match(source, /pendingOpening\(\)/);
  assert.match(source, /authorityPhase:\s*"pending"/);
  assert.match(source, /authorityPhase:\s*"accepted"/);
  assert.match(source, /only seat B view is visible/);
  assert.doesNotMatch(source, /pixelmatch|toHaveScreenshot|updateSnapshots/);
});


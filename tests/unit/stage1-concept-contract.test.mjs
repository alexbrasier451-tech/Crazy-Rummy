import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  CONCEPTS,
  FIXTURE,
  NETWORK_BY_STATE
} from "../../spikes/v1.1-stage-1/fixtures.js";

const root = path.resolve(import.meta.dirname, "../..");

test("Stage 1.1.1 freezes three material concepts around one privacy-safe fixture", () => {
  assert.deepEqual(Object.keys(CONCEPTS), ["a", "b", "c"]);
  assert.deepEqual(
    Object.values(CONCEPTS).map(({ name }) => name),
    ["Night Timetable", "Compartment Table", "Route Atlas"]
  );
  assert.equal(FIXTURE.id, "v111-busy-six");
  assert.equal(FIXTURE.revision, "locally-derived-uncommitted");
  assert.match(FIXTURE.sourceStatus, /NOT signed beta baseline/);
  assert.equal(FIXTURE.playerCount, 6);
  assert.equal(FIXTURE.seats.length, 6);
  assert.equal(FIXTURE.seats.filter(({ local }) => local).length, 1);
  assert.equal(FIXTURE.localSeatId, "p1");
  assert.equal(FIXTURE.localHand.length, 8);
  assert.equal(FIXTURE.publicMelds.length, 1);
  assert.equal(FIXTURE.game.stockCount, 3);
  assert.equal(FIXTURE.game.discard, "Q♠");
  assert.equal(NETWORK_BY_STATE.offline.tone, "offline");
});

test("Stage 1 source is isolated from production and contains no external runtime dependency", async () => {
  const [board, concepts, styles, appEntry, packageJson] = await Promise.all([
    readFile(path.join(root, "spikes/v1.1-stage-1/concept-board.js"), "utf8"),
    readFile(path.join(root, "spikes/v1.1-stage-1/concepts.js"), "utf8"),
    readFile(path.join(root, "spikes/v1.1-stage-1/concept-board.css"), "utf8"),
    readFile(path.join(root, "src/main.js"), "utf8"),
    readFile(path.join(root, "package.json"), "utf8").then(JSON.parse)
  ]);

  const conceptSource = `${board}\n${concepts}\n${styles}`;
  assert.doesNotMatch(conceptSource, /https?:\/\//);
  assert.doesNotMatch(conceptSource, /(?:roomSecret|seatSecret|inviteCode|shuffleSeed|iceServers)/);
  assert.doesNotMatch(appEntry, /v1\.1-stage-1/);
  assert.equal(packageJson.scripts["test:stage1-concepts"], "node tests/browser/stage1-concepts.mjs");
  assert.equal(
    packageJson.scripts["capture:stage1-keyframes"],
    "node tests/browser/capture-stage1-keyframes.mjs --out docs/v1.1/stage-1.1.1/exports"
  );
});

test("Stage 1 decision evidence records owner approval while keeping immutable reconciliation explicit", async () => {
  const [overview, decision, baseline, fixture, assetRegister] = await Promise.all([
    readFile(path.join(root, "docs/v1.1/stage-1.1.1/README.md"), "utf8"),
    readFile(path.join(root, "docs/v1.1/stage-1.1.1/CONCEPT_DECISION.md"), "utf8"),
    readFile(path.join(root, "docs/v1.1/stage-1.1.1/AUTHORITY_AND_BASELINE.md"), "utf8"),
    readFile(path.join(root, "docs/v1.1/stage-1.1.1/FIXTURE_CONTRACT.md"), "utf8"),
    readFile(path.join(root, "docs/v1.1/stage-1.1.1/ASSET_REGISTER.md"), "utf8")
  ]);

  assert.match(overview, /owner-approved/i);
  assert.match(decision, /Concept B — Compartment Table/);
  assert.match(decision, /Owner-approved/);
  assert.match(baseline, /no commits exist/i);
  assert.match(baseline, /production UI implementation: \*\*not authorised/i);
  assert.match(fixture, /No opponent card identity/);
  assert.match(assetRegister, /No generated raster image was needed/);
});

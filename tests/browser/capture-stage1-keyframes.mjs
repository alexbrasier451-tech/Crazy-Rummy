import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

import { startTestServer } from "./test-server.mjs";

export const STAGE1_CAPTURE_MATRIX = Object.freeze([
  { filename: "lobby-a-night-timetable-390x844.png", concept: "a", screen: "lobby", state: "healthy", width: 390, height: 844, motion: "full", colour: "normal" },
  { filename: "lobby-b-compartment-table-390x844.png", concept: "b", screen: "lobby", state: "healthy", width: 390, height: 844, motion: "full", colour: "normal", recommended: true },
  { filename: "lobby-c-route-atlas-390x844.png", concept: "c", screen: "lobby", state: "healthy", width: 390, height: 844, motion: "full", colour: "normal" },
  { filename: "game-a-night-timetable-390x844.png", concept: "a", screen: "game", state: "busy-six", width: 390, height: 844, motion: "full", colour: "normal" },
  { filename: "game-b-compartment-table-390x844.png", concept: "b", screen: "game", state: "busy-six", width: 390, height: 844, motion: "full", colour: "normal", recommended: true },
  { filename: "game-c-route-atlas-390x844.png", concept: "c", screen: "game", state: "busy-six", width: 390, height: 844, motion: "full", colour: "normal" },
  { filename: "lobby-b-compartment-table-offline-390x844.png", concept: "b", screen: "lobby", state: "offline", width: 390, height: 844, motion: "full", colour: "normal", recommended: true },
  { filename: "game-b-compartment-table-compact-320x568.png", concept: "b", screen: "game", state: "busy-six", width: 320, height: 568, motion: "full", colour: "normal", recommended: true },
  { filename: "game-b-compartment-table-tablet-768x900.png", concept: "b", screen: "game", state: "busy-six", width: 768, height: 900, motion: "full", colour: "normal", recommended: true },
  { filename: "game-b-compartment-table-reduced-motion-390x844.png", concept: "b", screen: "game", state: "busy-six", width: 390, height: 844, motion: "reduced", colour: "normal", recommended: true },
  { filename: "game-b-compartment-table-forced-colours-390x844.png", concept: "b", screen: "game", state: "busy-six", width: 390, height: 844, motion: "full", colour: "forced", recommended: true }
]);

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function captureUrl(origin, entry) {
  const params = new URLSearchParams({
    concept: entry.concept,
    screen: entry.screen,
    state: entry.state,
    motion: entry.motion,
    colour: entry.colour,
    capture: "keyframe"
  });
  return `${origin}/spikes/v1.1-stage-1/index.html?${params}`;
}

async function removeExpectedOutputs(outDirectory) {
  for (const { filename } of STAGE1_CAPTURE_MATRIX) {
    await unlink(path.join(outDirectory, filename)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

export async function captureStage1Keyframes(outDirectory) {
  const root = path.resolve(import.meta.dirname, "../..");
  const resolvedOut = path.resolve(outDirectory);
  if (resolvedOut === root || resolvedOut === path.parse(resolvedOut).root) {
    throw new Error("Refusing to use a repository or filesystem root as the keyframe output directory.");
  }

  await mkdir(resolvedOut, { recursive: true });
  await removeExpectedOutputs(resolvedOut);

  const testServer = await startTestServer({ root });
  const browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();
  const entries = [];

  try {
    for (const capture of STAGE1_CAPTURE_MATRIX) {
      const context = await browser.newContext({
        viewport: { width: capture.width, height: capture.height },
        deviceScaleFactor: 1,
        hasTouch: capture.width <= 430,
        reducedMotion: capture.motion === "reduced" ? "reduce" : "no-preference",
        forcedColors: capture.colour === "forced" ? "active" : "none",
        serviceWorkers: "block"
      });
      const page = await context.newPage();
      await page.goto(captureUrl(testServer.origin, capture), {
        waitUntil: "domcontentloaded"
      });
      await page.waitForFunction(() => Boolean(globalThis.__stage1Board));
      await page.screenshot({
        path: path.join(resolvedOut, capture.filename),
        animations: "disabled",
        fullPage: false
      });
      await context.close();

      const metadata = await stat(path.join(resolvedOut, capture.filename));
      entries.push({
        ...capture,
        route: capture.screen === "game" ? "/game" : "/lobby",
        fixtureId: "v111-busy-six",
        sourceRevision: "UNCOMMITTED",
        sourceStatus: "Locally derived uncommitted beta snapshot; not a signed immutable beta baseline.",
        browser: `Chromium ${browserVersion}`,
        deviceScaleFactor: 1,
        bytes: metadata.size
      });
    }
  } finally {
    await browser.close();
    await testServer.close();
  }

  const manifest = {
    schemaVersion: 1,
    stage: "v1.1 Stage 1.1.1",
    generatedDate: "2026-07-30",
    generator: "tests/browser/capture-stage1-keyframes.mjs",
    conceptOnly: true,
    ownerDirectionApproval: "approved",
    ownerDirectionApprovalDate: "2026-07-30",
    ownerDirectionApprovalRecord: "Project-owner statement in the controlling Codex task",
    recommendedConcept: "b-compartment-table",
    approvedConcept: "b-compartment-table",
    betaApplicationVersion: "1.0.0",
    sourceRevision: "UNCOMMITTED",
    sourceStatus: "Locally derived uncommitted beta snapshot; not a signed immutable beta baseline.",
    evidenceLimits: "Still concept representations; not production interaction, accessibility, motion, device, or release evidence.",
    entries
  };
  const manifestPath = path.resolve(resolvedOut, "..", "KEYFRAME_MANIFEST.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, manifestPath, outDirectory: resolvedOut };
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const out = argumentValue("--out");
  if (!out) throw new Error("Usage: node tests/browser/capture-stage1-keyframes.mjs --out <directory>");
  const result = await captureStage1Keyframes(out);
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  console.log(`Captured ${manifest.entries.length} Stage 1.1.1 keyframes in ${result.outDirectory}`);
}

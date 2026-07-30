import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

import {
  captureStage1Keyframes,
  STAGE1_CAPTURE_MATRIX
} from "./capture-stage1-keyframes.mjs";
import { startTestServer } from "./test-server.mjs";

const root = path.resolve(import.meta.dirname, "../..");

function boardUrl(origin, entry) {
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

function pngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  assert.equal(buffer.subarray(0, 8).toString("hex"), signature);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

const testServer = await startTestServer({ root });
const browser = await chromium.launch({ headless: true });

try {
  for (const concept of ["a", "b", "c"]) {
    for (const screen of ["lobby", "game"]) {
      const entry = {
        concept,
        screen,
        state: screen === "game" ? "busy-six" : "healthy",
        motion: "full",
        colour: "normal",
        width: 390,
        height: 844
      };
      const context = await browser.newContext({
        viewport: { width: entry.width, height: entry.height },
        deviceScaleFactor: 1,
        serviceWorkers: "block"
      });
      const page = await context.newPage();
      await page.goto(boardUrl(testServer.origin, entry), {
        waitUntil: "domcontentloaded"
      });
      await page.waitForFunction(() => Boolean(globalThis.__stage1Board));

      assert.equal(await page.locator("[data-stage1-fixture-plate=true]").count(), 1);
      assert.match(await page.locator("[data-stage1-fixture-plate=true]").innerText(), /NOT signed beta baseline/i);
      if (concept === "b") {
        assert.match(
          await page.locator("[data-stage1-fixture-plate=true]").innerText(),
          /OWNER-APPROVED DIRECTION/i
        );
      } else {
        assert.match(
          await page.locator("[data-stage1-fixture-plate=true]").innerText(),
          /NON-SELECTED ALTERNATIVE/i
        );
      }
      assert.equal(await page.locator("#stage-one-board").getAttribute("data-concept"), concept);
      assert.equal(await page.locator("[data-board-screen]").getAttribute("data-board-screen"), screen);

      const dimensions = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
        viewportHeight: document.documentElement.clientHeight,
        pageHeight: document.documentElement.scrollHeight
      }));
      assert.ok(
        dimensions.pageWidth <= dimensions.viewportWidth,
        `${concept}/${screen} must not overflow horizontally`
      );
      assert.ok(
        dimensions.pageHeight <= dimensions.viewportHeight,
        `${concept}/${screen} keyframe mode must stay inside the capture viewport`
      );
      const sceneGeometry = await page.locator(".concept-layout").evaluate((node) => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight
      }));
      assert.ok(
        sceneGeometry.scrollHeight <= sceneGeometry.clientHeight,
        `${concept}/${screen} keyframe content must fit without a hidden scroll position: ${sceneGeometry.scrollHeight}px > ${sceneGeometry.clientHeight}px`
      );

      if (screen === "game") {
        assert.equal(await page.locator("[data-seat-id]").count(), 6);
        assert.equal(await page.locator("[data-local=true]").count(), 1);
        assert.equal(await page.locator("[data-private-hand] .concept-card").count(), 8);
        assert.match(
          await page.locator("[data-public-stock]").getAttribute("aria-label"),
          /stock, 3 cards/i
        );
        assert.match(
          await page.locator("[data-public-discard]").getAttribute("aria-label"),
          /Queen of spades/i
        );
        assert.doesNotMatch(await page.locator("body").innerText(), /(?:room secret|seat secret|invite code|shuffle seed|ice server)/i);
      } else {
        assert.equal(await page.locator(".lobby-table").count(), 1);
      }
      await context.close();
    }
  }

  const offlineContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    serviceWorkers: "block"
  });
  const offlinePage = await offlineContext.newPage();
  await offlinePage.goto(boardUrl(testServer.origin, {
    concept: "b",
    screen: "lobby",
    state: "offline",
    motion: "full",
    colour: "normal"
  }), { waitUntil: "domcontentloaded" });
  await offlinePage.waitForFunction(() => Boolean(globalThis.__stage1Board));
  assert.equal(await offlinePage.locator(".lobby-table").count(), 0);
  assert.match(await offlinePage.locator("[data-network-status=offline]").innerText(), /Offline/);
  assert.equal(
    await offlinePage.getByRole("button", { name: "Create a table" }).isDisabled(),
    true
  );
  assert.equal(
    await offlinePage.getByRole("button", { name: "Join with a code" }).isDisabled(),
    true
  );
  await offlineContext.close();

  for (const entry of STAGE1_CAPTURE_MATRIX.filter(({ concept }) => concept === "b")) {
    const context = await browser.newContext({
      viewport: { width: entry.width, height: entry.height },
      deviceScaleFactor: 1,
      reducedMotion: entry.motion === "reduced" ? "reduce" : "no-preference",
      forcedColors: entry.colour === "forced" ? "active" : "none",
      serviceWorkers: "block"
    });
    const page = await context.newPage();
    await page.goto(boardUrl(testServer.origin, entry), {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(() => Boolean(globalThis.__stage1Board));
    assert.equal(await page.locator("#stage-one-board").getAttribute("data-motion"), entry.motion);
    assert.equal(await page.locator("#stage-one-board").getAttribute("data-colour"), entry.colour);
    const smallestTarget = await page.locator("button").evaluateAll((buttons) =>
      Math.min(...buttons.map((button) => {
        const bounds = button.getBoundingClientRect();
        return Math.min(bounds.width, bounds.height);
      }))
    );
    assert.ok(smallestTarget >= 44, `interactive targets must remain at least 44px; got ${smallestTarget}`);
    await context.close();
  }
} finally {
  await browser.close();
  await testServer.close();
}

const captureRoot = await mkdtemp(path.join(tmpdir(), "crazy-rummy-stage1-"));
try {
  const outDirectory = path.join(captureRoot, "exports");
  const { manifest, manifestPath } = await captureStage1Keyframes(outDirectory);
  assert.equal(manifest.entries.length, STAGE1_CAPTURE_MATRIX.length);
  assert.equal(manifest.sourceRevision, "UNCOMMITTED");
  assert.equal(manifest.ownerDirectionApproval, "approved");
  assert.equal(manifest.approvedConcept, "b-compartment-table");
  assert.equal(manifest.betaApplicationVersion, "1.0.0");
  assert.equal(
    manifest.entries.filter(({ recommended }) => recommended).length,
    7
  );
  for (const entry of manifest.entries) {
    const dimensions = pngDimensions(
      await readFile(path.join(outDirectory, entry.filename))
    );
    assert.deepEqual(dimensions, {
      width: entry.width,
      height: entry.height
    });
  }
  const persistedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(persistedManifest.entries.length, STAGE1_CAPTURE_MATRIX.length);
} finally {
  await rm(captureRoot, { recursive: true, force: true });
}

console.log("Stage 1.1.1 concepts, privacy boundaries, variants, and keyframe exports passed.");

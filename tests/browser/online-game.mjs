import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";

import { startTestServer } from "./test-server.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const testServer = await startTestServer({ root });
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${testServer.origin}/tests/browser/online-game.html`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForFunction(() => Boolean(globalThis.onlineGameHarness), null, {
    timeout: 8_000
  }).catch(() => {
    throw new Error(`Online game harness did not load: ${pageErrors.join(" | ")}`);
  });
  await page.evaluate(() => globalThis.onlineGameHarness.ready).catch(async (error) => {
    const topology = await page.evaluate(() => globalThis.onlineGameHarness.topologySnapshots());
    const peers = await page.evaluate(() => globalThis.onlineGameHarness.peerSnapshots());
    throw new Error(`${error.message}\nTopology: ${JSON.stringify(topology)}\nPeers: ${JSON.stringify(peers)}\nPage errors: ${pageErrors.join(" | ")}`);
  });

  const topologies = await page.evaluate(() =>
    globalThis.onlineGameHarness.topologySnapshots()
  );
  assert.equal(topologies["player-a"].state, "connected");
  assert.equal(topologies["player-a"].connections.length, 2);
  assert.equal(topologies["player-b"].connections.length, 1);
  assert.equal(topologies["player-c"].connections.length, 1);

  const privateCards = await page.evaluate(() =>
    globalThis.onlineGameHarness.privateCards()
  );
  assert.equal(privateCards.a.length, 7);
  assert.equal(privateCards.b.length, 8);
  assert.equal(privateCards.c.length, 7);
  assert.equal(new Set(Object.values(privateCards).flat()).size, 22);

  const publicProjections = await page.evaluate(() =>
    globalThis.onlineGameHarness.publicProjections()
  );
  assert.deepEqual(publicProjections.a, publicProjections.b);
  assert.deepEqual(publicProjections.a, publicProjections.c);

  const pending = await page.evaluate(() =>
    globalThis.onlineGameHarness.pendingOpening()
  );
  assert.equal(pending.result.queued, true);
  assert.equal(pending.action.phase, "PENDING");
  assert.equal(pending.heldCount, 1);
  assert.equal(await page.evaluate(() => globalThis.onlineGameHarness.hostRevision()), 1);
  await page.locator("#seat-b").getByRole("status").getByText("Action pending").waitFor();

  await page.evaluate(() => globalThis.onlineGameHarness.releaseOpening());
  assert.equal(await page.evaluate(() => globalThis.onlineGameHarness.hostRevision()), 2);
  const settled = await page.evaluate(() => globalThis.onlineGameHarness.snapshots());
  assert.equal(settled.b.lastAction.phase, "ACCEPTED");

  const latestPublic = await page.evaluate(() =>
    globalThis.onlineGameHarness.publicProjections()
  );
  assert.deepEqual(latestPublic.a, latestPublic.b);
  assert.deepEqual(latestPublic.a, latestPublic.c);
  assert.doesNotMatch(await page.locator("body").innerText(), /seat-proof|candidate|sdp|room-secret/i);

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  assert.equal(overflow, false, "Stage 6 three-seat views must not overflow at 320px");

  await page.evaluate(() => globalThis.onlineGameHarness.close());
  await context.close();
} finally {
  await browser.close();
  await testServer.close();
}

console.log("Stage 6 three-seat online game browser acceptance passed.");

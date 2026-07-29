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
  await page.goto(`${testServer.origin}/tests/browser/online-transport.html`, {
    waitUntil: "domcontentloaded"
  });
  await page.evaluate(() => globalThis.transportHarness.ready);
  await page.getByRole("status").getByText("All peer links connected").waitFor();

  const snapshots = await page.evaluate(() => globalThis.transportHarness.snapshots());
  assert.equal(snapshots.host.role, "host");
  assert.equal(snapshots.host.connections.length, 2);
  assert.deepEqual(snapshots.guest_one.connections.map(({ playerId }) => playerId), ["host"]);
  assert.deepEqual(snapshots.guest_two.connections.map(({ playerId }) => playerId), ["host"]);

  await page.evaluate(() => globalThis.transportHarness.sendOrdered());
  assert.deepEqual(
    await page.evaluate(() => globalThis.transportHarness.receivedByGuestTwo()),
    [1, 2, 3]
  );
  assert.doesNotMatch(await page.locator("body").innerText(), /seat-proof|candidate|sdp/i);

  await page.evaluate(() => globalThis.transportHarness.closeGuestOne());
  await page.getByRole("status").getByText("A peer link closed").waitFor();

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  assert.equal(overflow, false, "Stage 5 connection state must not overflow at 320px");
  await page.evaluate(() => globalThis.transportHarness.close());
  await context.close();
} finally {
  await browser.close();
  await testServer.close();
}

console.log("Stage 5 three-seat host-star browser acceptance passed.");

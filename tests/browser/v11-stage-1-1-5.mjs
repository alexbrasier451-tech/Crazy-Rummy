import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";

import { startTestServer } from "./test-server.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const testServer = await startTestServer({ root });
const browser = await chromium.launch({ headless: true });

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth,
    `${label}: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`
  );
}

try {
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 },
    hasTouch: true,
    serviceWorkers: "block"
  });
  const page = await context.newPage();

  await page.goto(`${testServer.origin}/tests/browser/stage7-results.html`, {
    waitUntil: "domcontentloaded"
  });
  await page.addStyleTag({ url: `${testServer.origin}/src/styles/v11-results-reference.css` });
  await page.waitForFunction(() => Boolean(globalThis.__stage7Results));
  assert.equal(await page.locator(".result-route-ledger").count(), 1);
  assert.equal(await page.locator(".result-score-ticket").count(), 1);
  assert.equal(await page.locator(".result-private-ticket").count(), 1);

  await page.evaluate(() => globalThis.__stage7Results.renderStoredFinal());
  assert.equal(await page.locator(".result-terminus-standings").count(), 1);
  assert.match(await page.locator(".result-terminus-label").innerText(), /Terminus reached/i);
  assert.equal(
    await page.locator('[data-screen="final-result"]').getAttribute("data-result-state"),
    "normal"
  );

  await page.evaluate(async () => {
    const { finalResultScreen } = await import("/src/screens/results.js");
    document.querySelector("#app").replaceChildren(finalResultScreen({
      navigate() {},
      router: { addBackLayer() { return () => {}; } }
    }));
  });
  assert.equal(await page.locator(".result-unavailable-ticket").count(), 1);
  assert.match(await page.locator(".result-unavailable-ticket").innerText(), /No standings have been invented/);

  await page.evaluate(async () => {
    const { rulesScreen } = await import("/src/screens/reference.js");
    document.querySelector("#app").replaceChildren(rulesScreen());
  });
  assert.equal(await page.locator(".rules-timetable__stop").count(), 13);
  assert.equal(await page.locator(".rules-entry").count(), 8);
  await page.locator(".section-nav button").first().click();
  assert.equal(await page.locator(":focus").getAttribute("id"), "rules-1");

  await page.evaluate(async () => {
    const { settingsScreen } = await import("/src/screens/reference.js");
    document.querySelector("#app").replaceChildren(settingsScreen({
      localSession: {
        getSnapshot() {
          return { identity: { displayName: "Alex" }, preferences: {} };
        }
      }
    }));
  });
  for (const heading of ["Your seat", "Play comfort", "Lobby", "Privacy and data"]) {
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
  }
  assert.equal(await page.getByLabel("Card size").evaluate((node) => node.tagName), "SELECT");
  assert.equal(await page.getByLabel("High contrast and suit labels").evaluate((node) => node.type), "checkbox");

  await page.evaluate(async () => {
    const { settingsScreen } = await import("/src/screens/reference.js");
    document.querySelector("#app").replaceChildren(settingsScreen({
      pwaStatus: {
        supported: true,
        phase: "ready",
        updateReady: false,
        online: false,
        controlled: true,
        error: null
      },
      localSession: {
        getSnapshot() {
          return { identity: { displayName: "Alex" }, preferences: {} };
        }
      }
    }));
  });
  assert.equal(await page.locator(".settings-install-ticket--offline").count(), 1);
  assert.match(await page.locator(".settings-install-ticket").innerText(), /Remote play can resume after reconnection/);
  await page.getByRole("button", { name: "Clear device data" }).click();
  await page.getByRole("button", { name: "Confirm clear device data" }).waitFor();
  assert.match(
    await page.locator(".settings-danger-ticket").innerText(),
    /does not create a cloud account or delete another player’s device/
  );

  await page.addStyleTag({ content: "html { font-size: 400% !important; }" });
  await assertNoHorizontalOverflow(page, "settings offline state at 400% text");
  await context.close();
} finally {
  await browser.close();
  await testServer.close();
}

console.log("Stage 1.1.5 results, rules, settings, resilient states, focus, and reflow passed.");

import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";

import { startTestServer } from "./test-server.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const server = await startTestServer({ root });
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto(`${server.origin}/tests/browser/game-flow.html`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-game-control="toggle-hand-tools"]').click();
  await page.getByText(/Sort: Rank · Selected cards: 0/).waitFor();
  assert.equal(await page.getByLabel("Sort private hand").count(), 0,
    "minimised hand controls show only their current details and maximise control");
  await page.locator('[data-game-control="toggle-hand-tools"]').click();
  await page.getByLabel("Sort private hand").waitFor();
  const wildCard = page.locator('[data-private-hand] [data-card-id="clubs:4"]');
  await wildCard.click();
  await page.getByLabel(/Select as lay-off destination/).click();
  const legalWildRank = page.getByLabel("Laid-off wild represents rank for 4 of clubs");
  assert.deepEqual(await legalWildRank.locator("option").evaluateAll((options) => (
    options.map((option) => option.value).filter(Boolean)
  )), ["10"], "a layoff wild must offer only the legal rank at the selected run end");
  assert.deepEqual(await page.getByLabel("Laid-off wild represents suit for 4 of clubs").locator("option").evaluateAll((options) => (
    options.map((option) => option.value).filter(Boolean)
  )), ["clubs"], "a layoff wild must offer only the destination run's suit");
  await page.locator('[data-game-control="cancel-layoff"]').click();
  await wildCard.click();

  const card = page.locator('[data-private-hand] [data-card-id="clubs:5"]');
  await card.click();
  assert.equal(await card.getAttribute("aria-pressed"), "true");
  assert.equal(await page.getByText("Selected cards: 1").count(), 1,
    "the staged-card count should stay visible beside the private hand");

  await page.evaluate(() => globalThis.gameFlowHarness.setNetwork("RECONNECTING"));
  const actions = page.locator('[data-game-control="open-actions"]');
  assert.equal(await actions.isEnabled(), true,
    "Actions remains available as a read-only review surface while reconnecting");
  await actions.click();
  await page.getByText(/Actions remain open for review, but table changes are disabled/i).waitFor();
  await page.locator('[data-game-control="close-actions"]').click();
  await page.evaluate(() => globalThis.gameFlowHarness.setNetwork("RUNNING"));

  await page.evaluate(() => globalThis.gameFlowHarness.passTurnToBlake());
  await page.locator('[data-game-workspace][data-active-seat-id="b"]').waitFor();
  await page.getByLabel(/Select as lay-off destination/).click();

  assert.equal(await page.locator('[data-game-sheet="add-to-table"]').count(), 0,
    "a stale selection must not open layoff after the local TABLE_PLAY turn ends");
  assert.match(await page.locator("[data-game-workspace]").innerText(), /only the active player can add to the shared table/i);

  await page.evaluate(() => globalThis.gameFlowHarness.passDrawTurnToAster());
  const automaticDrawMenu = page.locator('[data-game-action-menu="true"]');
  await automaticDrawMenu.waitFor();
  await page.locator('[data-game-control="draw-stock"]').waitFor();
  await page.locator('[data-game-control="draw-discard"]').waitFor();
  const discardPreview = automaticDrawMenu.locator('[data-game-current-discard="hearts:K"]');
  await discardPreview.waitFor();
  assert.match(await discardPreview.getAttribute("aria-label"), /Current discard: King of hearts/);
  assert.equal(await discardPreview.locator('[data-card-id="hearts:K"]').count(), 1,
    "the draw menu should show the actual current discard without requiring a table view");
  assert.equal(await page.locator('[data-game-control="open-actions"]').getAttribute("aria-expanded"), "true",
    "a newly active local draw turn should open its draw choices without an Actions-button press");

  await page.locator('[data-game-control="close-actions"]').click();
  await page.evaluate(() => globalThis.gameFlowHarness.notify());
  await page.waitForTimeout(25);
  assert.equal(await automaticDrawMenu.count(), 0,
    "closing the automatic draw menu should keep it closed for the rest of that turn");
} finally {
  await browser.close();
  await server.close();
}

console.log("Gameplay flow browser acceptance passed.");

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
  const layoffTargets = page.locator('[data-game-sheet="add-to-table"] [data-placement]');
  assert.equal(await layoffTargets.count(), 2,
    "a run should expose its two valid ends as separate card-preview targets");
  assert.equal(await page.getByLabel("Destination meld").count(), 0,
    "layoff targets must not be presented as a text select");
  assert.equal(await layoffTargets.first().locator(".game-meld-card").count() > 0, true,
    "each layoff target should be rendered as a card-form preview");
  const legalWildRank = page.getByLabel("Laid-off wild represents rank for 4 of clubs");
  assert.deepEqual(await legalWildRank.locator("option").evaluateAll((options) => (
    options.map((option) => option.value).filter(Boolean)
  )), ["10"], "a layoff wild must offer only the legal rank at the selected run end");
  await legalWildRank.selectOption("10");
  assert.deepEqual(await page.getByLabel("Laid-off wild represents suit for 4 of clubs").locator("option").evaluateAll((options) => (
    options.map((option) => option.value).filter(Boolean)
  )), ["clubs"], "a layoff wild must offer only the destination run's suit");
  await page.locator('[data-game-control="submit-layoff"]').click();
  assert.equal(
    (await page.evaluate(() => globalThis.gameFlowHarness.pendingAction()))?.type,
    "LAY_OFF",
    "the card addition should remain pending until host confirmation"
  );
  assert.equal(await page.locator('[data-game-control="submit-layoff"]').isDisabled(), true,
    "the staged layoff must be protected from duplicate taps while pending");
  assert.equal(await page.evaluate(() => globalThis.gameFlowHarness.projectPendingAction()), true);
  await page.locator('[data-game-sheet="add-to-table"]').waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => globalThis.gameFlowHarness.acceptPendingAction()), true);
  await page.locator('[data-game-sheet="add-to-table"]').waitFor({ state: "detached" });
  assert.equal(await page.locator('[data-game-control="open-actions"]').isEnabled(), true,
    "an accepted layoff acknowledgement must close the composer and unlock gameplay");

  const replacementCard = page.locator('[data-private-hand] [data-card-id="clubs:8"]');
  await replacementCard.click();
  await page.locator('[data-game-control="open-actions"]').click();
  await page.locator('[data-game-control="replace-wild"]').click();
  const replacementTargets = page.locator(
    '[data-game-sheet="replace-wild"] [data-replacement-target="true"]'
  );
  assert.equal(await replacementTargets.count(), 1,
    "wild replacement must show only legal targets as card previews");
  assert.equal(await page.getByLabel("Wild card on table").count(), 0,
    "wild replacement targets must not be presented as a text select");
  assert.equal(await replacementTargets.first().locator(".game-meld-card").count(), 8,
    "the replacement target must render the table cards before and after the swap");
  await page.locator('[data-game-control="confirm-wild-replacement"]').click();
  assert.equal(
    (await page.evaluate(() => globalThis.gameFlowHarness.pendingAction()))?.type,
    "REPLACE_WILD",
    "wild replacement should remain pending until host confirmation"
  );
  assert.equal(await page.evaluate(() => globalThis.gameFlowHarness.projectPendingAction()), true);
  await page.locator('[data-game-sheet="replace-wild"]').waitFor({ state: "detached" });
  assert.equal(await page.getByText("Selected cards: 0").count(), 1,
    "an authoritative replacement projection must clear its consumed selection without recursion");
  assert.equal(await page.evaluate(() => globalThis.gameFlowHarness.acceptPendingAction()), true);
  assert.equal(await page.locator('[data-game-control="open-actions"]').isEnabled(), true,
    "the replacement acknowledgement must unlock gameplay");

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
  await page.locator('[data-game-control="open-actions"]').click();
  await automaticDrawMenu.waitFor();
  await page.locator('[data-game-control="draw-stock"]').click();
  assert.equal(
    (await page.evaluate(() => globalThis.gameFlowHarness.pendingAction()))?.type,
    "DRAW_STOCK"
  );
  assert.equal(await page.evaluate(() => globalThis.gameFlowHarness.projectPendingAction()), true);
  assert.equal(await page.evaluate(() => globalThis.gameFlowHarness.acceptPendingAction()), true);
  const drawnCard = page.locator('[data-private-hand] [data-card-id="diamonds:2"]');
  await drawnCard.waitFor();
  assert.equal(await drawnCard.getAttribute("data-recently-drawn"), "true",
    "the authoritative card added by a draw should remain visibly highlighted");
  assert.match(await drawnCard.getAttribute("aria-label"), /just drawn/);
  assert.equal(await drawnCard.locator(".playing-card__recent").textContent(), "DRAWN");

  await page.evaluate(() => globalThis.gameFlowHarness.passTurnToBlake());
  assert.equal(await drawnCard.getAttribute("data-recently-drawn"), "false",
    "the just-drawn highlight should clear when the player's turn ends");

  const ambiguousPage = await browser.newPage({
    viewport: { width: 390, height: 844 }
  });
  await ambiguousPage.goto(
    `${server.origin}/tests/browser/game-flow.html`,
    { waitUntil: "domcontentloaded" }
  );
  for (const cardId of ["clubs:4", "diamonds:4", "clubs:J"]) {
    await ambiguousPage.locator(
      `[data-private-hand] [data-card-id="${cardId}"]`
    ).click();
  }
  await ambiguousPage.locator('[data-game-control="open-actions"]').click();
  await ambiguousPage.locator('[data-game-control="open-meld"]').click();
  await ambiguousPage.getByRole("radio", { name: "Set" }).waitFor();
  assert.equal(
    await ambiguousPage.getByRole("radio", { name: "Run" }).count(),
    1,
    "cards that can be either a set or run must let the player declare the meld type"
  );
  await ambiguousPage.getByRole("radio", { name: "Set" }).click();
  await ambiguousPage.getByText("Set detected").waitFor();
  assert.equal(
    await ambiguousPage.locator('[data-game-control="place-meld"]').isEnabled(),
    true,
    "choosing the set interpretation must make two wilds plus one natural placeable"
  );
  await ambiguousPage.locator('[data-game-control="place-meld"]').click();
  const ambiguousAction = await ambiguousPage.evaluate(
    () => globalThis.gameFlowHarness.pendingAction()
  );
  assert.equal(ambiguousAction?.type, "CREATE_MELD");
  assert.equal(ambiguousAction?.payload?.meld?.type, "SET");
  assert.deepEqual(
    ambiguousAction?.payload?.meld?.slots
      .filter(({ cardId }) => ["clubs:4", "diamonds:4"].includes(cardId))
      .map(({ represented }) => represented),
    [{ rank: "J" }, { rank: "J" }],
    "both wild cards must be submitted with the declared set rank"
  );
  assert.equal(
    await ambiguousPage.evaluate(() => globalThis.gameFlowHarness.projectPendingAction()),
    true,
    "the declared meld must pass authoritative engine validation"
  );
  assert.equal(
    await ambiguousPage.evaluate(() => globalThis.gameFlowHarness.acceptPendingAction()),
    true
  );
  await ambiguousPage.locator(
    '[data-private-hand] [data-card-id="clubs:J"]'
  ).waitFor({ state: "detached" });
  assert.match(
    await ambiguousPage.getByLabel("Shared table melds").innerText(),
    /4\s*♣.*4\s*♦.*J\s*♣/s,
    "the accepted three-card meld must reach the shared table"
  );

  await ambiguousPage.reload({ waitUntil: "domcontentloaded" });
  for (const cardId of ["clubs:4", "diamonds:4", "clubs:J"]) {
    await ambiguousPage.locator(
      `[data-private-hand] [data-card-id="${cardId}"]`
    ).click();
  }
  await ambiguousPage.locator('[data-game-control="open-actions"]').click();
  await ambiguousPage.locator('[data-game-control="open-meld"]').click();
  await ambiguousPage.getByRole("radio", { name: "Run" }).click();
  const firstWildRank = ambiguousPage.getByLabel(
    "Wild completes run as rank for 4 of clubs"
  );
  assert.deepEqual(
    await firstWildRank.locator("option").evaluateAll((options) => (
      options.map(({ value }) => value).filter(Boolean)
    )),
    ["9", "10", "Q", "K"],
    "the declared run must offer only positions from its run interpretations"
  );
  await firstWildRank.selectOption("9");
  assert.equal(
    await ambiguousPage.locator('[data-game-control="place-meld"]').isEnabled(),
    true,
    "one explicit wild choice must resolve the remaining forced run position"
  );
  await ambiguousPage.locator('[data-game-control="place-meld"]').click();
  const runAction = await ambiguousPage.evaluate(
    () => globalThis.gameFlowHarness.pendingAction()
  );
  assert.equal(runAction?.payload?.meld?.type, "RUN");
  assert.deepEqual(
    runAction?.payload?.meld?.slots.map(({ represented }) => represented.rank),
    ["9", "10", "J"],
    "the two wilds must occupy distinct positions in the declared run"
  );
  assert.equal(
    await ambiguousPage.evaluate(() => globalThis.gameFlowHarness.projectPendingAction()),
    true,
    "the alternate run declaration must also pass authoritative engine validation"
  );
  assert.equal(
    await ambiguousPage.evaluate(() => globalThis.gameFlowHarness.acceptPendingAction()),
    true
  );
  await ambiguousPage.close();
} finally {
  await browser.close();
  await server.close();
}

console.log("Gameplay flow browser acceptance passed.");

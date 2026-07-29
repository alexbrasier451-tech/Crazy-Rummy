import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

import { startTestServer } from "./test-server.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const dist = path.join(root, "dist");
const browserErrors = [];

async function buildProductionApp() {
  const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
  await execFileAsync(process.execPath, [viteCli, "build"], {
    cwd: root,
    env: { ...process.env, CRAZY_RUMMY_PWA_REVISION: "local-game-acceptance" },
    windowsHide: true
  });
}

function control(page, name) {
  return page.locator(`[data-game-control="${name}"]`);
}

function workspace(page) {
  return page.locator('[data-game-workspace="local"]');
}

async function showGameDetails(page) {
  if (await control(page, "developer-seat").count()) return;
  await control(page, "toggle-game-details").click();
  await control(page, "developer-seat").waitFor();
}

async function openActions(page) {
  if (await page.locator('[data-game-action-menu="true"]').count()) return;
  await control(page, "open-actions").click();
  await page.locator('[data-game-action-menu="true"]').waitFor();
}

async function takeAction(page, name) {
  await openActions(page);
  await control(page, name).click();
}

async function phase(page) {
  await workspace(page).waitFor({ state: "attached" });
  return workspace(page).getAttribute("data-phase");
}

async function revision(page) {
  await workspace(page).waitFor({ state: "attached" });
  return Number(await workspace(page).getAttribute("data-revision"));
}

async function activeSeatId(page) {
  const seatId = await workspace(page).getAttribute("data-active-seat-id");
  assert.ok(seatId, "the local harness must expose the active fixture seat");
  return seatId;
}

async function selectActiveSeat(page, { mayCompleteHand = false } = {}) {
  await showGameDetails(page);
  const seatControl = control(page, "developer-seat");
  if (mayCompleteHand) {
    const outcome = await Promise.race([
      seatControl.waitFor({ state: "visible", timeout: 30_000 })
        .then(() => "control"),
      page.waitForURL(/#\/hand-result$/, { timeout: 30_000 })
        .then(() => "result"),
      page.waitForTimeout(5_000).then(() => "timeout")
    ]);
    if (outcome === "result") return false;
    if (outcome === "timeout") {
      const diagnostics = await page.evaluate((capturedErrors) => {
        const workspace = document.querySelector('[data-game-workspace="local"]');
        const seat = document.querySelector('[data-game-control="developer-seat"]');
        const sheet = document.querySelector(".game-sheet");
        return {
          phase: workspace?.dataset.phase,
          revision: workspace?.dataset.revision,
          activeSeatId: workspace?.dataset.activeSeatId,
          seatConnected: Boolean(seat),
          seatVisible: Boolean(seat?.getClientRects().length),
          sheet: sheet?.innerText,
          liveMessage: workspace?.querySelector(".game-live-message")?.textContent,
          browserErrors: capturedErrors
        };
      }, browserErrors);
      throw new Error(
        `Neither the developer seat nor hand result became available at ${page.url()}; `
        + `workspace count ${await workspace(page).count()}; `
        + `state ${JSON.stringify(diagnostics)}`
      );
    }
  }
  await seatControl.selectOption(await activeSeatId(page), {
    timeout: mayCompleteHand ? 5_000 : 30_000
  });
  return true;
}

async function expectOneAcceptedRevision(page, action, label) {
  const before = await revision(page);
  await action();
  await page.waitForFunction((expected) => {
    const node = document.querySelector('[data-game-workspace="local"]');
    return Number(node?.dataset.revision) === expected;
  }, before + 1);
  assert.equal(await revision(page), before + 1, `${label} must advance exactly one revision`);
}

async function refreshPreservesAcceptedState(page, expectedPhase, label) {
  const before = await revision(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await workspace(page).waitFor({ state: "attached" });
  assert.equal(await revision(page), before, `${label} refresh must not duplicate an accepted command`);
  assert.equal(await phase(page), expectedPhase, `${label} refresh must restore its turn phase`);
}

async function firstPrivateCard(page) {
  const card = page.locator('[data-private-hand] [data-card-id]').first();
  await card.waitFor();
  return card;
}

async function clearSelection(page) {
  const button = control(page, "clear-selection");
  if (await button.isEnabled()) await button.click();
}

async function chooseCards(page, cardIds) {
  for (const cardId of cardIds) {
    const card = page.locator(`[data-private-hand] [data-card-id="${cardId}"]`);
    await card.waitFor();
    await card.tap();
    assert.equal(await card.getAttribute("aria-pressed"), "true", `${cardId} should be selected by tap`);
  }
}

async function discardFirstPrivateCard(page, label) {
  const card = await firstPrivateCard(page);
  await card.tap();
  const before = await revision(page);
  await takeAction(page, "discard");
  await control(page, "confirm-discard").click();
  await Promise.race([
    page.waitForURL(/#\/hand-result$/),
    page.waitForFunction((expected) => {
      const node = document.querySelector('[data-game-workspace="local"]');
      return Number(node?.dataset.revision) === expected;
    }, before + 1)
  ]);
  await page.waitForTimeout(25);
  if (!/#\/hand-result$/.test(page.url())) {
    assert.equal(await revision(page), before + 1, `${label} must advance exactly one revision`);
  }
}

async function playOrdinaryTurnsUntilHandComplete(page) {
  for (let turns = 0; turns < 180; turns += 1) {
    if (/hand-result$/.test(new URL(page.url()).hash)) return;
    const currentPhase = await phase(page);
    if (!await selectActiveSeat(page, { mayCompleteHand: true })) return;
    if (currentPhase === "AWAITING_DRAW") {
      await expectOneAcceptedRevision(page, () => takeAction(page, "draw-stock"), "stock draw");
      continue;
    }
    if (currentPhase === "TABLE_PLAY") {
      await discardFirstPrivateCard(page, "ordinary discard from table play");
      continue;
    }
    if (currentPhase === "AWAITING_DISCARD") {
      await discardFirstPrivateCard(page, "ordinary discard");
      continue;
    }
    throw new Error(`Unexpected phase while completing hand 1: ${currentPhase}`);
  }
  assert.fail("ordinary UI turns did not finish hand 1 within the fixture bound");
}

await buildProductionApp();

const testServer = await startTestServer({ root: dist });
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto(`${testServer.origin}/#/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${testServer.origin}/#/game`, { waitUntil: "domcontentloaded" });
  await workspace(page).waitFor();
  assert.equal(await phase(page), "DEALER_INITIAL_DISCARD");
  assert.equal(await page.locator('[data-shared-players] [data-card-id]').count(), 0,
    "shared player DOM must never expose private card identities");
  assert.equal(await page.locator('[data-shared-players] [data-private-hand]').count(), 0,
    "shared player DOM must never contain a private-hand tray");
  assert.equal(await workspace(page).evaluate((node) => [...node.childNodes]
    .some((child) => child.nodeType === Node.TEXT_NODE && child.textContent === "null")), false,
  "local mode must not render an empty online-connection placeholder");
  assert.equal(await control(page, "developer-seat").count(), 0,
    "nonessential game context should be collapsed initially");
  const phoneLayout = await page.evaluate(() => {
    const table = document.querySelector(".game-table");
    const stock = document.querySelector(".stock-discard > :first-child");
    const discard = document.querySelector(".stock-discard > :last-child");
    const hand = document.querySelector(".game-private-hand");
    const launcher = document.querySelector(".game-action-launch");
    const tableStyle = table ? getComputedStyle(table) : null;
    const launcherStyle = launcher ? getComputedStyle(launcher) : null;
    return {
      tableClientHeight: table?.clientHeight ?? 0,
      tableScrollHeight: table?.scrollHeight ?? 0,
      tableOverflowY: tableStyle?.overflowY,
      stockTop: Math.round(stock?.getBoundingClientRect().top ?? -1),
      discardTop: Math.round(discard?.getBoundingClientRect().top ?? -2),
      launcherTop: Math.round(launcher?.getBoundingClientRect().top ?? -1),
      launcherRight: Math.round(launcher?.getBoundingClientRect().right ?? -1),
      launcherPosition: launcherStyle?.position,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  });
  assert.ok(
    phoneLayout.tableScrollHeight <= phoneLayout.tableClientHeight + 1,
    "the phone table must expand to its content instead of creating a clipped nested scroller"
  );
  assert.equal(phoneLayout.tableOverflowY, "visible",
    "the phone table should participate in the page's single vertical scroll");
  assert.equal(phoneLayout.stockTop, phoneLayout.discardTop,
    "stock and discard should share a compact row on a phone");
  assert.equal(phoneLayout.launcherPosition, "fixed",
    "the phone Actions launcher must follow the viewport");
  assert.ok(phoneLayout.launcherTop >= 0 && phoneLayout.launcherTop < phoneLayout.viewportHeight,
    "the floating Actions launcher must stay vertically inside the phone viewport");
  assert.ok(phoneLayout.launcherRight > 0 && phoneLayout.launcherRight <= phoneLayout.viewportWidth,
    "the floating Actions launcher must stay horizontally inside the phone viewport");
  const floatingTopBeforeScroll = phoneLayout.launcherTop;
  await page.evaluate(() => window.scrollBy(0, 160));
  const floatingTopAfterScroll = await page.locator(".game-action-launch").evaluate((node) =>
    Math.round(node.getBoundingClientRect().top));
  assert.ok(Math.abs(floatingTopAfterScroll - floatingTopBeforeScroll) <= 1,
    "the floating Actions launcher must follow the screen while the table scrolls");
  await page.evaluate(() => window.scrollTo(0, 0));
  const handToolsToggle = control(page, "toggle-hand-tools");
  assert.equal(await handToolsToggle.getAttribute("aria-expanded"), "true",
    "hand controls should begin expanded");
  await handToolsToggle.click();
  await page.getByText(/Sort: Rank · Selected cards: 0/).waitFor();
  assert.equal(await page.getByLabel("Sort private hand").count(), 0,
    "minimised hand controls should show only their details");
  assert.equal(await control(page, "toggle-hand-tools").getAttribute("aria-expanded"), "false");
  assert.match(await control(page, "toggle-hand-tools").innerText(), /Maximise hand controls/);
  await control(page, "toggle-hand-tools").click();
  await page.getByLabel("Sort private hand").waitFor();
  await openActions(page);
  const actionMenu = page.getByRole("region", { name: "Actions", exact: true });
  await actionMenu.waitFor();
  assert.equal(await actionMenu.getAttribute("aria-modal"), null,
    "Actions must be a non-modal disclosure so the table and hand remain interactive");
  const actionMenuBox = await actionMenu.boundingBox();
  const actionViewport = page.viewportSize();
  assert.ok(actionMenuBox && actionViewport,
    "the floating Actions menu must have a measurable viewport position");
  assert.ok(Math.abs((actionMenuBox.x + (actionMenuBox.width / 2)) - (actionViewport.width / 2)) <= 2,
    "the floating Actions menu must be horizontally centred");
  assert.ok(Math.abs((actionMenuBox.y + (actionMenuBox.height / 2)) - (actionViewport.height / 2)) <= 2,
    "the floating Actions menu must be vertically centred");
  await actionMenu.getByText(/No turn action is available on this device/).waitFor();
  await control(page, "close-actions").click();
  await control(page, "open-actions").focus();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.gameControl), "open-actions",
    "closing the action sheet should restore focus to its trigger");

  await selectActiveSeat(page);
  await openActions(page);
  const liveOpeningCard = await firstPrivateCard(page);
  await liveOpeningCard.tap();
  assert.equal(await liveOpeningCard.getAttribute("aria-pressed"), "true",
    "the active player must be able to select a card while Actions remains open");
  assert.equal(await page.locator('[data-game-action-menu="true"]').count(), 1,
    "card selection must keep the non-modal Actions tray open");
  assert.equal(await control(page, "discard").isEnabled(), true,
    "selecting one opening card must reveal an enabled discard action");
  await control(page, "close-actions").click();
  await clearSelection(page);
  const openingCard = await firstPrivateCard(page);
  await openingCard.focus();
  await page.keyboard.press("Space");
  assert.equal(await openingCard.getAttribute("aria-pressed"), "true",
    "a private card must support keyboard selection");
  await refreshPreservesAcceptedState(page, "DEALER_INITIAL_DISCARD", "dealer opening");
  const refreshedOpeningCard = await firstPrivateCard(page);
  await refreshedOpeningCard.focus();
  await page.keyboard.press("Space");
  await expectOneAcceptedRevision(
    page,
    () => takeAction(page, "discard")
      .then(() => control(page, "confirm-opening-discard").click()),
    "dealer opening discard"
  );
  assert.equal(await phase(page), "AWAITING_DRAW");
  await refreshPreservesAcceptedState(page, "AWAITING_DRAW", "awaiting draw");

  await selectActiveSeat(page);
  const automaticDrawMenu = page.locator('[data-game-action-menu="true"]');
  await automaticDrawMenu.waitFor();
  await control(page, "draw-stock").waitFor();
  await control(page, "draw-discard").waitFor();
  const tableDiscardCardId = await page.locator(".stock-discard > :last-child [data-card-id]").getAttribute("data-card-id");
  assert.ok(tableDiscardCardId, "the normal draw turn should have a current discard");
  assert.equal(
    await automaticDrawMenu.locator("[data-game-current-discard]").getAttribute("data-game-current-discard"),
    tableDiscardCardId,
    "the automatic draw menu should repeat the current table discard"
  );
  assert.equal(await control(page, "open-actions").getAttribute("aria-expanded"), "true",
    "switching to the active player's draw turn should reveal draw choices automatically");
  await control(page, "close-actions").click();
  await control(page, "toggle-hand-tools").click();
  assert.equal(await automaticDrawMenu.count(), 0,
    "an unrelated same-turn render must not reopen a dismissed automatic draw menu");
  await control(page, "toggle-hand-tools").click();
  await expectOneAcceptedRevision(page, () => takeAction(page, "draw-stock"), "first stock draw");
  assert.equal(await phase(page), "TABLE_PLAY");
  await refreshPreservesAcceptedState(page, "TABLE_PLAY", "table play");

  await chooseCards(page, ["diamonds:10"]);
  await takeAction(page, "open-meld");
  await page.getByText("Select at least three cards to make a meld.").waitFor();
  assert.equal(await control(page, "place-meld").isDisabled(), true,
    "an incomplete selection must not invent a meld type");
  assert.equal(await page.locator('[data-game-sheet="compose-meld"]').count(), 1,
    "an incomplete meld must preserve the composer");
  assert.equal(await page.locator('[data-private-hand] [data-card-id="diamonds:10"]').getAttribute("aria-pressed"), "true",
    "an incomplete meld must preserve card selection");
  await control(page, "cancel-meld").click();
  await clearSelection(page);

  await chooseCards(page, ["diamonds:10", "diamonds:J", "clubs:A"]);
  await takeAction(page, "open-meld");
  assert.equal(await page.getByRole("radio", { name: "Set" }).count(), 0,
    "the composer must not ask the player to choose a meld type");
  await page.getByText("Run detected").waitFor();
  const wildRankChoice = page.getByLabel("Wild completes run as rank for Ace of clubs");
  assert.deepEqual(
    await wildRankChoice.locator("option").evaluateAll((options) => (
      options.map(({ value }) => value).filter(Boolean)
    )),
    ["9", "Q"],
    "a run wild must offer only the two ranks that legally complete the selected run"
  );
  assert.equal(await page.getByLabel("Wild completes run as suit for Ace of clubs").count(), 0,
    "the natural run cards must determine the wild suit");
  const editableWild = page.locator('[data-game-composer-card="true"][data-card-id="clubs:A"]');
  assert.equal(await editableWild.count(), 1,
    "the composer must expose the staged cards for direct editing");
  await editableWild.click();
  assert.equal(await page.locator('[data-game-sheet="compose-meld"]').count(), 1,
    "removing a staged card must keep the editable composer open");
  await page.locator('[data-game-composer-card="true"][data-card-id="clubs:A"]').click();
  await wildRankChoice.selectOption("Q");
  assert.equal(await wildRankChoice.inputValue(), "Q",
    "a legal run choice must remain visible after rerender");
  assert.equal(await control(page, "place-meld").isEnabled(), true);
  await control(page, "cancel-meld").click();
  await clearSelection(page);

  await chooseCards(page, ["diamonds:10", "clubs:10", "clubs:A"]);
  await takeAction(page, "open-meld");
  await page.getByText("Set detected").waitFor();
  assert.equal(await page.getByLabel(/Wild .* rank for Ace of clubs/).count(), 0,
    "a set must infer the wild rank from its natural cards without asking the player");
  assert.equal(await control(page, "place-meld").isEnabled(), true,
    "an inferred set must be ready to place immediately");
  await expectOneAcceptedRevision(page, () => control(page, "place-meld").click(), "opening set");
  assert.match(await page.getByLabel("Shared table melds").innerText(), /set/i);
  assert.equal(await page.locator("button article").count(), 0,
    "meld controls must not nest non-interactive card articles inside a button");
  assert.match(
    await page.getByLabel("Shared table melds").getByRole("button").getAttribute("aria-label"),
    /Set by .*Ace of clubs as 10/i,
    "a meld control must expose its cards and represented wild as text"
  );
  await refreshPreservesAcceptedState(page, "TABLE_PLAY", "accepted opening meld");

  const replacementCandidates = await page.locator('[data-private-hand] [data-card-id]').evaluateAll((nodes) => (
    nodes.slice(0, 2).map((node) => node.dataset.cardId)
  ));
  await chooseCards(page, replacementCandidates);
  await openActions(page);
  assert.equal(await control(page, "replace-wild").isDisabled(), true,
    "wild replacement must require exactly one natural card, not silently take the first selection");
  await control(page, "close-actions").click();
  await clearSelection(page);

  await openActions(page);
  assert.equal(await control(page, "finish-table-play").count(), 0,
    "the current UI must not require a redundant finish-table-play action");
  assert.equal(await control(page, "discard").count(), 1,
    "table play must offer discard as the direct end-turn action");
  await control(page, "close-actions").click();
  await discardFirstPrivateCard(page, "first turn atomic discard");

  await playOrdinaryTurnsUntilHandComplete(page);
  await page.waitForURL(/#\/hand-result$/);
  const handResult = page.locator('[data-screen="hand-result"]');
  await handResult.waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await handResult.waitFor();
  assert.match(await handResult.innerText(), /Hand 01 complete/i,
    "refresh recovery must retain the accepted hand-complete result");
  await handResult.getByRole("heading", { name: "Your remaining-card score" }).waitFor();
  assert.match(
    await handResult.getByRole("heading", { name: "Next hand" }).locator("xpath=..").innerText(),
    /Hand 2: 2 wild; .* deals first/i
  );
  await page.getByRole("button", { name: "Continue to next hand" }).click();
  await page.waitForURL(/#\/game$/);

  await showGameDetails(page);
  await control(page, "run-automated-match").click();
  await page.waitForURL(/#\/final-result$/);
  const finalResult = page.locator('[data-screen="final-result"]');
  await finalResult.waitFor();
  await finalResult.getByRole("heading", { name: "Hand-by-hand results" }).waitFor();
  const history = finalResult.getByRole("heading", { name: "Hand-by-hand results" }).locator("xpath=..");
  assert.equal(await history.getByRole("listitem").count(), 13);
  assert.match(
    await history.getByRole("listitem").first().innerText(),
    /north \+\d+.*east \+\d+.*south \+\d+/i
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { globalThis.__copiedResult = text; } }
    });
  });
  await finalResult.getByRole("button", { name: "Copy result summary" }).click();
  const copiedResult = await page.evaluate(() => globalThis.__copiedResult);
  assert.match(copiedResult, /Crazy Rummy result[\s\S]*Final standings:[\s\S]*Hand 01/);
  assert.doesNotMatch(copiedResult, /clubs:A|diamonds:10|roomSecret|seatSecret/i);
  await page.reload({ waitUntil: "domcontentloaded" });
  await finalResult.waitFor();
  assert.equal(await history.getByRole("listitem").count(), 13);
  await page.getByRole("button", { name: "Start a new local match" }).click();
  await page.waitForURL(/#\/game$/);
  assert.equal(await phase(page), "DEALER_INITIAL_DISCARD", "new match must restart at the opening discard");

  await page.goto(`${testServer.origin}/#/identity`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Display name").fill("Browser Fixture");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.waitForURL(/#\/lobby$/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.goto(`${testServer.origin}/#/identity`, { waitUntil: "domcontentloaded" });
  assert.equal(await page.getByLabel("Display name").inputValue(), "Browser Fixture");
  await page.goto(`${testServer.origin}/#/settings`, { waitUntil: "domcontentloaded" });
  const statisticsPanel = page.getByRole("heading", { name: "Your Crazy Rummy record" }).locator("xpath=..");
  await statisticsPanel.waitFor();
  assert.match(await statisticsPanel.innerText(), /Stored only on this device for Browser Fixture/i);
  assert.match(await statisticsPanel.innerText(), /Matches recorded\s+1/i);
  assert.match(await statisticsPanel.innerText(), /Wins\s+\d+ \(\d+%\)/i);
  assert.match(await statisticsPanel.innerText(), /Best final total\s+\d+/i);
  await page.getByLabel("Card size").selectOption("Large");
  await page.getByLabel("Default hand sorting").selectOption("Suit");
  await page.getByLabel("Motion").selectOption("Reduced");
  await page.getByLabel("High contrast and suit labels").check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await page.getByLabel("Display name").inputValue(), "Browser Fixture");
  assert.equal(await page.getByLabel("Card size").inputValue(), "Large");
  assert.equal(await page.getByLabel("Default hand sorting").inputValue(), "Suit");
  assert.equal(await page.getByLabel("Motion").inputValue(), "Reduced");
  assert.deepEqual(await page.locator("html").evaluate((node) => ({
    cardSize: node.dataset.cardSize,
    motion: node.dataset.motion,
    contrast: node.dataset.contrast
  })), { cardSize: "large", motion: "reduced", contrast: "high" });
  await page.getByRole("heading", { name: "Latest completed match" }).waitFor();
  assert.match(
    await page.getByRole("heading", { name: "Latest completed match" }).locator("xpath=..").innerText(),
    /13 accepted hand results retained on this device/i
  );

  await context.close();
} finally {
  await browser.close();
  await testServer.close();
}

console.log("Stage 3 local-game browser acceptance passed.");

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
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${testServer.origin}/tests/browser/online-harness.html`, {
    waitUntil: "domcontentloaded"
  });

  await page.getByRole("heading", { name: "Open tables" }).waitFor();
  await page.evaluate(() => globalThis.onlineHarness.mountLobbyDuringInitialRefresh());
  await page.getByRole("button", { name: "Go online" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("Create a table"))?.disabled === true);
  assert.equal(await page.getByRole("button", { name: "Create a table" }).isDisabled(), true,
    "creation must remain unavailable while the initial online refresh owns the lobby request");
  await page.evaluate(() => globalThis.onlineHarness.finishInitialRefresh());
  await page.getByRole("button", { name: "Create a table" }).waitFor({ state: "visible" });
  await page.waitForFunction(() => ![...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("Create a table"))?.disabled);
  await page.getByRole("button", { name: "Create a table" }).click();
  assert.equal(await page.getByRole("heading", { name: "Join a closed table" }).count(), 0,
    "Create and Join setup panels must not compete for phone space");
  await page.getByLabel("Closed table").check();
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.lastNavigation === "/waiting-room");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Open tables" }).waitFor();
  await page.getByRole("button", { name: "Create a table" }).click();
  assert.deepEqual(
    await page.locator("#table-capacity option").allTextContents(),
    ["2 seats", "3 seats", "4 seats", "5 seats", "6 seats"]
  );
  await page.getByRole("button", { name: "Hide create table" }).click();
  assert.equal(await page.getByRole("button", { name: "Preview table" }).count(), 0,
    "Open tables should expose a direct join instead of an intermediate preview");
  await page.getByRole("button", { name: "Join table" }).click();
  await page.getByRole("heading", { level: 1, name: "Waiting room" }).waitFor();
  await page.getByRole("button", { name: /I'm ready/ }).click();
  await page.getByLabel(/Alex, current turn, Ready/).waitFor();

  await page.evaluate(() => globalThis.onlineHarness.fillOpenRoom());
  await page.getByText("6 of 6 players").waitFor();
  assert.equal(await page.locator(".seat-grid .player-chip").count(), 6);
  await page.getByRole("button", { name: /I'm ready/ }).click();
  await page.getByLabel(/Pat, current turn, Ready/).waitFor();
  await page.getByRole("button", { name: /Cancel table/ }).click();
  await page.waitForFunction(() => document.body.dataset.lastNavigation === "/lobby");

  const closedCode = await page.evaluate(() => globalThis.onlineHarness.startClosedJourney());
  await page.getByText(/No open tables found right now/).waitFor();
  await page.getByRole("button", { name: "Join with a code" }).click();
  await page.getByLabel("Enter a table code").fill(closedCode);
  await page.getByRole("button", { name: "Find and join table" }).click();
  await page.getByRole("heading", { name: "Private invite" }).waitFor({ timeout: 5_000 }).catch(async (error) => {
    throw new Error(`${error.message}\nRendered body:\n${await page.locator("body").innerText()}`);
  });
  assert.equal(await page.locator(".invite-code__value").textContent(), closedCode);
  await page.getByRole("button", { name: "Copy code" }).waitFor();
  await page.getByText("This device's seat").waitFor();
  await page.evaluate(() => globalThis.onlineHarness.prepareTwoPlayerStart());
  await page.getByText("2 of 2 players").waitFor();
  assert.equal(await page.getByRole("button", { name: "Start match" }).isEnabled(), true);
  await page.getByRole("heading", { name: "Ready to start?" }).waitFor();
  await page.evaluate(() => globalThis.onlineHarness.mountWaitingRoomDuringRefresh());
  await page.getByRole("button", { name: "Refresh room" }).click();
  assert.equal(await page.getByRole("button", { name: /I'm not ready/ }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: /Start match/ }).isDisabled(), true);
  await page.evaluate(() => globalThis.onlineHarness.finishRoomRefresh());
  await page.waitForFunction(() => ![...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("Start match"))?.disabled);
  await page.getByRole("button", { name: "Start match" }).click();
  await page.getByText(/Connecting players|Join started match|Injected match connection failure/).waitFor();
  assert.ok(await page.evaluate(() => globalThis.onlineHarness.matchStartAttempts()) >= 1);

  await page.evaluate(() => globalThis.onlineHarness.mountLobbyWithCompatibilityWarning());
  await page.getByText("2 open tables are using a different version.").waitFor();
  await page.getByRole("link", { name: "Check Settings" }).waitFor();

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  assert.equal(overflow, false, "Lobby and waiting room must not overflow at 320px");
  await context.close();
} finally {
  await browser.close();
  await testServer.close();
}

console.log("Open/Closed two-to-six-seat lobby browser acceptance passed.");

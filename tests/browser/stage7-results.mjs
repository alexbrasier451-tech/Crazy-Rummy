import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";

import { startTestServer } from "./test-server.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const testServer = await startTestServer({ root });
const browser = await chromium.launch({ headless: true });

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
  await page.waitForFunction(() => Boolean(globalThis.__stage7Results));

  const continueButton = page.getByRole("button", { name: "Continue to next hand" });
  await continueButton.click();
  assert.match(await page.getByRole("status").innerText(), /Sending your acknowledgement/);
  await page.evaluate(() => globalThis.__stage7Results.acceptAcknowledgement());
  assert.match(
    await page.getByRole("status").innerText(),
    /Acknowledgement accepted\. Waiting for 2 other players\./
  );
  assert.equal(await page.getByRole("button", { name: "Acknowledgement accepted" }).isDisabled(), true);

  await page.evaluate(() => globalThis.__stage7Results.advanceToNextHand());
  assert.equal(
    await page.evaluate(() => globalThis.__stage7Results.lastNavigation),
    "/game",
    "the first fully acknowledged hand should return to the game"
  );

  await page.evaluate(() => {
    globalThis.__stage7Results.lastNavigation = null;
    globalThis.__stage7Results.renderHand(2);
  });
  await continueButton.click();
  assert.equal(
    (await page.evaluate(() => globalThis.__stage7Results.acknowledgementCalls())).at(-1).handId,
    "hand-2",
    "the second Continue action must target the current hand"
  );
  await page.evaluate(() =>
    globalThis.__stage7Results.acceptAcknowledgement({ includeLastAction: false })
  );
  assert.match(
    await page.getByRole("status").innerText(),
    /Acknowledgement accepted\. Waiting for 2 other players\./,
    "the authoritative hand result must settle Continue even when transient lastAction metadata is absent"
  );
  assert.equal(await page.getByRole("button", { name: "Acknowledgement accepted" }).isDisabled(), true);
  await page.evaluate(() => globalThis.__stage7Results.advanceToNextHand());
  assert.equal(
    await page.evaluate(() => globalThis.__stage7Results.lastNavigation),
    "/game",
    "the second fully acknowledged hand should return to the game"
  );

  await page.evaluate(() => {
    globalThis.__stage7Results.lastNavigation = null;
    globalThis.__stage7Results.renderHand(3);
  });
  await continueButton.click();
  assert.match(
    await page.locator("[data-continue-status]").innerText(),
    /Sending your acknowledgement/,
    "Continue progress must remain visible beside the button when the top status is off-screen"
  );
  await page.evaluate(() =>
    globalThis.__stage7Results.rejectAcknowledgement({ commandId: "unrelated-command" })
  );
  assert.equal(await page.getByRole("button", { name: "Sending acknowledgement..." }).isDisabled(), true,
    "an unrelated command result must not change the pending acknowledgement");
  await page.evaluate(() =>
    globalThis.__stage7Results.rejectAcknowledgement({ detail: "Please retry this acknowledgement." })
  );
  assert.equal(await continueButton.isEnabled(), true,
    "a matching rejection must unlock Continue for a safe retry");
  assert.match(
    await page.locator("[data-continue-status]").innerText(),
    /Please retry this acknowledgement/,
    "a matching rejection must be explained beside the retry control"
  );
  await continueButton.click();
  await page.evaluate(() =>
    globalThis.__stage7Results.acceptAcknowledgement({ includeLastAction: false })
  );
  assert.equal(await page.getByRole("button", { name: "Acknowledgement accepted" }).isDisabled(), true,
    "a retried acknowledgement must settle from authoritative hand state"
  );

  await page.evaluate(() => globalThis.__stage7Results.renderStoredFinal());
  assert.match(await page.getByRole("heading", { level: 1 }).innerText(), /Alex wins/);
  assert.equal(await page.locator('section[aria-label="Accepted final standings"]').count(), 1);
  assert.match(await page.getByText("Hand-by-hand results").locator("..").innerText(), /Hand 13/);

  await page.getByRole("button", { name: "Copy result summary" }).click();
  const copied = await page.evaluate(() => globalThis.__stage7Results.copiedText());
  assert.match(copied, /Crazy Rummy result/);
  assert.equal(/roomSecret|seatSecret|cardIds/.test(copied), false);

  await page.evaluate(() => {
    const replay = [...document.querySelectorAll("button")]
      .find((button) => button.textContent.includes("Play again"));
    replay.click();
    replay.click();
  });
  assert.equal(await page.evaluate(() => globalThis.__stage7Results.replayCalls()), 1);
  assert.equal(await page.getByRole("button", { name: "Requesting new match…" }).isDisabled(), true);
  await page.evaluate(() => globalThis.__stage7Results.resolveReplay());

  await page.evaluate(() => globalThis.__stage7Results.renderForfeit());
  assert.match(
    await page.locator(".route-line").innerText(),
    /Match ended during hand 1 after 0 accepted hand results/
  );

  await page.evaluate(() => { document.documentElement.style.fontSize = "400%"; });
  await page.waitForTimeout(50);
  const reflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  assert.ok(
    reflow.scrollWidth <= reflow.clientWidth,
    `final result must reflow at 400%: ${reflow.scrollWidth}px > ${reflow.clientWidth}px`
  );
  await context.close();
} finally {
  await browser.close();
  await testServer.close();
}

console.log("Stage 7 online results, acknowledgement, replay, refresh, and reflow acceptance passed.");

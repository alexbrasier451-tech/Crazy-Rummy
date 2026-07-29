import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

import { ROUTES } from "../../src/app/route-contract.js";
import { startTestServer } from "./test-server.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const dist = path.join(root, "dist");
const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 900 }
];

async function buildProductionApp() {
  const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
  await execFileAsync(process.execPath, [viteCli, "build"], {
    cwd: root,
    env: { ...process.env, CRAZY_RUMMY_PWA_REVISION: "smoke-test" },
    windowsHide: true
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    overflowers: [...document.querySelectorAll("body *")]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.right > document.documentElement.clientWidth + 1
          || rect.left < -1;
      })
      .slice(0, 8)
      .map((node) => ({
        tag: node.tagName,
        className: node.className,
        left: Math.round(node.getBoundingClientRect().left),
        right: Math.round(node.getBoundingClientRect().right),
        scrollWidth: node.scrollWidth
      }))
  }));
  assert.ok(
    metrics.documentWidth <= metrics.viewportWidth,
    `${label} overflows horizontally: `
      + `${metrics.documentWidth}px > ${metrics.viewportWidth}px `
      + JSON.stringify(metrics.overflowers)
  );
}

async function assertTapTargets(page, label) {
  const undersized = await page.locator("#main-content .action, #main-content button.playing-card").evaluateAll((nodes) =>
    nodes.filter((node) => node.getClientRects().length > 0).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        label: node.getAttribute("aria-label") || node.textContent.trim(),
        width: rect.width,
        height: rect.height
      };
    }).filter(({ width, height }) => width < 44 || height < 44)
  );
  assert.deepEqual(undersized, [], `${label} actions must be at least 44 by 44 CSS pixels`);
}

await buildProductionApp();

const testServer = await startTestServer({ root: dist });
const browser = await chromium.launch({ headless: true });

try {
  for (const { width, height } of viewports) {
    const context = await browser.newContext({
      viewport: { width, height },
      serviceWorkers: "block"
    });
    const page = await context.newPage();

    for (const route of ROUTES) {
      await page.goto(`${testServer.origin}/#${route.path}`, {
        waitUntil: "domcontentloaded"
      });
      const screen = page.locator(`[data-screen="${route.id}"]`);
      await screen.waitFor();
      await screen.getByRole("heading", { level: 1 }).waitFor();
      await assertNoHorizontalOverflow(page, `${route.path} at ${width}px`);
    }

    await page.goto(`${testServer.origin}/#/identity`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(() => document.activeElement?.tagName === "H1");
    await page.keyboard.press("Tab");
    assert.equal(
      await page.locator(":focus").getAttribute("href"),
      "#/rules",
      `Identity keyboard order should reach Rules first at ${width}px`
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page.locator(":focus").getAttribute("id"),
      "display-name",
      `Identity keyboard order should next reach Display name at ${width}px`
    );
    await page.getByLabel("Display name").waitFor();
    await page.getByRole("button", { name: "Save and continue" }).waitFor();
    await assertTapTargets(page, `Identity at ${width}px`);

    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block"
  });
  const page = await context.newPage();

  await page.goto(`${testServer.origin}/#/`, { waitUntil: "domcontentloaded" });
  await assertTapTargets(page, "Startup");
  const splashArt = page.getByRole("img", {
    name: "Dogs and cats playing cards together in a moonlit railway carriage."
  });
  await splashArt.waitFor();
  await page.waitForFunction(() =>
    document.querySelector(".splash-card__art")?.naturalWidth > 0
  );
  assert.equal(await page.getByText("Crazy Rummy", { exact: true }).count() >= 1, true);
  await page.getByText("A game by Alex Brasier", { exact: true }).waitFor();
  await page.getByText("13 hands · 2–6 players · one wild ride", { exact: true }).waitFor();
  await assertNoHorizontalOverflow(page, "Splash at 390px");
  await page.getByRole("button", { name: "Change player" }).click();
  await page.waitForURL(/#\/identity$/);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.waitForURL(/#\/lobby$/);
  await assertTapTargets(page, "Lobby");
  await page.getByRole("button", { name: "Go online" }).click();
  await page.getByText(/offline|unavailable|not configured/i).first().waitFor();
  await page.goto(`${testServer.origin}/#/waiting-room`, {
    waitUntil: "domcontentloaded"
  });
  await assertTapTargets(page, "Waiting room");
  await page.getByRole("button", { name: "Return to Lobby" }).click();
  await page.waitForURL(/#\/lobby$/);
  await page.goto(`${testServer.origin}/#/game`, {
    waitUntil: "domcontentloaded"
  });
  await assertTapTargets(page, "Game");
  await page.locator('[data-game-workspace="local"]').waitFor();
  await page.getByRole("button", { name: "Open Game table menu" }).click();
  await page.getByRole("dialog", { name: "Game table menu" })
    .getByRole("button", { name: "Return to lobby" }).click();
  await page.waitForURL(/#\/lobby$/);

  const menuButton = page.getByRole("button", { name: "Open Lobby menu" });
  await menuButton.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Lobby menu" }).waitFor();
  assert.equal(
    await page.locator(":focus").getAttribute("aria-label"),
    "Close menu",
    "dialog focus should enter at its labelled close control"
  );
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Lobby menu" }).waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    document.activeElement?.getAttribute("aria-label") === "Open Lobby menu"
  );
  assert.equal(
    await page.locator(":focus").getAttribute("aria-label"),
    "Open Lobby menu",
    "dialog dismissal should restore focus to its invoker"
  );
  assert.match(page.url(), /#\/lobby$/);

  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Lobby menu" }).waitFor();
  await page.getByRole("dialog").getByRole("link", { name: "Rules" }).click();
  await page.waitForURL(/#\/rules$/);
  await page.getByRole("link", { name: "Lobby" }).click();
  await page.waitForURL(/#\/lobby$/);
  await menuButton.click();
  await page.getByRole("dialog").getByRole("link", { name: "Settings" }).click();
  await page.waitForURL(/#\/settings$/);
  await page.getByRole("heading", { name: "Install and offline status" }).waitFor();
  await page.getByText(/Checking app shell|Installing app shell|App shell unavailable|Offline shell ready/).first().waitFor();
  await assertTapTargets(page, "Settings");

  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`${testServer.origin}/#/game`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  const gameUrl = page.url();
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  assert.equal(page.url(), gameUrl, "skip link must preserve the game hash route");
  assert.equal(
    await page.locator(":focus").getAttribute("id"),
    "main-content",
    "skip link must focus the rendered main landmark"
  );

  await page.locator(".skip-link").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const focusStyle = await page.locator(".skip-link").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth)
    };
  });
  assert.notEqual(focusStyle.outlineStyle, "none");
  assert.ok(focusStyle.outlineWidth >= 2, "keyboard focus needs a visible outline");

  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await assertNoHorizontalOverflow(page, "Game at 320-equivalent 200% text reflow");
  await page.addStyleTag({ content: "html { font-size: 400% !important; }" });
  await assertNoHorizontalOverflow(page, "Game at 320-equivalent 400% zoom reflow");
  const activeSeatId = await page.locator('[data-game-workspace="local"]').getAttribute("data-active-seat-id");
  await page.locator('[data-game-control="toggle-game-details"]').click();
  await page.locator('[data-game-control="developer-seat"]').selectOption(activeSeatId);
  await page.locator('[data-private-hand] button.playing-card').first().click();
  await page.locator('[data-game-control="open-actions"]').click();
  const primaryAction = page.locator('[data-game-control="discard"]');
  await primaryAction.scrollIntoViewIfNeeded();
  const actionBox = await primaryAction.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(actionBox && actionBox.y >= 0 && actionBox.y + actionBox.height <= viewport.height);

  await page.setViewportSize({ width: 320, height: 568 });
  await primaryAction.click();
  const confirmOpening = page.locator('[data-game-control="confirm-opening-discard"]');
  await confirmOpening.scrollIntoViewIfNeeded();
  const confirmBox = await confirmOpening.boundingBox();
  const shortViewport = page.viewportSize();
  assert.ok(
    confirmBox
      && confirmBox.y >= 0
      && confirmBox.y + confirmBox.height <= shortViewport.height,
    "the decision-sheet primary action must remain reachable above a short virtual-keyboard viewport"
  );

  await context.close();

  const mediaContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    serviceWorkers: "block"
  });
  const mediaPage = await mediaContext.newPage();
  await mediaPage.goto(`${testServer.origin}/#/game`, { waitUntil: "domcontentloaded" });

  const privateCard = mediaPage.locator('[data-private-hand] [data-card-id]').first();
  await privateCard.focus();
  await mediaPage.keyboard.press("Space");
  const reducedMotion = await privateCard.evaluate(
    (node) => {
      const style = getComputedStyle(node);
      return {
        transform: style.transform,
        transitionSeconds: Math.max(
          ...style.transitionDuration.split(",").map((value) => Number.parseFloat(value))
        )
      };
    }
  );
  assert.equal(reducedMotion.transform, "none");
  assert.ok(
    reducedMotion.transitionSeconds <= 0.001,
    "reduced motion should collapse transitions to at most 1ms"
  );

  await mediaPage.emulateMedia({ forcedColors: "active" });
  const forcedColourBorder = await mediaPage.locator('[data-private-hand] [data-card-id]').first().evaluate(
    (node) => {
      const style = getComputedStyle(node);
      return {
        style: style.borderTopStyle,
        width: Number.parseFloat(style.borderTopWidth)
      };
    }
  );
  assert.notEqual(forcedColourBorder.style, "none");
  assert.ok(forcedColourBorder.width >= 2, "forced colours should preserve card borders");
  await mediaContext.close();
} finally {
  await browser.close();
  await testServer.close();
}

console.log("Navigation, accessibility, and responsive smoke checks passed.");

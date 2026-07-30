import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

import { startTestServer } from "./test-server.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const testServer = await startTestServer({ root });
const execFileAsync = promisify(execFile);
const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
await execFileAsync(process.execPath, [viteCli, "build"], {
  cwd: root,
  env: { ...process.env, CRAZY_RUMMY_PWA_REVISION: "stage-1-1-3-pregame" },
  windowsHide: true
});
const appServer = await startTestServer({ root: path.join(root, "dist") });
const browser = await chromium.launch({ headless: true });
const cssText = await readFile(path.join(root, "src", "styles", "v11-pregame.css"), "utf8");
const captureRoot = path.join(root, "docs", "v1.1", "stage-1.1.3", "captures");
const capture = process.env.CRAZY_RUMMY_CAPTURE_PREGAME === "1";
if (capture) await mkdir(captureRoot, { recursive: true });

async function assertNoOverflow(page, label) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth
  }));
  assert.ok(widths.document <= widths.viewport, `${label} overflows: ${JSON.stringify(widths)}`);
}

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  await page.goto(`${appServer.origin}/#/`, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: cssText });
  await page.locator('[data-screen="startup"]').waitFor();
  assert.equal(await page.locator(".v11-arrival-route__station").count(), 13);
  await page.getByRole("img", { name: "Crazy Rummy route-node wordmark for The Midnight Limited." }).waitFor();
  await assertNoOverflow(page, "startup");
  if (capture) await page.screenshot({ path: path.join(captureRoot, "startup-390x844.png"), fullPage: true });
  await page.getByRole("button", { name: /Choose your player|Change player/ }).click();
  await page.locator('[data-screen="identity"]').waitFor();
  await page.addStyleTag({ content: cssText });
  await page.getByText("Stored on this device — not an account.").waitFor();
  assert.equal(await page.locator(".v11-marker-option").count(), 4);
  for (const label of ["Diamond marker", "Circle marker", "Square marker", "Triangle marker"]) {
    await page.getByRole("radio", { name: label }).waitFor();
  }
  await assertNoOverflow(page, "identity");
  if (capture) await page.screenshot({ path: path.join(captureRoot, "identity-390x844.png"), fullPage: true });

  await page.goto(`${appServer.origin}/#/lobby`, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: cssText });
  await page.locator(".v11-departures-empty").waitFor();
  if (capture) await page.screenshot({ path: path.join(captureRoot, "lobby-offline-empty-390x844.png"), fullPage: true });

  await page.goto(`${testServer.origin}/tests/browser/online-harness.html`, {
    waitUntil: "domcontentloaded"
  });
  await page.addStyleTag({ content: cssText });
  await page.getByRole("heading", { name: "Open tables" }).waitFor();
  await page.locator(".v11-lobby-threshold").waitFor();
  await page.locator(".v11-departure-ticket").waitFor();
  assert.equal(await page.locator(".v11-lobby-gates").count(), 1);
  await assertNoOverflow(page, "healthy lobby");
  if (capture) await page.screenshot({ path: path.join(captureRoot, "lobby-healthy-390x844.png"), fullPage: true });

  await page.getByRole("button", { name: "Join table" }).click();
  await page.getByRole("heading", { level: 1, name: "Waiting room" }).waitFor();
  await page.locator(".v11-room-ticket").waitFor();
  await page.locator(".v11-seating-plan").waitFor();
  assert.equal(await page.locator(".v11-seat-plaque").count(), 6);
  assert.equal(await page.locator(".v11-departure-line").count(), 1);
  await assertNoOverflow(page, "waiting room");
  if (capture) await page.screenshot({ path: path.join(captureRoot, "waiting-room-390x844.png"), fullPage: true });
  await context.close();

  const adaptiveContext = await browser.newContext({
    viewport: { width: 320, height: 568 },
    reducedMotion: "reduce",
    forcedColors: "active",
    serviceWorkers: "block"
  });
  const adaptivePage = await adaptiveContext.newPage();
  await adaptivePage.goto(`${testServer.origin}/tests/browser/online-harness.html`, {
    waitUntil: "domcontentloaded"
  });
  await adaptivePage.addStyleTag({ content: cssText });
  await adaptivePage.locator(".v11-departure-ticket").waitFor();
  const adaptiveStyle = await adaptivePage.locator(".v11-departure-ticket").first().evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      animationName: style.animationName,
      borderStyle: style.borderTopStyle,
      borderWidth: Number.parseFloat(style.borderTopWidth)
    };
  });
  assert.equal(adaptiveStyle.animationName, "none");
  assert.notEqual(adaptiveStyle.borderStyle, "none");
  assert.ok(adaptiveStyle.borderWidth >= 2);
  await assertNoOverflow(adaptivePage, "forced-colour reduced-motion lobby");
  if (capture) await adaptivePage.screenshot({
    path: path.join(captureRoot, "lobby-forced-colour-reduced-motion-320x568.png"),
    fullPage: true
  });
  await adaptiveContext.close();
} finally {
  await browser.close();
  await testServer.close();
  await appServer.close();
}

console.log("Stage 1.1.3 pre-game compositions and adaptive states passed.");

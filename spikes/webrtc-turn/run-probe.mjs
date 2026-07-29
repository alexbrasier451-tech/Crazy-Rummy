import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProbeServer } from "./probe-server.mjs";

const require = createRequire(import.meta.url);
const mode = readMode();
const playwright = loadPlaywright();
const server = await startProbeServer({
  iceTransportPolicy: mode === "relay" ? "relay" : "all",
});
const originalCwd = process.cwd();
const browserWorkDir = await mkdtemp(join(tmpdir(), "crazy-rummy-webrtc-"));
const chromeLogFile = join(browserWorkDir, "chromium.log");

let browser;
try {
  process.chdir(browserWorkDir);
  browser = await playwright.chromium.launch({
    headless: true,
    args: [`--log-file=${chromeLogFile}`],
    env: {
      ...process.env,
      CHROME_LOG_FILE: chromeLogFile,
    },
  });
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  const room = `probe_${randomUUID().replaceAll("-", "")}`;
  const timeout = Number(process.env.PROBE_TIMEOUT_MS || 30_000);

  await guestPage.goto(`${server.origin}/?room=${room}&role=guest`);
  await hostPage.goto(`${server.origin}/?room=${room}&role=host`);

  await Promise.all([
    waitForTerminalState(hostPage, timeout),
    waitForTerminalState(guestPage, timeout),
  ]);

  const host = await hostPage.evaluate(() => window.__probeReport);
  const guest = await guestPage.evaluate(() => window.__probeReport);
  const result = {
    mode,
    environment: "two isolated Chromium contexts on one desktop",
    host,
    guest,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!host?.passed || !guest?.passed) {
    process.exitCode = 1;
  }

  await Promise.all([hostContext.close(), guestContext.close()]);
} finally {
  await browser?.close();
  await server.close();
  process.chdir(originalCwd);
  await rm(browserWorkDir, { force: true, recursive: true });
}

function readMode() {
  const argument = process.argv.find((value) => value.startsWith("--mode="));
  const value = argument?.split("=")[1] || "direct";
  if (!["direct", "relay"].includes(value)) {
    throw new Error("Use --mode=direct or --mode=relay.");
  }
  return value;
}

function loadPlaywright() {
  const packageName = process.env.PLAYWRIGHT_PACKAGE || "playwright";
  try {
    return require(packageName);
  } catch (error) {
    throw new Error(
      `Could not load Playwright from ${packageName}. Set PLAYWRIGHT_PACKAGE to an installed package directory.`,
      { cause: error },
    );
  }
}

async function waitForTerminalState(page, timeout) {
  await page.waitForFunction(
    () => ["passed", "failed"].includes(document.querySelector("#status")?.dataset.status),
    null,
    { timeout },
  );
}

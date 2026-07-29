import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProbeServer } from "./probe-server.mjs";

const require = createRequire(import.meta.url);
const playwright = loadPlaywright();
const apiKey = process.env.METERED_PUBLISHABLE_KEY;
if (!/^pk_live_[a-zA-Z0-9]+$/.test(apiKey || "")) {
  throw new Error("Set METERED_PUBLISHABLE_KEY to the frontend-safe pk_live_ key.");
}

const server = await startProbeServer();
const originalCwd = process.cwd();
const browserWorkDir = await mkdtemp(join(tmpdir(), "crazy-rummy-metered-"));
let browser;

try {
  process.chdir(browserWorkDir);
  browser = await playwright.chromium.launch({
    headless: true,
    args: [`--log-file=${join(browserWorkDir, "chromium.log")}`],
  });
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  const diagnostics = { host: [], guest: [] };
  captureDiagnostics(hostPage, diagnostics.host);
  captureDiagnostics(guestPage, diagnostics.guest);
  const room = `crazy-rummy-probe-${randomUUID().replaceAll("-", "")}`;
  const timeout = Number(process.env.PROBE_TIMEOUT_MS || 45_000);

  await Promise.all([
    hostPage.addInitScript((key) => {
      window.__METERED_PUBLISHABLE_KEY = key;
    }, apiKey),
    guestPage.addInitScript((key) => {
      window.__METERED_PUBLISHABLE_KEY = key;
    }, apiKey),
  ]);

  await guestPage.goto(`${server.origin}/metered.html?room=${room}&role=guest&policy=relay`);
  await hostPage.goto(`${server.origin}/metered.html?room=${room}&role=host&policy=relay`);

  try {
    await Promise.all([
      waitForTerminalState(hostPage, timeout),
      waitForTerminalState(guestPage, timeout),
    ]);
  } catch (error) {
    const state = {
      host: await readPageState(hostPage),
      guest: await readPageState(guestPage),
      diagnostics,
    };
    process.stderr.write(`${JSON.stringify(state, null, 2)}\n`);
    throw error;
  }

  const host = await hostPage.evaluate(() => window.__probeReport);
  const guest = await guestPage.evaluate(() => window.__probeReport);
  const result = {
    mode: "relay",
    provider: "Metered",
    environment: "two isolated Chromium contexts on one desktop",
    host,
    guest,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!host?.passed || !guest?.configuredTurn || !guest?.payloadReceived) {
    process.exitCode = 1;
  }

  await Promise.all([hostContext.close(), guestContext.close()]);
} finally {
  await browser?.close();
  await server.close();
  process.chdir(originalCwd);
  await rm(browserWorkDir, { force: true, recursive: true });
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

function captureDiagnostics(page, output) {
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      output.push(`console:${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => output.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    output.push(`requestfailed: ${request.url()} — ${request.failure()?.errorText}`);
  });
}

async function readPageState(page) {
  return page.evaluate(() => ({
    status: document.querySelector("#status")?.textContent,
    statusCode: document.querySelector("#status")?.dataset.status,
    report: window.__probeReport,
  }));
}

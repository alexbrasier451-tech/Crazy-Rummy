import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProbeServer } from "./probe-server.mjs";

const require = createRequire(import.meta.url);
const playwright = loadPlaywright();
const externalOrigin = process.env.PROBE_ORIGIN?.replace(/\/+$/, "");
const server = externalOrigin ? null : await startProbeServer();
const probeOrigin = externalOrigin || `${server.origin}/pages`;
const originalCwd = process.cwd();
const browserWorkDir = await mkdtemp(join(tmpdir(), "crazy-rummy-pages-"));
let browser;

try {
  process.chdir(browserWorkDir);
  browser = await playwright.chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: [`--log-file=${join(browserWorkDir, "chromium.log")}`],
  });

  await verifyLauncher();
  const results = [];
  results.push(await runPair("direct", "all"));
  results.push(await runPair("relay", "relay"));
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} finally {
  await browser?.close();
  await server?.close();
  process.chdir(originalCwd);
  await rm(browserWorkDir, { force: true, recursive: true });
}

async function verifyLauncher() {
  const page = await browser.newPage();
  await page.goto(`${probeOrigin}/`);
  const links = await page.locator("a[id]").evaluateAll((anchors) =>
    Object.fromEntries(anchors.map((anchor) => [
      anchor.id,
      { href: anchor.href, target: anchor.target },
    ])),
  );
  const directHost = new URL(links["direct-host"].href);
  const directGuest = new URL(links["direct-guest"].href);
  const relayHost = new URL(links["relay-host"].href);
  const relayGuest = new URL(links["relay-guest"].href);
  assert(directHost.searchParams.get("room") === directGuest.searchParams.get("room"),
    "Direct launcher links must share a room.");
  assert(relayHost.searchParams.get("room") === relayGuest.searchParams.get("room"),
    "Relay launcher links must share a room.");
  assert(directHost.searchParams.get("role") === "host", "Direct desktop link must be host.");
  assert(directGuest.searchParams.get("role") === "guest", "Direct phone link must be guest.");
  assert(relayHost.searchParams.get("policy") === "relay", "Relay desktop link must force relay.");
  assert(relayGuest.searchParams.get("policy") === "relay", "Relay phone link must force relay.");
  assert(links["direct-host"].target === "_blank", "Direct desktop link must preserve launcher.");
  assert(links["relay-host"].target === "_blank", "Relay desktop link must preserve launcher.");
  await page.locator("#test-code").fill("ABC234");
  await page.locator("#apply-code").click();
  const appliedRoom = await page
    .locator("#direct-guest")
    .evaluate((anchor) => new URL(anchor.href).searchParams.get("room"));
  assert(
    appliedRoom === "crazy-rummy-direct-manual-ABC234",
    "Entered pairing code must own the guest room.",
  );
  await page.reload();
  const reloadedDirectRoom = await page
    .locator("#direct-host")
    .evaluate((anchor) => new URL(anchor.href).searchParams.get("room"));
  assert(
    reloadedDirectRoom === "crazy-rummy-direct-manual-ABC234",
    "Launcher reload must preserve its paired room.",
  );
  await page.close();
}

async function runPair(mode, policy) {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  const code = createTestCode();
  const room = `crazy-rummy-${mode}-manual-${code}`;
  const timeout = Number(process.env.PROBE_TIMEOUT_MS || 45_000);

  try {
    await guestPage.goto(
      `${probeOrigin}/probe.html?room=${room}&role=guest&policy=${policy}`,
    );
    await hostPage.goto(
      `${probeOrigin}/probe.html?room=${room}&role=host&policy=${policy}`,
    );
    await Promise.all([
      waitForTerminalState(hostPage, timeout),
      waitForTerminalState(guestPage, timeout),
    ]);
    const host = await hostPage.evaluate(() => window.__probeReport);
    const guest = await guestPage.evaluate(() => window.__probeReport);
    assert(host?.passed, `${mode} host did not pass.`);
    assert(guest?.passed, `${mode} guest did not pass.`);
    return { mode, environment: "two isolated Chromium contexts", host, guest };
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createTestCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const source = randomUUID().replaceAll("-", "");
  return [...source.slice(0, 6)]
    .map((value) => alphabet[Number.parseInt(value, 16) % alphabet.length])
    .join("");
}

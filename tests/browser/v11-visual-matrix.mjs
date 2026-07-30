import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  readFile,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

import { startTestServer } from "./test-server.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const dist = path.join(root, "dist");

export const V11_VISUAL_VIEWPORTS = Object.freeze([
  { id: "compact", width: 320, height: 568, touch: true },
  { id: "baseline", width: 390, height: 844, touch: true },
  { id: "tablet", width: 768, height: 900, touch: false }
]);

export const V11_ROUTE_STATES = Object.freeze([
  { route: "/", screen: "startup", state: "first-visit", signature: ".v11-arrival-route" },
  { route: "/identity", screen: "identity", state: "empty", signature: ".v11-identity-ticket" },
  { route: "/lobby", screen: "lobby", state: "offline-empty", signature: ".v11-lobby-threshold" },
  { route: "/waiting-room", screen: "waiting-room", state: "no-room", signature: ".v11-waiting-empty" },
  { route: "/game", screen: "game", state: "opening-local", signature: ".game-compartment-table" },
  { route: "/hand-result", screen: "hand-result", state: "not-ready", signature: ".result-unavailable-ticket" },
  { route: "/final-result", screen: "final-result", state: "not-ready", signature: ".result-unavailable-ticket" },
  { route: "/rules", screen: "rules", state: "full-reference", signature: ".rules-timetable" },
  { route: "/settings", screen: "settings", state: "defaults", signature: ".settings-ticket" }
]);

export const V11_VISUAL_MATRIX = Object.freeze(
  V11_VISUAL_VIEWPORTS.flatMap((viewport) =>
    V11_ROUTE_STATES.map((entry) => Object.freeze({
      ...entry,
      ...viewport,
      lane: "route"
    }))
  )
);

export const V11_HIGH_RISK_MATRIX = Object.freeze([
  {
    lane: "high-risk",
    route: "/game",
    screen: "game",
    state: "selected-reduced-motion",
    signature: ".game-compartment-table",
    width: 390,
    height: 844,
    touch: true,
    reducedMotion: "reduce",
    forcedColors: "none",
    prepare: "selected"
  },
  {
    lane: "high-risk",
    route: "/game",
    screen: "game",
    state: "selected-forced-colours",
    signature: ".game-compartment-table",
    width: 390,
    height: 844,
    touch: true,
    reducedMotion: "no-preference",
    forcedColors: "active",
    prepare: "selected"
  },
  {
    lane: "high-risk",
    route: "/game",
    screen: "game",
    state: "decision-sheet-compact",
    signature: ".game-compartment-table",
    width: 320,
    height: 568,
    touch: true,
    reducedMotion: "no-preference",
    forcedColors: "none",
    prepare: "decision-sheet"
  }
]);

const AUTHORITY_MATRIX = Object.freeze([
  {
    lane: "authority-fixture",
    route: "/game",
    screen: "game",
    state: "pending-authority",
    signature: ".game-network-rail[data-network-truth=pending]",
    width: 390,
    height: 844,
    touch: true
  },
  {
    lane: "authority-fixture",
    route: "/game",
    screen: "game",
    state: "accepted-authority",
    signature: ".game-workspace[data-network-mode=running]",
    width: 390,
    height: 844,
    touch: true
  }
]);

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function captureFilename(entry) {
  const route = entry.route === "/"
    ? "startup"
    : entry.route.replace(/^\//, "").replaceAll("/", "-");
  return [
    "v11",
    entry.lane,
    route,
    entry.state,
    `${entry.width}x${entry.height}`
  ].join("-") + ".png";
}

function assertSafeOutputDirectory(outDirectory) {
  const resolved = path.resolve(outDirectory);
  const stageOneBaselines = path.resolve(root, "docs/v1.1/stage-1.1.1/exports");
  if (resolved === root || resolved === path.parse(resolved).root) {
    throw new Error("Refusing to write visual evidence to a repository or filesystem root.");
  }
  if (
    resolved === stageOneBaselines
    || resolved.startsWith(`${stageOneBaselines}${path.sep}`)
    || /(?:^|[\\/])baselines?(?:[\\/]|$)/i.test(resolved)
  ) {
    throw new Error("Refusing to update an approved or baseline directory; provide a fresh evidence output directory.");
  }
  return resolved;
}

async function removeExpectedOutputs(outDirectory, entries) {
  for (const entry of entries) {
    await unlink(path.join(outDirectory, captureFilename(entry))).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  await unlink(path.join(outDirectory, "v11-visual-matrix-manifest.json")).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}

async function buildProductionApp() {
  const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
  await execFileAsync(process.execPath, [viteCli, "build"], {
    cwd: root,
    env: {
      ...process.env,
      CRAZY_RUMMY_PWA_REVISION: "v11-visual-matrix"
    },
    windowsHide: true
  });
}

async function sourceRevision() {
  if (process.env.CRAZY_RUMMY_EVIDENCE_REVISION) {
    return process.env.CRAZY_RUMMY_EVIDENCE_REVISION;
  }
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      windowsHide: true
    });
    return stdout.trim() || "UNCOMMITTED";
  } catch {
    return "UNCOMMITTED";
  }
}

async function settlePage(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            })
      )
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    overflowers: [...document.querySelectorAll("body *")]
      .filter((node) => {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const bounds = node.getBoundingClientRect();
        return bounds.right > document.documentElement.clientWidth + 1
          || bounds.left < -1;
      })
      .slice(0, 8)
      .map((node) => ({
        tag: node.tagName,
        className: String(node.className),
        left: Math.round(node.getBoundingClientRect().left),
        right: Math.round(node.getBoundingClientRect().right)
      }))
  }));
  assert.ok(
    metrics.documentWidth <= metrics.viewportWidth,
    `${label} overflows horizontally: ${metrics.documentWidth}px > `
      + `${metrics.viewportWidth}px ${JSON.stringify(metrics.overflowers)}`
  );
}

async function assertPrimaryAndCardTargets(page, label, scope = "#main-content") {
  const undersized = await page.locator(
    `${scope} .action--primary, ${scope} button.playing-card`
  ).evaluateAll((nodes) =>
    nodes
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => {
        const bounds = node.getBoundingClientRect();
        return {
          label: node.getAttribute("aria-label") || node.textContent.trim(),
          width: Math.round(bounds.width * 10) / 10,
          height: Math.round(bounds.height * 10) / 10
        };
      })
      .filter(({ width, height }) => width < 44 || height < 44)
  );
  assert.deepEqual(undersized, [], `${label} has an undersized primary/card target`);
}

async function assertPrivacySafe(page, label) {
  const text = await page.locator("body").innerText();
  assert.doesNotMatch(
    text,
    /(?:seat-proof|shuffle seed|session credential|a=ice-ufrag|candidate:\d|v=0\r?\no=)/i,
    `${label} exposes private fixture or transport material`
  );
}

function installRequestAudit(page, expectedOrigin) {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  return () => {
    const external = requests.filter((value) => {
      const url = new URL(value);
      return !["data:", "blob:"].includes(url.protocol) && url.origin !== expectedOrigin;
    });
    assert.deepEqual(external, [], "visual evidence must use local runtime assets only");
    assert.equal(
      requests.some((value) => /\/art\/crazy-rummy-splash\.v1\.png(?:$|[?#])/i.test(value)),
      false,
      "the legacy raster splash must not load"
    );
    return requests.map((value) => new URL(value).pathname);
  };
}

async function prepareLocalGameState(page, mode) {
  const workspace = page.locator('[data-game-workspace="local"]');
  await workspace.waitFor();
  const activeSeatId = await workspace.getAttribute("data-active-seat-id");
  await page.locator('[data-game-control="toggle-game-details"]').click();
  await page.locator('[data-game-control="developer-seat"]').selectOption(activeSeatId);
  await page.locator('[data-game-control="toggle-game-details"]').click();
  const card = page.locator("[data-private-hand] button.playing-card").first();
  await card.click();
  assert.equal(await card.getAttribute("aria-pressed"), "true");
  if (mode === "decision-sheet") {
    await page.locator('[data-game-control="open-actions"]').click();
    await page.locator('[data-game-control="discard"]').click();
    await page.locator(".game-decision-bench").waitFor();
  }
}

async function captureRouteEntry({
  browser,
  server,
  outDirectory,
  entry,
  browserVersion
}) {
  const context = await browser.newContext({
    viewport: { width: entry.width, height: entry.height },
    deviceScaleFactor: 1,
    hasTouch: entry.touch,
    reducedMotion: entry.reducedMotion ?? "no-preference",
    forcedColors: entry.forcedColors ?? "none",
    locale: "en-GB",
    timezoneId: "Europe/London",
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  const finishRequestAudit = installRequestAudit(page, server.origin);
  try {
    await page.goto(`${server.origin}/#${entry.route}`, {
      waitUntil: "domcontentloaded"
    });
    const screen = page.locator(`[data-screen="${entry.screen}"]`);
    await screen.waitFor();
    await page.locator(entry.signature).first().waitFor();
    if (entry.prepare) await prepareLocalGameState(page, entry.prepare);
    await settlePage(page);
    await assertNoHorizontalOverflow(page, `${entry.route}/${entry.state} at ${entry.width}`);
    await assertPrimaryAndCardTargets(page, `${entry.route}/${entry.state}`);
    await assertPrivacySafe(page, `${entry.route}/${entry.state}`);

    if (entry.screen === "startup") {
      const source = await page.locator(".v11-arrival-card img").getAttribute("src");
      assert.match(source, /\/assets\/brand\/crazy-rummy-wordmark\.v1\.svg$/);
    }
    if (entry.reducedMotion === "reduce") {
      const card = page.locator("[data-private-hand] button.playing-card").first();
      const style = await card.evaluate((node) => {
        const computed = getComputedStyle(node);
        return {
          transform: computed.transform,
          maxTransition: Math.max(...computed.transitionDuration
            .split(",")
            .map((value) => Number.parseFloat(value)))
        };
      });
      assert.equal(style.transform, "none");
      assert.ok(style.maxTransition <= 0.001);
    }
    if (entry.forcedColors === "active") {
      const border = await page.locator("[data-private-hand] button.playing-card")
        .first()
        .evaluate((node) => {
          const computed = getComputedStyle(node);
          return {
            style: computed.borderTopStyle,
            width: Number.parseFloat(computed.borderTopWidth)
          };
        });
      assert.notEqual(border.style, "none");
      assert.ok(border.width >= 2);
    }

    const filename = captureFilename(entry);
    await page.screenshot({
      path: path.join(outDirectory, filename),
      animations: "disabled",
      fullPage: false
    });
    const metadata = await stat(path.join(outDirectory, filename));
    const requests = finishRequestAudit();
    return {
      ...entry,
      filename,
      bytes: metadata.size,
      browser: `Chromium ${browserVersion}`,
      deviceScaleFactor: 1,
      fixture: entry.screen === "game"
        ? "deterministic local integration session"
        : "deterministic empty/offline production route",
      requestPaths: [...new Set(requests)].sort()
    };
  } finally {
    await context.close();
  }
}

async function captureAuthorityEntries({
  browser,
  sourceServer,
  outDirectory,
  browserVersion
}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    locale: "en-GB",
    timezoneId: "Europe/London",
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  const finishRequestAudit = installRequestAudit(page, sourceServer.origin);
  const entries = [];
  try {
    await page.goto(`${sourceServer.origin}/tests/browser/online-game.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(() => Boolean(globalThis.onlineGameHarness), null, {
      timeout: 8_000
    });
    await page.evaluate(() => globalThis.onlineGameHarness.ready);
    await page.addStyleTag({
      content: [
        "#seat-a, #seat-c { display: none !important; }",
        "#app { display: block !important; }",
        "#seat-b { display: block; width: 100%; min-width: 0; }"
      ].join("\n")
    });

    const pending = await page.evaluate(() =>
      globalThis.onlineGameHarness.pendingOpening()
    );
    assert.equal(pending.result.queued, true);
    assert.equal(String(pending.action.phase).toLowerCase(), "pending");
    await page.locator("#seat-b [data-network-mode=pending]").waitFor();
    await page.locator("#seat-b").getByRole("status")
      .getByText(/Action pending|Waiting for host acceptance/i)
      .first()
      .waitFor();
    await settlePage(page);
    await assertNoHorizontalOverflow(page, "online pending authority fixture");
    await assertPrimaryAndCardTargets(page, "online pending authority fixture", "#seat-b");
    await assertPrivacySafe(page, "online pending authority fixture");

    const pendingEntry = AUTHORITY_MATRIX[0];
    const pendingFilename = captureFilename(pendingEntry);
    await page.screenshot({
      path: path.join(outDirectory, pendingFilename),
      animations: "disabled",
      fullPage: false
    });
    entries.push({
      ...pendingEntry,
      filename: pendingFilename,
      bytes: (await stat(path.join(outDirectory, pendingFilename))).size,
      browser: `Chromium ${browserVersion}`,
      deviceScaleFactor: 1,
      fixture: "deterministic three-seat authenticated online fixture; only seat B view is visible",
      authorityPhase: "pending",
      authorityRevision: 1
    });

    await page.evaluate(() => globalThis.onlineGameHarness.releaseOpening());
    await page.locator("#seat-b [data-network-mode=running][data-revision='2']").waitFor();
    const settled = await page.evaluate(() =>
      globalThis.onlineGameHarness.snapshots().b.lastAction
    );
    assert.equal(String(settled.phase).toLowerCase(), "accepted");
    await settlePage(page);
    await assertNoHorizontalOverflow(page, "online accepted authority fixture");

    const acceptedEntry = AUTHORITY_MATRIX[1];
    const acceptedFilename = captureFilename(acceptedEntry);
    await page.screenshot({
      path: path.join(outDirectory, acceptedFilename),
      animations: "disabled",
      fullPage: false
    });
    entries.push({
      ...acceptedEntry,
      filename: acceptedFilename,
      bytes: (await stat(path.join(outDirectory, acceptedFilename))).size,
      browser: `Chromium ${browserVersion}`,
      deviceScaleFactor: 1,
      fixture: "deterministic three-seat authenticated online fixture; only seat B view is visible",
      authorityPhase: "accepted",
      authorityRevision: 2
    });

    const requests = finishRequestAudit();
    for (const entry of entries) {
      entry.requestPaths = [...new Set(requests)].sort();
    }
    return entries;
  } finally {
    await page.evaluate(() => globalThis.onlineGameHarness?.close?.()).catch(() => {});
    await context.close();
  }
}

export async function captureV11VisualMatrix(outDirectory) {
  const resolvedOut = assertSafeOutputDirectory(outDirectory);
  const allEntries = [
    ...V11_VISUAL_MATRIX,
    ...V11_HIGH_RISK_MATRIX,
    ...AUTHORITY_MATRIX
  ];
  await mkdir(resolvedOut, { recursive: true });
  await removeExpectedOutputs(resolvedOut, allEntries);
  await buildProductionApp();

  const productionServer = await startTestServer({ root: dist });
  const sourceServer = await startTestServer({ root });
  const browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();
  const captured = [];
  try {
    for (const entry of [...V11_VISUAL_MATRIX, ...V11_HIGH_RISK_MATRIX]) {
      captured.push(await captureRouteEntry({
        browser,
        server: productionServer,
        outDirectory: resolvedOut,
        entry,
        browserVersion
      }));
    }
    captured.push(...await captureAuthorityEntries({
      browser,
      sourceServer,
      outDirectory: resolvedOut,
      browserVersion
    }));
  } finally {
    await browser.close();
    await productionServer.close();
    await sourceServer.close();
  }

  const manifest = {
    schemaVersion: 1,
    stage: "v1.1 Stage 1.1.7",
    generator: "tests/browser/v11-visual-matrix.mjs",
    generatedAt: process.env.CRAZY_RUMMY_EVIDENCE_DATE ?? new Date().toISOString(),
    sourceRevision: await sourceRevision(),
    browser: `Chromium ${browserVersion}`,
    locale: "en-GB",
    timezone: "Europe/London",
    deviceScaleFactor: 1,
    baselineUpdate: false,
    automatedEvidenceOnly: true,
    privacyBoundary: "Production routes use deterministic local/empty views. Authority captures show only authenticated seat B; fixture siblings are hidden before export.",
    evidenceLimits: [
      "No approved visual baseline or pixel-diff judgement is created or updated.",
      "No human art-direction or owner approval is implied.",
      "No physical-device, installed-PWA, screen-reader, browser-chrome, GPU, thermal, or touch evidence is implied.",
      "The source-served authority fixture proves pending/accepted UI truth but is separate from the production-build route captures."
    ],
    entries: captured
  };
  const manifestPath = path.join(resolvedOut, "v11-visual-matrix-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { outDirectory: resolvedOut, manifestPath, manifest };
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const out = argumentValue("--out");
  if (!out) {
    throw new Error("Usage: node tests/browser/v11-visual-matrix.mjs --out <fresh-output-directory>");
  }
  const result = await captureV11VisualMatrix(out);
  const persisted = JSON.parse(await readFile(result.manifestPath, "utf8"));
  console.log(
    `Captured ${persisted.entries.length} automated v1.1 evidence images in ${result.outDirectory}. `
      + "No baseline or human/device gate was approved."
  );
}

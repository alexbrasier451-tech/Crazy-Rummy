import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

import { startTestServer } from "./test-server.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const basePath = "/Crazy-Rummy/";
const buildDirectory = await mkdtemp(
  path.join(tmpdir(), "crazy-rummy-github-pages-")
);
let browser;
let context;
let testServer;

try {
  const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
  await execFileAsync(
    process.execPath,
    [viteCli, "build", "--outDir", buildDirectory, "--emptyOutDir"],
    {
      cwd: root,
      env: {
        ...process.env,
        CRAZY_RUMMY_BASE_PATH: basePath,
        CRAZY_RUMMY_PWA_REVISION: "github-pages-acceptance",
        VITE_CRAZY_RUMMY_ONLINE_ENABLED: "true",
        VITE_METERED_PUBLISHABLE_KEY:
          "pk_live_githubpagesacceptance123"
      },
      windowsHide: true
    }
  );

  const precacheFilename = (await readdir(buildDirectory)).find((entry) =>
    /^precache-manifest\.[a-f0-9]+\.json$/.test(entry)
  );
  assert.ok(precacheFilename);
  const precache = JSON.parse(await readFile(
    path.join(buildDirectory, precacheFilename),
    "utf8"
  ));
  assert.equal(precache.navigationShell, `${basePath}index.html`);
  assert.deepEqual(precache.navigationRoutes, [
    basePath,
    `${basePath}rules`
  ]);
  assert.ok(precache.assets.every(({ url }) => url.startsWith(basePath)));

  testServer = await startTestServer({
    root: buildDirectory,
    mountPath: basePath
  });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  const failedResponses = [];
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({
        status: response.status(),
        url: response.url()
      });
    }
  });

  await page.goto(`${testServer.origin}${basePath}#/settings`, {
    waitUntil: "domcontentloaded"
  });
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const registration = await page.evaluate(async () => {
    const current = await navigator.serviceWorker.getRegistration();
    return {
      scope: current?.scope,
      scriptUrl: current?.active?.scriptURL
    };
  });
  assert.equal(registration.scope, `${testServer.origin}${basePath}`);
  assert.equal(registration.scriptUrl, `${testServer.origin}${basePath}sw.js`);

  const manifest = await page.evaluate(async (url) =>
    fetch(url).then((response) => response.json()),
  `${basePath}manifest.webmanifest`);
  const manifestUrl = new URL(
    `${basePath}manifest.webmanifest`,
    testServer.origin
  );
  assert.equal(
    new URL(manifest.start_url, manifestUrl).pathname,
    basePath
  );
  assert.equal(new URL(manifest.scope, manifestUrl).pathname, basePath);
  assert.ok(manifest.icons.every(({ src }) =>
    new URL(src, manifestUrl).pathname.startsWith(`${basePath}icons/`)
  ));

  const sameOriginResources = await page.evaluate((origin) =>
    performance.getEntriesByType("resource")
      .map(({ name }) => new URL(name))
      .filter((url) => url.origin === origin)
      .map((url) => url.pathname),
  testServer.origin);
  assert.ok(sameOriginResources.length > 0);
  assert.ok(sameOriginResources.every((pathname) =>
    pathname.startsWith(basePath)
  ));
  assert.deepEqual(failedResponses, []);

  const rootAsset = await page.request.get(
    `${testServer.origin}/assets/cards/card-back-midnight-lattice.v1.svg`
  );
  assert.equal(rootAsset.status(), 404);

  await context.setOffline(true);
  await page.goto(`${testServer.origin}${basePath}#/rules`, {
    waitUntil: "domcontentloaded"
  });
  assert.match(await page.locator("body").innerText(), /Crazy Rummy rules/i);
  const offlineArt = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return {
      ok: response.ok,
      hasSvg: (await response.text()).includes("<svg")
    };
  }, `${basePath}assets/cards/card-back-midnight-lattice.v1.svg`);
  assert.deepEqual(offlineArt, { ok: true, hasSvg: true });
} finally {
  await context?.setOffline(false).catch(() => {});
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await testServer?.close().catch(() => {});
  await rm(buildDirectory, { recursive: true, force: true });
}

console.log("GitHub Pages base path, PWA scope, assets, and offline checks passed.");

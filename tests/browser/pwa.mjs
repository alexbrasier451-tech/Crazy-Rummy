import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

import { startTestServer } from "./test-server.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const ART_URLS = [
  "/art/baize-texture.v1.svg",
  "/art/card-back-lattice.v1.svg",
  "/art/route-tickets.v1.svg"
];

async function buildProductionApp(outDirectory, revision) {
  const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
  await execFileAsync(
    process.execPath,
    [viteCli, "build", "--outDir", outDirectory, "--emptyOutDir"],
    {
      cwd: root,
      env: { ...process.env, CRAZY_RUMMY_PWA_REVISION: revision },
      windowsHide: true
    }
  );
}

async function readGeneratedPrecacheManifest(directory) {
  const filename = (await readdir(directory)).find((entry) =>
    /^precache-manifest\.[a-f0-9]+\.json$/.test(entry)
  );
  assert.ok(filename, "the build should emit a versioned precache manifest");
  return JSON.parse(await readFile(path.join(directory, filename), "utf8"));
}

function validateWebManifest(webManifest, distDirectory) {
  assert.equal(webManifest.display, "standalone");
  assert.equal(webManifest.orientation, "portrait-primary");
  assert.equal(webManifest.scope, "./");
  assert.match(webManifest.start_url, /#\/lobby/);
  assert.ok(webManifest.icons.some(({ purpose }) => purpose === "any"));
  assert.ok(webManifest.icons.some(({ purpose }) => purpose === "maskable"));

  return Promise.all(webManifest.icons.map(async (icon) => {
    assert.equal(icon.type, "image/svg+xml");
    assert.equal(icon.sizes, "any");
    await stat(path.join(distDirectory, icon.src.replace(/^\//, "")));
  }));
}

function validatePrecacheManifest(precacheManifest) {
  assert.equal(
    precacheManifest.cacheName,
    `crazy-rummy-static-${precacheManifest.version}`
  );
  assert.deepEqual(precacheManifest.navigationRoutes, ["/", "/rules"]);
  assert.ok(precacheManifest.assets.length > 0);
  assert.ok(precacheManifest.assets.every(({ url }) =>
    url.startsWith("/assets/")
      || url.startsWith("/art/")
      || url.startsWith("/icons/")
  ));
  assert.ok(precacheManifest.assets.every(({ url }) =>
    !/(?:api|session|token|room|match)/i.test(url)
  ));
  assert.deepEqual(
    precacheManifest.assets
      .map(({ url }) => url)
      .filter((url) => url.startsWith("/art/")),
    ART_URLS
  );
}

const buildRoot = await mkdtemp(path.join(tmpdir(), "crazy-rummy-pwa-browser-"));
const v1Directory = path.join(buildRoot, "v1");
const v2Directory = path.join(buildRoot, "v2");
let browser;
let context;
let testServer;

try {
  await buildProductionApp(v1Directory, "v1");
  await buildProductionApp(v2Directory, "v2");

  const [v1Manifest, v2Manifest, webManifest, v1Bootstrap, v2Bootstrap] =
    await Promise.all([
      readGeneratedPrecacheManifest(v1Directory),
      readGeneratedPrecacheManifest(v2Directory),
      readFile(path.join(v1Directory, "manifest.webmanifest"), "utf8")
        .then(JSON.parse),
      readFile(path.join(v1Directory, "sw.js"), "utf8"),
      readFile(path.join(v2Directory, "sw.js"), "utf8")
    ]);

  await validateWebManifest(webManifest, v1Directory);
  validatePrecacheManifest(v1Manifest);
  validatePrecacheManifest(v2Manifest);
  assert.notEqual(v2Manifest.version, v1Manifest.version);
  assert.notEqual(v2Manifest.cacheName, v1Manifest.cacheName);
  assert.notEqual(v2Bootstrap, v1Bootstrap);
  assert.match(v1Bootstrap, new RegExp(`sw\\.${v1Manifest.version}\\.js`));
  assert.match(v2Bootstrap, new RegExp(`sw\\.${v2Manifest.version}\\.js`));

  testServer = await startTestServer({ root: v1Directory });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();

  await page.goto(`${testServer.origin}/manifest.webmanifest`);
  await page.evaluate(async () => {
    const obsolete = await caches.open("crazy-rummy-static-obsolete");
    await obsolete.put("/obsolete.js", new Response("obsolete"));
  });

  await page.goto(`${testServer.origin}/#/settings`, {
    waitUntil: "domcontentloaded"
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const initialRegistration = await page.evaluate(async () => {
    const current = await navigator.serviceWorker.getRegistration();
    return {
      active: current?.active?.state,
      controlled: Boolean(navigator.serviceWorker.controller),
      scriptUrl: current?.active?.scriptURL
    };
  });
  assert.equal(initialRegistration.active, "activated");
  assert.equal(initialRegistration.controlled, true);
  assert.match(initialRegistration.scriptUrl, /\/sw\.js$/);

  await page.waitForFunction(
    () => caches.keys().then((names) =>
      !names.includes("crazy-rummy-static-obsolete")
    )
  );
  assert.deepEqual(
    await page.evaluate(async ({ cacheName, artUrls }) => {
      const cache = await caches.open(cacheName);
      return Promise.all(artUrls.map(async (url) => {
        const response = await cache.match(url);
        return {
          url,
          cached: Boolean(response),
          contentType: response?.headers.get("content-type")
        };
      }));
    }, { cacheName: v1Manifest.cacheName, artUrls: ART_URLS }),
    ART_URLS.map((url) => ({
      url,
      cached: true,
      contentType: "image/svg+xml"
    }))
  );

  await context.setOffline(true);
  const offlineArtV1 = await page.evaluate(async (artUrls) =>
    Promise.all(artUrls.map(async (url) => {
      const response = await fetch(url);
      return {
        url,
        ok: response.ok,
        hasSvg: (await response.text()).includes("<svg")
      };
    })), ART_URLS);
  assert.deepEqual(
    offlineArtV1,
    ART_URLS.map((url) => ({ url, ok: true, hasSvg: true }))
  );
  await context.setOffline(false);

  await page.evaluate(async () => {
    const obsolete = await caches.open("crazy-rummy-static-obsolete-update");
    await obsolete.put("/obsolete-update.js", new Response("obsolete"));
  });
  await testServer.setRoot(v2Directory);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
  });
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.waiting?.state === "installed";
  });

  const waitingCacheNames = await page.evaluate(() => caches.keys());
  assert.ok(waitingCacheNames.includes(v1Manifest.cacheName));
  assert.ok(waitingCacheNames.includes(v2Manifest.cacheName));
  assert.ok(waitingCacheNames.includes("crazy-rummy-static-obsolete-update"));

  const updateControl = page.getByRole("button", {
    name: "Update and reload",
    exact: true
  });
  await updateControl.waitFor();

  let controllerChanges = 0;
  await page.exposeFunction("__recordPwaControllerChange", () => {
    controllerChanges += 1;
  });
  await page.evaluate(() => {
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.__recordPwaControllerChange(),
      { once: true }
    );
  });

  await updateControl.click();
  await page.waitForFunction(
    () => document.querySelector(
      'meta[name="crazy-rummy-build-revision"]'
    )?.content === "v2"
  );
  assert.equal(controllerChanges, 1);

  await page.waitForFunction(
    ({ current, old, obsolete }) => caches.keys().then((names) =>
      names.includes(current)
        && !names.includes(old)
        && !names.includes(obsolete)
    ),
    {
      current: v2Manifest.cacheName,
      old: v1Manifest.cacheName,
      obsolete: "crazy-rummy-static-obsolete-update"
    }
  );

  await context.setOffline(true);
  await page.goto(`${testServer.origin}/#/rules`, {
    waitUntil: "domcontentloaded"
  });
  const offlineCopy = await page.locator("body").innerText();
  assert.match(
    offlineCopy,
    /offline[\s\S]*(?:online play|reconnect)|online play[\s\S]*(?:offline|unavailable)/i,
    "offline relaunch should explain that remote play needs connectivity"
  );
  assert.match(offlineCopy, /rules/i);
  assert.equal(
    await page.locator('meta[name="crazy-rummy-build-revision"]')
      .getAttribute("content"),
    "v2"
  );

  const offlineCardBackV2 = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return {
      ok: response.ok,
      contentType: response.headers.get("content-type"),
      hasRailLatticeTitle: (await response.text()).includes(
        "Crazy Rummy rail-lattice card back"
      )
    };
  }, "/art/card-back-lattice.v1.svg");
  assert.deepEqual(offlineCardBackV2, {
    ok: true,
    contentType: "image/svg+xml",
    hasRailLatticeTitle: true
  });

  console.log(
    "PWA v1→v2 install, offline art, explicit update, cache cleanup, and relaunch checks passed."
  );
} finally {
  await context?.setOffline(false).catch(() => {});
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await testServer?.close().catch(() => {});
  await rm(buildRoot, { recursive: true, force: true });
}

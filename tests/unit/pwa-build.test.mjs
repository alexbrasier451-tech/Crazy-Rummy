import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  generatePwaArtifacts,
  isVersionedStaticAsset
} from "../../src/pwa/pwa-build.js";

test("only hashed bundles and explicitly versioned install assets qualify", () => {
  assert.equal(isVersionedStaticAsset("assets/index-AbCdEf12.js"), true);
  assert.equal(isVersionedStaticAsset("icons/crazy-rummy-any.v1.svg"), true);
  assert.equal(isVersionedStaticAsset("art/card-back-lattice.v1.svg"), true);
  assert.equal(isVersionedStaticAsset("assets/index.js"), false);
  assert.equal(isVersionedStaticAsset("art/card-back-lattice.svg"), false);
  assert.equal(isVersionedStaticAsset("art/card-back-lattice.latest.svg"), false);
  assert.equal(isVersionedStaticAsset("manifest.webmanifest"), false);
  assert.equal(isVersionedStaticAsset("session/current.json"), false);
});

test("PWA build output is content-versioned and privacy-bounded", async (t) => {
  const dist = await mkdtemp(path.join(tmpdir(), "crazy-rummy-pwa-"));
  t.after(() => import("node:fs/promises").then(({ rm }) =>
    rm(dist, { recursive: true, force: true })
  ));

  await mkdir(path.join(dist, "assets"), { recursive: true });
  await mkdir(path.join(dist, "art"), { recursive: true });
  await mkdir(path.join(dist, "icons"), { recursive: true });
  await mkdir(path.join(dist, "session"), { recursive: true });
  await writeFile(path.join(dist, "index.html"), "<main>shell</main>");
  await writeFile(path.join(dist, "assets", "index-AbCdEf12.js"), "v1");
  await writeFile(
    path.join(dist, "art", "card-back-lattice.v1.svg"),
    "<svg><title>card back</title></svg>"
  );
  await writeFile(
    path.join(dist, "art", "unversioned.svg"),
    "<svg><title>excluded</title></svg>"
  );
  await writeFile(
    path.join(dist, "icons", "crazy-rummy-any.v1.svg"),
    "<svg/>"
  );
  await writeFile(path.join(dist, "session", "current.json"), "{\"secret\":true}");

  const first = await generatePwaArtifacts({ distDirectory: dist });
  assert.deepEqual(first.navigationRoutes, ["/", "/rules"]);
  assert.deepEqual(
    first.assets.map(({ url }) => url),
    [
      "/art/card-back-lattice.v1.svg",
      "/assets/index-AbCdEf12.js",
      "/icons/crazy-rummy-any.v1.svg"
    ]
  );
  assert.ok(!first.assets.some(({ url }) => url.includes("unversioned")));
  assert.ok(!first.assets.some(({ url }) => url.includes("session")));

  const worker = await readFile(
    path.join(dist, first.versionedWorkerFilename),
    "utf8"
  );
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /cacheName\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(worker, /session\/current/);

  await writeFile(path.join(dist, "assets", "index-AbCdEf12.js"), "v2");
  const second = await generatePwaArtifacts({ distDirectory: dist });
  assert.notEqual(second.version, first.version);
  assert.notEqual(second.cacheName, first.cacheName);

  await writeFile(path.join(dist, "index.html"), "<main>changed shell</main>");
  const third = await generatePwaArtifacts({ distDirectory: dist });
  assert.notEqual(third.version, second.version);
});

test("PWA build output is scoped to a GitHub Pages project path", async (t) => {
  const dist = await mkdtemp(path.join(tmpdir(), "crazy-rummy-pages-pwa-"));
  t.after(() => import("node:fs/promises").then(({ rm }) =>
    rm(dist, { recursive: true, force: true })
  ));

  await mkdir(path.join(dist, "assets"), { recursive: true });
  await mkdir(path.join(dist, "icons"), { recursive: true });
  await writeFile(path.join(dist, "index.html"), "<main>pages shell</main>");
  await writeFile(path.join(dist, "assets", "index-AbCdEf12.js"), "pages");
  await writeFile(path.join(dist, "icons", "crazy-rummy-any.v1.svg"), "<svg/>");

  const result = await generatePwaArtifacts({
    distDirectory: dist,
    revision: "pages",
    basePath: "/Crazy-Rummy/"
  });

  assert.equal(result.navigationShell, "/Crazy-Rummy/index.html");
  assert.deepEqual(result.navigationRoutes, [
    "/Crazy-Rummy/",
    "/Crazy-Rummy/rules"
  ]);
  assert.ok(result.assets.every(({ url }) => url.startsWith("/Crazy-Rummy/")));

  const worker = await readFile(
    path.join(dist, result.versionedWorkerFilename),
    "utf8"
  );
  assert.match(worker, /\/Crazy-Rummy\/index\.html/);
  assert.equal(worker.includes('cache.match("/")'), false);
});

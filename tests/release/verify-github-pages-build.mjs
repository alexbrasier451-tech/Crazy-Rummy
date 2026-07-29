import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const distDirectory = path.resolve(process.argv[2] ?? "dist");
const basePath = process.argv[3] ?? "/Crazy-Rummy/";

async function files(directory, prefix = "") {
  const entries = await readdir(path.join(directory, prefix), {
    withFileTypes: true
  });
  const result = [];
  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await files(directory, relativePath));
    else if (entry.isFile()) result.push(relativePath);
  }
  return result;
}

const paths = await files(distDirectory);
const textPaths = paths.filter((filename) =>
  /\.(?:css|html|js|json|webmanifest)$/.test(filename)
);
const contents = await Promise.all(textPaths.map(async (filename) => ({
  filename,
  text: await readFile(path.join(distDirectory, filename), "utf8")
})));
const combined = contents.map(({ text }) => text).join("\n");
const index = contents.find(({ filename }) => filename === "index.html")?.text;
const manifest = JSON.parse(
  contents.find(({ filename }) =>
    filename === "manifest.webmanifest"
  )?.text ?? "null"
);
const precache = JSON.parse(
  contents.find(({ filename }) =>
    /^precache-manifest\.[a-f0-9]+\.json$/.test(filename)
  )?.text ?? "null"
);

assert.ok(index?.includes(`${basePath}assets/`));
assert.ok(index?.includes('href="./manifest.webmanifest"'));
assert.equal(manifest.scope, "./");
assert.equal(manifest.start_url, "./#/lobby?source=installed");
assert.equal(precache.navigationShell, `${basePath}index.html`);
assert.ok(precache.assets.every(({ url }) => url.startsWith(basePath)));
assert.doesNotMatch(combined, /pk_live_replace_at_deployment/);
assert.match(combined, /pk_live_[A-Za-z0-9]{12,}/);
assert.doesNotMatch(
  combined,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}/
);

console.log("GitHub Pages online-beta artifact verification passed.");

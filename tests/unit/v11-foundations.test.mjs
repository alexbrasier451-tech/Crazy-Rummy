import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";
import { validateAssetRegister } from "../../tools/validate-v11-assets.mjs";

const root = new URL("../../", import.meta.url);
const tokenPath = new URL("src/styles/tokens.css", root);
const foundationPath = new URL("src/styles/v11-foundations.css", root);
const indexPath = new URL("src/styles/index.css", root);
const viteConfigPath = new URL("vite.config.js", root);

const assets = [
  "public/assets/brand/crazy-rummy-wordmark.v1.svg",
  "public/assets/cards/card-back-midnight-lattice.v1.svg",
  "public/assets/cards/wild-route-seal.v1.svg",
  "public/assets/materials/baize-fibre.v1.svg",
  "public/assets/ui/route-terminus.v1.svg"
];

test("Stage 1.1.2 exposes the complete semantic material and state token contract", async () => {
  const css = await readFile(tokenPath, "utf8");
  for (const token of [
    "midnight-1000",
    "carriage-900",
    "baize-800",
    "ticket-100",
    "brass-500",
    "signal-green",
    "signal-red",
    "signal-blue",
    "surface-ticket",
    "state-accepted",
    "state-rejected",
    "duration-route",
    "z-decision",
    "texture-baize-opacity"
  ]) {
    assert.match(css, new RegExp(`--${token}:`), `missing --${token}`);
  }
  assert.match(css, /html\[data-quality="degraded"\]/);
  assert.match(css, /@media \(prefers-reduced-data: reduce\)/);
});

test("Stage 1.1.2 authored assets are local, compact SVGs with text alternatives", async () => {
  for (const relativePath of assets) {
    const url = new URL(relativePath, root);
    await access(url);
    assert.ok((await stat(url)).size < 16_384, `${relativePath} exceeds the SVG budget`);
    const source = await readFile(url, "utf8");
    assert.match(source, /<title\b/);
    assert.match(source, /<desc\b/);
    assert.doesNotMatch(source, /(?:href|xlink:href)\s*=\s*["']https?:\/\//);
    assert.doesNotMatch(source, /<image\b/);
  }
});

test("the shared v1.1 foundation is integrated after the beta composition layer", async () => {
  const index = await readFile(indexPath, "utf8");
  const css = await readFile(foundationPath, "utf8");
  assert.ok(index.indexOf("./v11-foundations.css") > index.indexOf("./screens.css"));
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /html\[data-motion="reduced"\]/);
  assert.match(css, /\.v11-route-rail/);
  assert.match(css, /\.v11-ticket/);
});

test("the production asset register is complete and hash-pinned", async () => {
  assert.deepEqual(await validateAssetRegister(), {
    registerPath: "docs/v1.1/ASSET_REGISTER.csv",
    rows: 12,
    approved: 11,
    quarantined: 1
  });
});

test("every Vite production build validates the asset register first", async () => {
  const source = await readFile(viteConfigPath, "utf8");
  assert.match(source, /validateAssetRegister/);
  assert.match(source, /buildStart\(\)/);
  assert.ok(
    source.indexOf("createV11AssetValidationPlugin()")
      < source.indexOf("createCrazyRummyPwaPlugin()")
  );
});

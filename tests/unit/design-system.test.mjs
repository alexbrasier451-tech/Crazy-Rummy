import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tokensPath = new URL("../../src/styles/tokens.css", import.meta.url);
const basePath = new URL("../../src/styles/base.css", import.meta.url);
const componentsPath = new URL("../../src/styles/components.css", import.meta.url);
const screensPath = new URL("../../src/styles/screens.css", import.meta.url);
const indexPath = new URL("../../src/styles/index.css", import.meta.url);

function rgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function luminance(hex) {
  const channels = rgb(hex).map((channel) => (
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first, second) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function parseTokens(css) {
  return new Map(
    [...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)]
      .map(([, name, value]) => [name, value.toLowerCase()])
  );
}

test("the night-train palette exposes all visual roles", async () => {
  const css = await readFile(tokensPath, "utf8");
  const tokens = parseTokens(css);
  assert.deepEqual(
    [
      "color-page-depth",
      "color-deep-panel",
      "color-baize",
      "color-raised",
      "color-strong-edge",
      "color-cream",
      "color-muted-cream",
      "color-rail-green",
      "color-bright-green",
      "color-signal-red",
      "color-bright-red",
      "color-ticket-gold",
      "color-ink"
    ].filter((token) => !tokens.has(token)),
    []
  );
});

test("approved text and focus pairs meet WCAG AA normal-text contrast", async () => {
  const tokens = parseTokens(await readFile(tokensPath, "utf8"));
  const pairs = [
    ["color-cream", "color-page-depth"],
    ["color-cream", "color-deep-panel"],
    ["color-cream", "color-baize"],
    ["color-cream", "color-raised"],
    ["color-muted-cream", "color-page-depth"],
    ["color-muted-cream", "color-deep-panel"],
    ["color-muted-cream", "color-baize"],
    ["color-muted-cream", "color-raised"],
    ["color-ink", "color-ticket-gold"],
    ["color-bright-red", "color-deep-panel"],
    ["color-bright-green", "color-deep-panel"],
    ["color-ticket-gold", "color-page-depth"],
    ["color-suit-red", "color-cream"],
    ["color-suit-black", "color-cream"]
  ];

  for (const [foreground, background] of pairs) {
    const ratio = contrast(tokens.get(foreground), tokens.get(background));
    assert.ok(
      ratio >= 4.5,
      `${foreground} on ${background} has ${ratio.toFixed(2)}:1 contrast`
    );
  }
});

test("shared CSS preserves tap, reflow, forced-colour, and reduced-motion contracts", async () => {
  const css = [
    await readFile(tokensPath, "utf8"),
    await readFile(basePath, "utf8"),
    await readFile(componentsPath, "utf8"),
    await readFile(screensPath, "utf8")
  ].join("\n");
  assert.match(css, /--tap-min:\s*2\.75rem/);
  assert.doesNotMatch(
    css,
    /min-width:\s*320px/,
    "400% zoom must be able to reflow below a hard 320px layout minimum"
  );
  assert.match(css, /html\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /body\s*\{[\s\S]*?min-width:\s*0/);
  assert.doesNotMatch(css, /min-width:\s*20rem/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /html\[data-motion="reduced"\]/);
  assert.match(css, /html\[data-card-size="large"\]/);
  assert.match(css, /html\[data-contrast="high"\]/);
  assert.match(css, /\.route-line__compact/);
  assert.match(css, /overflow-x:\s*auto/);
});

test("the style entrypoint includes component and screen composition layers", async () => {
  const css = await readFile(indexPath, "utf8");
  assert.match(css, /@import "\.\/components\.css";/);
  assert.match(css, /@import "\.\/screens\.css";/);
  assert.ok(
    css.indexOf("./components.css") < css.indexOf("./screens.css"),
    "screen composition should follow the reusable component layer"
  );
});

test("every screen-emitted class has a responsive screen-level selector", async () => {
  const css = await readFile(screensPath, "utf8");
  const emittedClasses = [
    "screen-panel",
    "action-stack",
    "placeholder-notice",
    "field",
    "field-hint",
    "identity-form",
    "settings-form",
    "marker-picker",
    "marker-option",
    "sr-only",
    "table-card",
    "state-example",
    "player-list",
    "seat-grid",
    "brand-lockup",
    "brand-mark",
    "stock-discard",
    "meld-group",
    "action-dock",
    "section-nav",
    "text-link",
    "anchor-target",
    "check-field"
  ];

  for (const className of emittedClasses) {
    assert.match(css, new RegExp(`\\.${className}(?![\\w-])`), `missing .${className}`);
  }

  assert.match(css, /\.action-stack\s*>\s*\.action\s*\{[^}]*width:\s*100%/s);
  assert.match(css, /min-height:\s*var\(--tap-min\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /@media \(min-width:\s*30rem\)/);
  assert.match(css, /@media \(min-width:\s*45rem\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media \(forced-colors:\s*active\)/);
});

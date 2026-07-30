import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cardsPath = new URL("../../src/components/cards.js", import.meta.url);
const gamePath = new URL("../../src/screens/game.js", import.meta.url);
const gameplayCssPath = new URL("../../src/styles/v11-gameplay.css", import.meta.url);

test("authored cards expose redundant hero states and authority truth", async () => {
  const source = await readFile(cardsPath, "utf8");

  for (const state of [
    "data-playable",
    "data-invalid",
    "data-grouped",
    "data-discard-candidate",
    "data-authority-state",
    "data-card-visibility"
  ]) {
    assert.match(source, new RegExp(`"${state}"`), `${state} must remain available to CSS and tests`);
  }
  assert.match(source, /pending host confirmation/);
  assert.match(source, /rejected, still staged/);
  assert.match(source, /outcome uncertain/);
  assert.match(source, /playing-card__keyline/);
  assert.match(source, /playing-card__court-mark/);
  assert.match(source, /card-back__rails/);
  assert.match(source, /card-back__monogram/);
});

test("game composition preserves semantic order while staging the Compartment Table", async () => {
  const source = await readFile(gamePath, "utf8");
  const appendOrder = source.match(/workspace\.append\([\s\S]*?game-turn-prompt[\s\S]*?gameDetails\([\s\S]*?table,[\s\S]*?handSection,[\s\S]*?actionLaunch\(/);

  assert.ok(appendOrder, "reading order must remain turn/status, details, shared table, private hand, actions");
  assert.match(source, /game-seat-perimeter/);
  assert.match(source, /game-table-spine/);
  assert.match(source, /game-meld-sidings/);
  assert.match(source, /game-private-hand--foreground/);
  assert.match(source, /game-conductor-call/);
  assert.match(source, /game-decision-bench/);
  assert.match(source, /dataset:\s*\{\s*sharedPlayers:\s*"true"/);
  assert.match(source, /selected\.has\(cardId\)\s*\?\s*selectedAuthorityState\s*:\s*"settled"/);
  assert.match(source, /ui\.intentAuthorityState\s*=\s*"rejected"[\s\S]*staged choices are still here/);
});

test("gameplay art direction includes compact, wide, reduced-motion, and forced-colour treatments", async () => {
  const css = await readFile(gameplayCssPath, "utf8");

  assert.match(css, /\.game-compartment-table\s*\{/);
  assert.match(css, /\.game-seat-perimeter\s*\{/);
  assert.match(css, /\.playing-card\[data-wild="true"\]/);
  assert.match(css, /\.playing-card\[data-authority-state="pending"\]/);
  assert.match(css, /\.playing-card\[data-authority-state="rejected"\]/);
  assert.match(css, /\.playing-card\[data-authority-state="uncertain"\]/);
  assert.match(css, /@media \(min-width:\s*45rem\)/);
  assert.match(css, /@media \(max-width:\s*29\.9375rem\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media \(forced-colors:\s*active\)/);
  assert.match(css, /minmax\(0,\s*1fr\)/);
});

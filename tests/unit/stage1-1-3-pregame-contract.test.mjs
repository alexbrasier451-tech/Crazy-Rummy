import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const startup = new URL("../../src/screens/startup.js", import.meta.url);
const lobby = new URL("../../src/screens/lobby.js", import.meta.url);
const waiting = new URL("../../src/screens/waiting-room.js", import.meta.url);
const styles = new URL("../../src/styles/v11-pregame.css", import.meta.url);

test("Stage 1.1.3 assigns a distinct composition and truthful states to every pre-game route", async () => {
  const [startupSource, lobbySource, waitingSource] = await Promise.all([
    readFile(startup, "utf8"),
    readFile(lobby, "utf8"),
    readFile(waiting, "utf8")
  ]);

  assert.match(startupSource, /v11-arrival-route/);
  assert.match(startupSource, /v11-identity-ticket/);
  assert.match(startupSource, /Stored on this device — not an account/);
  assert.match(lobbySource, /v11-lobby-threshold/);
  assert.match(lobbySource, /v11-departures-empty--loading/);
  assert.match(lobbySource, /Last good results are kept/);
  assert.match(waitingSource, /v11-seating-plan/);
  assert.match(waitingSource, /seat accepted/);
  assert.match(waitingSource, /Start blocked:/);
  assert.match(waitingSource, /No invitation or recovery has been invented/);
});

test("Stage 1.1.3 CSS preserves reduced motion, forced colours, touch reflow, and route divergence", async () => {
  const css = await readFile(styles, "utf8");
  for (const selector of [
    ".v11-arrival-route",
    ".v11-identity-ticket",
    ".v11-lobby-threshold",
    ".v11-departure-ticket",
    ".v11-room-ticket",
    ".v11-seating-plan"
  ]) {
    assert.match(css, new RegExp(selector.replaceAll(".", "\\.")));
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /html\[data-motion="reduced"\]/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /@media \(max-width: 24rem\)/);
  assert.match(css, /min-height: 6\.25rem/);
});

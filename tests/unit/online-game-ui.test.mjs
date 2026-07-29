import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isOnlineInterruptedState,
  isOnlineTerminalState,
  onlineActionCopy,
  onlineGameState,
  recoveryCountdown
} from "../../src/screens/online-game.js";

const gameScreenPath = new URL("../../src/screens/game.js", import.meta.url);
const screensCssPath = new URL("../../src/styles/screens.css", import.meta.url);

test("online authority states disable gameplay without claiming an optimistic change", () => {
  const pending = onlineGameState({
    network: { state: "RUNNING", authoritativeSequence: 8, pendingCommandIds: ["cmd-9"] },
    lastAction: { commandId: "cmd-9", phase: "pending" }
  });
  assert.equal(pending.mode, "pending");
  assert.equal(pending.disabled, true);
  assert.match(pending.detail, /Nothing has changed yet/i);

  const running = onlineGameState({
    network: { state: "RUNNING", authoritativeSequence: 9, pendingCommandIds: [] },
    lastAction: { commandId: "cmd-9", phase: "accepted", authoritativeSequence: 9 }
  });
  assert.deepEqual(running, {
    mode: "running",
    disabled: false,
    connectionState: "online",
    label: "Online",
    detail: "Authoritative update 9."
  });
});

test("uncertain, recovery, compatibility, forfeit, and abandonment stop gameplay truthfully", () => {
  const deadline = 500_000;
  const cases = [
    [{ network: { state: "RUNNING" }, lastAction: { phase: "uncertain" } }, "uncertain"],
    [{ network: { state: "RECONNECTING", recoveryDeadline: deadline } }, "reconnecting"],
    [{ network: { state: "PAUSED", recoveryDeadline: deadline } }, "paused"],
    [{ network: { state: "RUNNING", compatibilityError: { message: "Rules mismatch." } } }, "incompatible"],
    [{ network: { state: "FORFEIT" } }, "forfeit"],
    [{ network: { state: "ABANDONED" } }, "abandoned"]
  ];

  for (const [snapshot, mode] of cases) {
    const presented = onlineGameState(snapshot, 200_000);
    assert.equal(presented.mode, mode);
    assert.equal(presented.disabled, true);
    assert.ok(presented.label);
    assert.ok(presented.detail);
  }
  assert.match(onlineGameState(cases[1][0], 200_000).detail, /05:00/);
  assert.equal(isOnlineInterruptedState(cases[1][0]), true);
  assert.equal(isOnlineTerminalState(cases[4][0]), true);
  assert.equal(isOnlineTerminalState(cases[5][0]), true);
});

test("recovery countdown is persistent MM:SS copy with a screen-reader label", () => {
  assert.deepEqual(recoveryCountdown(500_000, 237_001), {
    seconds: 263,
    clock: "04:23",
    label: "4 minutes 23 seconds remain to reconnect."
  });
  assert.deepEqual(recoveryCountdown(200_000, 200_001), {
    seconds: 0,
    clock: "00:00",
    label: "0 seconds remain to reconnect."
  });
  assert.equal(recoveryCountdown(null, 200_000), null);
});

test("authoritative action feedback distinguishes queued, accepted, rejected, and uncertain", () => {
  assert.match(onlineActionCopy({ phase: "pending" }).message, /Waiting for host acceptance/);
  assert.match(onlineActionCopy({ phase: "accepted" }).message, /host accepted/i);
  assert.match(
    onlineActionCopy({ phase: "rejected", reason: "INVALID_MELD" }).message,
    /Nothing changed; your staged choices are still here/
  );
  assert.match(onlineActionCopy({ phase: "uncertain" }).message, /has not confirmed/);
});

test("game screen keeps local hooks while resolving online commands by command ID", async () => {
  const source = await readFile(gameScreenPath, "utf8");
  assert.match(source, /onlineGameSession\s*\?\?\s*localSession/);
  assert.match(source, /session\?\.execute/);
  assert.match(source, /session\?\.submit/);
  assert.match(source, /ui\.queuedActions\.set\(result\.commandId/);
  assert.match(source, /const queued = ui\.queuedActions\.get\(commandId\)/);
  assert.match(source, /phase === "accepted"[\s\S]*queued\?\.onAccepted\?\.\(action\)/);
  assert.match(source, /phase === "rejected"[\s\S]*staged choices are still here/);
  assert.doesNotMatch(
    source,
    /session\?\.dispose\?\.\(\)/,
    "route disposal must not tear down the app-owned online match session"
  );
  assert.match(source, /setInterval\(\(\) => render\(\), 1000\)/);
  assert.match(source, /One minute warning/);
  assert.match(source, /announce:\s*false/);
  assert.doesNotMatch(source, /motionRevision/);
});

test("online status composition remains contained at the 320px shell boundary", async () => {
  const css = await readFile(screensCssPath, "utf8");
  assert.match(css, /\.game-workspace\s*\{[^}]*max-width:\s*100%/s);
  assert.match(css, /\.game-workspace\s*>\s*\.connection-state\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.connection-state__detail\s*\{[^}]*overflow-wrap:\s*anywhere/s);
});

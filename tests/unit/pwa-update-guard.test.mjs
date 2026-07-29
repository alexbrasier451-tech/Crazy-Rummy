import assert from "node:assert/strict";
import test from "node:test";

import { onlineUpdateGuard } from "../../src/pwa/update-guard.js";

function session(snapshot) {
  return { getSnapshot: () => snapshot };
}

test("app-shell updates are allowed outside online play", () => {
  assert.deepEqual(onlineUpdateGuard(), { blocked: false, reason: null });
  assert.deepEqual(
    onlineUpdateGuard({ onlineSession: session({ room: { table: null } }) }),
    { blocked: false, reason: null }
  );
});

test("app-shell updates are blocked while this device owns a waiting-room seat", () => {
  const result = onlineUpdateGuard({
    onlineSession: session({ room: { table: { tableId: "table-1", status: "OPEN" } } })
  });
  assert.equal(result.blocked, true);
  assert.match(result.reason, /leave the waiting room|cancel it/i);
});

test("app-shell updates are blocked during a peer-to-peer match", () => {
  const result = onlineUpdateGuard({
    onlineSession: session({ room: { table: null } }),
    onlineMatchSession: session({ network: { state: "ONLINE" } })
  });
  assert.equal(result.blocked, true);
  assert.match(result.reason, /finish or leave/i);
});

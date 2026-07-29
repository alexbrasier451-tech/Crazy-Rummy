import assert from "node:assert/strict";
import test from "node:test";

import {
  createUnavailableOnlineLobbySession,
  freshnessCopy,
  onlineErrorCopy,
  tableSummary
} from "../../src/screens/online-ui.js";

test("the default online session is explicitly unavailable and never invents tables", async () => {
  const session = createUnavailableOnlineLobbySession();
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.online, false);
  assert.deepEqual(snapshot.tables, []);
  await assert.rejects(session.goOnline(), { code: "SERVICE_UNAVAILABLE" });
  await assert.rejects(session.cancelTable(), { code: "SERVICE_UNAVAILABLE" });
});

test("online lobby presenters preserve safe table metadata and precise recovery copy", () => {
  assert.deepEqual(tableSummary({ id: "t-1", name: "<unsafe>", hostName: "Pat", occupancy: 3, maxPlayers: 6 }), {
    id: "t-1", name: "<unsafe>", host: "Pat", capacity: 6, occupied: 3,
    rules: "Crazy Rummy · 13 hands", visibility: "OPEN", state: "WAITING", code: null
  });
  assert.match(onlineErrorCopy({ code: "TABLE_FULL" }), /full/i);
  assert.match(onlineErrorCopy({ code: "INVITE_EXPIRED" }), /expired/i);
  assert.match(onlineErrorCopy({ code: "SERVICE_UNAVAILABLE" }), /not configured/i);
  assert.match(onlineErrorCopy({ code: "METERED_QUOTA_EXHAUSTED" }), /free service limit/i);
  assert.match(onlineErrorCopy({ code: "STALE_TABLE" }), /refresh/i);
  assert.match(onlineErrorCopy({ code: "RATE_LIMITED" }), /wait a moment/i);
  assert.match(onlineErrorCopy({ code: "PEER_CONNECTION_FAILED" }), /direct connection/i);
  assert.match(onlineErrorCopy({ code: "TABLE_CANCELLED" }), /expired|no longer/i);
  assert.match(onlineErrorCopy({ code: "METERED_PROVIDER_FAILURE" }), /interrupted/i);
  assert.match(onlineErrorCopy({ code: "FORBIDDEN" }), /refresh/i);
  assert.equal(freshnessCopy({ online: true, presence: { lastHeartbeatAt: 10_000 } }, 15_000), "Just now");
  assert.match(freshnessCopy({ online: true, presence: { lastHeartbeatAt: 10_000 } }, 80_000), /May be out of date/);
});

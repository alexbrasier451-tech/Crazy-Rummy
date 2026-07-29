import assert from "node:assert/strict";
import test from "node:test";

import { connectOnlineMatch } from "../../src/app/online-match-start.js";

function fixture({ host = true, fail = false } = {}) {
  const calls = [];
  const lobby = {
    async confirmStart() { calls.push("confirm"); },
    async abortStart() { calls.push("abort"); }
  };
  const previousMatch = {
    async dispose() { calls.push("dispose-previous"); }
  };
  const match = {
    async start() {
      calls.push("start-peer");
      if (fail) throw Object.assign(new Error("peer failed"), { code: "PEER_CONNECTION_FAILED" });
    },
    async dispose() { calls.push("dispose-new"); }
  };
  const bootstrap = {
    localPlayerId: host ? "host" : "guest",
    hostPlayerId: "host"
  };
  return { calls, lobby, previousMatch, match, bootstrap };
}

test("the host confirms only after every peer connection starts", async () => {
  const value = fixture();
  const result = await connectOnlineMatch({
    lobby: value.lobby,
    bootstrap: value.bootstrap,
    playerId: "host",
    previousMatch: value.previousMatch,
    createMatch: () => value.match
  });
  assert.equal(result, value.match);
  assert.deepEqual(value.calls, ["dispose-previous", "start-peer", "confirm"]);
});

test("a host connection failure disposes the topology and restores the waiting room", async () => {
  const value = fixture({ fail: true });
  await assert.rejects(
    connectOnlineMatch({
      lobby: value.lobby,
      bootstrap: value.bootstrap,
      playerId: "host",
      createMatch: () => value.match
    }),
    { code: "PEER_CONNECTION_FAILED" }
  );
  assert.deepEqual(value.calls, ["start-peer", "dispose-new", "abort"]);
});

test("a guest connection failure never rolls back the host's room", async () => {
  const value = fixture({ host: false, fail: true });
  await assert.rejects(
    connectOnlineMatch({
      lobby: value.lobby,
      bootstrap: value.bootstrap,
      playerId: "guest",
      createMatch: () => value.match
    })
  );
  assert.deepEqual(value.calls, ["start-peer", "dispose-new"]);
});

test("a host composition failure still restores the ready room", async () => {
  const value = fixture();
  await assert.rejects(
    connectOnlineMatch({
      lobby: value.lobby,
      bootstrap: value.bootstrap,
      playerId: "host",
      createMatch() {
        value.calls.push("create-match");
        throw new Error("WebRTC is unavailable");
      }
    }),
    /WebRTC is unavailable/
  );
  assert.deepEqual(value.calls, ["create-match", "abort"]);
});

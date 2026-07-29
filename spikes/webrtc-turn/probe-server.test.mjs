import assert from "node:assert/strict";
import test from "node:test";
import { startProbeServer } from "./probe-server.mjs";

test("relay mode refuses to start without TURN", async () => {
  await assert.rejects(
    startProbeServer({
      iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
      iceTransportPolicy: "relay",
    }),
    /requires a TURN URL/,
  );
});

test("relay mode refuses TURN without credentials", async () => {
  await assert.rejects(
    startProbeServer({
      iceServers: [{ urls: ["turn:turn.example:3478"] }],
      iceTransportPolicy: "relay",
    }),
    /requires username and credential/,
  );
});

test("ICE configuration and polling signalling remain peer scoped", async (context) => {
  const server = await startProbeServer({
    iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
  });
  context.after(() => server.close());

  const iceResponse = await fetch(`${server.origin}/api/ice`);
  assert.equal(iceResponse.status, 200);
  assert.deepEqual(await iceResponse.json(), {
    iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
    iceTransportPolicy: "all",
    configuredTurn: false,
  });

  const sent = await fetch(`${server.origin}/api/signal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      room: "room_123",
      from: "host",
      to: "guest",
      type: "offer",
      payload: { type: "offer", sdp: "redacted-test-sdp" },
    }),
  });
  assert.equal(sent.status, 202);

  const guestResponse = await fetch(
    `${server.origin}/api/signal?room=room_123&peer=guest&after=0`,
  );
  const guestMessages = await guestResponse.json();
  assert.equal(guestMessages.length, 1);
  assert.equal(guestMessages[0].to, "guest");
  assert.equal(guestMessages[0].payload.sdp, "redacted-test-sdp");

  const hostResponse = await fetch(
    `${server.origin}/api/signal?room=room_123&peer=host&after=0`,
  );
  assert.deepEqual(await hostResponse.json(), []);

  const invalidResponse = await fetch(
    `${server.origin}/api/signal?room=bad&peer=guest&after=0`,
  );
  assert.equal(invalidResponse.status, 422);
});


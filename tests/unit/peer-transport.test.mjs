import assert from "node:assert/strict";
import test from "node:test";

import {
  PEER_STATE,
  SIGNAL_KIND,
  createHostStarTransport,
  createManagedSignallingAdapter,
  createSignallingEnvelope,
  createWebRtcPeerConnection,
  parseSignallingEnvelope,
  validateIceServers,
} from "../../src/online/transport/index.js";

const MATCH = "match_stage5";
const VERSIONS = Object.freeze({
  transportProtocolVersion: "transport-v1",
  engineSchemaVersion: "engine-schema-v1",
  engineRulesVersion: "rules-v1",
});
const PROOFS = Object.freeze({
  host: "host-seat-proof-00000001",
  guest: "guest-seat-proof-000001",
});

test("strict signalling envelopes expire, reject oversized payloads, and require ephemeral TURN credentials", () => {
  const envelope = createSignallingEnvelope({
    signalId: "signal_00000001",
    matchId: MATCH,
    fromPlayerId: "host",
    toPlayerId: "guest",
    kind: SIGNAL_KIND.OFFER,
    createdAt: 1_000,
    expiresAt: 2_000,
    payload: { description: { type: "offer", sdp: "sensitive-test-sdp" } },
  });
  assert.deepEqual(parseSignallingEnvelope(envelope, { now: 1_500 }), envelope);
  assert.throws(() => parseSignallingEnvelope(envelope, { now: 2_000 }), { code: "SIGNAL_EXPIRED" });
  assert.throws(() => createSignallingEnvelope({ ...envelope, payload: { text: "x".repeat(500) } }, { maxBytes: 128 }), {
    code: "SIGNAL_TOO_LARGE",
  });
  assert.deepEqual(validateIceServers({
    iceServers: [{ urls: "turn:relay.example:3478", username: "ephemeral", credential: "temporary" }],
    expiresAt: 20_000,
  }, { now: 10_000 }).iceServers[0], {
    urls: "turn:relay.example:3478",
    username: "ephemeral",
    credential: "temporary",
  });
  assert.throws(() => validateIceServers({
    iceServers: [{ urls: "turn:relay.example:3478", username: "long", credential: "secret" }],
    expiresAt: 10_000 + 3_600_001,
  }, { now: 10_000 }), { code: "INVALID_TURN_CREDENTIAL" });
  assert.throws(() => validateIceServers({
    iceServers: [{ urls: "turn:relay.example:3478", username: "unknown", credential: "lifetime" }],
  }, { now: 10_000 }), { code: "INVALID_TURN_CREDENTIAL" });
  assert.deepEqual(validateIceServers([{ urls: "stun:stun.example:3478" }]).iceServers, [
    { urls: "stun:stun.example:3478" },
  ]);
});

test("managed pair signalling maps the Metered publish/subscribe boundary and captures injected ICE servers", async () => {
  const bus = new ManagedClientBus();
  const hostClient = bus.create("provider-host");
  const guestClient = bus.create("provider-guest");
  const host = createManagedSignallingAdapter({
    client: hostClient,
    channel: "crazy-rummy/v1/peer/pair-one",
    localPlayerId: "host",
    remotePlayerId: "guest",
    clock: () => 1_000,
    createSignalId: () => "signal_host_0001",
  });
  const guest = createManagedSignallingAdapter({
    client: guestClient,
    channel: "crazy-rummy/v1/peer/pair-one",
    localPlayerId: "guest",
    remotePlayerId: "host",
    clock: () => 1_000,
    createSignalId: () => "signal_guest_001",
  });
  let received;
  guest.subscribeSignals((signal) => { received = signal; });
  await Promise.all([host.start(), guest.start()]);
  await host.sendSignal({
    matchId: MATCH,
    toPlayerId: "guest",
    kind: SIGNAL_KIND.OFFER,
    payload: { description: { type: "offer", sdp: "never-logged" } },
  });
  assert.equal(received.fromPlayerId, "host");
  assert.equal(received.kind, SIGNAL_KIND.OFFER);
  assert.equal(hostClient.published.length, 1);
  assert.equal(host.getSnapshot().hasIceServers, true);
  assert.equal(host.getSnapshot().turnCredentialExpiresAt, null);
  assert.match((await host.getIceServers()).iceServers[0].urls, /^turn:/);
  await Promise.all([host.close(), guest.close()]);
  assert.deepEqual(hostClient.unsubscribed, ["crazy-rummy/v1/peer/pair-one"]);
});

test("managed signalling restores its channel subscription after the provider reconnects", async () => {
  const bus = new ManagedClientBus();
  const hostClient = bus.create("provider-host");
  const guestClient = bus.create("provider-guest");
  const host = createManagedSignallingAdapter({
    client: hostClient,
    channel: "crazy-rummy/v1/peer/reconnected-pair",
    localPlayerId: "host",
    remotePlayerId: "guest",
    clock: () => 1_000,
    createSignalId: () => "signal_host_reconnected_0001",
  });
  const guest = createManagedSignallingAdapter({
    client: guestClient,
    channel: "crazy-rummy/v1/peer/reconnected-pair",
    localPlayerId: "guest",
    remotePlayerId: "host",
    clock: () => 1_000,
    createSignalId: () => "signal_guest_reconnected_01",
  });
  const received = [];
  guest.subscribeSignals((signal) => received.push(signal.kind));
  await Promise.all([host.start(), guest.start()]);

  guestClient.disconnect();
  guestClient.reconnect();
  await settle();
  await host.sendSignal({
    matchId: MATCH,
    toPlayerId: "guest",
    kind: SIGNAL_KIND.RESTART,
    payload: { reason: "resume-after-background" },
  });

  assert.deepEqual(received, [SIGNAL_KIND.RESTART]);
  assert.equal(guest.getSnapshot().state, PEER_STATE.CONNECTED);
  await Promise.all([host.close(), guest.close()]);
});

test("foreground resume replaces a silently stale connected provider before peer recovery", async () => {
  const bus = new ManagedClientBus();
  const hostClient = bus.create("provider-host");
  const guestClient = bus.create("provider-guest");
  let hostSignalId = 0;
  let guestSignalId = 0;
  const channel = "crazy-rummy/v1/peer/foreground-recovery";
  const hostSignalling = createManagedSignallingAdapter({
    client: hostClient,
    channel,
    localPlayerId: "host",
    remotePlayerId: "guest",
    clock: () => 1_000,
    createSignalId: () => `signal_host_foreground_${++hostSignalId}`,
  });
  const guestSignalling = createManagedSignallingAdapter({
    client: guestClient,
    channel,
    localPlayerId: "guest",
    remotePlayerId: "host",
    clock: () => 1_000,
    createSignalId: () => `signal_guest_foreground_${++guestSignalId}`,
  });
  const rtc = createRtcPair();
  const verify = (expectedPlayerId) => ({ remotePlayerId, seatProof }) =>
    remotePlayerId === expectedPlayerId && seatProof === PROOFS[expectedPlayerId];
  const common = {
    matchId: MATCH,
    ...VERSIONS,
    heartbeatIntervalMs: 10,
    heartbeatTimeoutMs: 30,
  };
  const host = createWebRtcPeerConnection({
    ...common,
    localPlayerId: "host",
    remotePlayerId: "guest",
    localSeatProof: PROOFS.host,
    verifyRemoteSeatProof: verify("guest"),
    offerer: false,
    signalling: hostSignalling,
    scheduler: createIntervalScheduler(),
    rtcPeerConnectionFactory: rtc.hostFactory,
  });
  const guest = createWebRtcPeerConnection({
    ...common,
    localPlayerId: "guest",
    remotePlayerId: "host",
    localSeatProof: PROOFS.guest,
    verifyRemoteSeatProof: verify("host"),
    offerer: true,
    signalling: guestSignalling,
    scheduler: createIntervalScheduler(),
    rtcPeerConnectionFactory: rtc.guestFactory,
  });
  await host.start();
  await guest.start();
  await settle();
  assert.equal(host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(guest.getSnapshot().state, PEER_STATE.CONNECTED);

  const guestConnectsBeforeForeground = guestClient.connectCalls;
  guestClient.becomeSilentlyStale();
  rtc.hostConnection.connectionState = "disconnected";
  rtc.hostConnection.emit("connectionstatechange");
  rtc.guestConnection.connectionState = "disconnected";
  rtc.guestConnection.emit("connectionstatechange");
  await guest.resume();
  await settle();

  assert.equal(guestClient.closeCalls, 1);
  assert.equal(guestClient.connectCalls, guestConnectsBeforeForeground + 1);
  assert.equal(guestClient.channels.has(channel), true);
  assert.equal(host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(guest.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.deepEqual(rtc.guestConnection.offerOptions.at(-1), { iceRestart: true });

  const hostConnectsBeforeForeground = hostClient.connectCalls;
  hostClient.becomeSilentlyStale();
  await host.resume();
  await settle();

  assert.equal(hostClient.closeCalls, 1);
  assert.equal(hostClient.connectCalls, hostConnectsBeforeForeground + 1);
  assert.equal(hostClient.channels.has(channel), true);
  assert.equal(host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(guest.getSnapshot().state, PEER_STATE.CONNECTED);
  await Promise.all([host.close(), guest.close()]);
  await Promise.all([hostClient.close(), guestClient.close()]);
});

test("managed signalling retries a transient subscription failure without another provider event", async () => {
  const bus = new ManagedClientBus();
  const client = bus.create("provider-guest");
  const scheduler = createIntervalScheduler();
  const signalling = createManagedSignallingAdapter({
    client,
    channel: "crazy-rummy/v1/peer/subscription-retry",
    localPlayerId: "guest",
    remotePlayerId: "host",
    clock: () => 1_000,
    scheduler,
  });
  await signalling.start();
  client.failSubscribeCount = 1;
  client.disconnect();
  client.reconnect();
  await settle();
  assert.equal(signalling.getSnapshot().state, PEER_STATE.DISCONNECTED);
  assert.equal(scheduler.runNextTimeout(), true);
  await settle();
  assert.equal(signalling.getSnapshot().state, PEER_STATE.CONNECTED);
  await signalling.close();
});

test("managed signalling actively reconnects after a provider disconnect without a later connected event", async () => {
  const bus = new ManagedClientBus();
  const client = bus.create("provider-guest");
  const scheduler = createIntervalScheduler();
  const signalling = createManagedSignallingAdapter({
    client,
    channel: "crazy-rummy/v1/peer/provider-retry",
    localPlayerId: "guest",
    remotePlayerId: "host",
    clock: () => 1_000,
    scheduler,
  });
  await signalling.start();
  const connectsBeforeLoss = client.connectCalls;
  client.disconnect({ willReconnect: false });
  await settle();
  assert.equal(signalling.getSnapshot().state, PEER_STATE.DISCONNECTED);
  assert.equal(scheduler.runNextTimeout(), true);
  await settle();
  assert.equal(client.connectCalls, connectsBeforeLoss + 1);
  assert.equal(signalling.getSnapshot().state, PEER_STATE.CONNECTED);
  await signalling.close();
});

test("a never-settling provider publish times out so later recovery traffic can proceed", async () => {
  const bus = new ManagedClientBus();
  const client = bus.create("provider-host");
  const scheduler = createIntervalScheduler();
  const signalling = createManagedSignallingAdapter({
    client,
    channel: "crazy-rummy/v1/peer/publish-timeout",
    localPlayerId: "host",
    remotePlayerId: "guest",
    clock: () => 1_000,
    scheduler,
  });
  await signalling.start();
  client.hangNextPublish = true;
  const stuckPublish = signalling.sendSignal({
    matchId: MATCH,
    toPlayerId: "guest",
    kind: SIGNAL_KIND.RESTART,
    payload: { reason: "recovery" },
  });
  await settle();
  assert.equal(scheduler.runNextTimeout(), true);
  await assert.rejects(stuckPublish, { code: "SIGNAL_SEND_FAILED" });
  await signalling.sendSignal({
    matchId: MATCH,
    toPlayerId: "guest",
    kind: SIGNAL_KIND.RESTART,
    payload: { reason: "retry" },
  });
  assert.equal(client.published.length, 1, "the retry must not be held behind the timed-out provider call");
  await signalling.close();
});

test("untrusted direct traffic cannot claim the authenticated provider route", async () => {
  const bus = new ManagedClientBus();
  const hostClient = bus.create("provider-host");
  const guestClient = bus.create("provider-guest");
  const attackerClient = bus.create("provider-attacker");
  const attackerMessages = [];
  let hostSignalNumber = 0;
  attackerClient.on("direct", (message) => attackerMessages.push(message));
  const host = createManagedSignallingAdapter({
    client: hostClient,
    channel: "crazy-rummy/v1/peer/authenticated-pair",
    localPlayerId: "host",
    remotePlayerId: "guest",
    clock: () => 1_000,
    createSignalId: () => `signal_host_auth_${++hostSignalNumber}`,
  });
  const guest = createManagedSignallingAdapter({
    client: guestClient,
    channel: "crazy-rummy/v1/peer/authenticated-pair",
    localPlayerId: "guest",
    remotePlayerId: "host",
    clock: () => 1_000,
    createSignalId: () => "signal_guest_auth1",
  });
  const received = [];
  guest.subscribeSignals((signal) => received.push(signal.kind));
  await Promise.all([host.start(), guest.start()]);

  await attackerClient.send("provider-host", {
    fromPlayerId: "guest",
    type: "untrusted-route-claim",
  });
  await host.sendSignal({
    matchId: MATCH,
    toPlayerId: "guest",
    kind: SIGNAL_KIND.OFFER,
    payload: { description: { type: "offer", sdp: "authenticated-destination" } },
  });

  assert.equal(attackerMessages.length, 0);
  assert.deepEqual(received, [SIGNAL_KIND.OFFER]);
  host.registerPeerRoute("guest", "provider-guest");
  await host.sendSignal({
    matchId: MATCH,
    toPlayerId: "guest",
    kind: SIGNAL_KIND.ANSWER,
    payload: { description: { type: "answer", sdp: "trusted-direct-route" } },
  });
  assert.equal(attackerMessages.length, 0);
  assert.deepEqual(received, [SIGNAL_KIND.OFFER, SIGNAL_KIND.ANSWER]);
  assert.equal(hostClient.published.length, 1);
  await Promise.all([host.close(), guest.close()]);
});

test("injected WebRTC peers negotiate offer/answer/ICE, prove seats, order events, detect stale heartbeat, and close", async () => {
  const signalling = createSignalPair();
  const rtc = createRtcPair();
  const now = { value: 0 };
  const hostScheduler = createIntervalScheduler();
  const guestScheduler = createIntervalScheduler();
  const verify = (expectedPlayerId) => ({ remotePlayerId, seatProof }) =>
    remotePlayerId === expectedPlayerId && seatProof === PROOFS[expectedPlayerId];
  const common = {
    matchId: MATCH,
    ...VERSIONS,
    heartbeatIntervalMs: 10,
    heartbeatTimeoutMs: 30,
    clock: () => now.value,
  };
  const host = createWebRtcPeerConnection({
    ...common,
    localPlayerId: "host",
    remotePlayerId: "guest",
    localSeatProof: PROOFS.host,
    verifyRemoteSeatProof: verify("guest"),
    offerer: true,
    signalling: signalling.host,
    scheduler: hostScheduler,
    rtcPeerConnectionFactory: rtc.hostFactory,
  });
  const guest = createWebRtcPeerConnection({
    ...common,
    localPlayerId: "guest",
    remotePlayerId: "host",
    localSeatProof: PROOFS.guest,
    verifyRemoteSeatProof: verify("host"),
    offerer: false,
    signalling: signalling.guest,
    scheduler: guestScheduler,
    rtcPeerConnectionFactory: rtc.guestFactory,
  });
  const received = [];
  guest.onMessage((payload) => received.push(payload.index));
  await Promise.all([guest.start(), host.start()]);
  await settle();
  assert.equal(host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(guest.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.deepEqual(rtc.configurations.map((value) => value.iceTransportPolicy), ["all", "all"]);
  assert.equal(rtc.hostConnection.createdChannelOptions.ordered, true);
  const offerIdentity = signalling.sent.find((entry) => entry.kind === SIGNAL_KIND.OFFER).payload.identity;
  assert.deepEqual(offerIdentity, {
    ...VERSIONS,
    seatProof: PROOFS.host,
  });
  assert.equal("protocolVersion" in offerIdentity, false);
  await host.send({ index: 1 });
  await host.send({ index: 2 });
  await host.send({ index: 3 });
  await settle();
  assert.deepEqual(received, [1, 2, 3]);
  now.value = 31;
  hostScheduler.runAll();
  assert.equal(host.getSnapshot().state, PEER_STATE.DISCONNECTED);
  assert.equal(host.getSnapshot().lastError.code, "HEARTBEAT_TIMEOUT");
  await host.close();
  await settle();
  assert.equal(host.getSnapshot().state, PEER_STATE.CLOSED);
  assert.equal(guest.getSnapshot().state, PEER_STATE.CLOSED);
  assert.equal(rtc.hostConnection.closed, true);
  assert.equal(rtc.guestConnection.closed, true);
});

test("a later-starting guest offers only after the host is listening", async () => {
  const pair = await connectedPeerFixture({
    hostOfferer: false,
    hostStartsFirst: true,
  });

  assert.equal(pair.host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(pair.guest.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(
    pair.rtc.hostConnection.remoteDescription.sdp,
    "guest-offer",
  );

  await Promise.all([pair.host.close(), pair.guest.close()]);
});

test("the designated guest offerer restarts ICE and restores an interrupted peer", async () => {
  const pair = await connectedPeerFixture({
    hostOfferer: false,
    hostStartsFirst: true,
  });
  const offersBefore = pair.signalling.sent.filter(({ kind }) => kind === SIGNAL_KIND.OFFER).length;
  const answersBefore = pair.signalling.sent.filter(({ kind }) => kind === SIGNAL_KIND.ANSWER).length;
  const received = [];
  pair.host.onMessage((payload) => received.push(payload.index));

  pair.rtc.hostConnection.connectionState = "disconnected";
  pair.rtc.hostConnection.emit("connectionstatechange");
  pair.rtc.guestConnection.connectionState = "disconnected";
  pair.rtc.guestConnection.emit("connectionstatechange");
  await settle();

  assert.equal(
    pair.signalling.sent.filter(({ kind }) => kind === SIGNAL_KIND.OFFER).length,
    offersBefore + 1,
  );
  assert.equal(
    pair.signalling.sent.filter(({ kind }) => kind === SIGNAL_KIND.ANSWER).length,
    answersBefore + 1,
  );
  assert.deepEqual(pair.rtc.guestConnection.offerOptions.at(-1), { iceRestart: true });
  assert.equal(pair.rtc.guestConnection.restartIceCalls, 1);
  assert.equal(pair.host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(pair.guest.getSnapshot().state, PEER_STATE.CONNECTED);

  await pair.guest.send({ index: 1 });
  await settle();
  assert.deepEqual(received, [1]);
  await Promise.all([pair.host.close(), pair.guest.close()]);
});

test("foreground resume forces a fresh recovery epoch from either peer role", async () => {
  const pair = await connectedPeerFixture({
    hostOfferer: false,
    hostStartsFirst: true,
  });
  const offersBeforeHostResume = pair.signalling.sent
    .filter(({ kind }) => kind === SIGNAL_KIND.OFFER).length;
  const hostStates = [];
  pair.host.subscribe(({ state }) => hostStates.push(state));

  await pair.host.resume();
  await settle();

  assert.equal(hostStates.includes(PEER_STATE.DISCONNECTED), true);
  assert.equal(pair.host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(pair.guest.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(
    pair.signalling.sent.filter(({ kind }) => kind === SIGNAL_KIND.OFFER).length,
    offersBeforeHostResume + 1,
  );

  const offersBeforeGuestResume = pair.signalling.sent
    .filter(({ kind }) => kind === SIGNAL_KIND.OFFER).length;
  const guestStates = [];
  pair.guest.subscribe(({ state }) => guestStates.push(state));

  await pair.guest.resume();
  await settle();

  assert.equal(guestStates.includes(PEER_STATE.DISCONNECTED), true);
  assert.equal(pair.host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(pair.guest.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(
    pair.signalling.sent.filter(({ kind }) => kind === SIGNAL_KIND.OFFER).length,
    offersBeforeGuestResume + 1,
  );
  await Promise.all([pair.host.close(), pair.guest.close()]);
});

test("a failed data-channel send recovers before it can create an ordered sequence hole", async () => {
  const pair = await connectedPeerFixture();
  const received = [];
  pair.guest.onMessage((payload) => received.push(payload.index));
  pair.rtc.channels.host.throwNextSend = true;

  await assert.rejects(pair.host.send({ index: 1 }));
  await settle();
  assert.equal(pair.host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(pair.guest.getSnapshot().state, PEER_STATE.CONNECTED);

  await pair.host.send({ index: 2 });
  await settle();
  assert.deepEqual(received, [2], "the next command must not wait for a failed wire sequence");
  await Promise.all([pair.host.close(), pair.guest.close()]);
});

test("a connected peer with a no-longer-open channel schedules recovery before rejecting a command", async () => {
  const pair = await connectedPeerFixture();
  pair.rtc.channels.host.readyState = "closing";
  await assert.rejects(pair.host.send({ index: 1 }), { code: "DATA_CHANNEL_NOT_OPEN" });
  await settle();
  assert.equal(pair.host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(pair.guest.getSnapshot().state, PEER_STATE.CONNECTED);
  await Promise.all([pair.host.close(), pair.guest.close()]);
});

test("a stalled inbound wire sequence forces recovery even when the peer stays otherwise live", async () => {
  const pair = await connectedPeerFixture();
  const received = [];
  pair.host.onMessage((payload) => received.push(payload.index));
  pair.rtc.channels.guest.send(JSON.stringify({
    type: "crazy-rummy/peer-transport",
    schemaVersion: "1",
    kind: "event",
    sequence: 2,
    payload: { index: 2 },
  }));
  await settle();
  assert.deepEqual(received, []);
  assert.equal(pair.hostScheduler.runNextTimeout(), true);
  await settle();
  assert.equal(pair.host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(pair.guest.getSnapshot().state, PEER_STATE.CONNECTED);
  await Promise.all([pair.host.close(), pair.guest.close()]);
});

test("a lost initial offer is retried by the negotiation watchdog", async () => {
  const pair = await connectedPeerFixture({ dropSignals: true });
  assert.equal(pair.host.getSnapshot().state, PEER_STATE.CONNECTING);
  pair.signalling.dropSignals = false;
  assert.equal(pair.hostScheduler.runNextTimeout(), true);
  await settle();
  assert.equal(pair.host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(pair.guest.getSnapshot().state, PEER_STATE.CONNECTED);
  await Promise.all([pair.host.close(), pair.guest.close()]);
});

test("an answerer retries a transient restart signal failure", async () => {
  const pair = await connectedPeerFixture({ hostOfferer: false, hostStartsFirst: true });
  pair.signalling.rejectNextByKind.set(SIGNAL_KIND.RESTART, 1);
  await pair.host.resume();
  assert.equal(pair.host.getSnapshot().state, PEER_STATE.DISCONNECTED);
  assert.equal(pair.hostScheduler.runNextTimeout(), true);
  await settle();
  assert.equal(pair.host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(pair.guest.getSnapshot().state, PEER_STATE.CONNECTED);
  await Promise.all([pair.host.close(), pair.guest.close()]);
});

test("an answerer resume revives an offerer after retryable ICE exhaustion", async () => {
  const guestScheduler = createIntervalScheduler();
  const pair = await connectedPeerFixture({
    hostOfferer: false,
    hostStartsFirst: true,
    maximumIceRestartAttempts: 1,
    guestScheduler,
  });
  pair.signalling.dropSignals = true;
  pair.rtc.guestConnection.connectionState = "disconnected";
  pair.rtc.guestConnection.emit("connectionstatechange");
  await settle();
  guestScheduler.runNextTimeout();
  await settle();

  assert.equal(pair.guest.getSnapshot().state, PEER_STATE.FAILED);
  assert.equal(pair.guest.getSnapshot().lastError.code, "ICE_RESTART_EXHAUSTED");

  pair.signalling.dropSignals = false;
  await pair.host.resume();
  await settle();

  assert.equal(pair.host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.equal(pair.guest.getSnapshot().state, PEER_STATE.CONNECTED);
  await Promise.all([pair.host.close(), pair.guest.close()]);
});

test("malformed or far-future wire traffic fails closed without extending liveness or growing reorder state", async () => {
  const malformed = await connectedPeerFixture({ maxWireBytes: 256, maxPendingMessages: 2 });
  malformed.rtc.channels.guest.send(JSON.stringify({
    type: "crazy-rummy/peer-transport",
    schemaVersion: "1",
    kind: "unknown-kind",
    payload: "x".repeat(400),
  }));
  await settle();
  assert.equal(malformed.host.getSnapshot().state, PEER_STATE.FAILED);
  assert.equal(malformed.host.getSnapshot().lastError.code, "WIRE_MESSAGE_TOO_LARGE");
  await Promise.all([malformed.host.close(), malformed.guest.close()]);

  const unknown = await connectedPeerFixture({ maxWireBytes: 4_096, maxPendingMessages: 2 });
  unknown.rtc.channels.guest.send(JSON.stringify({
    type: "crazy-rummy/peer-transport",
    schemaVersion: "1",
    kind: "unknown-kind",
    payload: { small: true },
  }));
  await settle();
  assert.equal(unknown.host.getSnapshot().state, PEER_STATE.FAILED);
  assert.equal(unknown.host.getSnapshot().lastError.code, "INVALID_WIRE_MESSAGE");
  await Promise.all([unknown.host.close(), unknown.guest.close()]);

  const throwingVerifier = await connectedPeerFixture({
    maxWireBytes: 4_096,
    maxPendingMessages: 2,
    hostVerifyRemoteSeatProof({ remotePlayerId, seatProof }) {
      if (seatProof === undefined) throw new TypeError("malformed proof");
      return remotePlayerId === "guest" && seatProof === PROOFS.guest;
    },
  });
  assert.doesNotThrow(() => throwingVerifier.rtc.channels.host.emit("message", {
    data: JSON.stringify({
      type: "crazy-rummy/peer-transport",
      schemaVersion: "1",
      kind: "hello",
      payload: {
        ...VERSIONS,
        playerId: "guest",
      },
    }),
  }));
  await settle();
  assert.equal(throwingVerifier.host.getSnapshot().state, PEER_STATE.FAILED);
  assert.equal(throwingVerifier.host.getSnapshot().lastError.code, "INVALID_SEAT_PROOF");
  await Promise.all([throwingVerifier.host.close(), throwingVerifier.guest.close()]);

  const bounded = await connectedPeerFixture({ maxWireBytes: 4_096, maxPendingMessages: 2 });
  const received = [];
  bounded.host.onMessage((payload) => received.push(payload.index));
  bounded.rtc.channels.guest.send(JSON.stringify({
    type: "crazy-rummy/peer-transport",
    schemaVersion: "1",
    kind: "event",
    sequence: 2,
    payload: { index: 2 },
  }));
  bounded.rtc.channels.guest.send(JSON.stringify({
    type: "crazy-rummy/peer-transport",
    schemaVersion: "1",
    kind: "event",
    sequence: 1,
    payload: { index: 1 },
  }));
  await settle();
  assert.equal(bounded.host.getSnapshot().state, PEER_STATE.CONNECTED);
  assert.deepEqual(received, [1, 2]);
  await Promise.all([bounded.host.close(), bounded.guest.close()]);

  const reordered = await connectedPeerFixture({ maxWireBytes: 4_096, maxPendingMessages: 2 });
  reordered.rtc.channels.guest.send(JSON.stringify({
    type: "crazy-rummy/peer-transport",
    schemaVersion: "1",
    kind: "event",
    sequence: 99,
    payload: { index: 99 },
  }));
  await settle();
  assert.equal(reordered.host.getSnapshot().state, PEER_STATE.FAILED);
  assert.equal(reordered.host.getSnapshot().lastError.code, "WIRE_SEQUENCE_GAP");
  await Promise.all([reordered.host.close(), reordered.guest.close()]);
});

test("six-seat host-star creates five host links and one guest link, with no guest edge and ordered forwarding", async () => {
  const seats = ["host", "g1", "g2", "g3", "g4", "g5"];
  const peerBus = createTopologyPeerBus();
  const created = [];
  const makeTopology = (localPlayerId) => createHostStarTransport({
    matchId: MATCH,
    localPlayerId,
    hostPlayerId: "host",
    seatPlayerIds: seats,
    createPeer(options) {
      created.push(options);
      return peerBus.create(options);
    },
  });
  const topologies = Object.fromEntries(seats.map((id) => [id, makeTopology(id)]));
  await Promise.all(Object.values(topologies).map((topology) => topology.start()));
  assert.equal(topologies.host.getSnapshot().connections.length, 5);
  for (const guestId of seats.slice(1)) {
    assert.deepEqual(topologies[guestId].getSnapshot().connections.map((entry) => entry.playerId), ["host"]);
  }
  assert.equal(created.some(({ localPlayerId, remotePlayerId }) =>
    localPlayerId !== "host" && remotePlayerId !== "host"), false);
  assert.equal(created.every(({ pairPlayerIds }) => pairPlayerIds.length === 2), true);
  assert.equal(created.filter(({ localPlayerId }) => localPlayerId === "host")
    .every(({ offerer }) => offerer === false), true);
  assert.equal(created.filter(({ localPlayerId }) => localPlayerId !== "host")
    .every(({ offerer }) => offerer === true), true);

  const forwarded = [];
  topologies.g2.onMessage((payload, meta) => forwarded.push([meta.sourcePlayerId, payload.index]));
  await topologies.g1.send("g2", { index: 1 });
  await topologies.g1.send("g2", { index: 2 });
  await topologies.g1.send("g2", { index: 3 });
  assert.deepEqual(forwarded, [["g1", 1], ["g1", 2], ["g1", 3]]);
  await assert.rejects(topologies.g1.send("not-a-seat", { index: 4 }), { code: "INVALID_TRANSPORT_INPUT" });
  await Promise.all(Object.values(topologies).map((topology) => topology.close()));
  assert.equal(Object.values(topologies).every((topology) => topology.getSnapshot().state === PEER_STATE.CLOSED), true);
});

test("host-star topology accepts two seats", async () => {
  const peerBus = createTopologyPeerBus();
  const topology = createHostStarTransport({
    matchId: MATCH,
    localPlayerId: "host",
    hostPlayerId: "host",
    seatPlayerIds: ["host", "guest"],
    createPeer(options) { return peerBus.create(options); },
  });
  assert.deepEqual(topology.getSnapshot().connections.map(({ playerId }) => playerId), ["guest"]);
  await topology.resume();
  assert.equal(peerBus.resumeCount("host", "guest"), 1);
  await topology.close();
});

test("a host-star forwarding failure asks the destination link to recover", async () => {
  const peerBus = createTopologyPeerBus();
  const seats = ["host", "g1", "g2"];
  const topologies = Object.fromEntries(seats.map((localPlayerId) => [localPlayerId,
    createHostStarTransport({
      matchId: MATCH,
      localPlayerId,
      hostPlayerId: "host",
      seatPlayerIds: seats,
      createPeer(options) { return peerBus.create(options); },
    })
  ]));
  await Promise.all(Object.values(topologies).map((topology) => topology.start()));
  peerBus.failNextSend("host", "g2");
  await topologies.g1.send("g2", { index: 1 });
  assert.equal(peerBus.resumeCount("host", "g2"), 1);
  await Promise.all(Object.values(topologies).map((topology) => topology.close()));
});

class ManagedClientBus {
  constructor() {
    this.clients = [];
  }
  create(peerId) {
    const client = new FakeManagedClient(this, peerId);
    this.clients.push(client);
    return client;
  }
}

class FakeManagedClient {
  constructor(bus, peerId) {
    this.bus = bus;
    this.peerId = peerId;
    this.state = "idle";
    this.handlers = new Map();
    this.channels = new Set();
    this.published = [];
    this.unsubscribed = [];
    this.failSubscribeCount = 0;
    this.connectCalls = 0;
    this.closeCalls = 0;
    this.hangNextPublish = false;
    this.silentlyStale = false;
  }
  on(type, listener) { this.handlers.set(type, listener); return this; }
  off(type, listener) { if (this.handlers.get(type) === listener) this.handlers.delete(type); return this; }
  async connect() {
    this.connectCalls += 1;
    this.silentlyStale = false;
    this.state = "connected";
    this.handlers.get("connected")?.({
      iceServers: [{ urls: "turn:relay.example:3478", username: "temporary", credential: "temporary" }],
      expiresAt: null,
    });
  }
  disconnect({ willReconnect = true } = {}) {
    this.state = "disconnected";
    this.channels.clear();
    this.handlers.get("disconnected")?.({ willReconnect });
  }
  reconnect() {
    this.silentlyStale = false;
    this.state = "connected";
    this.handlers.get("connected")?.({
      iceServers: [{ urls: "turn:relay.example:3478", username: "temporary", credential: "temporary" }],
      expiresAt: null,
    });
  }
  async subscribe(channel) {
    if (this.failSubscribeCount > 0) {
      this.failSubscribeCount -= 1;
      throw new Error("transient subscribe failure");
    }
    this.channels.add(channel);
  }
  becomeSilentlyStale() {
    this.silentlyStale = true;
    this.channels.clear();
  }
  async close() {
    this.closeCalls += 1;
    this.channels.clear();
    this.state = "closed";
  }
  async unsubscribe(channel) { this.unsubscribed.push(channel); this.channels.delete(channel); }
  async publish(channel, data) {
    if (this.hangNextPublish) {
      this.hangNextPublish = false;
      return new Promise(() => {});
    }
    if (this.silentlyStale) return;
    this.published.push({ channel, data });
    for (const target of this.bus.clients) {
      if (target !== this && target.channels.has(channel)) {
        target.handlers.get("message")?.({ channel, from: this.peerId, data });
      }
    }
  }
  async send(peerId, data) {
    this.bus.clients.find((target) => target.peerId === peerId)
      ?.handlers.get("direct")?.({ from: this.peerId, data });
  }
}

function createSignalPair() {
  const endpoints = { sent: [], dropSignals: false, rejectNextByKind: new Map() };
  let id = 0;
  function endpoint(localPlayerId, remotePlayerId) {
    const listeners = new Set();
    return {
      async start() {},
      subscribeSignals(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      async getIceServers() {
        return validateIceServers({
          iceServers: [{
            urls: "turn:relay.example:3478",
            username: "short",
            credential: "lived",
          }],
          expiresAt: Date.now() + 60_000,
        });
      },
      async sendSignal({ matchId, toPlayerId, kind, payload }) {
        const createdAt = Date.now();
        const envelope = createSignallingEnvelope({
          signalId: `signal_${String(++id).padStart(8, "0")}`,
          matchId,
          fromPlayerId: localPlayerId,
          toPlayerId,
          kind,
          payload,
          createdAt,
          expiresAt: createdAt + 30_000,
        });
        endpoints.sent.push(envelope);
        const remainingFailures = endpoints.rejectNextByKind.get(kind) ?? 0;
        if (remainingFailures > 0) {
          endpoints.rejectNextByKind.set(kind, remainingFailures - 1);
          throw new Error(`Transient ${kind} signal failure`);
        }
        if (endpoints.dropSignals) return;
        queueMicrotask(() => {
          for (const listener of endpoints[remotePlayerId].listeners) listener(envelope);
        });
      },
      listeners,
    };
  }
  endpoints.host = endpoint("host", "guest");
  endpoints.guest = endpoint("guest", "host");
  return endpoints;
}

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

class FakeDataChannel extends FakeEventTarget {
  constructor() {
    super();
    this.readyState = "connecting";
    this.ordered = true;
    this.peer = null;
    this.throwNextSend = false;
  }
  send(data) {
    if (this.readyState !== "open") throw new Error("channel closed");
    if (this.throwNextSend) {
      this.throwNextSend = false;
      throw new Error("transient channel send failure");
    }
    queueMicrotask(() => this.peer?.emit("message", { data }));
  }
  open() { this.readyState = "open"; this.emit("open"); }
  close() {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.emit("close");
    if (this.peer?.readyState !== "closed") {
      this.peer.readyState = "closed";
      this.peer.emit("close");
    }
  }
}

class FakeRtcConnection extends FakeEventTarget {
  constructor(side, network, configuration) {
    super();
    this.side = side;
    this.network = network;
    this.configuration = configuration;
    this.connectionState = "new";
    this.localDescription = null;
    this.remoteDescription = null;
    this.candidates = [];
    this.closed = false;
    this.offerOptions = [];
    this.restartIceCalls = 0;
    network[`${side}Connection`] = this;
  }
  createDataChannel(_label, options) {
    this.createdChannelOptions = options;
    const local = new FakeDataChannel();
    const remote = new FakeDataChannel();
    local.peer = remote;
    remote.peer = local;
    const remoteSide = this.side === "host" ? "guest" : "host";
    this.network.channels = { [this.side]: local, [remoteSide]: remote };
    return local;
  }
  async createOffer(options = undefined) {
    this.offerOptions.push(options);
    return { type: "offer", sdp: `${this.side}-offer` };
  }
  restartIce() { this.restartIceCalls += 1; }
  async createAnswer() { return { type: "answer", sdp: `${this.side}-answer` }; }
  async setLocalDescription(description) {
    this.localDescription = description;
    queueMicrotask(() => this.emit("icecandidate", {
      candidate: { toJSON: () => ({ candidate: `${this.side}-candidate` }) },
    }));
  }
  async setRemoteDescription(description) {
    this.remoteDescription = description;
    if (description.type === "offer") {
      this.emit("datachannel", { channel: this.network.channels[this.side] });
    }
    if (description.type === "answer") {
      for (const connection of [this.network.hostConnection, this.network.guestConnection]) {
        connection.connectionState = "connected";
        connection.emit("connectionstatechange");
      }
      this.network.channels.host.open();
      this.network.channels.guest.open();
    }
  }
  async addIceCandidate(candidate) { this.candidates.push(candidate); }
  close() {
    this.closed = true;
    this.connectionState = "closed";
    this.emit("connectionstatechange");
  }
}

function createRtcPair() {
  const network = { configurations: [] };
  network.hostFactory = (configuration) => {
    network.configurations.push(configuration);
    return new FakeRtcConnection("host", network, configuration);
  };
  network.guestFactory = (configuration) => {
    network.configurations.push(configuration);
    return new FakeRtcConnection("guest", network, configuration);
  };
  return network;
}

function createIntervalScheduler() {
  const tasks = [];
  const timeouts = [];
  return {
    setInterval(callback) { tasks.push({ callback, cleared: false }); return tasks.length - 1; },
    clearInterval(id) { if (tasks[id]) tasks[id].cleared = true; },
    setTimeout(callback) {
      timeouts.push({ callback, cleared: false, completed: false });
      return { timeout: timeouts.length - 1 };
    },
    clearTimeout(id) {
      if (id && timeouts[id.timeout]) timeouts[id.timeout].cleared = true;
    },
    runAll() { for (const task of tasks) if (!task.cleared) task.callback(); },
    runNextTimeout() {
      const task = timeouts.find((candidate) => !candidate.cleared && !candidate.completed);
      if (!task) return false;
      task.completed = true;
      task.callback();
      return true;
    },
  };
}

async function connectedPeerFixture({
  maxWireBytes,
  maxPendingMessages,
  hostVerifyRemoteSeatProof,
  hostOfferer = true,
  hostStartsFirst = false,
  maximumIceRestartAttempts,
  dropSignals = false,
  hostScheduler = createIntervalScheduler(),
  guestScheduler = createIntervalScheduler(),
} = {}) {
  const signalling = createSignalPair();
  signalling.dropSignals = dropSignals;
  const rtc = createRtcPair();
  const verify = (expectedPlayerId) => ({ remotePlayerId, seatProof }) =>
    remotePlayerId === expectedPlayerId && seatProof === PROOFS[expectedPlayerId];
  const common = {
    matchId: MATCH,
    ...VERSIONS,
    heartbeatIntervalMs: 10,
    heartbeatTimeoutMs: 30,
    maxWireBytes,
    maxPendingMessages,
    maximumIceRestartAttempts,
  };
  const host = createWebRtcPeerConnection({
    ...common,
    localPlayerId: "host",
    remotePlayerId: "guest",
    localSeatProof: PROOFS.host,
    verifyRemoteSeatProof: hostVerifyRemoteSeatProof ?? verify("guest"),
    offerer: hostOfferer,
    signalling: signalling.host,
    scheduler: hostScheduler,
    rtcPeerConnectionFactory: rtc.hostFactory,
  });
  const guest = createWebRtcPeerConnection({
    ...common,
    localPlayerId: "guest",
    remotePlayerId: "host",
    localSeatProof: PROOFS.guest,
    verifyRemoteSeatProof: verify("host"),
    offerer: !hostOfferer,
    signalling: signalling.guest,
    scheduler: guestScheduler,
    rtcPeerConnectionFactory: rtc.guestFactory,
  });
  if (hostStartsFirst) {
    await host.start();
    await settle();
    await guest.start();
  } else {
    await Promise.all([guest.start(), host.start()]);
  }
  await settle();
  if (!dropSignals) assert.equal(host.getSnapshot().state, PEER_STATE.CONNECTED);
  return { host, guest, rtc, signalling, hostScheduler, guestScheduler };
}

function createTopologyPeerBus() {
  const endpoints = new Map();
  const resumeCounts = new Map();
  const failures = new Map();
  return {
    resumeCount(localPlayerId, remotePlayerId) {
      return resumeCounts.get(`${localPlayerId}->${remotePlayerId}`) ?? 0;
    },
    failNextSend(localPlayerId, remotePlayerId) {
      const key = `${localPlayerId}->${remotePlayerId}`;
      failures.set(key, (failures.get(key) ?? 0) + 1);
    },
    create(options) {
      let state = PEER_STATE.IDLE;
      const states = new Set();
      const messages = new Set();
      const key = `${options.localPlayerId}->${options.remotePlayerId}`;
      const endpoint = {
        async start() {
          state = PEER_STATE.CONNECTED;
          for (const listener of states) listener({ state });
        },
        async send(payload) {
          const remainingFailures = failures.get(key) ?? 0;
          if (remainingFailures > 0) {
            failures.set(key, remainingFailures - 1);
            throw new Error("transient forwarding failure");
          }
          const remote = endpoints.get(`${options.remotePlayerId}->${options.localPlayerId}`);
          for (const listener of remote.messages) await listener(structuredClone(payload));
        },
        async close() {
          state = PEER_STATE.CLOSED;
          for (const listener of states) listener({ state });
        },
        async resume() {
          resumeCounts.set(key, (resumeCounts.get(key) ?? 0) + 1);
        },
        getSnapshot: () => ({ state }),
        subscribe(listener) { states.add(listener); return () => states.delete(listener); },
        onMessage(listener) { messages.add(listener); return () => messages.delete(listener); },
        messages,
      };
      endpoints.set(key, endpoint);
      return endpoint;
    },
  };
}

async function settle() {
  for (let index = 0; index < 64; index += 1) await Promise.resolve();
}

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
  assert.match((await host.getIceServers()).iceServers[0].urls, /^turn:/);
  await Promise.all([host.close(), guest.close()]);
  assert.deepEqual(hostClient.unsubscribed, ["crazy-rummy/v1/peer/pair-one"]);
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
  }
  on(type, listener) { this.handlers.set(type, listener); return this; }
  off(type, listener) { if (this.handlers.get(type) === listener) this.handlers.delete(type); return this; }
  async connect() {
    this.state = "connected";
    this.handlers.get("connected")?.({
      iceServers: [{ urls: "turn:relay.example:3478", username: "temporary", credential: "temporary" }],
      turnCredentialExpiresAt: 2_000,
    });
  }
  async subscribe(channel) { this.channels.add(channel); }
  async unsubscribe(channel) { this.unsubscribed.push(channel); this.channels.delete(channel); }
  async publish(channel, data) {
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
  const endpoints = { sent: [] };
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
  }
  send(data) {
    if (this.readyState !== "open") throw new Error("channel closed");
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
    network[`${side}Connection`] = this;
  }
  createDataChannel(_label, options) {
    this.createdChannelOptions = options;
    const local = new FakeDataChannel();
    const remote = new FakeDataChannel();
    local.peer = remote;
    remote.peer = local;
    this.network.channels = { host: local, guest: remote };
    return local;
  }
  async createOffer() { return { type: "offer", sdp: "host-offer" }; }
  async createAnswer() { return { type: "answer", sdp: "guest-answer" }; }
  async setLocalDescription(description) {
    this.localDescription = description;
    queueMicrotask(() => this.emit("icecandidate", {
      candidate: { toJSON: () => ({ candidate: `${this.side}-candidate` }) },
    }));
  }
  async setRemoteDescription(description) {
    this.remoteDescription = description;
    if (this.side === "guest" && description.type === "offer") {
      this.emit("datachannel", { channel: this.network.channels.guest });
    }
    if (this.side === "host" && description.type === "answer") {
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
  return {
    setInterval(callback) { tasks.push({ callback, cleared: false }); return tasks.length - 1; },
    clearInterval(id) { if (tasks[id]) tasks[id].cleared = true; },
    runAll() { for (const task of tasks) if (!task.cleared) task.callback(); },
  };
}

async function connectedPeerFixture({
  maxWireBytes,
  maxPendingMessages,
  hostVerifyRemoteSeatProof,
} = {}) {
  const signalling = createSignalPair();
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
  };
  const host = createWebRtcPeerConnection({
    ...common,
    localPlayerId: "host",
    remotePlayerId: "guest",
    localSeatProof: PROOFS.host,
    verifyRemoteSeatProof: hostVerifyRemoteSeatProof ?? verify("guest"),
    offerer: true,
    signalling: signalling.host,
    scheduler: createIntervalScheduler(),
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
    scheduler: createIntervalScheduler(),
    rtcPeerConnectionFactory: rtc.guestFactory,
  });
  await Promise.all([guest.start(), host.start()]);
  await settle();
  assert.equal(host.getSnapshot().state, PEER_STATE.CONNECTED);
  return { host, guest, rtc };
}

function createTopologyPeerBus() {
  const endpoints = new Map();
  return {
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
          const remote = endpoints.get(`${options.remotePlayerId}->${options.localPlayerId}`);
          for (const listener of remote.messages) await listener(structuredClone(payload));
        },
        async close() {
          state = PEER_STATE.CLOSED;
          for (const listener of states) listener({ state });
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

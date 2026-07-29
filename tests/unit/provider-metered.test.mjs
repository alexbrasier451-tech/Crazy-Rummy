import assert from "node:assert/strict";
import test from "node:test";

import {
  METERED_CAPABILITIES,
  MeteredProviderError,
  createMeteredLobbyProvider,
  createMeteredPeerSignalling,
  createMeteredRealtimeRequestClient,
  createMeteredService,
  createMeteredHostTableService,
  validateMeteredConfig,
} from "../../src/online/providers/index.js";

const KEY = "pk_live_abc123";
const CONFIG = { publicKey: KEY, leaseTtlMs: 10_000, rateLimitMs: { heartbeat: 0, listTables: 0 } };

test("Metered config permits only a restricted publishable browser key and bounded controls", () => {
  const config = validateMeteredConfig(CONFIG);
  assert.equal(config.publicKey, KEY);
  assert.equal(config.maxRequestBytes, 8_192);
  assert.deepEqual(METERED_CAPABILITIES, ["PUBLISH", "SUBSCRIBE", "PRESENCE", "SEND"]);
  assert.throws(
    () => validateMeteredConfig({ ...CONFIG, adminSecret: "do-not-ship" }),
    (error) => error instanceof MeteredProviderError && error.code === "INVALID_METERED_CONFIG",
  );
  assert.throws(
    () => validateMeteredConfig({ ...CONFIG, origin: "http://example.test" }),
    /HTTPS/,
  );
});

test("adapter uses public index only for Open tables and hashes Closed invite channels", async () => {
  const requests = [];
  const provider = createMeteredLobbyProvider({
    config: CONFIG,
    createRequestId: () => "request-1",
    createInviteCode: () => "a".repeat(48),
    client: {
      async request(envelope) {
        requests.push(envelope);
        return { ok: true, value: { table: { tableId: "table_1", providerScope: "crazy-rummy/v1/closed/host-control" } } };
      },
    },
  });
  await provider.createTable({
    host: { playerId: "host", displayName: "Host" }, visibility: "CLOSED", capacity: 2, protocolVersion: 1, rulesVersion: 1,
  });
  assert.match(requests[0].channel, /^crazy-rummy\/v1\/closed\/[a-f0-9]{64}$/);
  assert.equal(requests[0].channel.includes("a".repeat(48)), false);
  assert.equal(requests[0].payload.inviteCode, "a".repeat(48));
  assert.equal(requests[0].mutation.idempotencyKey, "request-1");
  assert.deepEqual(requests[0].payload.lease, { requestedTtlMs: 10_000 });

  await provider.joinTable({ tableId: "table_1", player: { playerId: "guest", displayName: "Guest" }, protocolVersion: 1, rulesVersion: 1 });
  assert.equal(requests[1].channel, "crazy-rummy/v1/closed/host-control");
});

test("adapter fails closed on unknown table scope, quota, offline, and local kill switch", async () => {
  const provider = createMeteredLobbyProvider({
    config: CONFIG,
    client: { async request() { throw new Error("quota limit exceeded"); } },
  });
  await assert.rejects(
    provider.heartbeat({ playerId: "person", displayName: "Person", online: true, protocolVersion: 1, rulesVersion: 1 }),
    (error) => error.code === "METERED_QUOTA_EXHAUSTED" && error.retryable,
  );
  await assert.rejects(
    provider.joinTable({ tableId: "unseen", player: { playerId: "guest", displayName: "Guest" } }),
    (error) => error.code === "TABLE_SCOPE_UNKNOWN",
  );
  const disabled = createMeteredLobbyProvider({ config: { ...CONFIG, enabled: false }, client: { request() {} } });
  await assert.rejects(disabled.listTables({ protocolVersion: 1, rulesVersion: 1 }), { code: "ONLINE_DISABLED" });
});

test("injected SignallingClient bridge correlates a conditional host-authoritative reply without an SDK dependency", async () => {
  FakeSignallingClient.reset();
  const host = createMeteredService({
    SignallingClient: FakeSignallingClient,
    apiKey: KEY,
    config: { ...CONFIG, requestTimeoutMs: 500 },
    installationId: "host-installation",
    hostHandler(envelope) {
      if (envelope.operation === "listTables") {
        return { table: { tableId: "table_1", visibility: "OPEN", providerScope: "crazy-rummy/v1/host/table_1" } };
      }
      assert.equal(envelope.mutation.expectedTableVersion, 4);
      assert.equal(envelope.payload.lease.requestedTtlMs, 10_000);
      return { table: { tableId: envelope.payload.tableId, providerScope: "crazy-rummy/v1/host/table_1", revision: 5 } };
    },
  });
  const guest = createMeteredService({
    SignallingClient: FakeSignallingClient,
    apiKey: KEY,
    config: { ...CONFIG, requestTimeoutMs: 500 },
    installationId: "guest-installation",
  });
  // Seed the opaque scope as it would be retained after discovery/lookup.
  await guest.listTables({ protocolVersion: 1, rulesVersion: 1 });
  const result = await guest.renewLease({ tableId: "table_1", hostId: "host", expectedTableVersion: 4 });
  assert.equal(result.table.revision, 5);
  await Promise.all([host.close(), guest.close()]);
});

test("host creates, advertises, conditionally seats, and expires a transient Open table through two clients", async () => {
  FakeSignallingClient.reset();
  let time = 1_000;
  let tableNumber = 0;
  const authority = createMeteredHostTableService({
    clock: () => time, leaseMs: 10_000, createTableId: () => `table_${String(++tableNumber).padStart(8, "0")}`,
  });
  const host = createMeteredService({
    SignallingClient: FakeSignallingClient, apiKey: KEY,
    config: { ...CONFIG, requestTimeoutMs: 500 }, installationId: "host-client", hostTableService: authority,
  });
  const guest = createMeteredService({
    SignallingClient: FakeSignallingClient, apiKey: KEY,
    config: { ...CONFIG, requestTimeoutMs: 500 }, installationId: "guest-client",
    // An empty local authority must fall through to the real remote host.
    hostTableService: createMeteredHostTableService({ clock: () => time, leaseMs: 10_000 }),
  });
  assert.equal((await host.heartbeat({ playerId: "host_user", displayName: "Host", online: true, protocolVersion: "v1", rulesVersion: "r1" })).online, true);
  assert.equal((await guest.heartbeat({ playerId: "guest_user", displayName: "Guest", online: true, protocolVersion: "v1", rulesVersion: "r1" })).online, true);
  const created = await host.createTable({
    host: { playerId: "host_user", displayName: "Host" }, visibility: "OPEN", capacity: 3, protocolVersion: "v1", rulesVersion: "r1",
  });
  assert.equal(created.table.revision, 1);
  assert.ok(FakeSignallingClient.instances[0].published.some((entry) => entry.data.type === "crazy-rummy/table-advertisement"));
  const listed = await guest.listTables({ protocolVersion: "v1", rulesVersion: "r1" });
  assert.equal(listed.tables[0].tableId, created.table.tableId);
  const joined = await guest.joinTable({
    tableId: created.table.tableId, player: { playerId: "guest_user", displayName: "Guest" }, protocolVersion: "v1", rulesVersion: "r1", expectedRevision: 1,
  });
  assert.equal(joined.table.revision, 2);
  const renewed = await host.renewLease({
    tableId: created.table.tableId,
    hostId: "host_user",
    expectedTableVersion: created.table.revision,
  });
  assert.equal(renewed.table.revision, joined.table.revision);
  assert.equal(renewed.table.occupiedSeats, 2);
  const accepted = await host.acceptTable({
    tableId: created.table.tableId,
    playerId: "guest_user",
    expectedRevision: renewed.table.revision,
  });
  assert.equal(accepted.table.seats.find((seat) => seat.playerId === "guest_user").acceptedAt, time);
  await assert.rejects(
    guest.setReady({ tableId: created.table.tableId, playerId: "guest_user", ready: true, expectedRevision: 1 }),
    { code: "STALE_TABLE" },
  );
  time += 10_001;
  assert.deepEqual(authority.listOpenTables(), []);
  await Promise.all([host.close(), guest.close()]);
});

test("Closed invites stay off discovery and route lookup and join through the hashed room scope", async () => {
  FakeSignallingClient.reset();
  const authority = createMeteredHostTableService({ leaseMs: 10_000, createTableId: () => "table_closed_0001" });
  const host = createMeteredService({
    SignallingClient: FakeSignallingClient, apiKey: KEY, config: { ...CONFIG, requestTimeoutMs: 500 },
    installationId: "closed-host", hostTableService: authority,
  });
  const guest = createMeteredService({
    SignallingClient: FakeSignallingClient, apiKey: KEY, config: { ...CONFIG, requestTimeoutMs: 500 }, installationId: "closed-guest",
  });
  const created = await host.createTable({
    host: { playerId: "host_closed", displayName: "Host" }, visibility: "CLOSED", capacity: 3, protocolVersion: "v1", rulesVersion: "r1",
  });
  await assert.rejects(
    host.getMatchBootstrap({
      tableId: created.table.tableId, playerId: "host_closed", protocolVersion: "v1", rulesVersion: "r1",
    }),
    { code: "NOT_FOUND" },
  );
  assert.equal(FakeSignallingClient.instances[0].published.some((entry) => entry.data.type === "crazy-rummy/table-advertisement"), false);
  assert.deepEqual(await guest.listTables({ protocolVersion: "v1", rulesVersion: "r1" }), { tables: [] });
  const lookedUp = await guest.lookupTable({ code: created.invite.code, protocolVersion: "v1", rulesVersion: "r1" });
  assert.equal(lookedUp.table.tableId, created.table.tableId);
  const joined = await guest.joinTable({
    tableId: created.table.tableId, player: { playerId: "guest_closed", displayName: "Guest" }, protocolVersion: "v1", rulesVersion: "r1", expectedRevision: 1,
  });
  assert.equal(joined.table.occupiedSeats, 2);
  await Promise.all([host.close(), guest.close()]);
});

test("host authority starts a match with two accepted, ready players", async () => {
  const authority = createMeteredHostTableService({
    requestRateLimitMs: 0,
    leaseMs: 10_000,
    createTableId: () => "table_two_player",
    createSecret: (bytes) => "a".repeat(bytes * 2),
  });
  const request = (operation, payload, channel, requestId, expectedTableVersion = null) => ({
    version: 1,
    serviceModel: "host-authoritative-realtime-v1",
    operation,
    payload,
    channel,
    requestId,
    mutation: { idempotencyKey: `${requestId}_once`, expectedTableVersion },
  });
  let table = (await authority.handle(request("createTable", {
    host: { playerId: "host_two", displayName: "Host" },
    visibility: "OPEN",
    capacity: 2,
    protocolVersion: "v1",
    rulesVersion: "r1",
  }, "crazy-rummy/v1/open-index", "create_two"))).table;
  const channel = table.providerScope;
  table = (await authority.handle(request("setReady", {
    tableId: table.tableId, playerId: "host_two", ready: true
  }, channel, "ready_host", table.revision))).table;
  table = (await authority.handle(request("joinTable", {
    tableId: table.tableId,
    player: { playerId: "guest_two", displayName: "Guest" },
    protocolVersion: "v1",
    rulesVersion: "r1",
  }, channel, "join_guest", table.revision))).table;
  table = (await authority.handle(request("acceptTable", {
    tableId: table.tableId, playerId: "guest_two"
  }, channel, "accept_guest", table.revision))).table;
  table = (await authority.handle(request("setReady", {
    tableId: table.tableId, playerId: "guest_two", ready: true
  }, channel, "ready_guest", table.revision))).table;
  const started = await authority.handle(request("startMatch", {
    tableId: table.tableId, hostId: "host_two"
  }, channel, "start_two", table.revision));
  assert.equal(started.table.status, "STARTED");
  assert.equal(started.bootstrap.seats.length, 2);
});

test("host authority caches idempotent mutations and rejects stale or final-seat races", async () => {
  const authority = createMeteredHostTableService({ requestRateLimitMs: 0, leaseMs: 10_000, createTableId: () => "table_idempotent_1" });
  const request = (operation, payload, channel, requestId, mutation = undefined) => ({
    version: 1, serviceModel: "host-authoritative-realtime-v1", operation, payload, channel, requestId, mutation,
  });
  const created = await authority.handle(request("createTable", {
    host: { playerId: "host_idem", displayName: "Host" }, visibility: "OPEN", capacity: 3, protocolVersion: "v1", rulesVersion: "r1",
  }, "crazy-rummy/v1/open-index", "request_create", { idempotencyKey: "create_once", expectedTableVersion: null }));
  const duplicateCreate = await authority.handle(request("createTable", {
    host: { playerId: "host_idem", displayName: "Host" }, visibility: "OPEN", capacity: 3, protocolVersion: "v1", rulesVersion: "r1",
  }, "crazy-rummy/v1/open-index", "request_duplicate", { idempotencyKey: "create_once", expectedTableVersion: null }));
  assert.equal(duplicateCreate.table.tableId, created.table.tableId);
  const join = (playerId, expectedTableVersion, key) => authority.handle(request("joinTable", {
    tableId: created.table.tableId, player: { playerId, displayName: playerId }, protocolVersion: "v1", rulesVersion: "r1",
  }, created.table.providerScope, `request_${key}`, { idempotencyKey: key, expectedTableVersion }));
  assert.equal((await join("guest_one", 1, "join_once")).table.revision, 2);
  assert.equal((await join("guest_one", 1, "join_once")).table.revision, 2);
  assert.equal((await join("guest_two", 2, "join_two")).table.revision, 3);
  await assert.rejects(join("guest_three", 3, "join_full"), { code: "TABLE_FULL" });
  await assert.rejects(join("guest_three", 1, "join_stale"), { code: "STALE_TABLE" });
});

test("exact MeteredPeer construction follows the locally proven TURN probe API", () => {
  const calls = [];
  class MeteredPeer {
    constructor(options) { calls.push(options); }
  }
  const peer = createMeteredPeerSignalling({
    sdk: { MeteredPeer }, publicKey: KEY, rtcPeerConnectionFactory: () => ({}),
  });
  assert.ok(peer instanceof MeteredPeer);
  assert.equal(calls[0].apiKey, KEY);
  assert.equal(typeof calls[0].rtcPeerConnectionFactory, "function");
});

test("realtime bridge collects only Open public advertisements and unsubscribes on cleanup", async () => {
  FakeSignallingClient.reset();
  const bridge = createMeteredRealtimeRequestClient({
    SignallingClient: FakeSignallingClient, publicKey: KEY, installationId: "collector", discoveryWindowMs: 50,
  });
  await bridge.advertiseTable({ tableId: "open_1", visibility: "OPEN", providerScope: "hidden", inviteCode: "hidden" });
  const listed = await bridge.request({ requestId: "discover", operation: "listTables", channel: "crazy-rummy/v1/open-index" }, { timeoutMs: 500 });
  assert.deepEqual(listed.value.tables, []);
  assert.equal(bridge.client.connectCalls, 1);
  assert.equal(bridge.client.calls[0], "connect");
  assert.ok(bridge.client.calls.indexOf("connect") < bridge.client.calls.indexOf("subscribe:crazy-rummy/v1/open-index"));
  await bridge.close();
  assert.ok(bridge.client.unsubscribed.includes("crazy-rummy/v1/open-index"));
  assert.equal(bridge.client.state, "closed");
});

class FakeSignallingClient {
  static instances = [];
  static reset() { FakeSignallingClient.instances = []; }
  constructor(options) {
    this.options = options;
    this.handlers = new Map();
    this.unsubscribed = [];
    this.published = [];
    this.calls = [];
    this.connectCalls = 0;
    this.state = "idle";
    this.peerId = `fake-peer-${FakeSignallingClient.instances.length + 1}`;
    FakeSignallingClient.instances.push(this);
  }
  on(event, callback) { this.handlers.set(event, callback); return this; }
  off(event, callback) { if (this.handlers.get(event) === callback) this.handlers.delete(event); return this; }
  async connect() {
    this.connectCalls += 1;
    this.calls.push("connect");
    this.state = "connected";
  }
  assertConnected(operation) {
    if (this.state !== "connected") throw new Error(`${operation} before connect`);
  }
  async subscribe(channel) {
    this.assertConnected("subscribe");
    this.calls.push(`subscribe:${channel}`);
  }
  async unsubscribe(channel) {
    this.assertConnected("unsubscribe");
    this.unsubscribed.push(channel);
  }
  async publish(channel, data) {
    this.assertConnected("publish");
    this.calls.push(`publish:${channel}`);
    this.published.push({ channel, data });
    for (const client of FakeSignallingClient.instances) client.handlers.get("message")?.({ channel, from: this.peerId, data });
  }
  async send(peerId, data) {
    this.assertConnected("send");
    const target = FakeSignallingClient.instances.find((client) => client.peerId === peerId);
    target?.handlers.get("direct")?.({ from: this.peerId, data });
  }
  async close() {
    this.calls.push("close");
    this.state = "closed";
  }
}

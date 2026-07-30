import assert from "node:assert/strict";
import test from "node:test";

import { RULES_VERSION, SCHEMA_VERSION } from "../../src/engine/index.js";
import {
  DEFAULT_TRANSPORT_PROTOCOL_VERSION,
  SIGNAL_KIND,
  createSignallingEnvelope,
} from "../../src/online/index.js";
import {
  createConfiguredOnlineLobbySession,
  createConfiguredPeerConnection,
} from "../../src/online/runtime.js";

class FailingSignallingClient {
  static latest = null;

  constructor() {
    this.state = "idle";
    this.handlers = new Map();
    this.closed = false;
    FailingSignallingClient.latest = this;
  }

  on(type, listener) { this.handlers.set(type, listener); return this; }
  off(type, listener) {
    if (this.handlers.get(type) === listener) this.handlers.delete(type);
    return this;
  }
  async connect() { throw new Error("provider unavailable"); }
  async subscribe() {}
  async unsubscribe() {}
  async publish() {}
  async close() { this.closed = true; }
}

test("configured peer start failure releases its provider lifecycle", async () => {
  const peer = createConfiguredPeerConnection({
    publicKey: "pk_live_test",
    SignallingClientClass: FailingSignallingClient,
    rtcPeerConnectionFactory: () => {
      throw new Error("RTC must not start after signalling failure");
    },
    matchId: "runtime-match",
    channel: "crazy-rummy/v1/peer/runtime-pair",
    localPlayerId: "host",
    remotePlayerId: "guest",
    offerer: true,
    localSeatProof: "runtime-host-seat-proof-000001",
    verifyRemoteSeatProof: () => true,
  });

  await assert.rejects(peer.start(), { code: "SIGNALLING_UNAVAILABLE" });
  assert.equal(FailingSignallingClient.latest.closed, true);
  assert.equal(FailingSignallingClient.latest.handlers.size, 0);
});

class WorkingSignallingClient extends FailingSignallingClient {
  async connect() {
    this.state = "connected";
    this.handlers.get("connected")?.({ iceServers: [] });
  }
}

class LobbySignallingClient extends WorkingSignallingClient {
  static instances = [];
  constructor(...args) {
    super(...args);
    this.published = [];
    LobbySignallingClient.instances.push(this);
  }
  async subscribe() {
    assert.equal(this.state, "connected");
  }
  async unsubscribe() {}
  async publish(channel, data) {
    assert.equal(this.state, "connected");
    this.published.push({ channel, data });
  }
}

test("configured lobby refreshes do not trip a second client-side read limit", async () => {
  const session = createConfiguredOnlineLobbySession({
    player: { playerId: "runtime-lobby-player", displayName: "Runtime lobby" },
    publicKey: "pk_live_test",
    SignallingClientClass: LobbySignallingClient,
    autoRefresh: false,
    discoveryWindowMs: 50,
  });

  await session.goOnline();
  await session.refresh();

  assert.equal(session.getSnapshot().error, null);
  assert.equal(session.getSnapshot().presence.status, "online");
  session.dispose();
});

test("configured lobbies use distinct realtime installation IDs even for the same player identity", async () => {
  LobbySignallingClient.instances = [];
  const options = {
    player: { playerId: "shared-player-id", displayName: "Shared player" },
    publicKey: "pk_live_test",
    SignallingClientClass: LobbySignallingClient,
    autoRefresh: false,
    discoveryWindowMs: 50,
  };
  const first = createConfiguredOnlineLobbySession(options);
  const second = createConfiguredOnlineLobbySession(options);

  await Promise.all([first.goOnline(), second.goOnline()]);
  const installationIds = LobbySignallingClient.instances.map((client) =>
    client.published.find((entry) => entry.data.type === "crazy-rummy/discovery-request")
      ?.data.installationId
  );
  assert.equal(new Set(installationIds).size, 2);
  assert.equal(installationIds.includes("shared-player-id"), false);

  first.dispose();
  second.dispose();
});

class PassiveRtcConnection {
  constructor() {
    this.connectionState = "new";
    this.localDescription = null;
    this.remoteDescription = null;
    this.listeners = new Map();
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  async addIceCandidate() {}
  close() { this.connectionState = "closed"; }
}

test("remote peer closure releases the configured provider lifecycle", async () => {
  const peer = createConfiguredPeerConnection({
    publicKey: "pk_live_test",
    SignallingClientClass: WorkingSignallingClient,
    rtcPeerConnectionFactory: () => new PassiveRtcConnection(),
    matchId: "runtime-match",
    channel: "crazy-rummy/v1/peer/runtime-pair",
    localPlayerId: "host",
    remotePlayerId: "guest",
    offerer: false,
    localSeatProof: "runtime-host-seat-proof-000001",
    verifyRemoteSeatProof: () => true,
  });
  await peer.start();
  const now = Date.now();
  const remoteClose = createSignallingEnvelope({
    signalId: "runtime_remote_close_1",
    matchId: "runtime-match",
    fromPlayerId: "guest",
    toPlayerId: "host",
    kind: SIGNAL_KIND.CLOSE,
    createdAt: now,
    expiresAt: now + 30_000,
    payload: {
      reason: "normal",
      identity: {
        transportProtocolVersion: DEFAULT_TRANSPORT_PROTOCOL_VERSION,
        engineSchemaVersion: SCHEMA_VERSION,
        engineRulesVersion: RULES_VERSION,
        seatProof: "runtime-guest-seat-proof-00001",
      },
    },
  });
  WorkingSignallingClient.latest.handlers.get("message")?.({ data: remoteClose });
  for (let index = 0; index < 20; index += 1) await Promise.resolve();

  assert.equal(peer.getSnapshot().state, "closed");
  assert.equal(WorkingSignallingClient.latest.closed, true);
  assert.equal(WorkingSignallingClient.latest.handlers.size, 0);
});

class HangingCleanupSignallingClient extends WorkingSignallingClient {
  async unsubscribe() { return new Promise(() => {}); }
  async close() { return new Promise(() => {}); }
}

test("configured peer close releases local resources when provider cleanup never settles", async () => {
  const providerScheduler = createTimeoutScheduler();
  const peer = createConfiguredPeerConnection({
    publicKey: "pk_live_test",
    SignallingClientClass: HangingCleanupSignallingClient,
    rtcPeerConnectionFactory: () => new PassiveRtcConnection(),
    matchId: "runtime-close-timeout",
    channel: "crazy-rummy/v1/peer/runtime-close-timeout",
    localPlayerId: "host",
    remotePlayerId: "guest",
    offerer: false,
    localSeatProof: "runtime-host-seat-proof-000001",
    verifyRemoteSeatProof: () => true,
    providerScheduler,
    providerCloseTimeoutMs: 1,
  });
  await peer.start();
  const closing = peer.close();
  assert.equal(peer.getSnapshot().state, "closed", "local peer close must not wait for provider cleanup");
  providerScheduler.runAll();
  await closing;
  assert.equal(WorkingSignallingClient.latest.handlers.size, 0);
});

function createTimeoutScheduler() {
  const tasks = [];
  return {
    setTimeout(callback) {
      tasks.push({ callback, cleared: false });
      return tasks.length - 1;
    },
    clearTimeout(id) { if (tasks[id]) tasks[id].cleared = true; },
    runAll() {
      for (const task of tasks) if (!task.cleared) {
        task.cleared = true;
        task.callback();
      }
    }
  };
}

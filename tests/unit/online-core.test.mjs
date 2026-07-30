import assert from "node:assert/strict";
import test from "node:test";

import {
  ONLINE_ERROR,
  OnlineLobbyError,
  createFakeLobbyService,
  createOnlineLobbySession
} from "../../src/online/index.js";

const versions = Object.freeze({ protocolVersion: "lobby-test-v1", rulesVersion: "rules-test-v1" });
const host = Object.freeze({ playerId: "host-0001", displayName: "Host" });
const guestOne = Object.freeze({ playerId: "guest-001", displayName: "Guest One" });
const guestTwo = Object.freeze({ playerId: "guest-002", displayName: "Guest Two" });
const guestThree = Object.freeze({ playerId: "guest-003", displayName: "Guest Three" });

function fakeOptions(now) {
  let token = 0;
  return {
    clock: () => now.value,
    token: () => `${++token}`.padEnd(32, "x")
  };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code);
}

test("fake authority expires presence and unrenewed table leases at authoritative time", async () => {
  const now = { value: 0 };
  const service = createFakeLobbyService(fakeOptions(now));
  await service.heartbeat({ ...host, ...versions, online: true });
  await service.createTable({ host, visibility: "OPEN", capacity: 3, ...versions });
  assert.equal(service.inspect().presence.length, 1);
  assert.equal((await service.listTables(versions)).tables.length, 1);

  now.value = 45_000;
  assert.equal(service.inspect().presence.length, 0);
  assert.equal((await service.listTables(versions)).tables.length, 0);
});

test("lease renewal extends availability without changing the table revision", async () => {
  const now = { value: 0 };
  const service = createFakeLobbyService(fakeOptions(now));
  const created = await service.createTable({ host, visibility: "OPEN", capacity: 2, ...versions });
  now.value = 20_000;
  const renewed = await service.renewLease({
    tableId: created.table.tableId,
    hostId: host.playerId,
    expectedRevision: created.table.revision - 1,
  });
  assert.equal(renewed.table.revision, created.table.revision);
  assert.equal(renewed.table.leaseExpiresAt, 65_000);
});

test("Open discovery hides Closed tables and only returns compatible protocol/rules", async () => {
  const now = { value: 0 };
  const service = createFakeLobbyService(fakeOptions(now));
  const closed = await service.createTable({ host, visibility: "CLOSED", capacity: 3, ...versions });
  await service.createTable({ host: guestOne, visibility: "OPEN", capacity: 3, ...versions });
  const publicList = await service.listTables(versions);
  assert.equal(publicList.tables.length, 1);
  assert.equal(publicList.tables[0].visibility, "OPEN");
  assert.equal(JSON.stringify(publicList).includes(closed.invite.code), false);
  const incompatible = await service.listTables({ ...versions, rulesVersion: "other-rules" });
  assert.equal(incompatible.tables.length, 0);
  assert.equal(incompatible.incompatibleOpenTableCount, 1);
  await rejectsCode(service.lookupTable({ code: closed.invite.code, ...versions, protocolVersion: "other-protocol" }), ONLINE_ERROR.INCOMPATIBLE_PROTOCOL);
  await rejectsCode(service.joinTable({ tableId: closed.table.tableId, player: guestOne, ...versions, rulesVersion: "other-rules" }), ONLINE_ERROR.INCOMPATIBLE_RULES);
});

test("conditional seats, acceptance, readiness, leave, and host cancellation preserve table authority", async () => {
  const now = { value: 0 };
  const service = createFakeLobbyService(fakeOptions(now));
  const created = await service.createTable({ host, visibility: "OPEN", capacity: 3, ...versions });
  let table = created.table;
  table = (await service.joinTable({ tableId: table.tableId, player: guestOne, ...versions, expectedRevision: table.revision })).table;
  table = (await service.joinTable({ tableId: table.tableId, player: guestTwo, ...versions, expectedRevision: table.revision })).table;
  await rejectsCode(service.joinTable({ tableId: table.tableId, player: guestThree, ...versions, expectedRevision: table.revision }), ONLINE_ERROR.TABLE_FULL);
  await rejectsCode(service.setReady({ tableId: table.tableId, playerId: guestOne.playerId, ready: true, expectedRevision: table.revision }), ONLINE_ERROR.FORBIDDEN);
  table = (await service.acceptTable({ tableId: table.tableId, playerId: guestOne.playerId, expectedRevision: table.revision })).table;
  table = (await service.setReady({ tableId: table.tableId, playerId: guestOne.playerId, ready: true, expectedRevision: table.revision })).table;
  assert.equal(table.seats.find((seat) => seat.playerId === guestOne.playerId).ready, true);
  table = (await service.leaveTable({ tableId: table.tableId, playerId: guestTwo.playerId, expectedRevision: table.revision })).table;
  assert.equal(table.occupiedSeats, 2);
  await service.cancelTable({ tableId: table.tableId, hostId: host.playerId, expectedRevision: table.revision });
  assert.equal((await service.listTables(versions)).tables.length, 0);
});

test("two accepted, ready players connect, recover a failed topology, then confirm an online match", async () => {
  const service = createFakeLobbyService(fakeOptions({ value: 1_000 }));
  let table = (await service.createTable({ host, visibility: "OPEN", capacity: 2, ...versions })).table;
  table = (await service.setReady({
    tableId: table.tableId, playerId: host.playerId, ready: true, expectedRevision: table.revision
  })).table;
  table = (await service.joinTable({
    tableId: table.tableId, player: guestOne, ...versions, expectedRevision: table.revision
  })).table;
  table = (await service.acceptTable({
    tableId: table.tableId, playerId: guestOne.playerId, expectedRevision: table.revision
  })).table;
  table = (await service.setReady({
    tableId: table.tableId, playerId: guestOne.playerId, ready: true, expectedRevision: table.revision
  })).table;
  const connecting = await service.startMatch({
    tableId: table.tableId, hostId: host.playerId, expectedRevision: table.revision
  });
  assert.equal(connecting.table.status, "CONNECTING");
  assert.equal(connecting.bootstrap.seats.length, 2);
  const guestBootstrap = await service.getMatchBootstrap({
    tableId: table.tableId, playerId: guestOne.playerId
  });
  assert.equal(guestBootstrap.table.status, "CONNECTING");
  assert.equal(guestBootstrap.bootstrap.localPlayerId, guestOne.playerId);

  const restored = await service.abortStart({
    tableId: table.tableId, hostId: host.playerId, expectedRevision: connecting.table.revision
  });
  assert.equal(restored.aborted, true);
  assert.equal(restored.table.status, "OPEN");
  assert.equal(restored.table.seats.every((seat) => seat.ready && seat.acceptedAt !== null), true);
  await rejectsCode(service.getMatchBootstrap({ tableId: table.tableId, playerId: guestOne.playerId }), ONLINE_ERROR.NOT_FOUND);

  const retry = await service.startMatch({
    tableId: table.tableId, hostId: host.playerId, expectedRevision: restored.table.revision
  });
  const confirmed = await service.confirmStart({
    tableId: table.tableId, hostId: host.playerId, expectedRevision: retry.table.revision
  });
  assert.equal(confirmed.table.status, "STARTED");
  assert.equal(confirmed.bootstrap.matchId, retry.bootstrap.matchId);
});

function createScheduler() {
  const tasks = [];
  return {
    tasks,
    setTimeout(callback, delay) { tasks.push({ callback, delay, cancelled: false }); return tasks.length - 1; },
    clearTimeout(id) { if (tasks[id]) tasks[id].cancelled = true; },
    async runNext() { const task = tasks.find((candidate) => !candidate.cancelled && !candidate.ran); task.ran = true; await task.callback(); }
  };
}

test("sessions use jittered exponential polling backoff and pause while hidden", async () => {
  const now = { value: 0 };
  const fake = createFakeLobbyService(fakeOptions(now));
  let listAttempts = 0;
  const service = {
    ...fake,
    async listTables(input) {
      listAttempts += 1;
      if (listAttempts < 3) throw new OnlineLobbyError(ONLINE_ERROR.SERVICE_UNAVAILABLE, "Temporarily unavailable.", { retryable: true });
      return fake.listTables(input);
    }
  };
  let visible = true;
  let visibilityListener = null;
  const scheduler = createScheduler();
  const session = createOnlineLobbySession({
    service, player: host, ...versions, clock: () => now.value, scheduler, random: () => 0.5,
    pollMs: 100, maxPollMs: 1_000, jitterRatio: 0,
    visibility: { isVisible: () => visible, subscribe(listener) { visibilityListener = listener; return () => {}; } }
  });
  await rejectsCode(session.goOnline(), ONLINE_ERROR.SERVICE_UNAVAILABLE);
  assert.equal(scheduler.tasks.at(-1).delay, 200);
  await scheduler.runNext();
  assert.equal(scheduler.tasks.at(-1).delay, 400);
  visible = false;
  visibilityListener();
  assert.equal(session.getSnapshot().polling.visible, false);
  assert.equal(scheduler.tasks.at(-1).cancelled, true);
  session.dispose();
});

test("disabled lobby auto-refresh leaves explicit manual refresh available", async () => {
  const scheduler = createScheduler();
  const service = createFakeLobbyService(fakeOptions({ value: 0 }));
  let autoRefresh = false;
  const session = createOnlineLobbySession({
    service,
    player: host,
    ...versions,
    scheduler,
    clock: () => 0,
    jitterRatio: 0,
    autoRefresh: () => autoRefresh
  });

  await session.goOnline();
  assert.equal(session.getSnapshot().polling.autoRefresh, false);
  assert.equal(session.getSnapshot().polling.nextPollAt, null);
  assert.equal(scheduler.tasks.filter((task) => !task.cancelled).length, 0);

  await session.refresh();
  assert.equal(session.getSnapshot().polling.lastRefreshAt, 0);
  assert.equal(scheduler.tasks.filter((task) => !task.cancelled).length, 0);

  autoRefresh = true;
  await session.syncAutoRefresh();
  assert.equal(session.getSnapshot().polling.autoRefresh, true);
  assert.equal(scheduler.tasks.filter((task) => !task.cancelled).length, 1);

  autoRefresh = false;
  await session.syncAutoRefresh();
  assert.equal(session.getSnapshot().polling.autoRefresh, false);
  assert.equal(scheduler.tasks.filter((task) => !task.cancelled).length, 0);
  session.dispose();
});

test("manual refresh replaces the pending automatic poll", async () => {
  const scheduler = createScheduler();
  const session = createOnlineLobbySession({
    service: createFakeLobbyService(fakeOptions({ value: 0 })),
    player: host,
    ...versions,
    scheduler,
    clock: () => 0,
    jitterRatio: 0,
  });

  await session.goOnline();
  const pendingPoll = scheduler.tasks.find((task) => !task.cancelled && !task.ran);
  assert.ok(pendingPoll);

  await session.refresh();

  assert.equal(pendingPoll.cancelled, true);
  assert.equal(
    scheduler.tasks.filter((task) => !task.cancelled && !task.ran).length,
    1,
  );
  session.dispose();
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test("a late discovery response cannot overwrite a newer refresh response", async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const service = {
    heartbeat: async () => ({ expiresAt: 45_000 }),
    listTables: async () => (++calls === 1 ? first.promise : second.promise)
  };
  const scheduler = createScheduler();
  const session = createOnlineLobbySession({ service, player: host, ...versions, scheduler, jitterRatio: 0 });
  const online = session.goOnline();
  await Promise.resolve();
  const newer = session.refresh();
  await Promise.resolve();
  second.resolve([{ tableId: "table-new", hostDisplayName: "New" }]);
  await newer;
  first.resolve([{ tableId: "table-old", hostDisplayName: "Old" }]);
  await online;
  assert.equal(session.getSnapshot().tables[0].tableId, "table-new");
  session.dispose();
});

test("provider routing and invite secrets never cross the UI snapshot boundary", async () => {
  const scheduler = createScheduler();
  const session = createOnlineLobbySession({
    service: {
      heartbeat: async () => ({ expiresAt: 45_000 }),
      listTables: async () => ({
        tables: [{
          tableId: "table_secret_01",
          visibility: "OPEN",
          providerScope: "crazy-rummy/v1/host/private",
          inviteCode: "must-not-render",
          roomSecret: "must-not-render",
          seatSecret: "must-not-render"
        }]
      })
    },
    player: host,
    ...versions,
    scheduler,
    jitterRatio: 0
  });
  await session.goOnline();
  const encoded = JSON.stringify(session.getSnapshot().tables);
  assert.doesNotMatch(encoded, /providerScope|inviteCode|roomSecret|seatSecret|must-not-render/);
  session.dispose();
});

test("session exposes incompatible open-table discovery metadata without exposing incompatible tables", async () => {
  const session = createOnlineLobbySession({
    service: {
      heartbeat: async () => ({ expiresAt: 45_000 }),
      listTables: async () => ({
        tables: [{ tableId: "compatible-table", visibility: "OPEN", protocolVersion: versions.protocolVersion, rulesVersion: versions.rulesVersion }],
        incompatibleOpenTableCount: 2
      })
    },
    player: host,
    ...versions,
    scheduler: createScheduler(),
    jitterRatio: 0
  });
  await session.goOnline();
  assert.deepEqual(session.getSnapshot().tables.map((table) => table.tableId), ["compatible-table"]);
  assert.equal(session.getSnapshot().discovery.incompatibleOpenTableCount, 2);
  session.dispose();
});

test("host session can abort a connecting start after topology failure and retain the ready room", async () => {
  const now = { value: 0 };
  const service = createFakeLobbyService(fakeOptions(now));
  const hostSession = createOnlineLobbySession({ service, player: host, ...versions, scheduler: createScheduler(), clock: () => now.value, jitterRatio: 0 });
  const guestSession = createOnlineLobbySession({ service, player: guestOne, ...versions, scheduler: createScheduler(), clock: () => now.value, jitterRatio: 0 });
  await hostSession.goOnline();
  const created = await hostSession.createTable({ visibility: "OPEN", capacity: 2 });
  await hostSession.setReady(true);
  await guestSession.goOnline();
  await guestSession.joinTable({
    tableId: created.table.tableId,
    revision: hostSession.getSnapshot().room.table.revision
  });
  await guestSession.setReady(true);
  await hostSession.refresh();

  await hostSession.startMatch();
  assert.equal(hostSession.getSnapshot().room.table.status, "CONNECTING");
  assert.ok(hostSession.getMatchBootstrap());
  await hostSession.abortStart();
  const recovered = hostSession.getSnapshot();
  assert.equal(recovered.room.table.status, "OPEN");
  assert.equal(recovered.room.table.seats.every((seat) => seat.ready && seat.acceptedAt !== null), true);
  assert.equal(hostSession.getMatchBootstrap(), null);
  await hostSession.startMatch();
  await hostSession.confirmStart();
  assert.equal(hostSession.getSnapshot().room.table.status, "STARTED");
  hostSession.dispose();
  guestSession.dispose();
});

test("the UI session completes Closed-code acceptance before object-form readiness and passes both provider revision fields", async () => {
  const now = { value: 0 };
  const fake = createFakeLobbyService(fakeOptions(now));
  let conditionalInput = null;
  const service = {
    ...fake,
    async setReady(input) {
      conditionalInput = input;
      return fake.setReady(input);
    }
  };
  const scheduler = createScheduler();
  const hostSession = createOnlineLobbySession({ service, player: host, ...versions, scheduler, clock: () => now.value, jitterRatio: 0 });
  await hostSession.goOnline();
  const creation = await hostSession.createTable({ visibility: "CLOSED", capacity: 3 });
  const guestSession = createOnlineLobbySession({ service, player: guestOne, ...versions, scheduler: createScheduler(), clock: () => now.value, jitterRatio: 0 });
  await guestSession.goOnline();
  await guestSession.joinByCode(creation.invite.code);
  await guestSession.setReady({ ready: true });
  assert.equal(guestSession.getSnapshot().room.table.seats.find((seat) => seat.playerId === guestOne.playerId).ready, true);
  assert.equal(guestSession.getSnapshot().tables.length, 0);
  assert.equal(conditionalInput.expectedRevision, conditionalInput.expectedTableVersion);
  assert.throws(() => createOnlineLobbySession({ service, player: { ...guestOne, displayName: "www.bad.example" }, ...versions }), (error) => error?.code === ONLINE_ERROR.INVALID_DISPLAY_NAME);
  hostSession.dispose();
  guestSession.dispose();
});

test("a polling refresh cannot supersede a completed join mutation or skip acceptance", async () => {
  let resolveJoin;
  const joined = new Promise((resolve) => { resolveJoin = resolve; });
  const accepted = [];
  const table = (revision, acceptedAt = null) => ({
    tableId: "table-race-001", revision, visibility: "OPEN", hostPlayerId: host.playerId,
    seats: [{ ...guestOne, acceptedAt, ready: false }]
  });
  const service = {
    heartbeat: async () => ({ expiresAt: 10_000 }),
    listTables: async () => ({ tables: [] }),
    joinTable: async () => joined,
    acceptTable: async (input) => {
      accepted.push(input);
      return { table: table(3, 1) };
    }
  };
  const session = createOnlineLobbySession({
    service, player: guestOne, ...versions, scheduler: createScheduler(), jitterRatio: 0
  });
  await session.goOnline();
  const join = session.joinTable({ tableId: "table-race-001", revision: 1 });
  await Promise.resolve();
  await session.refresh();
  resolveJoin({ table: table(2) });
  await join;
  assert.equal(accepted.length, 1);
  assert.equal(session.getSnapshot().room.table.revision, 3);
  session.dispose();
});

test("a retry retains its operation idempotency key and reconciles the accepted table", async () => {
  const keys = [];
  let attempts = 0;
  const service = {
    heartbeat: async () => ({ expiresAt: 10_000 }),
    listTables: async () => ({ tables: [] }),
    createTable: async (input) => {
      keys.push(input.idempotencyKey);
      attempts += 1;
      if (attempts === 1) throw new OnlineLobbyError(ONLINE_ERROR.SERVICE_UNAVAILABLE, "Reply lost.", { retryable: true });
      return { table: { tableId: "table-retry-001", revision: 1, visibility: "OPEN", hostPlayerId: host.playerId, seats: [{ ...host, acceptedAt: 1, ready: false }] } };
    }
  };
  const session = createOnlineLobbySession({
    service, player: host, ...versions, scheduler: createScheduler(), jitterRatio: 0
  });
  await session.goOnline();
  await assert.rejects(session.createTable({ visibility: "OPEN", capacity: 2 }), { code: ONLINE_ERROR.SERVICE_UNAVAILABLE });
  await session.createTable({ visibility: "OPEN", capacity: 2 });
  assert.equal(keys[0], keys[1]);
  assert.equal(session.getSnapshot().room.table.tableId, "table-retry-001");
  session.dispose();
});

test("a polling refresh does not suppress an in-flight mutation error", async () => {
  const created = deferred();
  const service = {
    heartbeat: async () => ({ expiresAt: 10_000 }),
    listTables: async () => ({ tables: [] }),
    createTable: async () => created.promise
  };
  const session = createOnlineLobbySession({
    service, player: host, ...versions, scheduler: createScheduler(), jitterRatio: 0
  });
  await session.goOnline();
  const create = session.createTable({ visibility: "OPEN", capacity: 2 });
  await Promise.resolve();
  await session.refresh();
  created.reject(new OnlineLobbyError(ONLINE_ERROR.SERVICE_UNAVAILABLE, "Reply lost.", { retryable: true }));
  await assert.rejects(create, { code: ONLINE_ERROR.SERVICE_UNAVAILABLE });
  assert.equal(session.getSnapshot().error.code, ONLINE_ERROR.SERVICE_UNAVAILABLE);
  session.dispose();
});

test("a lost lease-renewal reply reuses its key once, then a confirmed renewal rotates it", async () => {
  const renewalInputs = [];
  const cachedRenewals = new Map();
  let leaseExpiresAt = 20_000;
  let loseFirstReply = true;
  const table = () => ({
    tableId: "table-lease-001", revision: 1, visibility: "OPEN", hostPlayerId: host.playerId,
    seats: [{ ...host, acceptedAt: 1, ready: false }], leaseExpiresAt
  });
  const service = {
    heartbeat: async () => ({ expiresAt: 30_000 }),
    listTables: async () => ({ tables: [] }),
    createTable: async () => ({ table: table() }),
    renewLease: async (input) => {
      renewalInputs.push(input);
      if (!cachedRenewals.has(input.idempotencyKey)) {
        leaseExpiresAt += 10_000;
        cachedRenewals.set(input.idempotencyKey, { table: table() });
      }
      if (loseFirstReply) {
        loseFirstReply = false;
        throw new OnlineLobbyError(ONLINE_ERROR.SERVICE_UNAVAILABLE, "Reply lost.", { retryable: true });
      }
      return cachedRenewals.get(input.idempotencyKey);
    }
  };
  const session = createOnlineLobbySession({
    service, player: host, ...versions, scheduler: createScheduler(), jitterRatio: 0
  });
  await session.goOnline();
  await session.createTable({ visibility: "OPEN", capacity: 2 });
  await assert.rejects(session.refresh(), { code: ONLINE_ERROR.SERVICE_UNAVAILABLE });
  await session.refresh();
  await session.refresh();
  assert.equal(renewalInputs.length, 3);
  assert.equal(renewalInputs[0].idempotencyKey, renewalInputs[1].idempotencyKey);
  assert.notEqual(renewalInputs[1].idempotencyKey, renewalInputs[2].idempotencyKey);
  assert.deepEqual(renewalInputs.map((input) => input.expectedRevision), [1, 1, 1]);
  assert.equal(session.getSnapshot().room.table.leaseExpiresAt, 40_000);
  session.dispose();
});

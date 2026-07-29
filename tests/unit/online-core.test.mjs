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
  assert.equal((await service.listTables(versions)).length, 1);

  now.value = 45_000;
  assert.equal(service.inspect().presence.length, 0);
  assert.equal((await service.listTables(versions)).length, 0);
});

test("Open discovery hides Closed tables and only returns compatible protocol/rules", async () => {
  const now = { value: 0 };
  const service = createFakeLobbyService(fakeOptions(now));
  const closed = await service.createTable({ host, visibility: "CLOSED", capacity: 3, ...versions });
  await service.createTable({ host: guestOne, visibility: "OPEN", capacity: 3, ...versions });
  const publicList = await service.listTables(versions);
  assert.equal(publicList.length, 1);
  assert.equal(publicList[0].visibility, "OPEN");
  assert.equal(JSON.stringify(publicList).includes(closed.invite.code), false);
  assert.equal((await service.listTables({ ...versions, rulesVersion: "other-rules" })).length, 0);
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
  assert.equal((await service.listTables(versions)).length, 0);
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

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
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

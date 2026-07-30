import {
  DEFAULT_PROTOCOL_VERSION,
  HEARTBEAT_MS,
  assertCapacity,
  assertInviteCode,
  assertPlayerId,
  assertVersion,
  assertVisibility,
  frozenCopy,
  normalizePlayer
} from "./contract.js";
import { RULES_VERSION as DEFAULT_LOBBY_RULES_VERSION } from "../../config.js";
import { ONLINE_ERROR, OnlineLobbyError, asOnlineLobbyError } from "./errors.js";

const DEFAULT_POLL_MS = 5_000;
const MAX_POLL_MS = 30_000;

function clockNow(clock) { return Number(clock()); }

function defaultScheduler() {
  return { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) };
}

function defaultVisibility() {
  const document = globalThis.document;
  if (!document?.addEventListener) return { isVisible: () => true, subscribe: () => () => {} };
  return {
    isVisible: () => document.visibilityState !== "hidden",
    subscribe(listener) {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    }
  };
}

function tableFrom(result) {
  return result?.table ?? null;
}

function publicTable(value) {
  if (!value || typeof value !== "object") return value;
  const {
    providerScope,
    inviteCode,
    roomSecret,
    seatSecret,
    ...safe
  } = value;
  return safe;
}

/**
 * UI-facing state holder. It owns request ordering and polling but has no
 * provider knowledge: all authority remains behind the supplied service.
 */
export function createOnlineLobbySession(options = {}) {
  if (!options.service || typeof options.service !== "object") throw new TypeError("An online lobby service is required.");
  const service = options.service;
  const player = normalizePlayer(options.player);
  const protocolVersion = assertVersion(options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION, "protocol version");
  const rulesVersion = assertVersion(options.rulesVersion ?? DEFAULT_LOBBY_RULES_VERSION, "rules version");
  const clock = options.clock ?? Date.now;
  const scheduler = options.scheduler ?? defaultScheduler();
  const random = options.random ?? Math.random;
  const visibility = options.visibility ?? defaultVisibility();
  const autoRefresh = options.autoRefresh ?? true;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const maxPollMs = options.maxPollMs ?? MAX_POLL_MS;
  const jitterRatio = options.jitterRatio ?? 0.2;
  if (!Number.isFinite(pollMs) || pollMs < 1 || !Number.isFinite(maxPollMs) || maxPollMs < pollMs) throw new TypeError("Polling intervals are invalid.");
  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) throw new TypeError("Polling jitter is invalid.");

  const listeners = new Set();
  let online = false;
  let tables = [];
  let roomTable = null;
  let invite = null;
  let providerScope = null;
  let matchBootstrap = null;
  let presence = { status: "offline", lastHeartbeatAt: null, expiresAt: null, error: null };
  let lastError = null;
  let requestSequence = 0;
  let mutationSequence = 0;
  let refreshSequence = 0;
  let appliedMutationSequence = 0;
  let mutationOrdinal = 0;
  let renewalOrdinal = 0;
  const pendingMutationKeys = new Map();
  const pendingRenewalKeys = new Map();
  let consecutiveFailures = 0;
  let nextPollAt = null;
  let timer = null;
  let disposed = false;
  let lastRefreshAt = null;
  let incompatibleOpenTableCount = 0;

  function isVisible() { return visibility.isVisible?.() !== false; }
  function autoRefreshEnabled() {
    try {
      return typeof autoRefresh === "function"
        ? autoRefresh() !== false
        : autoRefresh !== false;
    } catch {
      return true;
    }
  }
  function serializableError(error) {
    if (!error) return null;
    return { code: error.code, message: error.message, retryable: error.retryable, details: error.details ?? null };
  }
  function snapshot() {
    return frozenCopy({
      online,
      player,
      presence: { ...presence, error: serializableError(presence.error) },
      tables,
      room: { table: roomTable, invite },
      discovery: { incompatibleOpenTableCount },
      polling: {
        visible: isVisible(),
        autoRefresh: autoRefreshEnabled(),
        failures: consecutiveFailures,
        nextPollAt,
        lastRefreshAt
      },
      error: serializableError(lastError),
      requestSequence
    });
  }
  function notify() {
    const next = snapshot();
    for (const listener of listeners) listener(next);
    return next;
  }
  function assertActive() {
    if (disposed) throw new OnlineLobbyError(ONLINE_ERROR.SERVICE_UNAVAILABLE, "This lobby session was disposed.");
  }
  function assertOnline() {
    assertActive();
    if (!online) throw new OnlineLobbyError(ONLINE_ERROR.OFFLINE, "Go online before using the lobby.", { retryable: true });
  }
  function callInput(extra = {}) {
    return { ...extra, protocolVersion, rulesVersion, providerScope };
  }
  function applyRoom(result) {
    const table = tableFrom(result);
    const { providerScope: tableScope, ...safeTable } = table ?? {};
    if (
      table
      && roomTable?.tableId === safeTable.tableId
      && Number.isInteger(roomTable.revision)
      && Number.isInteger(safeTable.revision)
      && safeTable.revision < roomTable.revision
    ) return;
    roomTable = table ? safeTable : null;
    if (result?.invite) invite = result.invite;
    const nextScope = result?.providerScope ?? tableScope;
    if (typeof nextScope === "string") providerScope = nextScope;
    if (result?.bootstrap && result.bootstrap.localPlayerId === player.playerId) matchBootstrap = result.bootstrap;
    if (!table || table.status === "OPEN") matchBootstrap = null;
  }
  function delayFor(failures) {
    const base = Math.min(maxPollMs, pollMs * (2 ** failures));
    const randomValue = Math.min(1, Math.max(0, Number(random())));
    return Math.round(base * (1 + ((randomValue * 2) - 1) * jitterRatio));
  }
  function clearTimer() {
    if (timer !== null) scheduler.clearTimeout(timer);
    timer = null;
    nextPollAt = null;
  }
  function schedulePoll() {
    clearTimer();
    if (disposed || !online || !isVisible() || !autoRefreshEnabled()) return;
    const delay = delayFor(consecutiveFailures);
    nextPollAt = clockNow(clock) + delay;
    timer = scheduler.setTimeout(async () => {
      timer = null;
      nextPollAt = null;
      try { await refreshCycle(); } catch { /* reflected in snapshot */ }
      schedulePoll();
      notify();
    }, delay);
  }
  async function ordered(operation, invoke, apply) {
    const token = ++mutationSequence;
    requestSequence += 1;
    try {
      const result = await invoke();
      if (disposed || token < appliedMutationSequence) return { stale: true, result };
      apply?.(result);
      appliedMutationSequence = token;
      lastError = null;
      notify();
      return result;
    } catch (failure) {
      const error = asOnlineLobbyError(failure);
      if (!disposed && token === mutationSequence) {
        lastError = error;
        notify();
      }
      throw error;
    }
  }
  async function refreshCycle() {
    assertOnline();
    presence = { ...presence, status: "updating", error: null };
    notify();
    const token = ++refreshSequence;
    requestSequence += 1;
    try {
      const heartbeat = await service.heartbeat(callInput({ ...player, online: true }));
      if (disposed || token !== refreshSequence) return { stale: true };
      presence = { status: "online", lastHeartbeatAt: clockNow(clock), expiresAt: heartbeat?.expiresAt ?? null, error: null };
      if (roomTable?.hostPlayerId === player.playerId) {
        const renewingTable = roomTable;
        const [renewalSlot, idempotencyKey] = renewalKeyFor(renewingTable);
        const renewal = await service.renewLease(callInput({
          tableId: renewingTable.tableId,
          hostId: player.playerId,
          expectedRevision: renewingTable.revision,
          expectedTableVersion: renewingTable.revision,
          idempotencyKey
        }));
        // A confirmed renewal starts a fresh lease-extension operation. Keep a
        // key only while its outcome is unknown so a lost reply can replay it.
        pendingRenewalKeys.delete(renewalSlot);
        if (disposed || token !== refreshSequence) return { stale: true };
        applyRoom(renewal);
      }
      if (roomTable && typeof service.getTable === "function") {
        const room = await service.getTable(callInput({ tableId: roomTable.tableId, playerId: player.playerId }));
        if (disposed || token !== refreshSequence) return { stale: true };
        applyRoom(room);
      }
      if (roomTable && typeof service.getMatchBootstrap === "function") {
        try {
          const started = await service.getMatchBootstrap(callInput({ tableId: roomTable.tableId, playerId: player.playerId }));
          if (disposed || token !== refreshSequence) return { stale: true };
          applyRoom(started);
        } catch (failure) {
          // A waiting room has no bootstrap until its host starts. Other
          // provider failures still surface through the normal refresh path.
          const error = asOnlineLobbyError(failure);
          if (error.code !== ONLINE_ERROR.NOT_FOUND) throw error;
        }
      }
      const response = await service.listTables(callInput());
      if (disposed || token !== refreshSequence) return { stale: true };
      const discovered = Array.isArray(response) ? response : response?.tables ?? [];
      tables = discovered.map(publicTable);
      incompatibleOpenTableCount = Number.isInteger(response?.incompatibleOpenTableCount)
        && response.incompatibleOpenTableCount >= 0
        ? response.incompatibleOpenTableCount
        : 0;
      lastRefreshAt = clockNow(clock);
      consecutiveFailures = 0;
      lastError = null;
      notify();
      return { tables };
    } catch (failure) {
      const error = asOnlineLobbyError(failure);
      if (!disposed && token === refreshSequence) {
        presence = { ...presence, status: "error", error };
        lastError = error;
        consecutiveFailures += 1;
        notify();
      }
      throw error;
    }
  }
  function mutationKeyFor(operation, key) {
    const stableKey = key ?? operation;
    if (!pendingMutationKeys.has(stableKey)) {
      mutationOrdinal += 1;
      pendingMutationKeys.set(stableKey, `${player.playerId}:${operation}:${mutationOrdinal}`);
    }
    return [stableKey, pendingMutationKeys.get(stableKey)];
  }
  function renewalKeyFor(table) {
    // Lease renewal intentionally leaves table.revision unchanged. The slot is
    // revision-scoped for retries, while the generated key rotates after an
    // acknowledgement so later renewals extend the lease rather than replay
    // an earlier expiry from the host idempotency cache.
    const slot = `${table.tableId}:${table.revision}`;
    if (!pendingRenewalKeys.has(slot)) {
      renewalOrdinal += 1;
      pendingRenewalKeys.set(slot, `${player.playerId}:renewLease:${slot}:${renewalOrdinal}`);
    }
    return [slot, pendingRenewalKeys.get(slot)];
  }
  function mutate(operation, invoke, key) {
    assertOnline();
    const [stableKey, idempotencyKey] = mutationKeyFor(operation, key);
    return ordered(operation, () => invoke(idempotencyKey), applyRoom).then((result) => {
      if (!result?.stale) pendingMutationKeys.delete(stableKey);
      return result;
    });
  }
  const unsubscribeVisibility = visibility.subscribe?.(() => {
    if (disposed) return;
    if (!isVisible()) {
      clearTimer();
      notify();
      return;
    }
    if (online) {
      refreshCycle().catch(() => {}).finally(() => schedulePoll());
    }
    notify();
  }) ?? (() => {});

  return Object.freeze({
    getSnapshot: snapshot,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("A subscription listener is required.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async goOnline() {
      assertActive();
      online = true;
      presence = { ...presence, status: "connecting", error: null };
      notify();
      try { return await refreshCycle(); } finally { schedulePoll(); }
    },
    async goOffline() {
      assertActive();
      clearTimer();
      online = false;
      presence = { ...presence, status: "offline", error: null };
      notify();
      try {
        return await ordered("offline", () => service.heartbeat(callInput({ ...player, online: false })));
      } finally { notify(); }
    },
    async refresh() {
      clearTimer();
      try {
        return await refreshCycle();
      } finally {
        schedulePoll();
      }
    },
    async syncAutoRefresh() {
      assertActive();
      clearTimer();
      if (!online || !isVisible() || !autoRefreshEnabled()) return notify();
      try {
        await refreshCycle();
      } catch {
        // Refresh state already carries the provider error. Keep the configured
        // retry loop alive with its normal bounded backoff.
      }
      schedulePoll();
      return notify();
    },
    createTable(input) {
      const visibilityValue = assertVisibility(input?.visibility);
      const capacity = assertCapacity(input?.capacity);
      return mutate("createTable", (idempotencyKey) => service.createTable(callInput({ host: player, visibility: visibilityValue, capacity, idempotencyKey })), `createTable:${visibilityValue}:${capacity}`);
    },
    joinTable(input) {
      const tableId = assertPlayerId(input?.tableId);
      const expectedRevision = input?.revision;
      return mutate("joinTable", (idempotencyKey) => service.joinTable(callInput({
        tableId,
        player,
        expectedRevision,
        expectedTableVersion: expectedRevision,
        idempotencyKey
      })), `joinTable:${tableId}`).then((result) => {
        if (result?.stale) return result;
        // The join confirmation is an explicit service transition, but the UI
        // receives a completed waiting-room join so its first readiness tap is
        // never rejected merely because it raced this acknowledgement.
        return this.accept();
      });
    },
    async joinByCode(input) {
      assertOnline();
      const code = assertInviteCode(typeof input === "string" ? input : input?.code);
      const lookup = await ordered("lookupTable", () => service.lookupTable(callInput({ code })), applyRoom);
      if (lookup?.stale) return lookup;
      return this.joinTable({ tableId: lookup.table.tableId, revision: lookup.table.revision });
    },
    accept() {
      if (!roomTable) return Promise.reject(new OnlineLobbyError(ONLINE_ERROR.NOT_FOUND, "Join a table before accepting it."));
      return mutate("acceptTable", (idempotencyKey) => service.acceptTable(callInput({
        tableId: roomTable.tableId,
        playerId: player.playerId,
        expectedRevision: roomTable.revision,
        expectedTableVersion: roomTable.revision,
        idempotencyKey
      })), `acceptTable:${roomTable.tableId}`);
    },
    setReady(ready) {
      if (!roomTable) return Promise.reject(new OnlineLobbyError(ONLINE_ERROR.NOT_FOUND, "Join a table before setting ready."));
      const value = ready && typeof ready === "object" && !Array.isArray(ready) ? ready.ready : ready;
      if (typeof value !== "boolean") return Promise.reject(new OnlineLobbyError(ONLINE_ERROR.INVALID_INPUT, "Ready must be true or false."));
      return mutate("setReady", (idempotencyKey) => service.setReady(callInput({
        tableId: roomTable.tableId,
        playerId: player.playerId,
        ready: value,
        expectedRevision: roomTable.revision,
        expectedTableVersion: roomTable.revision,
        idempotencyKey
      })), `setReady:${roomTable.tableId}:${value}`);
    },
    leave() {
      if (!roomTable) return Promise.resolve({ table: null });
      return mutate("leaveTable", (idempotencyKey) => service.leaveTable(callInput({
        tableId: roomTable.tableId,
        playerId: player.playerId,
        expectedRevision: roomTable.revision,
        expectedTableVersion: roomTable.revision,
        idempotencyKey
      })), `leaveTable:${roomTable.tableId}`).then((result) => {
        if (!result.table) { roomTable = null; invite = null; providerScope = null; }
        return result;
      });
    },
    cancelTable() {
      if (!roomTable) return Promise.reject(new OnlineLobbyError(ONLINE_ERROR.NOT_FOUND, "There is no table to cancel."));
      return mutate("cancelTable", (idempotencyKey) => service.cancelTable(callInput({
        tableId: roomTable.tableId,
        hostId: player.playerId,
        expectedRevision: roomTable.revision,
        expectedTableVersion: roomTable.revision,
        idempotencyKey
      })), `cancelTable:${roomTable.tableId}`).then((result) => {
        roomTable = null;
        invite = null;
        providerScope = null;
        return result;
      });
    },
    startMatch() {
      if (!roomTable) return Promise.reject(new OnlineLobbyError(ONLINE_ERROR.NOT_FOUND, "There is no table to start."));
      return mutate("startMatch", (idempotencyKey) => service.startMatch(callInput({
        tableId: roomTable.tableId,
        hostId: player.playerId,
        expectedRevision: roomTable.revision,
        expectedTableVersion: roomTable.revision,
        idempotencyKey
      })), `startMatch:${roomTable.tableId}`);
    },
    confirmStart() {
      if (!roomTable) return Promise.reject(new OnlineLobbyError(ONLINE_ERROR.NOT_FOUND, "There is no table to confirm."));
      return mutate("confirmStart", (idempotencyKey) => service.confirmStart(callInput({
        tableId: roomTable.tableId,
        hostId: player.playerId,
        expectedRevision: roomTable.revision,
        expectedTableVersion: roomTable.revision,
        idempotencyKey
      })), `confirmStart:${roomTable.tableId}`);
    },
    abortStart() {
      if (!roomTable) return Promise.reject(new OnlineLobbyError(ONLINE_ERROR.NOT_FOUND, "There is no connecting table to restore."));
      return mutate("abortStart", (idempotencyKey) => service.abortStart(callInput({
        tableId: roomTable.tableId,
        hostId: player.playerId,
        expectedRevision: roomTable.revision,
        expectedTableVersion: roomTable.revision,
        idempotencyKey
      })), `abortStart:${roomTable.tableId}`).then((result) => {
        matchBootstrap = null;
        return result;
      });
    },
    getMatchBootstrap() { return matchBootstrap ? frozenCopy(matchBootstrap) : null; },
    clearMatchBootstrap() { matchBootstrap = null; },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimer();
      unsubscribeVisibility();
      listeners.clear();
    }
  });
}

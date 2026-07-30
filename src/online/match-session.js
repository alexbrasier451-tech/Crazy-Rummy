import { RULES_VERSION, SCHEMA_VERSION, playerView } from "../engine/index.js";
import { createClientSyncSession } from "./sync/client.js";
import { createHostSyncSession } from "./sync/host.js";
import { createHostStarTransport } from "./transport/host-star.js";
import { PEER_STATE } from "./transport/contract.js";
import { ONLINE_MATCH_MODE, validateMatchBootstrap } from "./match-contract.js";
import { createMatchRecoveryStorage } from "./recovery-storage.js";
import {
  createCompletedMatchSummary,
  createCompletedSummaryStorage
} from "../local/completed-summary.js";
import { createPlayerStatisticsStorage } from "../local/player-statistics.js";

function freeze(value) { return Object.freeze(value); }
function copy(value) { return value == null ? value : structuredClone(value); }

/** Browser composition root: only projections cross this boundary to UI. */
export function createOnlineMatchSession({
  bootstrap, playerId, initialState, createPeer, transport, createTransport = createHostStarTransport,
  createHostSession = createHostSyncSession, createClientSession = createClientSyncSession,
  recoveryStorage = createMatchRecoveryStorage(), completedSummaryStorage = createCompletedSummaryStorage(),
  playerStatisticsStorage = createPlayerStatisticsStorage(), recoveryRecord = null, clock = () => Date.now(),
  connectionTimeoutMs = 15_000, scheduler = globalThis, visibility = defaultVisibility(), onTerminal
} = {}) {
  const boot = validateMatchBootstrap(bootstrap, { playerId });
  const localSeat = boot.seats.find((seat) => seat.seatId === boot.localSeatId);
  const isHost = localSeat.playerId === boot.hostPlayerId;
  if (isHost && !initialState) throw new TypeError("Host match composition requires canonical initial state.");
  const listeners = new Set();
  let disposed = false;
  let started = false;
  let terminalReached = false;
  let completedSummary = null;
  let projection = null;
  let lastAction = null;
  let network = { state: "CONNECTING", transport: PEER_STATE.IDLE, sync: "CONNECTING", incompatible: false };
  let sequence = 0;
  let commandOrdinal = 0;
  let previousTransportState = PEER_STATE.IDLE;
  let guestRebindRequested = false;
  let guestTransportInterrupted = false;
  let recoverySweepTimer = null;
  const interruptedPlayerIds = new Set();
  const playerToSeat = new Map(boot.seats.map((seat) => [seat.playerId, seat.seatId]));
  const seatToPlayer = new Map(boot.seats.map((seat) => [seat.seatId, seat.playerId]));

  const topology = transport ?? createTransport({
    matchId: boot.matchId, localPlayerId: boot.localPlayerId, hostPlayerId: boot.hostPlayerId,
    seatPlayerIds: boot.seats.map((seat) => seat.playerId),
    createPeer: createPeer ?? (() => { throw new TypeError("A peer factory is required."); })
  });
  let sync;
  function publish() { const next = snapshot(); for (const listener of listeners) listener(next); return next; }
  function clearRecoverySweep() {
    if (recoverySweepTimer === null) return;
    scheduler.clearTimeout?.(recoverySweepTimer);
    recoverySweepTimer = null;
  }
  function scheduleRecoverySweep() {
    clearRecoverySweep();
    if (disposed) return;
    const status = sync?.getStatus?.();
    const sweepsAtDeadline = isHost
      ? status?.state === "PAUSED"
      : status?.state === "RECONNECTING";
    if (!sweepsAtDeadline) return;
    const deadline = isHost ? status?.recoveryDeadline : status?.hostRecoveryDeadline;
    if (!Number.isFinite(deadline)) return;
    const delay = Math.max(0, deadline - clock());
    recoverySweepTimer = scheduler.setTimeout?.(() => {
      recoverySweepTimer = null;
      if (disposed) return;
      sync?.sweep?.(clock());
      projection = isHost ? playerView(sync.getState(), boot.localSeatId) : sync.getProjection?.();
      terminal();
      persist();
      publish();
      scheduleRecoverySweep();
    }, delay) ?? null;
  }
  function persist() {
    if (terminalReached) return;
    const record = sync?.exportRecoveryRecord?.({ roomSecret: boot.roomSecret, seatSecret: boot.seatSecret });
    if (record) recoveryStorage.writeComposition?.(boot.matchId, { bootstrap: boot, sync: record }) ?? recoveryStorage.write(boot.matchId, { bootstrap: boot, sync: record });
  }
  function terminal() {
    const engineComplete = isHost
      ? sync?.getState?.().lifecycle === "COMPLETE"
      : projection?.lifecycle === "COMPLETE";
    if (!terminalReached && (sync?.shouldClearRecovery?.() || engineComplete)) {
      terminalReached = true;
      if (engineComplete) {
        const summary = createCompletedMatchSummary(projection, { mode: "ONLINE" });
        if (summary) {
          // A finished match is retained only as this public-only record. It
          // must be written before the private recovery record is removed.
          try {
            playerStatisticsStorage.recordCompletedSummary?.({
              playerId: boot.localPlayerId,
              localSeatId: boot.localSeatId,
              eventId: `online:${boot.matchId}:${summary.revision}`,
              summary
            });
          } catch {}
          try { completedSummaryStorage.write?.(summary); } catch {}
          completedSummary = summary;
        }
      }
      recoveryStorage.remove(boot.matchId);
      onTerminal?.(snapshot());
    }
  }
  function receive(payload, route) {
    const sourceSeatId = playerToSeat.get(route?.sourcePlayerId);
    if (!sourceSeatId) return;
    const result = isHost ? sync.receiveFromSeat(sourceSeatId, payload) : sync.receive(payload);
    projection = isHost ? playerView(sync.getState(), boot.localSeatId) : sync.getProjection?.();
    sequence = sync.getStatus?.().authoritativeSequence ?? sequence;
    persist(); terminal(); publish(); return result;
  }
  const sendToSeat = (seatId, envelope) => topology.send(seatToPlayer.get(seatId), envelope);
  if (isHost) {
    sync = createHostSession({
      state: initialState, roomSecret: boot.roomSecret,
      seats: Object.fromEntries(boot.seats.map((seat) => [seat.seatId, {
        ...(recoveryRecord?.seats?.[seat.seatId] ?? {}),
        seatSecret: seat.seatId === boot.localSeatId
          ? null
          : boot.seatSecretById?.[seat.playerId]
      }])),
      send: sendToSeat,
      notCommittedCommands: recoveryRecord?.notCommittedCommands,
      onStateChange() {
        sequence = sync.getState().revision;
        projection = playerView(sync.getState(), boot.localSeatId);
        const status = sync.getStatus();
        network = {
          ...network,
          state: status.state,
          sync: status.state,
          recoveryDeadline: status.recoveryDeadline ?? null,
          terminalReason: status.terminalReason ?? null
        };
        persist(); terminal(); publish(); scheduleRecoverySweep();
      },
      onForfeit() { terminal(); }, onAbandon() { terminal(); }
    });
  } else {
    sync = createClientSession({
      matchId: boot.matchId, seatId: boot.localSeatId, engineSchemaVersion: boot.engineSchemaVersion, rulesVersion: boot.rulesVersion,
      send: (envelope) => topology.send(boot.hostPlayerId, envelope),
      recoveryRecord,
      onSnapshot(next) { projection = next; sequence = next.revision; persist(); terminal(); publish(); scheduleRecoverySweep(); },
      onStatus(status) {
        if (status.state !== "RECONNECTING") {
          guestRebindRequested = false;
          guestTransportInterrupted = false;
        }
        network = { ...network, state: status.state, sync: status.state, recoveryDeadline: status.hostRecoveryDeadline ?? null, terminalReason: status.terminalReason ?? null };
        persist(); terminal(); publish(); scheduleRecoverySweep();
      },
      onCommandResult(result) { lastAction = { commandId: result.commandId, phase: result.accepted === true ? "ACCEPTED" : result.accepted === false ? "REJECTED" : "UNCERTAIN", ...copy(result) }; publish(); }
    });
  }
  topology.onMessage(receive);
  topology.subscribe((value) => {
    if (disposed) return;
    const interrupted = [PEER_STATE.DISCONNECTED, PEER_STATE.FAILED].includes(value.state);
    const wasInterrupted = [PEER_STATE.DISCONNECTED, PEER_STATE.FAILED].includes(previousTransportState);
    network = {
      ...network,
      transport: value.state,
      incompatible: value.state === PEER_STATE.FAILED,
      state: value.state === PEER_STATE.FAILED ? "INCOMPATIBLE" : network.state
    };
    if (isHost) {
      for (const peer of value.connections ?? []) {
        const peerInterrupted = [PEER_STATE.DISCONNECTED, PEER_STATE.FAILED, PEER_STATE.CLOSED]
          .includes(peer.state);
        if (peerInterrupted && !interruptedPlayerIds.has(peer.playerId)) {
          interruptedPlayerIds.add(peer.playerId);
          const seatId = playerToSeat.get(peer.playerId);
          if (seatId) sync.disconnectSeat?.(seatId, clock());
        } else if (!peerInterrupted) {
          interruptedPlayerIds.delete(peer.playerId);
        }
      }
    } else if (interrupted && !wasInterrupted) {
      guestRebindRequested = false;
      guestTransportInterrupted = true;
      sync.markHostDisconnected?.(clock());
    } else if (
      value.state === PEER_STATE.CONNECTED
      && guestTransportInterrupted
      && sync.getStatus?.().state === "RECONNECTING"
      && !guestRebindRequested
    ) {
      guestRebindRequested = true;
      sync.requestRebind?.({ roomSecret: boot.roomSecret, seatSecret: boot.seatSecret });
    }
    previousTransportState = value.state;
    scheduleRecoverySweep();
    publish();
  });

  function snapshot() {
    const status = sync.getStatus?.() ?? {};
    const pendingCommandIds = sync.inspect?.().pendingCommandIds ?? [];
    const resolvedNetwork = { ...network, state: network.state === "CONNECTING" && status.state ? status.state : network.state, authoritativeSequence: status.authoritativeSequence ?? sequence, pendingCommandIds };
    return freeze({ mode: ONLINE_MATCH_MODE, localSeatId: boot.localSeatId, view: projection, completedSummary: completedSummary ? freeze(copy(completedSummary)) : null, status: freeze({ ...status, network: freeze(copy(resolvedNetwork)), authoritativeSequence: status.authoritativeSequence ?? sequence }), network: freeze(copy(resolvedNetwork)), lastAction: lastAction ? freeze(copy(lastAction)) : null });
  }
  projection = isHost ? playerView(sync.getState(), boot.localSeatId) : null;
  function waitForConnected() {
    const current = topology.getSnapshot();
    if (current.state === PEER_STATE.CONNECTED) return Promise.resolve(current);
    if (current.state === PEER_STATE.FAILED || current.state === PEER_STATE.CLOSED) {
      return Promise.reject(new Error("The online match transport could not connect."));
    }
    return new Promise((resolve, reject) => {
      let timeoutId;
      const unsubscribe = topology.subscribe((next) => {
        if (next.state === PEER_STATE.CONNECTED) {
          scheduler.clearTimeout?.(timeoutId);
          unsubscribe();
          resolve(next);
        } else if (next.state === PEER_STATE.FAILED || next.state === PEER_STATE.CLOSED) {
          scheduler.clearTimeout?.(timeoutId);
          unsubscribe();
          reject(new Error("The online match transport could not connect."));
        }
      });
      timeoutId = scheduler.setTimeout?.(() => {
        unsubscribe();
        reject(new Error("The online match transport connection timed out."));
      }, connectionTimeoutMs);
    });
  }
  async function startTopologyWithDeadline() {
    let timeoutId = null;
    const deadline = new Promise((resolve, reject) => {
      timeoutId = scheduler.setTimeout?.(() => {
        reject(new Error("The online match transport start timed out."));
      }, connectionTimeoutMs) ?? null;
    });
    try {
      return await Promise.race([topology.start(), deadline]);
    } finally {
      if (timeoutId !== null) scheduler.clearTimeout?.(timeoutId);
    }
  }
  async function start() {
    await startTopologyWithDeadline();
    await waitForConnected();
    if (isHost) {
      for (const seat of boot.seats) if (seat.seatId !== boot.localSeatId) sync.sendSnapshot(seat.seatId, "INITIAL");
    } else if (recoveryRecord) {
      sync.requestRebind?.({ roomSecret: boot.roomSecret, seatSecret: boot.seatSecret });
    } else {
      // The host's initial snapshot is deliberately best-effort. Begin an
      // authenticated pull immediately so a lost first delivery cannot leave
      // a new guest with no playable projection.
      sync.requestResync?.("INITIAL_SNAPSHOT");
    }
    network = { ...network, transport: topology.getSnapshot().state, state: sync.getStatus().state, sync: sync.getStatus().state };
    terminal();
    persist();
    scheduleRecoverySweep();
    started = true;
    return publish();
  }
  function submit(type, payload = {}) {
    if (disposed) return freeze({ queued: false, reason: "MATCH_DISPOSED" });
    const commandId = payload.clientCommandId ?? `${boot.localSeatId}:ui:${++commandOrdinal}`;
    const command = { ...payload, type, gameId: payload.gameId ?? boot.matchId, handId: payload.handId ?? projection?.hand?.id, actorSeatId: boot.localSeatId, clientCommandId: commandId, expectedRevision: payload.expectedRevision ?? sequence };
    lastAction = { commandId, phase: "PENDING" }; publish();
    const result = isHost ? sync.submitHostCommand(command) : sync.submitCommand(command);
    if (isHost || result?.queued === false) lastAction = { commandId, phase: result?.accepted ? "ACCEPTED" : "REJECTED", ...copy(result) };
    publish();
    return freeze({
      commandId,
      ...copy(result),
      queued: isHost ? result?.accepted === true : result?.queued === true
    });
  }
  async function reconnect() {
    if (disposed || !started) return snapshot();
    await topology.resume?.();
    if (!isHost
      && sync.getStatus?.().state === "RECONNECTING"
      && !guestRebindRequested) {
      guestRebindRequested = true;
      sync.requestRebind?.({ roomSecret: boot.roomSecret, seatSecret: boot.seatSecret });
    }
    return snapshot();
  }
  const unsubscribeVisibility = visibility?.subscribe?.(() => {
    if (disposed || !started || visibility.isVisible?.() === false) return undefined;
    return reconnect().catch(() => snapshot());
  }) ?? (() => {});
  return freeze({ start, getSnapshot: snapshot, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, submit, execute: submit, reconnect, async dispose() { if (disposed) return; disposed = true; clearRecoverySweep(); unsubscribeVisibility(); persist(); sync.dispose?.(); await topology.close?.(); listeners.clear(); } });
}

function defaultVisibility() {
  if (typeof document === "undefined"
    || typeof document.addEventListener !== "function"
    || typeof document.removeEventListener !== "function") return null;
  return {
    isVisible: () => document.visibilityState !== "hidden",
    subscribe(listener) {
      document.addEventListener("visibilitychange", listener);
      globalThis.addEventListener?.("pageshow", listener);
      globalThis.addEventListener?.("online", listener);
      return () => {
        document.removeEventListener("visibilitychange", listener);
        globalThis.removeEventListener?.("pageshow", listener);
        globalThis.removeEventListener?.("online", listener);
      };
    }
  };
}

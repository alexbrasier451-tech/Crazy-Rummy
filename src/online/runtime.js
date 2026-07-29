import { SignallingClient } from "@metered-ca/realtime";

import { RULES_VERSION as LOBBY_RULES_VERSION } from "../config.js";
import {
  RULES_VERSION as ENGINE_RULES_VERSION,
  SCHEMA_VERSION as ENGINE_SCHEMA_VERSION,
  createLobbyState,
  createSeat,
  executeCommand,
  COMMAND_TYPE,
  initialDealerSeatIdFor
} from "../engine/index.js";
import {
  DEFAULT_TRANSPORT_PROTOCOL_VERSION,
  DEFAULT_PROTOCOL_VERSION,
  PEER_STATE,
  createManagedSignallingAdapter,
  createMeteredHostTableService,
  createMeteredService,
  createOnlineLobbySession,
  createWebRtcPeerConnection
} from "./index.js";
import { createOnlineMatchSession } from "./match-session.js";
import { createMatchRecoveryStorage } from "./recovery-storage.js";

const buildEnvironment = import.meta.env ?? {};

export function createConfiguredOnlineLobbySession({
  player,
  publicKey = buildEnvironment.VITE_METERED_PUBLISHABLE_KEY,
  enabled = buildEnvironment.VITE_CRAZY_RUMMY_ONLINE_ENABLED !== "false",
  origin = globalThis.location?.origin,
  SignallingClientClass = SignallingClient,
  protocolVersion = DEFAULT_PROTOCOL_VERSION,
  rulesVersion = LOBBY_RULES_VERSION,
  installationId = player?.playerId,
  clock,
  scheduler,
  random,
  visibility,
  autoRefresh,
  discoveryWindowMs
} = {}) {
  if (!enabled || !publicKey || !player?.playerId || !player?.displayName) return null;

  const leaseMs = 45_000;
  const channelPrefix = "crazy-rummy/v1";
  const hostTableService = createMeteredHostTableService({
    clock,
    leaseMs,
    channelPrefix
  });
  const service = createMeteredService({
    SignallingClient: SignallingClientClass,
    apiKey: publicKey,
    installationId,
    hostTableService,
    discoveryWindowMs,
    config: {
      enabled: true,
      channelPrefix,
      openIndexChannel: `${channelPrefix}/open-index`,
      leaseTtlMs: leaseMs,
      // Polling and explicit refresh are already ordered by the lobby session.
      // Applying a second client-side limit here can make the configured
      // client reject its own jittered heartbeat/discovery cycle.
      rateLimitMs: { heartbeat: 0, listTables: 0 },
      ...(origin?.startsWith("https://") ? { origin } : {})
    }
  });
  const session = createOnlineLobbySession({
    service,
    player,
    protocolVersion,
    rulesVersion,
    clock,
    scheduler,
    random,
    visibility,
    autoRefresh
  });

  return Object.freeze({
    ...session,
    dispose() {
      session.dispose();
      void service.close();
    }
  });
}

/**
 * Builds one pair-scoped Stage 5 peer. Phase 6 composes these pairs into a
 * host-star match after the lobby has assigned seats and private pair scopes.
 */
export function createConfiguredPeerConnection({
  publicKey = buildEnvironment.VITE_METERED_PUBLISHABLE_KEY,
  enabled = buildEnvironment.VITE_CRAZY_RUMMY_ONLINE_ENABLED !== "false",
  SignallingClientClass = SignallingClient,
  rtcPeerConnectionFactory = (configuration) =>
    new globalThis.RTCPeerConnection(configuration),
  matchId,
  channel,
  localPlayerId,
  remotePlayerId,
  offerer,
  localSeatProof,
  verifyRemoteSeatProof,
  transportProtocolVersion = DEFAULT_TRANSPORT_PROTOCOL_VERSION,
  engineSchemaVersion = ENGINE_SCHEMA_VERSION,
  engineRulesVersion = ENGINE_RULES_VERSION,
  credentialProvider,
  clock,
  scheduler,
  heartbeatIntervalMs,
  heartbeatTimeoutMs,
  iceTransportPolicy
} = {}) {
  if (!enabled || !publicKey) return null;

  const client = new SignallingClientClass({ apiKey: publicKey });
  const signalling = createManagedSignallingAdapter({
    client,
    channel,
    localPlayerId,
    remotePlayerId,
    credentialProvider,
    clock
  });
  const peer = createWebRtcPeerConnection({
    matchId,
    localPlayerId,
    remotePlayerId,
    offerer,
    transportProtocolVersion,
    engineSchemaVersion,
    engineRulesVersion,
    localSeatProof,
    verifyRemoteSeatProof,
    signalling,
    rtcPeerConnectionFactory,
    clock,
    scheduler,
    heartbeatIntervalMs,
    heartbeatTimeoutMs,
    iceTransportPolicy
  });
  let providerClosePromise = null;
  let unsubscribePeerState = () => {};

  function closeProvider() {
    if (providerClosePromise) return providerClosePromise;
    providerClosePromise = (async () => {
      unsubscribePeerState();
      const outcomes = await Promise.allSettled([
        signalling.close(),
        Promise.resolve().then(() => client.close?.())
      ]);
      const failure = outcomes.find((outcome) => outcome.status === "rejected");
      if (failure) throw failure.reason;
    })();
    return providerClosePromise;
  }

  unsubscribePeerState = peer.subscribe((snapshot) => {
    if (snapshot.state === PEER_STATE.CLOSED) void closeProvider().catch(() => {});
  });

  return Object.freeze({
    ...peer,
    async start() {
      try {
        return await peer.start();
      } catch (error) {
        await peer.close({ notifyRemote: false });
        await closeProvider();
        throw error;
      }
    },
    getSignallingSnapshot: signalling.getSnapshot,
    registerPeerRoute: signalling.registerPeerRoute,
    async close(options) {
      await peer.close(options);
      await closeProvider();
    }
  });
}

function secureSeed() {
  const values = new Uint32Array(4);
  globalThis.crypto?.getRandomValues?.(values);
  return [...values].join("-");
}

function hostInitialState(bootstrap, seed = secureSeed()) {
  const seats = bootstrap.seats.map((seat) => createSeat({
    seatId: seat.seatId, playerId: seat.playerId, displayName: seat.displayName, ready: true
  }));
  const state = createLobbyState({ gameId: bootstrap.matchId, hostSeatId: bootstrap.localSeatId, seats });
  const ids = seats.map((seat) => seat.seatId);
  const started = executeCommand(state, {
    type: COMMAND_TYPE.START_GAME, gameId: state.gameId, actorSeatId: state.hostSeatId,
    clientCommandId: `${state.gameId}:start`, expectedRevision: state.revision,
    initialDealerSeatId: initialDealerSeatIdFor(seed, ids), shuffleSeed: seed
  });
  if (!started.accepted) throw new Error(`Could not start online match: ${started.reason}`);
  return started.state;
}

/** Compose the configured WebRTC factory with the provider-neutral match facade. */
export function createConfiguredOnlineMatchSession({ bootstrap, playerId, initialState, createPeerConnection = createConfiguredPeerConnection, ...options } = {}) {
  const localIsHost = bootstrap?.localPlayerId === bootstrap?.hostPlayerId;
  const restoredState = localIsHost ? options.recoveryRecord?.authoritativeState : undefined;
  return createOnlineMatchSession({
    ...options,
    bootstrap,
    playerId,
    initialState: initialState ?? restoredState ?? (localIsHost ? hostInitialState(bootstrap) : undefined),
    createPeer: ({ remotePlayerId, offerer }) => createPeerConnection({
      ...options,
      matchId: bootstrap.matchId,
      channel: bootstrap.pairScopes[remotePlayerId],
      localPlayerId: bootstrap.localPlayerId,
      remotePlayerId,
      offerer,
      localSeatProof: bootstrap.localSeatProof,
      verifyRemoteSeatProof: ({ remotePlayerId, seatProof }) => bootstrap.remoteSeatProofs?.[remotePlayerId] === seatProof
    })
  });
}

/** Restore only a validated private composition record; otherwise fail closed. */
export function restoreConfiguredOnlineMatchSession({ playerId, recoveryStorage = createMatchRecoveryStorage(), ...options } = {}) {
  const record = recoveryStorage.readActive?.();
  if (!record?.bootstrap || !record?.sync || record.bootstrap.localPlayerId !== playerId) return null;
  const host = record.bootstrap.localPlayerId === record.bootstrap.hostPlayerId;
  if (record.sync.matchId !== record.bootstrap.matchId || (!host && record.sync.seatId !== record.bootstrap.localSeatId) || (host && record.sync.authoritativeState?.gameId !== record.bootstrap.matchId)) return null;
  try { return createConfiguredOnlineMatchSession({ ...options, bootstrap: record.bootstrap, playerId, recoveryStorage, recoveryRecord: record.sync }); }
  catch { return null; }
}

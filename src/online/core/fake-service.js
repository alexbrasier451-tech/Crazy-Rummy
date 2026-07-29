import {
  HEARTBEAT_MS,
  LEASE_MS,
  TABLE_STATUS,
  TABLE_VISIBILITY,
  assertCapacity,
  assertInviteCode,
  assertPlayerId,
  assertVersion,
  assertVisibility,
  compatible,
  copy,
  incompatibility,
  normalizePlayer
} from "./contract.js";
import { ONLINE_ERROR, OnlineLobbyError } from "./errors.js";
import { RULES_VERSION, SCHEMA_VERSION } from "../../engine/index.js";

function systemClock() { return Date.now(); }

function secureToken(bytes = 24) {
  const array = new Uint8Array(bytes);
  if (!globalThis.crypto?.getRandomValues) {
    throw new OnlineLobbyError(ONLINE_ERROR.SERVICE_UNAVAILABLE, "Secure random values are unavailable.");
  }
  globalThis.crypto.getRandomValues(array);
  return [...array]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function publicTable(table) {
  return {
    tableId: table.tableId,
    visibility: table.visibility,
    hostPlayerId: table.hostPlayerId,
    hostDisplayName: table.hostDisplayName,
    capacity: table.capacity,
    occupiedSeats: table.seats.length,
    status: table.status,
    protocolVersion: table.protocolVersion,
    rulesVersion: table.rulesVersion,
    leaseExpiresAt: table.leaseExpiresAt,
    revision: table.revision
  };
}

function roomTable(table) {
  return {
    ...publicTable(table),
    seats: table.seats.map((seat) => ({
      playerId: seat.playerId,
      displayName: seat.displayName,
      ready: seat.ready,
      acceptedAt: seat.acceptedAt
    }))
  };
}

function matchBootstrap(table, playerId, token) {
  const seat = table.seats.find((entry) => entry.playerId === playerId);
  if (!seat || !table.match) return null;
  return copy({
    version: 1,
    matchId: table.match.matchId,
    localSeatId: seat.playerId,
    localPlayerId: seat.playerId,
    hostPlayerId: table.hostPlayerId,
    seats: table.seats.map((entry) => ({ seatId: entry.playerId, playerId: entry.playerId, displayName: entry.displayName })),
    roomSecret: table.match.roomSecret,
    seatSecret: table.match.seatSecrets[seat.playerId],
    ...(seat.playerId === table.hostPlayerId ? { seatSecretById: table.match.seatSecrets } : {}),
    localSeatProof: table.match.seatProofs[seat.playerId],
    remoteSeatProofs: Object.fromEntries(table.seats.filter((entry) => entry.playerId !== seat.playerId && (seat.playerId === table.hostPlayerId || entry.playerId === table.hostPlayerId)).map((entry) => [entry.playerId, table.match.seatProofs[entry.playerId]])),
    pairScopes: Object.fromEntries(table.seats.filter((entry) => entry.playerId !== seat.playerId).map((entry) => [entry.playerId, table.match.pairScopes[`${[entry.playerId, seat.playerId].sort().join("|")}`]])),
    engineSchemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    transportProtocolVersion: "crazy-rummy-transport-v1"
  });
}

/**
 * Deterministic, in-memory authority for adapter and UI contract tests.
 * It intentionally has no timers: callers advance `clock` and call an operation
 * to observe expiry, exactly as a real service evaluates authoritative time.
 */
export function createFakeLobbyService(options = {}) {
  const clock = options.clock ?? systemClock;
  const leaseMs = options.leaseMs ?? LEASE_MS;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  const token = options.token ?? secureToken;
  const tables = new Map();
  const presence = new Map();
  let tableOrdinal = 0;

  function now() { return Number(clock()); }

  function expire() {
    const current = now();
    for (const [playerId, record] of presence) {
      if (record.expiresAt <= current) presence.delete(playerId);
    }
    for (const [tableId, table] of tables) {
      if (table.leaseExpiresAt <= current || table.status === TABLE_STATUS.CANCELLED) tables.delete(tableId);
    }
  }

  function versions(input) {
    return {
      protocolVersion: assertVersion(input?.protocolVersion, "protocol version"),
      rulesVersion: assertVersion(input?.rulesVersion, "rules version")
    };
  }

  function found(tableId) {
    expire();
    assertPlayerId(tableId);
    const table = tables.get(tableId);
    if (!table) throw new OnlineLobbyError(ONLINE_ERROR.NOT_FOUND, "That table is no longer available.");
    return table;
  }

  function condition(table, expectedRevision) {
    if (expectedRevision !== undefined && expectedRevision !== table.revision) {
      throw new OnlineLobbyError(ONLINE_ERROR.STALE_TABLE, "The table changed before that request was accepted.", {
        retryable: true,
        details: { revision: table.revision }
      });
    }
  }

  function tableId() {
    // Same alphabet/length validation as external ids, while allowing deterministic test tokens.
    tableOrdinal += 1;
    return `table_${String(tableOrdinal).padStart(8, "0")}_${token(12)}`;
  }

  return Object.freeze({
    async heartbeat(input) {
      expire();
      const player = normalizePlayer(input);
      versions(input);
      if (input.online === false) {
        presence.delete(player.playerId);
        return { online: false, expiresAt: null };
      }
      const expiresAt = now() + heartbeatMs * 3;
      presence.set(player.playerId, { ...player, expiresAt });
      return { online: true, expiresAt };
    },

    async listTables(input) {
      expire();
      const requested = versions(input);
      const openTables = [...tables.values()]
        .filter((table) => table.visibility === TABLE_VISIBILITY.OPEN && table.status === TABLE_STATUS.OPEN);
      return {
        tables: openTables
          .filter((table) => compatible(table, requested))
          .map((table) => copy(publicTable(table))),
        incompatibleOpenTableCount: openTables.filter((table) => !compatible(table, requested)).length
      };
    },

    async createTable(input) {
      expire();
      const host = normalizePlayer(input?.host);
      const { protocolVersion, rulesVersion } = versions(input);
      const visibility = assertVisibility(input?.visibility);
      const capacity = assertCapacity(input?.capacity);
      const createdAt = now();
      const table = {
        tableId: tableId(),
        code: token(24),
        visibility,
        hostPlayerId: host.playerId,
        hostDisplayName: host.displayName,
        capacity,
        status: TABLE_STATUS.OPEN,
        protocolVersion,
        rulesVersion,
        leaseExpiresAt: createdAt + leaseMs,
        revision: 1,
        seats: [{ ...host, ready: false, acceptedAt: createdAt }]
      };
      tables.set(table.tableId, table);
      return { table: copy(roomTable(table)), invite: { code: table.code } };
    },

    async lookupTable(input) {
      expire();
      const requested = versions(input);
      const code = assertInviteCode(input?.code);
      const table = [...tables.values()].find((candidate) => candidate.code === code);
      if (!table) throw new OnlineLobbyError(ONLINE_ERROR.NOT_FOUND, "That table code is not available.");
      const conflict = incompatibility(table, requested);
      if (conflict) throw conflict;
      return { table: copy(roomTable(table)), invite: { code } };
    },

    async getTable(input) {
      const table = found(input?.tableId);
      const playerId = assertPlayerId(input?.playerId);
      if (!table.seats.some((seat) => seat.playerId === playerId)) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "Join this table before viewing it.");
      return { table: copy(roomTable(table)) };
    },

    async joinTable(input) {
      const table = found(input?.tableId);
      if (table.status !== TABLE_STATUS.OPEN) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "This match has already started.");
      const player = normalizePlayer(input?.player);
      const requested = versions(input);
      const conflict = incompatibility(table, requested);
      if (conflict) throw conflict;
      condition(table, input?.expectedRevision);
      if (!table.seats.some((seat) => seat.playerId === player.playerId)) {
        if (table.seats.length >= table.capacity) {
          throw new OnlineLobbyError(ONLINE_ERROR.TABLE_FULL, "All seats at this table were claimed first.", { retryable: true });
        }
        table.seats.push({ ...player, ready: false, acceptedAt: null });
        table.revision += 1;
      }
      return { table: copy(roomTable(table)) };
    },

    async acceptTable(input) {
      const table = found(input?.tableId);
      const playerId = assertPlayerId(input?.playerId);
      condition(table, input?.expectedRevision);
      const seat = table.seats.find((candidate) => candidate.playerId === playerId);
      if (!seat) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "Join this table before accepting it.");
      if (seat.acceptedAt === null) {
        seat.acceptedAt = now();
        table.revision += 1;
      }
      return { table: copy(roomTable(table)) };
    },

    async setReady(input) {
      const table = found(input?.tableId);
      if (table.status !== TABLE_STATUS.OPEN) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "This match has already started.");
      const playerId = assertPlayerId(input?.playerId);
      condition(table, input?.expectedRevision);
      if (typeof input?.ready !== "boolean") throw new OnlineLobbyError(ONLINE_ERROR.INVALID_INPUT, "Ready must be true or false.");
      const seat = table.seats.find((candidate) => candidate.playerId === playerId);
      if (!seat || seat.acceptedAt === null) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "Accept this table before setting ready.");
      if (seat.ready !== input.ready) {
        seat.ready = input.ready;
        table.revision += 1;
      }
      return { table: copy(roomTable(table)) };
    },

    async leaveTable(input) {
      const table = found(input?.tableId);
      if (table.status !== TABLE_STATUS.OPEN) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "Leave the live match instead.");
      const playerId = assertPlayerId(input?.playerId);
      condition(table, input?.expectedRevision);
      if (table.hostPlayerId === playerId) {
        tables.delete(table.tableId);
        return { table: null, cancelled: true };
      }
      const index = table.seats.findIndex((candidate) => candidate.playerId === playerId);
      if (index >= 0) {
        table.seats.splice(index, 1);
        table.revision += 1;
      }
      return { table: copy(roomTable(table)) };
    },

    async cancelTable(input) {
      const table = found(input?.tableId);
      const hostId = assertPlayerId(input?.hostId);
      condition(table, input?.expectedRevision);
      if (table.hostPlayerId !== hostId) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "Only the host can cancel this table.");
      tables.delete(table.tableId);
      return { table: null, cancelled: true };
    },

    async renewLease(input) {
      const table = found(input?.tableId);
      const hostId = assertPlayerId(input?.hostId);
      if (table.hostPlayerId !== hostId) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "Only the host can renew this table.");
      table.leaseExpiresAt = now() + leaseMs;
      return { table: copy(roomTable(table)) };
    },

    async startMatch(input) {
      const table = found(input?.tableId);
      const hostId = assertPlayerId(input?.hostId);
      condition(table, input?.expectedRevision);
      if (table.hostPlayerId !== hostId) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "Only the host can start this match.");
      if (table.status !== TABLE_STATUS.OPEN) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "This match has already started.");
      if (table.seats.length < 2 || table.seats.length > 6 || table.seats.some((seat) => seat.acceptedAt === null || !seat.ready)) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "Two to six accepted, ready players are required.");
      const matchId = `match_${token(12)}`;
      const seatSecrets = Object.fromEntries(table.seats.map((seat) => [seat.playerId, token(16)]));
      const seatProofs = Object.fromEntries(table.seats.map((seat) => [seat.playerId, token(16)]));
      const pairScopes = {};
      for (let index = 0; index < table.seats.length; index += 1) for (let other = index + 1; other < table.seats.length; other += 1) pairScopes[[table.seats[index].playerId, table.seats[other].playerId].sort().join("|")] = `pair_${token(16)}`;
      table.match = { matchId, roomSecret: token(24), seatSecrets, seatProofs, pairScopes };
      table.status = TABLE_STATUS.CONNECTING;
      table.revision += 1;
      return { table: copy(roomTable(table)), bootstrap: matchBootstrap(table, hostId, token) };
    },

    async confirmStart(input) {
      const table = found(input?.tableId);
      const hostId = assertPlayerId(input?.hostId);
      condition(table, input?.expectedRevision);
      if (table.hostPlayerId !== hostId) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "Only the host can confirm this match.");
      if (table.status !== TABLE_STATUS.CONNECTING || !table.match) {
        throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "This match is not waiting for player connections.");
      }
      table.status = TABLE_STATUS.STARTED;
      table.revision += 1;
      return { table: copy(roomTable(table)), bootstrap: matchBootstrap(table, hostId, token) };
    },

    async abortStart(input) {
      const table = found(input?.tableId);
      const hostId = assertPlayerId(input?.hostId);
      condition(table, input?.expectedRevision);
      if (table.hostPlayerId !== hostId) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "Only the host can restore this table.");
      if (table.status !== TABLE_STATUS.CONNECTING) {
        throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "Only a connecting match can be restored to the waiting room.");
      }
      table.match = null;
      table.status = TABLE_STATUS.OPEN;
      table.revision += 1;
      return { table: copy(roomTable(table)), aborted: true };
    },

    async getMatchBootstrap(input) {
      const table = found(input?.tableId);
      const playerId = assertPlayerId(input?.playerId);
      if (![TABLE_STATUS.CONNECTING, TABLE_STATUS.STARTED].includes(table.status)) throw new OnlineLobbyError(ONLINE_ERROR.NOT_FOUND, "The match has not started.");
      const bootstrap = matchBootstrap(table, playerId, token);
      if (!bootstrap) throw new OnlineLobbyError(ONLINE_ERROR.FORBIDDEN, "Only a seated player may receive match details.");
      return { table: copy(roomTable(table)), bootstrap };
    },

    /** Test-only inspection; never use this as a browser/UI data source. */
    inspect() {
      expire();
      return copy({
        tables: [...tables.values()].map(roomTable),
        presence: [...presence.values()]
      });
    }
  });
}

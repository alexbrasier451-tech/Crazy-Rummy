import { MeteredProviderError } from "./metered.js";
import { RULES_VERSION, SCHEMA_VERSION } from "../../engine/index.js";

const ID = /^[A-Za-z0-9_-]{8,128}$/;
const VERSION = /^[A-Za-z0-9._-]{1,80}$/;
const NAME_CONTROL = /[\u0000-\u001f\u007f]/;
const LINK_LIKE = /(?:https?:\/\/|www\.|@)/i;

/**
 * Minimal transient authority for one browser-hosted table collection. It is
 * deliberately memory-only: a host reload loses its tables and the leases
 * make that failure visible instead of pretending that Metered is storage.
 */
export function createMeteredHostTableService({
  clock = () => Date.now(),
  leaseMs = 20_000,
  heartbeatMs = 15_000,
  channelPrefix = "crazy-rummy/v1",
  createTableId = defaultId,
  createSecret = defaultSecret,
  requestRateLimitMs = 250,
} = {}) {
  if (!Number.isInteger(leaseMs) || leaseMs < 10_000 || leaseMs > 60_000) throw invalid("leaseMs must be 10000-60000.");
  if (!Number.isInteger(heartbeatMs) || heartbeatMs < 1_000 || heartbeatMs > 60_000) throw invalid("heartbeatMs must be 1000-60000.");
  if (!Number.isInteger(requestRateLimitMs) || requestRateLimitMs < 0 || requestRateLimitMs > 60_000) throw invalid("requestRateLimitMs must be 0-60000.");
  const tables = new Map();
  const presence = new Map();
  const idempotency = new Map();
  const lastRequestAt = new Map();
  const currentTime = () => Number(clock());

  async function handle(envelope, context = {}) {
    expire();
    validateEnvelope(envelope);
    const key = envelope.mutation?.idempotencyKey;
    if (key && idempotency.has(key)) return clone(idempotency.get(key).value);
    rateLimit(envelope.operation, context.installationId ?? "anonymous");
    let value;
    switch (envelope.operation) {
      case "heartbeat": value = heartbeat(envelope.payload); break;
      case "listTables": value = listTables(envelope.payload); break;
      case "createTable": value = createTable(envelope); break;
      case "lookupTable": value = lookupTable(envelope); break;
      case "getTable": value = getTable(envelope); break;
      case "joinTable": value = joinTable(envelope); break;
      case "acceptTable": value = acceptTable(envelope); break;
      case "setReady": value = setReady(envelope); break;
      case "leaveTable": value = leaveTable(envelope); break;
      case "cancelTable": value = cancelTable(envelope); break;
      case "renewLease": value = renewLease(envelope); break;
      case "startMatch": value = startMatch(envelope); break;
      case "getMatchBootstrap": value = getMatchBootstrap(envelope, context); break;
      default: throw invalid("Unsupported host table operation.");
    }
    if (key) idempotency.set(key, { value: clone(value), expiresAt: currentTime() + leaseMs });
    return clone(value);
  }

  function heartbeat(input) {
    const player = playerFrom(input);
    versions(input);
    if (input.online === false) {
      presence.delete(player.playerId);
      return { online: false, expiresAt: null };
    }
    const expiresAt = currentTime() + (heartbeatMs * 3);
    presence.set(player.playerId, { ...player, expiresAt });
    return { online: true, expiresAt };
  }

  function listTables(input) {
    const requested = versions(input);
    return { tables: [...tables.values()]
      .filter((table) => table.visibility === "OPEN" && table.status === "OPEN" && compatible(table, requested))
      .map((table) => projection(table, { room: false })) };
  }

  function createTable(envelope) {
    const input = envelope.payload;
    const host = playerFrom(input.host);
    const requested = versions(input);
    const visibility = input.visibility;
    if (!["OPEN", "CLOSED"].includes(visibility)) throw invalid("visibility must be OPEN or CLOSED.");
    if (!Number.isInteger(input.capacity) || input.capacity < 3 || input.capacity > 6) throw invalid("capacity must be 3-6.");
    if (visibility === "CLOSED" && !invite(input.inviteCode)) throw invalid("Closed table invite code is invalid.");
    const tableId = createTableId();
    if (!ID.test(tableId) || tables.has(tableId)) throw invalid("Generated table ID is invalid or already in use.");
    const table = {
      tableId,
      visibility,
      inviteCode: visibility === "CLOSED" ? input.inviteCode : null,
      lookupScope: envelope.channel,
      providerScope: `${channelPrefix}/host/${tableId}`,
      hostPlayerId: host.playerId,
      hostDisplayName: host.displayName,
      capacity: input.capacity,
      status: "OPEN",
      protocolVersion: requested.protocolVersion,
      rulesVersion: requested.rulesVersion,
      leaseExpiresAt: currentTime() + leaseMs,
      revision: 1,
      seats: [{ ...host, acceptedAt: currentTime(), ready: false }],
    };
    tables.set(tableId, table);
    return { table: projection(table, { room: true }), ...(visibility === "CLOSED" ? { invite: { code: table.inviteCode } } : {}) };
  }

  function lookupTable(envelope) {
    const input = envelope.payload;
    const requested = versions(input);
    if (!invite(input.code)) throw invalid("Invite code is invalid.");
    const table = [...tables.values()].find((candidate) =>
      candidate.visibility === "CLOSED"
      && candidate.inviteCode.toLowerCase() === input.code.toLowerCase()
    );
    if (!table) throw new MeteredProviderError("NOT_FOUND", "That Closed table is no longer available.");
    if (envelope.channel !== table.lookupScope) throw new MeteredProviderError("FORBIDDEN", "Closed lookup must use its private room channel.");
    assertCompatible(table, requested);
    return { table: projection(table, { room: true }), invite: { code: input.code } };
  }

  function getTable(envelope) {
    const table = tableForMutation(envelope);
    const playerId = requireId(envelope.payload.playerId);
    if (!seatFor(table, playerId)) throw new MeteredProviderError("FORBIDDEN", "Join this table before viewing it.");
    return { table: projection(table, { room: true }) };
  }

  function joinTable(envelope) {
    const table = tableForMutation(envelope);
    if (table.status !== "OPEN") throw new MeteredProviderError("FORBIDDEN", "This match has already started.");
    const player = playerFrom(envelope.payload.player);
    assertCompatible(table, versions(envelope.payload));
    conditional(table, envelope);
    if (!table.seats.some((seat) => seat.playerId === player.playerId)) {
      if (table.seats.length >= table.capacity) throw new MeteredProviderError("TABLE_FULL", "All seats were claimed first.", { retryable: true });
      table.seats.push({ ...player, acceptedAt: null, ready: false });
      table.revision += 1;
    }
    return { table: projection(table, { room: true }) };
  }

  function acceptTable(envelope) {
    const table = tableForMutation(envelope);
    conditional(table, envelope);
    const seat = seatFor(table, envelope.payload.playerId);
    if (!seat) throw new MeteredProviderError("FORBIDDEN", "Join this table before accepting it.");
    if (!seat.acceptedAt) { seat.acceptedAt = currentTime(); table.revision += 1; }
    return { table: projection(table, { room: true }) };
  }

  function setReady(envelope) {
    const table = tableForMutation(envelope);
    if (table.status !== "OPEN") throw new MeteredProviderError("FORBIDDEN", "This match has already started.");
    conditional(table, envelope);
    const seat = seatFor(table, envelope.payload.playerId);
    if (!seat?.acceptedAt) throw new MeteredProviderError("FORBIDDEN", "Accept this table before setting ready.");
    if (typeof envelope.payload.ready !== "boolean") throw invalid("ready must be boolean.");
    if (seat.ready !== envelope.payload.ready) { seat.ready = envelope.payload.ready; table.revision += 1; }
    return { table: projection(table, { room: true }) };
  }

  function leaveTable(envelope) {
    const table = tableForMutation(envelope);
    conditional(table, envelope);
    const playerId = requireId(envelope.payload.playerId);
    if (playerId === table.hostPlayerId) { tables.delete(table.tableId); return { table: null, cancelled: true }; }
    const index = table.seats.findIndex((seat) => seat.playerId === playerId);
    if (index >= 0) { table.seats.splice(index, 1); table.revision += 1; }
    return { table: projection(table, { room: true }) };
  }

  function cancelTable(envelope) {
    const table = tableForMutation(envelope);
    conditional(table, envelope);
    if (requireId(envelope.payload.hostId) !== table.hostPlayerId) throw new MeteredProviderError("FORBIDDEN", "Only the host can cancel a table.");
    tables.delete(table.tableId);
    return { table: null, cancelled: true };
  }

  function renewLease(envelope) {
    const table = tableForMutation(envelope);
    conditional(table, envelope);
    if (requireId(envelope.payload.hostId) !== table.hostPlayerId) throw new MeteredProviderError("FORBIDDEN", "Only the host can renew a table lease.");
    table.leaseExpiresAt = currentTime() + leaseMs;
    table.revision += 1;
    return { table: projection(table, { room: true }) };
  }

  function startMatch(envelope) {
    const table = tableForMutation(envelope);
    conditional(table, envelope);
    if (requireId(envelope.payload.hostId) !== table.hostPlayerId) throw new MeteredProviderError("FORBIDDEN", "Only the host can start a match.");
    if (table.status !== "OPEN" || table.seats.length < 3 || table.seats.some((seat) => seat.acceptedAt === null || !seat.ready)) throw new MeteredProviderError("FORBIDDEN", "Three to six accepted, ready players are required.");
    const seats = table.seats;
    const seatSecrets = Object.fromEntries(seats.map((seat) => [seat.playerId, createSecret(16)]));
    const seatProofs = Object.fromEntries(seats.map((seat) => [seat.playerId, createSecret(16)]));
    const pairScopes = {};
    for (let index = 0; index < seats.length; index += 1) for (let other = index + 1; other < seats.length; other += 1) pairScopes[[seats[index].playerId, seats[other].playerId].sort().join("|")] = `${channelPrefix}/peer/${createSecret(16)}`;
    table.match = { matchId: `match_${createSecret(12)}`, roomSecret: createSecret(24), seatSecrets, seatProofs, pairScopes };
    table.status = "STARTED";
    table.revision += 1;
    return { table: projection(table, { room: true }), bootstrap: bootstrapFor(table, table.hostPlayerId) };
  }

  function getMatchBootstrap(envelope, context) {
    const table = tableForMutation(envelope);
    const playerId = requireId(envelope.payload.playerId);
    if (table.status !== "STARTED") throw new MeteredProviderError("NOT_FOUND", "The match has not started.");
    if (!table.seats.some((seat) => seat.playerId === playerId)) throw new MeteredProviderError("FORBIDDEN", "Match bootstrap is unavailable.");
    // The realtime bridge sends this response directly to the requesting peer.
    if (context.fromPeerId === null && playerId !== table.hostPlayerId) throw new MeteredProviderError("FORBIDDEN", "Bootstrap requires the seated peer route.");
    return { table: projection(table, { room: true }), bootstrap: bootstrapFor(table, playerId) };
  }

  function tableForMutation(envelope) {
    const table = tables.get(requireId(envelope.payload.tableId));
    if (!table) throw new MeteredProviderError("NOT_FOUND", "That table is no longer available.");
    if (envelope.channel !== table.providerScope) throw new MeteredProviderError("FORBIDDEN", "Table mutations must use the host control channel.");
    return table;
  }

  function conditional(table, envelope) {
    const expected = envelope.mutation?.expectedTableVersion;
    if (expected !== null && expected !== undefined && expected !== table.revision) {
      throw new MeteredProviderError("STALE_TABLE", "The table changed before this request was accepted.", { retryable: true, details: { revision: table.revision } });
    }
  }

  function expire() {
    const current = currentTime();
    for (const [id, value] of presence) if (value.expiresAt <= current) presence.delete(id);
    for (const [id, value] of tables) if (value.leaseExpiresAt <= current) tables.delete(id);
    for (const [key, value] of idempotency) if (value.expiresAt <= current) idempotency.delete(key);
  }

  function rateLimit(operation, installationId) {
    // Heartbeats are always handled by the caller's own in-memory authority
    // before anything is published. Rate-limiting that local read path makes
    // the normal refresh loop reject itself without protecting a remote host.
    if (operation === "heartbeat") return;
    const key = `${installationId}:${operation}`;
    const previous = lastRequestAt.get(key);
    const current = currentTime();
    if (previous !== undefined && current - previous < requestRateLimitMs) {
      throw new MeteredProviderError("RATE_LIMITED", "Host table service rate limit reached.", { retryable: true, details: { retryAfterMs: requestRateLimitMs - (current - previous) } });
    }
    lastRequestAt.set(key, current);
  }

  return Object.freeze({
    handle,
    ownsChannel(channel) { return [...tables.values()].some((table) => table.providerScope === channel || table.lookupScope === channel); },
    listOpenTables() { expire(); return [...tables.values()].filter((table) => table.visibility === "OPEN" && table.status === "OPEN").map((table) => projection(table, { room: false })); },
    inspect() { expire(); return clone({ tables: [...tables.values()].map((table) => projection(table, { room: true })), presence: [...presence.values()] }); },
  });
}

function validateEnvelope(envelope) {
  if (!envelope || envelope.version !== 1 || envelope.serviceModel !== "host-authoritative-realtime-v1" || !ID.test(envelope.requestId || "")) {
    throw invalid("Malformed Metered lobby envelope.");
  }
}
function projection(table, { room }) {
  const result = {
    tableId: table.tableId, visibility: table.visibility, providerScope: table.providerScope,
    hostPlayerId: table.hostPlayerId, hostDisplayName: table.hostDisplayName, capacity: table.capacity,
    occupiedSeats: table.seats.length, status: table.status, protocolVersion: table.protocolVersion,
    rulesVersion: table.rulesVersion, leaseExpiresAt: table.leaseExpiresAt, revision: table.revision,
  };
  if (room) result.seats = table.seats.map(({ playerId, displayName, ready, acceptedAt }) => ({ playerId, displayName, ready, acceptedAt }));
  return result;
}
function versions(value) { return { protocolVersion: version(value?.protocolVersion), rulesVersion: version(value?.rulesVersion) }; }
function compatible(table, requested) { return table.protocolVersion === requested.protocolVersion && table.rulesVersion === requested.rulesVersion; }
function assertCompatible(table, requested) { if (!compatible(table, requested)) throw new MeteredProviderError("INCOMPATIBLE_PROTOCOL", "This table uses an incompatible protocol or rules version."); }
function playerFrom(value) { return { playerId: requireId(value?.playerId), displayName: displayName(value?.displayName) }; }
function seatFor(table, playerId) { return table.seats.find((seat) => seat.playerId === requireId(playerId)); }
function requireId(value) { if (!ID.test(value || "")) throw invalid("A bounded anonymous player or table ID is required."); return value; }
function version(value) { if (typeof value !== "string" || !VERSION.test(value)) throw invalid("Protocol and rules versions are required."); return value; }
function invite(value) { return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value); }
function displayName(value) { if (typeof value !== "string" || value.trim().length < 1 || value.length > 24 || NAME_CONTROL.test(value) || LINK_LIKE.test(value)) throw invalid("Display names must be bounded plain text."); return value.trim(); }
function defaultId() { return globalThis.crypto?.randomUUID?.().replaceAll("-", "_") || `table_${Math.random().toString(36).slice(2).padEnd(12, "0")}`; }
function defaultSecret(bytes) {
  const values = new Uint8Array(bytes);
  if (!globalThis.crypto?.getRandomValues) throw new MeteredProviderError("CRYPTO_UNAVAILABLE", "Secure random values are unavailable.");
  globalThis.crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
}
function bootstrapFor(table, playerId) {
  const local = table.seats.find((seat) => seat.playerId === playerId);
  const pairScopes = Object.fromEntries(table.seats.filter((seat) => seat.playerId !== playerId).map((seat) => [seat.playerId, table.match.pairScopes[[seat.playerId, playerId].sort().join("|")]]));
  return {
    version: 1, matchId: table.match.matchId, localSeatId: local.playerId, localPlayerId: local.playerId, hostPlayerId: table.hostPlayerId,
    seats: table.seats.map((seat) => ({ seatId: seat.playerId, playerId: seat.playerId, displayName: seat.displayName })),
    roomSecret: table.match.roomSecret, seatSecret: table.match.seatSecrets[playerId], ...(playerId === table.hostPlayerId ? { seatSecretById: table.match.seatSecrets } : {}),
    localSeatProof: table.match.seatProofs[playerId], remoteSeatProofs: Object.fromEntries(table.seats.filter((seat) => seat.playerId !== playerId && (playerId === table.hostPlayerId || seat.playerId === table.hostPlayerId)).map((seat) => [seat.playerId, table.match.seatProofs[seat.playerId]])), pairScopes, engineSchemaVersion: SCHEMA_VERSION, rulesVersion: RULES_VERSION, transportProtocolVersion: "crazy-rummy-transport-v1"
  };
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function invalid(message) { return new MeteredProviderError("INVALID_INPUT", message); }

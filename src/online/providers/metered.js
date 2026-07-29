const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  origin: null,
  openIndexChannel: "crazy-rummy/v1/open-index",
  channelPrefix: "crazy-rummy/v1",
  requestTimeoutMs: 8_000,
  maxRequestBytes: 8_192,
  leaseTtlMs: 20_000,
  rateLimitMs: Object.freeze({
    heartbeat: 5_000,
    listTables: 2_000,
    createTable: 20_000,
    lookupTable: 500,
    getTable: 500,
    joinTable: 500,
    acceptTable: 500,
    setReady: 500,
    leaveTable: 500,
    cancelTable: 500,
    renewLease: 5_000,
    startMatch: 500,
    getMatchBootstrap: 500,
  }),
});

export const METERED_CAPABILITIES = Object.freeze(["PUBLISH", "SUBSCRIBE", "PRESENCE", "SEND"]);
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export class MeteredProviderError extends Error {
  constructor(code, message, { retryable = false, details } = {}) {
    super(message);
    this.name = "MeteredProviderError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

/**
 * Validates only browser-publishable configuration. The Metered administrative
 * key and TURN credential must never be accepted by the static application.
 */
export function validateMeteredConfig(input = {}, { currentOrigin = browserOrigin() } = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...input,
    rateLimitMs: { ...DEFAULT_CONFIG.rateLimitMs, ...(input.rateLimitMs || {}) },
  };
  for (const key of Object.keys(input)) {
    if (/secret|admin|credential|private.?key/i.test(key)) {
      throw invalidConfig(`Browser configuration must not contain ${key}.`);
    }
  }
  if (typeof config.enabled !== "boolean") throw invalidConfig("enabled must be boolean.");
  if (typeof config.publicKey !== "string" || !/^pk_live_[A-Za-z0-9]+$/.test(config.publicKey)) {
    throw invalidConfig("A restricted Metered pk_live_ publishable key is required.");
  }
  if (!validChannel(config.openIndexChannel) || !validChannel(config.channelPrefix)) {
    throw invalidConfig("Metered channels must be bounded safe path strings.");
  }
  if (!Number.isInteger(config.requestTimeoutMs) || config.requestTimeoutMs < 500 || config.requestTimeoutMs > 30_000) {
    throw invalidConfig("requestTimeoutMs must be between 500 and 30000.");
  }
  if (!Number.isInteger(config.maxRequestBytes) || config.maxRequestBytes < 512 || config.maxRequestBytes > 32_768) {
    throw invalidConfig("maxRequestBytes must be between 512 and 32768.");
  }
  if (!Number.isInteger(config.leaseTtlMs) || config.leaseTtlMs < 10_000 || config.leaseTtlMs > 60_000) {
    throw invalidConfig("leaseTtlMs must be between 10000 and 60000.");
  }
  if (config.origin && (!isHttpsOrigin(config.origin) || (currentOrigin && currentOrigin !== config.origin))) {
    throw invalidConfig("The configured Metered origin must be HTTPS and match this PWA origin.");
  }
  for (const [operation, interval] of Object.entries(config.rateLimitMs)) {
    if (!Number.isInteger(interval) || interval < 0 || interval > 60_000) {
      throw invalidConfig(`Invalid local rate limit for ${operation}.`);
    }
  }
  return Object.freeze(config);
}

/**
 * Provider-neutral Phase 4 service backed by an injected, publishable-client
 * request facade. The facade owns Metered publish/subscribe wiring and the
 * host-authoritative table-service protocol; the published SDK has no
 * documented durable or compare-and-swap store.
 */
export function createMeteredLobbyProvider({
  client,
  config,
  clock = () => Date.now(),
  createRequestId = defaultRequestId,
  createInviteCode = defaultInviteCode,
  crypto = globalThis.crypto,
  currentOrigin,
} = {}) {
  const resolvedConfig = validateMeteredConfig(config, { currentOrigin });
  if (!client || typeof client.request !== "function") {
    throw invalidConfig("A Metered request client with request(envelope) is required.");
  }
  const lastRequestAt = new Map();
  const scopeByTableId = new Map();

  async function request(operation, payload, scope = resolvedConfig.openIndexChannel) {
    if (!resolvedConfig.enabled) {
      throw new MeteredProviderError("ONLINE_DISABLED", "Online discovery is disabled by configuration.");
    }
    validateOperation(operation, payload);
    applyRateLimit(operation, lastRequestAt, resolvedConfig.rateLimitMs, clock);
    const requestId = createRequestId();
    const mutating = !["heartbeat", "listTables", "lookupTable"].includes(operation);
    const envelope = {
      version: 1,
      provider: "metered-realtime-messaging",
      serviceModel: "host-authoritative-realtime-v1",
      operation,
      requestId,
      channel: scope,
      capabilities: METERED_CAPABILITIES,
      payload: withLease(operation, payload, resolvedConfig.leaseTtlMs),
      ...(mutating ? {
        mutation: {
          idempotencyKey: requestId,
          expectedTableVersion: payload.expectedTableVersion ?? payload.expectedRevision ?? null,
        },
      } : {}),
    };
    if (encodedBytes(envelope) > resolvedConfig.maxRequestBytes) {
      throw new MeteredProviderError("REQUEST_TOO_LARGE", "Lobby request exceeds the configured provider limit.");
    }
    try {
      const response = await client.request(envelope, { timeoutMs: resolvedConfig.requestTimeoutMs });
      if (response?.ok === false) throw response.error || response;
      const value = response?.ok === true ? response.value : response;
      rememberScopes(value, scopeByTableId);
      return value;
    } catch (error) {
      throw normalizeMeteredError(error);
    }
  }

  return Object.freeze({
    provider: "metered-realtime-messaging",
    capabilities: METERED_CAPABILITIES,
    async heartbeat(input) { return request("heartbeat", input); },
    async listTables(input) { return request("listTables", input); },
    async createTable(input) {
      const closed = input?.visibility === "CLOSED";
      const inviteCode = closed ? createInviteCode() : undefined;
      const scope = closed ? await closedChannel(resolvedConfig.channelPrefix, inviteCode, crypto) : resolvedConfig.openIndexChannel;
      const value = await request("createTable", { ...input, ...(inviteCode ? { inviteCode } : {}) }, scope);
      return closed && value && !value.invite ? { ...value, invite: { code: inviteCode } } : value;
    },
    async lookupTable(input) {
      const code = typeof input?.code === "string" ? input.code.toLowerCase() : input?.code;
      const scope = await closedChannel(resolvedConfig.channelPrefix, code, crypto);
      return request("lookupTable", { ...input, code }, scope);
    },
    async getTable(input) { return request("getTable", input, tableScope(input?.tableId)); },
    async joinTable(input) { return request("joinTable", input, tableScope(input?.tableId)); },
    async acceptTable(input) { return request("acceptTable", input, tableScope(input?.tableId)); },
    async setReady(input) { return request("setReady", input, tableScope(input?.tableId)); },
    async leaveTable(input) { return request("leaveTable", input, tableScope(input?.tableId)); },
    async cancelTable(input) { return request("cancelTable", input, tableScope(input?.tableId)); },
    async renewLease(input) { return request("renewLease", input, tableScope(input?.tableId)); },
    async startMatch(input) { return request("startMatch", input, tableScope(input?.tableId)); },
    async getMatchBootstrap(input) { return request("getMatchBootstrap", input, tableScope(input?.tableId)); },
  });

  function tableScope(tableId) {
    if (!SAFE_ID.test(tableId || "")) throw new MeteredProviderError("INVALID_REQUEST", "A safe tableId is required.");
    // Closed scopes are learned only from create/lookup replies and never put
    // in the public index. A fresh client must lookup its invite before join;
    // guessing a table channel would weaken the channel restriction boundary.
    const scope = scopeByTableId.get(tableId);
    if (!scope) {
      throw new MeteredProviderError("TABLE_SCOPE_UNKNOWN", "Lookup the table or refresh the public index before mutating it.", {
        retryable: true,
      });
    }
    return scope;
  }
}

/** Exact browser SDK construction proven by the local Metered TURN probe. */
export function createMeteredPeerSignalling({ sdk, publicKey, rtcPeerConnectionFactory } = {}) {
  if (!sdk?.MeteredPeer || typeof sdk.MeteredPeer !== "function") {
    throw invalidConfig("MeteredPeer browser SDK is unavailable.");
  }
  if (!/^pk_live_[A-Za-z0-9]+$/.test(publicKey || "")) throw invalidConfig("A Metered publishable key is required.");
  if (typeof rtcPeerConnectionFactory !== "function") throw invalidConfig("rtcPeerConnectionFactory is required.");
  return new sdk.MeteredPeer({ apiKey: publicKey, rtcPeerConnectionFactory });
}

/**
 * Builds the realtime request facade from Metered's documented SignallingClient
 * surface. It is deliberately an injected constructor: tests do not load a CDN
 * or SDK package and production can pin the package separately.
 *
 * The optional hostHandler is the table authority. It receives every bounded
 * lobby request addressed to a subscribed room and must enforce lease expiry,
 * capacity, and expectedTableVersion before responding. Metered pub/sub is
 * transient, so this is not durable server-side storage or atomic CAS.
 */
export function createMeteredRealtimeRequestClient({
  SignallingClient,
  publicKey,
  installationId = defaultRequestId(),
  hostHandler,
  shouldHandleLocally = (envelope) => envelope.operation === "createTable",
  requestTimeoutMs = DEFAULT_CONFIG.requestTimeoutMs,
  maxRequestBytes = DEFAULT_CONFIG.maxRequestBytes,
  discoveryWindowMs = 350,
} = {}) {
  if (typeof SignallingClient !== "function") throw invalidConfig("The Metered SignallingClient constructor is required.");
  if (!/^pk_live_[A-Za-z0-9]+$/.test(publicKey || "")) throw invalidConfig("A Metered publishable key is required.");
  if (!SAFE_ID.test(installationId)) throw invalidConfig("installationId must be a bounded anonymous ID.");
  if (hostHandler !== undefined && typeof hostHandler !== "function") throw invalidConfig("hostHandler must be a function.");
  if (!Number.isInteger(discoveryWindowMs) || discoveryWindowMs < 50 || discoveryWindowMs > 5_000) {
    throw invalidConfig("discoveryWindowMs must be between 50 and 5000.");
  }
  if (!Number.isInteger(maxRequestBytes) || maxRequestBytes < 512 || maxRequestBytes > 32_768) throw invalidConfig("maxRequestBytes is invalid.");
  const client = new SignallingClient({ apiKey: publicKey });
  const subscribed = new Set();
  const pending = new Map();
  let closed = false;
  const onMessage = (event) => { void receive(event.data, event.channel, event.from); };
  const onDirect = (event) => { void receive(event.data, event.data?.channel, event.from); };
  client.on("message", onMessage);
  client.on("direct", onDirect);

  async function ensureSubscribed(channel) {
    if (closed) throw new MeteredProviderError("METERED_OFFLINE", "Metered client is closed.", { retryable: true });
    if (!subscribed.has(channel)) {
      await client.subscribe(channel, { includeSenderMetadata: false });
      subscribed.add(channel);
    }
  }

  async function request(envelope, { timeoutMs = requestTimeoutMs } = {}) {
    if (closed) throw new MeteredProviderError("METERED_OFFLINE", "Metered client is closed.", { retryable: true });
    if (!envelope?.requestId || !validChannel(envelope.channel)) throw invalidRequest("A requestId and safe channel are required.");
    await ensureSubscribed(envelope.channel);
    // A table creator is its own authority. Process its create/renew requests
    // locally rather than waiting for Metered to echo a publish back to sender.
    if (hostHandler && shouldHandleLocally(envelope)) {
      try {
        const value = await hostHandler(envelope, { fromPeerId: null, installationId });
        await subscribeResultScope(value);
        return { ok: true, value };
      } catch (error) {
        // A guest can carry an empty local authority. Only an explicit local
        // owner is allowed to fail locally; unknown tables still route to the
        // remote host control channel.
        if (error?.code !== "NOT_FOUND") throw error;
      }
    }
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(envelope.requestId);
        reject(new MeteredProviderError("METERED_OFFLINE", "Metered response timed out.", { retryable: true }));
      }, timeoutMs);
      pending.set(envelope.requestId, {
        resolve(value) { clearTimeout(timer); resolve(value); },
        reject(error) { clearTimeout(timer); reject(error); },
        tables: [],
        discovery: envelope.operation === "listTables",
      });
      try {
        await client.publish(envelope.channel, {
          type: envelope.operation === "listTables" ? "crazy-rummy/discovery-request" : "crazy-rummy/lobby-request",
          installationId,
          envelope,
        });
        if (envelope.operation === "listTables") {
          setTimeout(() => {
            const pendingRequest = pending.get(envelope.requestId);
            if (!pendingRequest) return;
            pending.delete(envelope.requestId);
            pendingRequest.resolve({ ok: true, value: { tables: dedupeTables(pendingRequest.tables) } });
          }, discoveryWindowMs);
        }
      } catch (error) {
        pending.delete(envelope.requestId);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  async function advertiseTable(table, { channel = DEFAULT_CONFIG.openIndexChannel, expiresAt } = {}) {
    if (!table?.tableId || table.visibility !== "OPEN") throw invalidRequest("Only an OPEN table may be advertised publicly.");
    await ensureSubscribed(channel);
    await client.publish(channel, {
      type: "crazy-rummy/table-advertisement",
      table: publicTable(table),
      expiresAt,
      installationId,
    });
  }

  async function receive(message, channel, fromPeerId) {
    if (!message || typeof message !== "object" || message.installationId === installationId) return;
    if (message.type === "crazy-rummy/lobby-response") {
      const pendingRequest = pending.get(message.requestId);
      if (!pendingRequest || message.toInstallationId !== installationId) return;
      if (pendingRequest.discovery) {
        collectTables(pendingRequest.tables, message.value);
        return;
      }
      pending.delete(message.requestId);
      message.error ? pendingRequest.reject(message.error) : pendingRequest.resolve({ ok: true, value: message.value });
      return;
    }
    if (message.type === "crazy-rummy/table-advertisement") {
      for (const pendingRequest of pending.values()) if (pendingRequest.discovery) collectTables(pendingRequest.tables, { table: message.table });
      return;
    }
    if (!["crazy-rummy/lobby-request", "crazy-rummy/discovery-request"].includes(message.type) || !hostHandler) return;
    const envelope = message.envelope;
    if (!envelope || channel !== envelope.channel || encodedBytes(envelope) > maxRequestBytes) return;
    try {
      const value = await hostHandler(envelope, { fromPeerId, installationId: message.installationId });
      await subscribeResultScope(value);
      if (envelope.operation === "getMatchBootstrap" && (!fromPeerId || typeof client.send !== "function")) {
        throw new MeteredProviderError("BOOTSTRAP_DIRECT_REQUIRED", "Match bootstrap requires an authenticated direct route.");
      }
      const response = {
        type: "crazy-rummy/lobby-response",
        requestId: envelope.requestId,
        toInstallationId: message.installationId,
        installationId,
        channel: envelope.channel,
        value,
      };
      if (fromPeerId && typeof client.send === "function") await client.send(fromPeerId, response);
      else await client.publish(envelope.channel, response);
    } catch (error) {
      const response = {
        type: "crazy-rummy/lobby-response",
        requestId: envelope.requestId,
        toInstallationId: message.installationId,
        installationId,
        channel: envelope.channel,
        error: serializeProviderError(error),
      };
      if (fromPeerId && typeof client.send === "function") await client.send(fromPeerId, response);
      else await client.publish(envelope.channel, response);
    }
  }

  async function subscribeResultScope(value) {
    if (validChannel(value?.table?.providerScope)) await ensureSubscribed(value.table.providerScope);
  }

  return Object.freeze({
    client,
    request,
    advertiseTable,
    async close() {
      if (closed) return;
      closed = true;
      client.off?.("message", onMessage);
      client.off?.("direct", onDirect);
      await Promise.all([...subscribed].map((channel) => client.unsubscribe(channel)));
      subscribed.clear();
      for (const entry of pending.values()) entry.reject(new MeteredProviderError("METERED_OFFLINE", "Metered client closed.", { retryable: true }));
      pending.clear();
    },
  });
}

/** Creates the provider-neutral service over the injected real-time bridge. */
export function createMeteredService({ SignallingClient, apiKey, config = {}, hostTableService, hostHandler, ...options } = {}) {
  const resolvedConfig = validateMeteredConfig({ ...config, publicKey: apiKey || config.publicKey });
  const resolvedHostHandler = hostHandler ?? hostTableService?.handle;
  const client = createMeteredRealtimeRequestClient({
    SignallingClient,
    publicKey: resolvedConfig.publicKey,
    requestTimeoutMs: resolvedConfig.requestTimeoutMs,
    maxRequestBytes: resolvedConfig.maxRequestBytes,
    hostHandler: resolvedHostHandler,
    shouldHandleLocally: (envelope) => ["createTable", "heartbeat"].includes(envelope.operation) || Boolean(hostTableService?.ownsChannel?.(envelope.channel)),
    ...options,
  });
  const provider = createMeteredLobbyProvider({ client, config: resolvedConfig, ...options });
  async function advertise(result) {
    if (result?.table?.visibility === "OPEN") await client.advertiseTable(result.table, { expiresAt: result.table.leaseExpiresAt });
    return result;
  }
  return Object.freeze({
    ...provider,
    async createTable(input) { return advertise(await provider.createTable(input)); },
    async renewLease(input) { return advertise(await provider.renewLease(input)); },
    close: client.close,
    advertiseTable: client.advertiseTable,
    hostTableService,
    async advertiseOpenTables() {
      if (!hostTableService) return [];
      const tables = hostTableService.listOpenTables();
      await Promise.all(tables.map((table) => client.advertiseTable(table, { expiresAt: table.leaseExpiresAt })));
      return tables;
    },
  });
}

async function closedChannel(prefix, code, crypto) {
  if (typeof code !== "string" || code.length < 16 || code.length > 128) {
    throw new MeteredProviderError("INVALID_INVITE", "A bounded Closed-table invite code is required.");
  }
  if (!crypto?.subtle?.digest || !globalThis.TextEncoder) {
    throw new MeteredProviderError("CRYPTO_UNAVAILABLE", "Secure invite channel scoping requires Web Crypto.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  const hex = [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
  return `${prefix}/closed/${hex}`;
}

function validateOperation(operation, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidRequest("Lobby input must be an object.");
  if (input.displayName !== undefined) validateDisplayName(input.displayName);
  if (input.host?.displayName !== undefined) validateDisplayName(input.host.displayName);
  if (input.player?.displayName !== undefined) validateDisplayName(input.player.displayName);
  for (const id of [input.playerId, input.tableId, input.hostId, input.player?.playerId, input.host?.playerId]) {
    if (id !== undefined && !SAFE_ID.test(id)) throw invalidRequest("Lobby IDs must be 1-128 safe characters.");
  }
  if (input.visibility !== undefined && !["OPEN", "CLOSED"].includes(input.visibility)) throw invalidRequest("visibility must be OPEN or CLOSED.");
  if (input.capacity !== undefined && (!Number.isInteger(input.capacity) || input.capacity < 3 || input.capacity > 6)) {
    throw invalidRequest("capacity must be between 3 and 6.");
  }
  if (input.ready !== undefined && typeof input.ready !== "boolean") throw invalidRequest("ready must be boolean.");
  if (operation === "lookupTable" && typeof input.code !== "string") throw invalidRequest("lookupTable requires an invite code.");
}

function withLease(operation, payload, leaseTtlMs) {
  if (["heartbeat", "createTable", "renewLease"].includes(operation)) {
    return { ...payload, lease: { requestedTtlMs: leaseTtlMs } };
  }
  return payload;
}

function validateDisplayName(value) {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > 32 || CONTROL_CHARACTER.test(value)) {
    throw invalidRequest("Display names must be 1-32 printable characters.");
  }
}

function applyRateLimit(operation, entries, limits, clock) {
  const now = clock();
  const previous = entries.get(operation);
  const interval = limits[operation] ?? 0;
  if (previous !== undefined && now - previous < interval) {
    throw new MeteredProviderError("RATE_LIMITED", "Lobby request is locally rate limited.", {
      retryable: true,
      details: { retryAfterMs: interval - (now - previous) },
    });
  }
  entries.set(operation, now);
}

function rememberScopes(value, scopes) {
  const records = Array.isArray(value?.tables) ? value.tables : [value?.table, value];
  for (const record of records) {
    if (record?.tableId && validChannel(record.providerScope)) scopes.set(record.tableId, record.providerScope);
  }
}

function collectTables(target, value) {
  if (value?.table) target.push(value.table);
  if (Array.isArray(value?.tables)) target.push(...value.tables);
}

function dedupeTables(tables) {
  const byId = new Map();
  for (const table of tables) {
    // providerScope is returned only to the adapter/core so the next mutation
    // stays on the host control channel. Core deliberately omits it from UI
    // projections; advertiseTable() is the public wire representation.
    if (table?.tableId && table.visibility === "OPEN") byId.set(table.tableId, table);
  }
  return [...byId.values()];
}

function publicTable(table) {
  const { providerScope, inviteCode, roomSecret, ...safe } = table;
  return safe;
}

function serializeProviderError(error) {
  const normalized = normalizeMeteredError(error);
  return { code: normalized.code, message: normalized.message, retryable: normalized.retryable, details: normalized.details };
}

function normalizeMeteredError(error) {
  if (error instanceof MeteredProviderError) return error;
  const source = error?.error || error;
  const code = source?.code;
  if (typeof code === "string") return new MeteredProviderError(code, source.message || "Metered request failed.", {
    retryable: Boolean(source.retryable), details: source.details,
  });
  const message = source instanceof Error ? source.message : String(source || "Metered request failed.");
  if (/quota|limit exceeded|too many requests/i.test(message)) {
    return new MeteredProviderError("METERED_QUOTA_EXHAUSTED", "Metered free-tier quota is unavailable.", { retryable: true });
  }
  if (/offline|network|timeout|abort|disconnect/i.test(message)) {
    return new MeteredProviderError("METERED_OFFLINE", "Metered is unreachable.", { retryable: true });
  }
  return new MeteredProviderError("METERED_PROVIDER_FAILURE", "Metered request failed.", { retryable: true });
}

function defaultRequestId() {
  return globalThis.crypto?.randomUUID?.() || `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultInviteCode() {
  if (!globalThis.crypto?.getRandomValues) throw new MeteredProviderError("CRYPTO_UNAVAILABLE", "Secure invite codes require Web Crypto.");
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encodedBytes(value) { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
function validChannel(value) { return typeof value === "string" && /^[a-z0-9][a-z0-9/_-]{2,127}$/.test(value); }
function isHttpsOrigin(value) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
function browserOrigin() { return globalThis.location?.origin || null; }
function invalidConfig(message) { return new MeteredProviderError("INVALID_METERED_CONFIG", message); }
function invalidRequest(message) { return new MeteredProviderError("INVALID_REQUEST", message); }

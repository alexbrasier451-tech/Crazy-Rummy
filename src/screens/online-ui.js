const EMPTY_SNAPSHOT = Object.freeze({
  online: false,
  presence: { status: "offline", lastHeartbeatAt: null, error: null },
  tables: [],
  room: { table: null, invite: null },
  polling: { visible: true, failures: 0, nextPollAt: null },
  error: { code: "SERVICE_UNAVAILABLE", retryable: true },
  requestSequence: 0
});

export function createUnavailableOnlineLobbySession() {
  let listener = null;
  const unavailable = async () => {
    const error = new Error("Online table service is not configured on this device.");
    error.code = "SERVICE_UNAVAILABLE";
    error.retryable = true;
    throw error;
  };
  return Object.freeze({
    getSnapshot: () => EMPTY_SNAPSHOT,
    subscribe(nextListener) {
      listener = typeof nextListener === "function" ? nextListener : null;
      listener?.(EMPTY_SNAPSHOT);
      return () => { listener = null; };
    },
    goOnline: unavailable,
    goOffline: async () => EMPTY_SNAPSHOT,
    refresh: unavailable,
    createTable: unavailable,
    joinTable: unavailable,
    joinByCode: unavailable,
    accept: unavailable,
    setReady: unavailable,
    cancelTable: unavailable,
    leave: async () => EMPTY_SNAPSHOT,
    dispose: () => { listener = null; }
  });
}

export function onlineErrorCopy(error, fallback) {
  const code = error?.code;
  if (code === "OFFLINE" || code === "METERED_OFFLINE") {
    return "You’re offline. Reconnect to continue online play.";
  }
  if (code === "SERVICE_UNAVAILABLE" || code === "ONLINE_DISABLED") {
    return "Online play is not configured for this build.";
  }
  if (code === "TABLE_FULL") return "That table is full. Refresh and choose another table.";
  if (code === "TABLE_STARTED") return "That table has already started.";
  if (code === "INVITE_EXPIRED" || code === "TABLE_NOT_FOUND" || code === "NOT_FOUND") {
    return "That code has expired or no longer matches a table.";
  }
  if (code === "INCOMPATIBLE_PROTOCOL" || code === "INCOMPATIBLE_RULES") {
    return "That table uses a different app or rules version.";
  }
  if (code === "METERED_QUOTA_EXHAUSTED") {
    return "Online play has reached its free service limit. Try again later.";
  }
  if (code === "NAME_COLLISION") return "That name is already at this table. Choose another name.";
  return fallback ?? "That request could not be completed. Your choices are still here.";
}

export function tableSummary(table = {}) {
  const capacity = Number(table.capacity ?? table.maxPlayers ?? 0);
  const occupied = Number(table.occupiedSeats ?? table.occupancy ?? table.seats?.length ?? 0);
  return {
    id: table.tableId ?? table.id,
    name: table.name ?? "Crazy Rummy table",
    host: table.hostDisplayName ?? table.hostName ?? "Host",
    capacity,
    occupied,
    rules: table.rulesLabel ?? table.rulesVersion ?? "Crazy Rummy · 13 hands",
    visibility: table.visibility ?? "OPEN",
    state: table.state ?? "WAITING",
    code: table.code ?? table.inviteCode ?? null
  };
}

export function freshnessCopy(snapshot, now = Date.now()) {
  const heartbeatAt = snapshot?.presence?.lastHeartbeatAt;
  if (!snapshot?.online) return "Offline · online tables are unavailable.";
  if (snapshot?.presence?.status === "updating") return "Updating… showing the last results.";
  if (!heartbeatAt) return "Updating…";
  const seconds = Math.max(0, Math.round((now - new Date(heartbeatAt).getTime()) / 1000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `May be out of date · ${Math.floor(seconds / 60)}m ago`;
}

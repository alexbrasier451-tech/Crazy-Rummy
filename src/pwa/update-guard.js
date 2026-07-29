function snapshotOf(session) {
  try {
    return session?.getSnapshot?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * Installed-shell updates reload the page. Keep that explicit reload away from
 * device-owned waiting rooms and peer-to-peer matches, where a refresh can
 * discard the only in-memory host topology.
 */
export function onlineUpdateGuard({
  onlineSession,
  onlineMatchSession
} = {}) {
  if (onlineMatchSession) {
    return Object.freeze({
      blocked: true,
      reason: "Finish or leave the online match before updating this device."
    });
  }

  const lobby = snapshotOf(onlineSession);
  if (lobby?.room?.table) {
    return Object.freeze({
      blocked: true,
      reason: "Leave the waiting room, or cancel it if you are the host, before updating this device."
    });
  }

  return Object.freeze({ blocked: false, reason: null });
}

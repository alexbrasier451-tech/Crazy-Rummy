import { MATCH_BOOTSTRAP_VERSION } from "./match-contract.js";

export const MATCH_RECOVERY_PREFIX = "crazy-rummy.match.v1.";
export const ACTIVE_MATCH_KEY = "crazy-rummy.match.v1.active";

function storageOrMemory(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

export function createMatchRecoveryStorage({ storage } = {}) {
  const target = storageOrMemory(storage);
  const keyFor = (matchId) => `${MATCH_RECOVERY_PREFIX}${matchId}`;
  return Object.freeze({
    read(matchId) {
      try {
        const parsed = JSON.parse(target?.getItem?.(keyFor(matchId)) ?? "null");
        return parsed?.version === MATCH_BOOTSTRAP_VERSION ? parsed.value : null;
      } catch { return null; }
    },
    write(matchId, value) {
      try { target?.setItem?.(keyFor(matchId), JSON.stringify({ version: MATCH_BOOTSTRAP_VERSION, value })); return null; }
      catch (error) { return error instanceof Error ? error.message : String(error); }
    },
    writeComposition(matchId, value) {
      const error = this.write(matchId, value);
      if (!error) try { target?.setItem?.(ACTIVE_MATCH_KEY, JSON.stringify({ version: MATCH_BOOTSTRAP_VERSION, matchId })); } catch {}
      return error;
    },
    readActive() {
      try {
        const active = JSON.parse(target?.getItem?.(ACTIVE_MATCH_KEY) ?? "null");
        return active?.version === MATCH_BOOTSTRAP_VERSION && typeof active.matchId === "string" ? this.read(active.matchId) : null;
      } catch { return null; }
    },
    clearActive() {
      try {
        const active = JSON.parse(target?.getItem?.(ACTIVE_MATCH_KEY) ?? "null");
        if (typeof active?.matchId === "string") target?.removeItem?.(keyFor(active.matchId));
        target?.removeItem?.(ACTIVE_MATCH_KEY);
      } catch {}
    },
    clearAll() {
      try {
        const keys = [];
        for (let index = 0; index < (target?.length ?? 0); index += 1) {
          const key = target?.key?.(index);
          if (key === ACTIVE_MATCH_KEY || key?.startsWith(MATCH_RECOVERY_PREFIX)) keys.push(key);
        }
        keys.forEach((key) => target?.removeItem?.(key));
      } catch {}
    },
    remove(matchId) { try { target?.removeItem?.(keyFor(matchId)); const active = JSON.parse(target?.getItem?.(ACTIVE_MATCH_KEY) ?? "null"); if (active?.matchId === matchId) target?.removeItem?.(ACTIVE_MATCH_KEY); } catch {} }
  });
}

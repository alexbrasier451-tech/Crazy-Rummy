/**
 * Compose a peer match as a recoverable transaction around the lobby's
 * CONNECTING state. Only the host may commit or roll back the shared room.
 */
export function onlineMatchRoute(snapshot = {}) {
  if (snapshot?.view?.lifecycle === "COMPLETE") return "/final-result";
  if (snapshot?.view?.hand?.phase === "HAND_COMPLETE") return "/hand-result";
  return "/game";
}

export function isRecoverableOnlineMatchSnapshot(snapshot = {}) {
  const state = String(snapshot?.network?.state ?? "").toUpperCase();
  return Boolean(snapshot?.view) && [
    "CONNECTING",
    "DISCONNECTED",
    "PAUSED",
    "RECONNECTING"
  ].includes(state);
}

export async function connectOnlineMatch({
  lobby,
  bootstrap,
  playerId,
  previousMatch,
  createMatch
} = {}) {
  if (!bootstrap || !playerId || typeof createMatch !== "function") {
    throw new TypeError("Online match start details are incomplete.");
  }

  const localIsHost = bootstrap.localPlayerId === bootstrap.hostPlayerId;
  let match = null;

  try {
    await previousMatch?.dispose?.();
    match = createMatch({ bootstrap, playerId });
    await match.start();
    if (localIsHost) await lobby?.confirmStart?.();
    return match;
  } catch (error) {
    await match?.dispose?.().catch?.(() => {});
    if (localIsHost) {
      try {
        await lobby?.abortStart?.();
      } catch (rollbackError) {
        console.warn(
          "Crazy Rummy could not restore the waiting room after connection setup failed.",
          rollbackError
        );
      }
    }
    throw error;
  }
}

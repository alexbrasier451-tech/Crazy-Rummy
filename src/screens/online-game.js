const TERMINAL_NETWORK_STATES = new Set(["FORFEIT", "ABANDONED"]);
const INTERRUPTED_NETWORK_STATES = new Set([
  "PAUSED",
  "RECONNECTING",
  "DISCONNECTED",
  "CONNECTING"
]);

function normalizedState(snapshot) {
  return String(snapshot?.network?.state ?? "RUNNING").toUpperCase();
}

function remainingWords(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return [
    minutes ? `${minutes} minute${minutes === 1 ? "" : "s"}` : null,
    remainder ? `${remainder} second${remainder === 1 ? "" : "s"}` : null
  ].filter(Boolean).join(" ") || "0 seconds";
}

export function recoveryCountdown(deadline, now = Date.now()) {
  if (!Number.isFinite(deadline)) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return Object.freeze({
    seconds,
    clock: `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`,
    label: `${remainingWords(seconds)} remain to reconnect.`
  });
}

function recoveryDetail(deadline, now) {
  const countdown = recoveryCountdown(deadline, now);
  if (!countdown) return "Waiting for the table to recover.";
  return `Recovery window · ${countdown.clock} remaining. ${countdown.label}`;
}

/**
 * Pure online-table presenter. `disabled` is deliberately conservative:
 * gameplay is available only while authority is running and no command outcome
 * is pending or uncertain.
 */
export function onlineGameState(snapshot = {}, now = Date.now()) {
  const network = snapshot.network ?? {};
  const state = normalizedState(snapshot);
  const phase = String(snapshot.lastAction?.phase ?? "").toLowerCase();
  const pendingIds = Array.isArray(network.pendingCommandIds) ? network.pendingCommandIds : [];
  const compatibilityError = network.compatibilityError;

  if (compatibilityError || state === "INCOMPATIBLE") {
    return {
      mode: "incompatible",
      disabled: true,
      connectionState: "error",
      label: "Incompatible table",
      detail: compatibilityError?.message
        ?? compatibilityError?.detail
        ?? "This table uses a different app, protocol, or rules version."
    };
  }
  if (state === "ABANDONED") {
    return {
      mode: "abandoned",
      disabled: true,
      connectionState: "error",
      label: "Match abandoned",
      detail: "The host could not be recovered, so this match has ended without a result."
    };
  }
  if (state === "FORFEIT") {
    return {
      mode: "forfeit",
      disabled: true,
      connectionState: "offline",
      label: "Match ended by forfeit",
      detail: "Gameplay has stopped. The authoritative forfeit result is shown."
    };
  }
  if (state === "RECONNECTING" || state === "DISCONNECTED" || state === "CONNECTING") {
    const countdown = recoveryCountdown(network.recoveryDeadline, now);
    return {
      mode: "reconnecting",
      disabled: true,
      connectionState: "reconnecting",
      label: state === "CONNECTING" ? "Connecting to table" : "Reconnecting",
      detail: recoveryDetail(network.recoveryDeadline, now),
      countdown
    };
  }
  if (state === "PAUSED") {
    const countdown = recoveryCountdown(network.recoveryDeadline, now);
    return {
      mode: "paused",
      disabled: true,
      connectionState: "offline",
      label: "Match paused",
      detail: recoveryDetail(network.recoveryDeadline, now),
      countdown
    };
  }
  if (phase === "uncertain") {
    return {
      mode: "uncertain",
      disabled: true,
      connectionState: "stale",
      label: "Action outcome uncertain",
      detail: "Gameplay is paused while the table checks whether the host accepted that action."
    };
  }
  if (phase === "pending" || pendingIds.length > 0) {
    return {
      mode: "pending",
      disabled: true,
      connectionState: "connecting",
      label: "Action pending",
      detail: "Waiting for host authority. Nothing has changed yet."
    };
  }
  return {
    mode: "running",
    disabled: false,
    connectionState: "online",
    label: "Online",
    detail: Number.isInteger(network.authoritativeSequence)
      ? `Authoritative update ${network.authoritativeSequence}.`
      : "Connected to host authority."
  };
}

export function onlineActionCopy(action = {}) {
  const phase = String(action.phase ?? "").toLowerCase();
  if (phase === "pending") {
    return {
      tone: "status",
      message: "Action sent. Waiting for host acceptance; nothing has changed yet."
    };
  }
  if (phase === "accepted") {
    return {
      tone: "success",
      message: "The host accepted that action. The authoritative table is shown."
    };
  }
  if (phase === "rejected") {
    const reason = action.detail || action.reason;
    return {
      tone: "error",
      message: `${reason ? `${reason} ` : ""}Nothing changed; your staged choices are still here.`
    };
  }
  if (phase === "uncertain") {
    return {
      tone: "error",
      message: "The host has not confirmed whether that action happened. Gameplay is paused while the table reconciles."
    };
  }
  return null;
}

export function isOnlineTerminalState(snapshot) {
  return TERMINAL_NETWORK_STATES.has(normalizedState(snapshot));
}

export function isOnlineInterruptedState(snapshot) {
  return INTERRUPTED_NETWORK_STATES.has(normalizedState(snapshot))
    || Boolean(snapshot?.network?.compatibilityError);
}

import {
  actionButton,
  actionLink,
  connectionState
} from "../components/index.js";
import {
  DEFAULT_RULES,
  HAND_SCHEDULE,
  RULES_VERSION as ENGINE_RULES_VERSION
} from "../engine/index.js";
import { APP_VERSION } from "../config.js";
import {
  bulletList,
  copy,
  element,
  field,
  illustrativeNotice,
  panel,
  routeLink,
  screenShell
} from "./helpers.js";

const MARKERS = Object.freeze([
  ["◆", "Diamond marker"],
  ["●", "Circle marker"],
  ["■", "Square marker"],
  ["▲", "Triangle marker"]
]);

function activeRulesFrom(...sessions) {
  for (const session of sessions) {
    const rules = session?.getSnapshot?.()?.view?.rules;
    if (rules?.rulesVersion) return rules;
  }
  return DEFAULT_RULES;
}

/** A pure, contract-derived description that tests and the rules screen share. */
export function rulesReference(activeRules = DEFAULT_RULES) {
  const rules = { ...DEFAULT_RULES, ...(activeRules ?? {}) };
  const schedule = Array.isArray(rules.handSchedule) && rules.handSchedule.length
    ? rules.handSchedule
    : HAND_SCHEDULE;
  return Object.freeze({
    version: rules.rulesVersion ?? ENGINE_RULES_VERSION,
    schedule: schedule.map(({ index, wildRank, label }) => ({ index, wildRank, label })),
    sections: Object.freeze([
      ["Aim and 13-hand progression", "Play all 13 hands. The lowest cumulative penalty total wins after the Kings hand."],
      ["Moving wild rank", "Every card of the hand’s listed rank is wild for that hand only. It returns to its natural rank on the next hand."],
      ["Turn order", "The dealer starts with eight cards and makes one opening discard. Every later turn is draw, optional table play, then one mandatory discard."],
      ["Sets, runs, and table additions", "Sets contain three or four cards of one rank; runs contain three or more consecutive cards of one suit. Aces are low only. After opening, a player may add legal cards to any table meld."],
      ["Opening and wild replacement", "A first complete set or run may include wilds. Before opening, a player cannot lay off or replace a table wild. A legal natural replacement takes the reclaimed wild into that player’s hand to hold, play, or discard normally."],
      ["Going out and stock exhaustion", "Going out requires a final discard; playing every card to the table is not enough. If the final stock card is drawn, that player finishes the turn; if they do not go out, everyone’s remaining cards are scored."],
      ["Scoring and final ties", "Aces score 1; natural 2–10 score face value; natural Jacks, Queens, and Kings score 10; a current-hand wild left in hand scores 50. All players tied for the lowest final total are joint winners."],
      ["Table preset", "This game uses the signed-off Crazy Rummy preset. Its version is recorded with the match and does not change after play starts."]
    ])
  });
}

export function rulesScreen({ localSession, onlineGameSession, gameSession } = {}) {
  const reference = rulesReference(activeRulesFrom(onlineGameSession, gameSession, localSession));
  const sections = reference.sections;

  return screenShell({
    id: "rules",
    context: `Rules preset · ${reference.version}`,
    title: "Crazy Rummy rules",
    action: routeLink("Lobby", "/lobby", "quiet"),
    content: [
      illustrativeNotice(
        `Cached contract reference · active table preset ${reference.version}. Examples explain the rules but never replace the recorded preset.`
      ),
      panel(
        "Moving wild schedule",
        copy("The hand number fixes the moving wild rank."),
        bulletList(reference.schedule.map(({ index, wildRank, label }) => `Hand ${index}: ${label} (${wildRank}s wild).`), { ordered: true })
      ),
      element(
        "nav",
        { className: "section-nav", "aria-label": "Rules sections" },
        bulletList(
          sections.map(([title], index) => element("button", {
            type: "button",
            className: "text-link",
            text: title,
            onClick: () => document.querySelector(`#rules-${index + 1}`)?.scrollIntoView()
          }))
        )
      ),
      ...sections.map(([title, description], index) => panel(
        title,
        element("span", { id: `rules-${index + 1}`, className: "anchor-target" }),
        copy(description)
      ))
    ]
  });
}

function valueFor(values, key) {
  return typeof values?.get === "function" ? values.get(key) : values?.[key];
}

/** Normalize only declared preference keys; unsupported haptics always stays off. */
export function normalizeSettingsPreferences(values, current = {}, { hapticsAvailable = false } = {}) {
  const option = (key, fallback) => {
    const value = valueFor(values, key);
    return typeof value === "string" && value ? value : fallback;
  };
  return {
    ...current,
    marker: option("settings-seat-marker", current.marker ?? "●"),
    cardSize: option("card-size", current.cardSize ?? "Standard"),
    handSort: option("hand-sort", current.handSort ?? "Rank"),
    motion: option("motion", current.motion ?? "System"),
    confirmDiscard: option("confirm-discard", current.confirmDiscard ?? "Always"),
    highContrast: valueFor(values, "high-contrast") === "on",
    autoRefresh: valueFor(values, "auto-refresh") === "on",
    haptics: hapticsAvailable && valueFor(values, "haptics") === "on"
  };
}

export function completedSummaryReference(summary) {
  if (!summary || !Array.isArray(summary.seats) || !Array.isArray(summary.winners)) return null;
  const names = Object.fromEntries(summary.seats.map((seat) => [seat.seatId, seat.displayName]));
  const standings = summary.seats
    .filter((seat) => summary.activeSeatOrder?.includes(seat.seatId) || seat.status !== "DROPPED")
    .map((seat) => ({
      name: seat.displayName,
      total: seat.cumulativeScore,
      winner: summary.winners.includes(seat.seatId)
    }))
    .sort((left, right) => left.total - right.total || left.name.localeCompare(right.name));
  const winnerNames = summary.winners.map((seatId) => names[seatId]).filter(Boolean);
  return Object.freeze({
    outcome: summary.completion?.reason === "FORFEIT"
      ? `${winnerNames.join(" and ")} won by forfeit.`
      : `${winnerNames.join(" and ")} ${winnerNames.length === 1 ? "won" : "tied for the win"}.`,
    handCount: summary.completedHands?.length ?? 0,
    standings
  });
}

export function playerStatisticsReference(statistics) {
  if (
    !statistics
    || !Number.isInteger(statistics.matchesRecorded)
    || statistics.matchesRecorded < 1
    || !Number.isInteger(statistics.matchesFinished)
    || !Number.isInteger(statistics.matchesEndedEarly)
    || !Number.isInteger(statistics.matchWins)
    || !Number.isInteger(statistics.forfeitWins)
    || !Number.isInteger(statistics.handsWon)
    || statistics.matchesFinished + statistics.matchesEndedEarly !== statistics.matchesRecorded
    || (
      statistics.bestFinalTotal !== null
      && (!Number.isFinite(statistics.bestFinalTotal) || statistics.bestFinalTotal < 0)
    )
  ) return null;
  const wins = statistics.matchWins + statistics.forfeitWins;
  return Object.freeze({
    matchesRecorded: statistics.matchesRecorded,
    wins,
    winRate: Math.round((wins / statistics.matchesRecorded) * 100),
    handsWon: statistics.handsWon,
    bestFinalTotal: statistics.bestFinalTotal,
    matchesFinished: statistics.matchesFinished,
    matchesEndedEarly: statistics.matchesEndedEarly
  });
}

function playerStatisticsPanel(statistics, displayName) {
  const record = playerStatisticsReference(statistics);
  if (!displayName) {
    return panel(
      "Your Crazy Rummy record",
      copy("Set a player name to keep device-local match statistics.")
    );
  }
  if (!record) {
    return panel(
      "Your Crazy Rummy record",
      copy(`No recorded matches for ${displayName} yet. Statistics appear after a match reaches an accepted final result.`)
    );
  }
  const metric = (label, value) => element(
    "div",
    { className: "career-stat" },
    element("dt", { text: label }),
    element("dd", { text: value })
  );
  return panel(
    "Your Crazy Rummy record",
    copy(`Stored only on this device for ${displayName}.`),
    element(
      "dl",
      { className: "career-stats", "aria-label": `Device-local statistics for ${displayName}` },
      metric("Matches recorded", record.matchesRecorded),
      metric("Wins", `${record.wins} (${record.winRate}%)`),
      metric("Hands won", record.handsWon),
      metric("Best final total", record.bestFinalTotal ?? "—")
    ),
    copy(
      `${record.matchesFinished} finished normally`
      + (record.matchesEndedEarly ? ` · ${record.matchesEndedEarly} ended early` : "")
      + ". Joint and forfeit wins are included; lower final totals are better."
    )
  );
}

export function settingsScreen({
  pwaStatus,
  activateUpdate,
  localSession,
  clearDeviceData,
  completedSummary
} = {}) {
  const snapshot = localSession?.getSnapshot?.() ?? {};
  const identity = snapshot.identity ?? {};
  const preferences = snapshot.preferences ?? {};
  const hapticsAvailable = typeof globalThis.navigator?.vibrate === "function";
  const status = pwaStatus ?? {
    supported: false,
    phase: "unsupported",
    updateReady: false,
    online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
    controlled: false,
    error: null
  };
  const name = field({
    id: "settings-display-name",
    label: "Display name",
    value: identity.displayName ?? "",
    minLength: 1,
    maxLength: 24,
    required: true,
    hint: "Stored only on this device; it is not an account."
  });
  const saved = element("p", {
    className: "field-hint",
    role: "status",
    "aria-live": "polite"
  });
  const marker = markerField(preferences.marker ?? "●");
  const form = element(
    "form",
    {
      className: "settings-form",
      onSubmit: (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const values = new FormData(form);
        localSession?.setIdentity?.({
          playerId: identity.playerId
            ?? `local-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
          displayName: String(values.get("settings-display-name") ?? "").trim()
        });
        localSession?.setPreferences?.(normalizeSettingsPreferences(values, preferences, { hapticsAvailable }));
        saved.textContent = "Settings saved on this device.";
      }
    },
    name.wrapper,
    marker,
    selectField("card-size", "Card size", ["Standard", "Large"], preferences.cardSize),
    selectField("hand-sort", "Default hand sorting", ["Rank", "Suit"], preferences.handSort),
    selectField("motion", "Motion", ["System", "Reduced"], preferences.motion),
    selectField("confirm-discard", "Confirm discard", ["Always", "Quick confirm"], preferences.confirmDiscard),
    checkboxField("high-contrast", "High contrast and suit labels", preferences.highContrast),
    checkboxField("auto-refresh", "Lobby auto-refresh", preferences.autoRefresh ?? true),
    checkboxField("haptics", "Haptics", hapticsAvailable && preferences.haptics, {
      disabled: !hapticsAvailable,
      hint: hapticsAvailable ? "Uses short optional feedback only." : "Haptics are not available in this browser."
    }),
    actionButton({ label: "Save settings", type: "submit" }),
    saved
  );
  let clearArmed = false;
  const clearData = actionButton({
    label: "Clear device data",
    variant: "danger",
    onActivate: () => {
      if (!clearArmed) {
        clearArmed = true;
        clearData.querySelector(".action__label").textContent = "Confirm clear device data";
        saved.textContent = "This clears this device’s local identity, preferences, player statistics, local fixture, completed summaries, and all online recovery records.";
        return;
      }
      if (typeof clearDeviceData === "function") void clearDeviceData();
      else localSession?.clearDeviceData?.();
      name.input.value = "";
      saved.textContent = "Device-local identity, preferences, player statistics, fixture, summaries, and all online recovery records cleared.";
      clearData.disabled = true;
    }
  });
  const installContent = [
    copy(`Crazy Rummy ${APP_VERSION}`),
    pwaConnectionState(status),
    copy(pwaStatusDetail(status)),
    copy("Remote play always requires a shared online service.")
  ];

  if (status.updateReady) {
    installContent.push(actionButton({
      label: "Update and reload",
      pending: status.phase === "activating",
      onActivate: () => activateUpdate?.()
    }));
  }
  const latestSummary = completedSummaryReference(completedSummary ?? snapshot.completedSummary);

  return screenShell({
    id: "settings",
    context: "Your device",
    title: "Settings",
    action: actionLink({ label: "Lobby", href: "#/lobby", variant: "quiet" }),
    content: [
      copy("Identity and preferences are stored locally and restored after refresh."),
      form,
      panel("Install and offline status", ...installContent),
      playerStatisticsPanel(snapshot.playerStatistics, identity.displayName),
      latestSummary ? panel(
        "Latest completed match",
        copy(latestSummary.outcome),
        copy(`${latestSummary.handCount} accepted hand ${latestSummary.handCount === 1 ? "result" : "results"} retained on this device.`),
        bulletList(latestSummary.standings.map((entry, index) =>
          `${index + 1}. ${entry.name}: ${entry.total}${entry.winner ? " — winner" : ""}`
        ), { ordered: true })
      ) : panel(
        "Latest completed match",
        copy("No completed match summary is stored on this device yet.")
      ),
      panel(
        "Privacy and data",
        copy("This device keeps only your local identity, preferences, aggregate player statistics, local fixture state, and public-only completed-match summaries. Statistics and summaries do not include card history, invite codes, room secrets, or recovery secrets."),
        copy("Clear device data removes exactly those local records. It does not create a cloud account or delete another player’s device."),
        clearData
      )
    ]
  });
}

function markerField(selectedMarker) {
  const group = element("fieldset", { className: "marker-picker" }, element("legend", { text: "Seat marker" }));
  MARKERS.forEach(([value, label], index) => {
    const id = `settings-marker-${index + 1}`;
    group.append(element("label", { className: "marker-option" },
      element("input", { id, name: "settings-seat-marker", type: "radio", value, checked: value === selectedMarker }),
      element("span", { "aria-hidden": "true", text: value }),
      element("span", { className: "visually-hidden", text: label })
    ));
  });
  return group;
}

function pwaConnectionState(status) {
  if (status.online === false) return connectionState({ state: "offline", label: "Offline", detail: "Online play is unavailable." });
  if (status.updateReady) return connectionState({ state: "stale", label: "App update ready", detail: "Activation waits for your explicit choice." });
  if (["registering", "installing", "activating"].includes(status.phase)) return connectionState({ state: "connecting", label: status.phase === "activating" ? "Activating update" : "Installing app shell", detail: "Static app files only." });
  if (status.phase === "ready") return connectionState({ state: "online", label: status.controlled ? "Offline shell ready" : "App shell installed", detail: status.controlled ? "This page is using the installed shell." : "It will control a future app load." });
  if (status.phase === "error") return connectionState({ state: "error", label: "App shell unavailable", detail: status.error || "Registration could not complete." });
  if (!status.supported || status.phase === "unsupported") return connectionState({ state: "error", label: "Install not supported", detail: "Cached app-shell installation is unavailable in this browser." });
  return connectionState({ state: "connecting", label: "Checking app shell", detail: "Install status is not ready yet." });
}

function pwaStatusDetail(status) {
  if (status.online === false) return "The installed shell, cached rules, and local settings remain available. Remote play can resume after reconnection.";
  if (status.updateReady) return "A new versioned static shell is waiting. Update and reload activates it; no match action is replayed.";
  if (status.phase === "activating") return "The waiting shell is activating. This page reloads only after the service worker confirms control.";
  if (status.phase === "registering" || status.phase === "installing") return "Versioned static app files are installing. Session, room, match, and private card data are not precached.";
  if (status.phase === "ready") return "The versioned app shell is ready for supported offline pages.";
  if (status.phase === "error") return "The current page still works, but offline relaunch may be unavailable.";
  if (!status.supported || status.phase === "unsupported") return "This browser can use the current page but cannot install the offline shell.";
  return "The app is checking whether the versioned offline shell is available.";
}

function selectField(id, label, options, selectedValue) {
  const select = element("select", { id, name: id });
  options.forEach((option) => select.append(element("option", { value: option, text: option, selected: option === selectedValue })));
  return element("div", { className: "field" }, element("label", { htmlFor: id, text: label }), select);
}

function checkboxField(id, label, checked = false, { disabled = false, hint = null } = {}) {
  return element("div", { className: "field" },
    element("label", { className: "check-field" },
      element("input", { id, name: id, type: "checkbox", checked, disabled }),
      element("span", { text: label })
    ),
    hint ? element("p", { className: "field-hint", text: hint }) : null
  );
}

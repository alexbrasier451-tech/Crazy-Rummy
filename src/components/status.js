import { element } from "./dom.js";

const CONNECTION_STATES = Object.freeze({
  online: { icon: "✓", label: "Online" },
  connecting: { icon: "…", label: "Connecting" },
  reconnecting: { icon: "↻", label: "Reconnecting" },
  stale: { icon: "!", label: "May be out of date" },
  offline: { icon: "×", label: "Offline" },
  error: { icon: "!", label: "Connection error" }
});

const PLAYER_STATES = Object.freeze({
  waiting: "Waiting",
  ready: "Ready",
  connected: "Connected",
  current: "Current turn",
  offline: "Offline",
  reconnecting: "Reconnecting",
  dropped: "Dropped",
  error: "Needs attention"
});

export function playerChip({
  name,
  marker = "●",
  state = "waiting",
  cardCount,
  current = false
} = {}) {
  if (!name) {
    throw new TypeError("playerChip requires a name.");
  }

  const stateLabel = PLAYER_STATES[state] || String(state);
  const chip = element("div", {
    className: "player-chip",
    attributes: {
      "data-state": state,
      "data-current": String(Boolean(current)),
      "aria-label": [
        name,
        current ? "current turn" : null,
        stateLabel,
        Number.isFinite(cardCount) ? `${cardCount} cards` : null
      ].filter(Boolean).join(", ")
    }
  });
  chip.append(
    element("span", {
      className: "player-chip__marker",
      text: marker,
      attributes: { "aria-hidden": "true" }
    }),
    element("span", { className: "player-chip__name", text: name }),
    element("span", {
      className: "player-chip__state",
      text: `${current ? "◆ " : ""}${stateLabel}${Number.isFinite(cardCount) ? ` · ${cardCount}` : ""}`
    })
  );
  return chip;
}

export function scoreStrip({
  scores = [],
  activePlayerId = null,
  label = "Scores"
} = {}) {
  const strip = element("section", {
    className: "score-strip",
    attributes: { "aria-label": label }
  });
  const list = element("ol", { className: "score-strip__list" });

  for (const entry of scores) {
    const active = entry.id === activePlayerId;
    const displayedScore = Number.isFinite(entry.total)
      ? entry.total
      : (Number.isFinite(entry.score) ? entry.score : 0);
    const handDelta = Number.isFinite(entry.hand)
      ? `Hand ${entry.hand >= 0 ? "+" : "−"}${Math.abs(entry.hand)}`
      : null;
    const metadata = [active ? "◆ Current" : null, handDelta, entry.state]
      .filter(Boolean)
      .join(" · ");
    const item = element("li", {
      className: "score-strip__item",
      attributes: {
        "data-active": String(active),
        "aria-label": [
          entry.name,
          `${displayedScore} points`,
          handDelta,
          active ? "current" : null,
          entry.state
        ].filter(Boolean).join(", ")
      }
    });
    item.append(
      element("span", {
        className: "score-strip__name",
        text: `${entry.marker ? `${entry.marker} ` : ""}${entry.name}`
      }),
      element("strong", { className: "score-strip__score", text: displayedScore }),
      element("span", {
        className: "score-strip__state",
        text: metadata
      })
    );
    list.append(item);
  }

  strip.append(list);
  return strip;
}

export function connectionState({
  state = "online",
  label,
  detail = null,
  announce = false
} = {}) {
  const definition = CONNECTION_STATES[state] || {
    icon: "•",
    label: String(state)
  };
  const status = element("div", {
    className: "connection-state",
    attributes: {
      "data-state": state,
      role: "status",
      "aria-live": announce ? "polite" : "off",
      "aria-atomic": "true"
    }
  });
  status.append(
    element("span", {
      className: "connection-state__icon",
      text: definition.icon,
      attributes: { "aria-hidden": "true" }
    }),
    element("span", {
      className: "connection-state__label",
      text: label || definition.label
    })
  );
  if (detail) {
    status.append(element("span", { className: "connection-state__detail", text: detail }));
  }
  return status;
}

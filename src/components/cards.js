import { element, setBooleanAttribute } from "./dom.js";

const SUITS = Object.freeze({
  clubs: { symbol: "♣", name: "clubs", red: false },
  diamonds: { symbol: "♦", name: "diamonds", red: true },
  hearts: { symbol: "♥", name: "hearts", red: true },
  spades: { symbol: "♠", name: "spades", red: false }
});

const RANK_NAMES = Object.freeze({
  A: "Ace",
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
  "10": "Ten",
  J: "Jack",
  Q: "Queen",
  K: "King",
  WILD: "Wild"
});

function cardLabel({ rank, suit, wild, selected, recentlyDrawn, position, total }) {
  const normalizedRank = String(rank ?? "").toUpperCase();
  const rankName = RANK_NAMES[normalizedRank] || String(rank || "Unknown card");
  const suitInfo = SUITS[String(suit ?? "").toLowerCase()];
  const parts = [suitInfo ? `${rankName} of ${suitInfo.name}` : rankName];

  if (wild || normalizedRank === "WILD") {
    parts.push("wild");
  }
  if (recentlyDrawn) {
    parts.push("just drawn");
  }
  parts.push(selected ? "selected" : "not selected");

  if (Number.isFinite(position) && Number.isFinite(total)) {
    parts.push(`card ${position} of ${total}`);
  }

  return `${parts.join(", ")}.`;
}

function cardFacePart(className, rank, symbol) {
  const corner = element("span", {
    className,
    attributes: { "aria-hidden": "true" }
  });
  corner.append(
    element("span", { text: rank }),
    element("span", { className: "playing-card__suit", text: symbol })
  );
  return corner;
}

export function playingCard({
  rank,
  suit,
  wild = false,
  selected = false,
  recentlyDrawn = false,
  position,
  total,
  disabled = false,
  interactive = true,
  onToggle
} = {}) {
  const normalizedRank = String(rank ?? "").toUpperCase();
  const suitInfo = SUITS[String(suit ?? "").toLowerCase()];

  if (!RANK_NAMES[normalizedRank]) {
    throw new TypeError(`Unknown playing-card rank: ${rank ?? ""}`);
  }
  if (normalizedRank !== "WILD" && !suitInfo) {
    throw new TypeError(`Unknown playing-card suit: ${suit ?? ""}`);
  }

  const card = element(interactive ? "button" : "article", {
    className: `playing-card${suitInfo?.red ? " playing-card--red" : ""}${recentlyDrawn ? " playing-card--recent" : ""}`,
    attributes: {
      type: interactive ? "button" : undefined,
      "aria-label": cardLabel({ rank, suit, wild, selected, recentlyDrawn, position, total }),
      "aria-pressed": interactive ? String(Boolean(selected)) : undefined,
      "data-selected": String(Boolean(selected)),
      "data-recently-drawn": String(Boolean(recentlyDrawn)),
      "data-rank": normalizedRank,
      "data-suit": suitInfo?.name,
      "data-wild": String(Boolean(wild || normalizedRank === "WILD"))
    }
  });

  if (interactive) {
    card.disabled = Boolean(disabled);
  }

  const displayRank = normalizedRank === "WILD" ? "★" : normalizedRank;
  const displaySuit = suitInfo?.symbol || "★";
  card.append(
    cardFacePart("playing-card__corner", displayRank, displaySuit),
    element("span", {
      className: "playing-card__centre",
      text: displaySuit,
      attributes: { "aria-hidden": "true" }
    }),
    cardFacePart(
      "playing-card__corner playing-card__corner--end",
      displayRank,
      displaySuit
    )
  );

  if (wild || normalizedRank === "WILD") {
    card.append(
      element("span", {
        className: "playing-card__wild",
        text: "WILD",
        attributes: { "aria-hidden": "true" }
      })
    );
  }

  if (recentlyDrawn) {
    card.append(
      element("span", {
        className: "playing-card__recent",
        text: "DRAWN",
        attributes: { "aria-hidden": "true" }
      })
    );
  }

  const check = element("span", {
    className: "playing-card__check",
    text: "✓",
    attributes: {
      "aria-hidden": "true",
      hidden: selected ? undefined : true
    }
  });
  card.append(check);

  if (interactive) {
    card.addEventListener("click", (event) => {
      const nextSelected = card.getAttribute("aria-pressed") !== "true";
      setBooleanAttribute(card, "aria-pressed", nextSelected);
      card.setAttribute("data-selected", String(nextSelected));
      card.setAttribute(
        "aria-label",
        cardLabel({
          rank,
          suit,
          wild,
          selected: nextSelected,
          recentlyDrawn,
          position,
          total
        })
      );
      check.hidden = !nextSelected;
      if (typeof onToggle === "function") {
        onToggle(nextSelected, event);
      }
    });
  }

  return card;
}

export function cardBack({
  label = "Face-down card",
  interactive = false,
  onActivate
} = {}) {
  const back = element(interactive ? "button" : "div", {
    className: "card-back",
    attributes: {
      type: interactive ? "button" : undefined,
      "aria-label": label,
      role: interactive ? undefined : "img"
    }
  });
  back.append(
    element("span", {
      className: "visually-hidden",
      text: label
    })
  );

  if (interactive && typeof onActivate === "function") {
    back.addEventListener("click", onActivate);
  }

  return back;
}

export function handTray({
  label = "Your hand",
  cards = [],
  sortLabel,
  onCardToggle
} = {}) {
  const tray = element("section", {
    className: "hand-tray",
    attributes: { "aria-label": label }
  });
  const header = element("header", { className: "hand-tray__header" });
  header.append(
    element("h2", {
      className: "hand-tray__title",
      text: `${label} · ${cards.length}`
    })
  );
  if (sortLabel) {
    header.append(element("span", { className: "hand-tray__meta", text: sortLabel }));
  }

  const list = element("ul", {
    className: "hand-tray__list",
    attributes: { role: "list" }
  });
  cards.forEach((cardData, index) => {
    const item = element("li", { className: "hand-tray__item" });
    item.append(
      playingCard({
        ...cardData,
        position: index + 1,
        total: cards.length,
        onToggle: (nextSelected, event) => {
          if (typeof cardData.onToggle === "function") {
            cardData.onToggle(nextSelected, event);
          }
          if (typeof onCardToggle === "function") {
            onCardToggle(index, nextSelected, event);
          }
        }
      })
    );
    list.append(item);
  });

  tray.append(header, list);
  return tray;
}


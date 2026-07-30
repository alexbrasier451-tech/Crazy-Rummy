import { FIXTURE } from "./fixtures.js";

function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === "className") node.className = value;
    else if (name === "text") node.textContent = value;
    else node.setAttribute(name, String(value));
  }
  for (const child of children.flat()) if (child) node.append(child);
  return node;
}

function heading(level, text, className) {
  return element(`h${level}`, { className, text });
}

function status(network) {
  return element("p", { className: `board-status board-status--${network.tone}`, "data-network-status": network.tone }, [
    element("strong", { text: network.label }), element("span", { text: network.detail })
  ]);
}

function card(card) {
  const label = card.rank === "WILD" ? "WILD ★" : `${card.rank}${({ clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" })[card.suit]}`;
  return element("li", { className: `concept-card${card.suit === "diamonds" || card.suit === "hearts" ? " concept-card--red" : ""}`, "aria-label": card.rank === "WILD" ? "Wild card" : `${card.rank} of ${card.suit}` }, [
    element("span", { text: label })
  ]);
}

function hand() {
  return element("section", { className: "private-hand", "aria-labelledby": "private-hand-title", "data-private-hand": FIXTURE.localSeatId }, [
    element("div", { className: "private-hand__heading" }, [
      heading(2, `${FIXTURE.localPlayer}’s private hand`, "private-hand__title"),
      element("p", { text: `${FIXTURE.localHand.length} cards · private to this fixture` })
    ]),
    element("ul", { className: "private-hand__cards", role: "list" }, FIXTURE.localHand.map(card))
  ]);
}

function publicTable() {
  return element("section", { className: "public-table", "aria-labelledby": "public-table-title", "data-public-table": "true" }, [
    heading(2, "Shared table", "public-table__title"),
    element("p", { className: "public-table__meta", text: `Hand ${FIXTURE.game.hand} · wild ${FIXTURE.game.wildRank} · dealer ${FIXTURE.game.dealer} · stock ${FIXTURE.game.stockCount} · discard ${FIXTURE.game.discard}` }),
    element("div", { className: "public-table__piles", "aria-label": "Public stock and discard" }, [
      element("div", { className: "mini-card mini-card--back", role: "img", "aria-label": `Face-down stock, ${FIXTURE.game.stockCount} cards`, "data-public-stock": "true" }, [
        element("span", { text: "STOCK" }), element("small", { text: String(FIXTURE.game.stockCount) })
      ]),
      element("div", { className: "mini-card mini-card--discard", role: "img", "aria-label": "Public discard: Queen of spades", "data-public-discard": "Q-spades" }, [
        element("span", { text: "Q" }), element("strong", { text: "♠" }), element("small", { text: "DISCARD" })
      ])
    ]),
    element("div", { className: "public-melds" }, FIXTURE.publicMelds.map((meld) => element("article", { className: "public-meld", "aria-label": meld.label }, [
      element("h3", { text: meld.label }),
      element("ul", { className: "public-meld__cards", role: "list" }, meld.cards.map((label) => {
        const wild = label.startsWith("WILD");
        return element("li", { className: `mini-card mini-card--meld${wild ? " mini-card--wild" : ""}`, "data-public-meld-card": wild ? "wild" : "card", "aria-label": wild ? "Wild card represented as seven of hearts" : label }, [
          element("span", { text: wild ? "WILD" : label }),
          wild ? element("small", { text: "A♣ → 7♥" }) : null
        ]);
      }))
    ])))
  ]);
}

function seat(seat) {
  return element("li", { className: `seat${seat.local ? " seat--local" : ""}`, "data-seat-id": seat.id, "data-local": String(Boolean(seat.local)) }, [
    element("strong", { text: seat.name }),
    element("span", { text: `${seat.score} points · ${seat.count} cards` }),
    element("small", { text: seat.state })
  ]);
}

function tableActions() {
  return element("section", { className: "table-actions", "aria-label": "Available concept actions" }, [
    element("button", { type: "button", text: "Draw from stock" }),
    element("button", { type: "button", className: "table-actions__secondary", text: "Review table" })
  ]);
}

function lobbyTableCards(network) {
  if (network.tone === "offline") {
    return element("section", { className: "lobby-empty", "data-lobby-empty": "offline", "aria-labelledby": "offline-lobby-title" }, [
      heading(2, "No tables are available while offline", "section-title"),
      element("p", { id: "offline-lobby-title", text: "Reconnect to browse public tables. Your saved rules and local settings remain available on this device." }),
      element("button", { type: "button", className: "table-actions__secondary", text: "Review saved rules" })
    ]);
  }
  return element("ol", { className: "lobby-tables", "aria-label": "Illustrative table list" }, FIXTURE.lobbyTables.map((table) => element("li", { className: "lobby-table" }, [
    element("strong", { text: table.name }),
    element("span", { text: `Host ${table.host}` }),
    element("span", { text: `${table.seats} seats` }),
    element("small", { text: table.status }),
    element("small", { text: table.rules })
  ])));
}

function lobbyIntro(network) {
  return element("header", { className: "screen-intro" }, [
    element("p", { className: "eyebrow", text: "Online play · Midnight Limited" }),
    heading(1, "Choose a carriage", "screen-title"),
    element("p", { className: "screen-copy", text: "An exploratory lobby composition; controls and data are illustrative only." }),
    status(network)
  ]);
}

function gameIntro(network) {
  return element("header", { className: "screen-intro" }, [
    element("p", { className: "eyebrow", text: `Hand ${FIXTURE.game.hand} · wild rank ${FIXTURE.game.wildRank} · turn ${FIXTURE.game.turn}` }),
    heading(1, `${FIXTURE.localPlayer}’s turn`, "screen-title"),
    element("p", { className: "screen-copy", text: "Choose a card action after host acknowledgement." }),
    status(network)
  ]);
}

function timetableLobby(network) {
  return element("section", { className: "concept-layout concept-layout--timetable concept-layout--lobby" }, [
    lobbyIntro(network),
    element("section", { className: "timetable-board", "aria-labelledby": "timetable-title" }, [
      heading(2, "Departure board", "section-title"),
      element("p", { id: "timetable-title", className: "sr-only", text: "Illustrative available tables" }),
      lobbyTableCards(network)
    ]),
    element("aside", { className: "timetable-note" }, [heading(2, "Tonight’s line", "section-title"), element("p", { text: "A quiet vertical sequence makes table status and next action the visual timetable." })])
  ]);
}

function timetableGame(network) {
  return element("section", { className: "concept-layout concept-layout--timetable concept-layout--game" }, [
    gameIntro(network),
    element("section", { className: "timetable-game-board", "aria-labelledby": "game-timetable-title" }, [
      heading(2, "Service positions", "section-title"),
      element("ol", { className: "timetable-seats", "aria-label": "Six public player positions" }, FIXTURE.seats.map(seat)),
      publicTable()
    ]),
    hand(), tableActions()
  ]);
}

function compartmentLobby(network) {
  return element("section", { className: "concept-layout concept-layout--compartment concept-layout--lobby" }, [
    lobbyIntro(network),
    element("section", { className: "compartment-lobby-core", "aria-labelledby": "compartment-choice-title" }, [
      heading(2, "Find your compartment", "section-title"),
      element("p", { id: "compartment-choice-title", text: "A central invitation card is framed by enough availability information to make the next action clear." }),
      element("div", { className: "paired-ticket-gate", "aria-label": "Table entry actions" }, [
        element("button", {
          type: "button",
          className: "compartment-primary",
          text: "Create a table",
          disabled: network.tone === "offline"
        }),
        element("button", {
          type: "button",
          className: "table-actions__secondary",
          text: "Join with a code",
          disabled: network.tone === "offline"
        })
      ]),
      lobbyTableCards(network)
    ]),
    element("aside", { className: "compartment-lobby-note" }, [heading(2, "Near rail", "section-title"), element("p", { text: "At phone size the choice stays closest to the thumb; the availability rail moves below it." })])
  ]);
}

function compartmentGame(network) {
  return element("section", { className: "concept-layout concept-layout--compartment concept-layout--game" }, [
    gameIntro(network),
    element("section", { className: "compartment-table", "aria-labelledby": "compartment-table-title" }, [
      heading(2, "Six-seat compartment", "section-title"),
      element("p", { id: "compartment-table-title", className: "sr-only", text: `Public six player table. ${FIXTURE.localPlayer} is the local player.` }),
      element("ol", { className: "compartment-seats", "aria-label": "Six public player positions" }, FIXTURE.seats.map(seat)),
      publicTable()
    ]),
    hand(), tableActions()
  ]);
}

function atlasLobby(network) {
  return element("section", { className: "concept-layout concept-layout--atlas concept-layout--lobby" }, [
    lobbyIntro(network),
    element("section", { className: "atlas-map", "aria-labelledby": "atlas-title" }, [
      heading(2, "Route atlas", "section-title"),
      element("p", { id: "atlas-title", text: "Select an open station, or begin a private service." }),
      element("div", { className: "atlas-line", "aria-hidden": "true" }, [element("span"), element("span"), element("span")]),
      lobbyTableCards(network)
    ]),
    element("aside", { className: "atlas-legend" }, [heading(2, "Map key", "section-title"), element("p", { text: "Nodes carry table state with a name and seat count, not colour alone." })])
  ]);
}

function atlasGame(network) {
  return element("section", { className: "concept-layout concept-layout--atlas concept-layout--game" }, [
    gameIntro(network),
    element("section", { className: "atlas-game-map", "aria-labelledby": "atlas-game-title" }, [
      heading(2, "Shared route", "section-title"),
      element("p", { id: "atlas-game-title", className: "sr-only", text: "Public game route showing six player stations" }),
      element("ol", { className: "atlas-seats", "aria-label": "Six public player positions" }, FIXTURE.seats.map(seat)),
      publicTable()
    ]),
    hand(), tableActions()
  ]);
}

export function renderConcept({ concept, screen, network }) {
  const layouts = {
    a: { lobby: timetableLobby, game: timetableGame },
    b: { lobby: compartmentLobby, game: compartmentGame },
    c: { lobby: atlasLobby, game: atlasGame }
  };
  return layouts[concept][screen](network);
}

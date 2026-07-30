export const FIXTURE = Object.freeze({
  id: "v111-busy-six",
  revision: "locally-derived-uncommitted",
  date: "2026-07-30",
  locale: "en-GB",
  timeZone: "Europe/London",
  sourceStatus: "Locally derived uncommitted source snapshot — NOT signed beta baseline.",
  baselineViewport: "390 × 844 CSS px",
  route: "/game",
  lifecycle: "IN_PROGRESS",
  viewRevision: 19,
  localSeatId: "p1",
  playerCount: 6,
  localPlayer: "Pat",
  mockDataNotice: "Mock concept data. Only Pat’s private hand is shown; other players’ concealed cards, construction data, room data, invitation details, and access credentials are omitted.",
  game: Object.freeze({ hand: "1 / 13", wildRank: "A", dealer: "Pat", phase: "TABLE_PLAY", turn: 6, stockCount: 3, discard: "Q♠" }),
  seats: Object.freeze([
    { id: "p1", name: "Pat", score: 0, count: 8, state: "Your turn", local: true },
    { id: "p2", name: "Alex", score: 0, count: 4, state: "Active" },
    { id: "p3", name: "Lee", score: 0, count: 7, state: "Active" },
    { id: "p4", name: "Jo", score: 0, count: 7, state: "Active" },
    { id: "p5", name: "Mina", score: 0, count: 7, state: "Active" },
    { id: "p6", name: "Sam", score: 0, count: 7, state: "Active" }
  ]),
  localHand: Object.freeze([
    { rank: "Q", suit: "clubs" }, { rank: "6", suit: "clubs" },
    { rank: "5", suit: "clubs" }, { rank: "5", suit: "diamonds" },
    { rank: "2", suit: "clubs" }, { rank: "5", suit: "spades" },
    { rank: "8", suit: "diamonds" }, { rank: "9", suit: "spades" }
  ]),
  publicMelds: Object.freeze([
    { label: "Alex’s run", cards: ["WILD (A♣ → 7♥)", "8♥", "9♥"] }
  ]),
  lobbyTables: Object.freeze([
    { name: "Crazy Rummy", host: "Pat", seats: "1 / 6", status: "OPEN · WAITING", rules: "Crazy Rummy · 13 hands" }
  ])
});

export const NETWORK_BY_STATE = Object.freeze({
  healthy: Object.freeze({ label: "Online", detail: "Lobby list is current", tone: "healthy" }),
  offline: Object.freeze({ label: "Offline", detail: "Saved rules remain available", tone: "offline" }),
  "busy-six": Object.freeze({ label: "Online · turn acknowledged", detail: "Pat may choose a legal table action", tone: "healthy" })
});

export const CONCEPTS = Object.freeze({
  a: Object.freeze({ id: "a", name: "Night Timetable", summary: "A vertical departure board that makes the next decision read like a legible late-night service." }),
  b: Object.freeze({ id: "b", name: "Compartment Table", summary: "A private six-seat card compartment with the shared table at its centre and the local hand as the near rail." }),
  c: Object.freeze({ id: "c", name: "Route Atlas", summary: "A route map and station cards turn each choice into a clearly named point on the journey." })
});

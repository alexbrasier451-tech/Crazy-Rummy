import { gameScreen } from "../../src/screens/game.js";

const listeners = new Set();
let snapshot = {
  localSeatId: "a",
  preferences: {},
  view: {
    lifecycle: "IN_PROGRESS",
    revision: 7,
    seatOrder: ["a", "b"],
    seats: {
      a: { displayName: "Aster", cumulativeScore: 0 },
      b: { displayName: "Blake", cumulativeScore: 0 }
    },
    hand: {
      id: "hand-1",
      index: 1,
      wildRank: "4",
      activeSeatId: "a",
      phase: "TABLE_PLAY",
      stockCount: 42,
      discardCardIds: ["hearts:K"],
      ownHandCardIds: ["clubs:4", "clubs:5", "clubs:6", "diamonds:9"],
      handCountsBySeat: { a: 4, b: 3 },
      melds: [{
        id: "run-1",
        type: "RUN",
        originatingSeatId: "b",
        slots: [
          { slotId: "run-1:1", cardId: "clubs:7", represented: { rank: "7", suit: "clubs" } },
          { slotId: "run-1:2", cardId: "clubs:8", represented: { rank: "8", suit: "clubs" } },
          { slotId: "run-1:3", cardId: "clubs:9", represented: { rank: "9", suit: "clubs" } }
        ]
      }]
    }
  }
};

const session = {
  getSnapshot: () => structuredClone(snapshot),
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  execute: async () => ({ accepted: false, reason: "TEST_ONLY" })
};

const router = { addBackLayer: () => () => {} };
document.querySelector("#app").append(gameScreen({
  navigate(path) { document.querySelector("#app").dataset.navigation = path; },
  router,
  localSession: { getSnapshot: () => ({ preferences: {} }) },
  onlineGameSession: session
}));

globalThis.gameFlowHarness = Object.freeze({
  setNetwork(state) {
    snapshot = structuredClone(snapshot);
    snapshot.network = { state, recoveryDeadline: Date.now() + 120_000, pendingCommandIds: [] };
    for (const listener of listeners) listener();
  },
  passTurnToBlake() {
    snapshot = structuredClone(snapshot);
    snapshot.view.revision += 1;
    snapshot.view.hand.activeSeatId = "b";
    for (const listener of listeners) listener();
  }
});

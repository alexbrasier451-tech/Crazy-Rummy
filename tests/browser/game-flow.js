import { gameScreen } from "../../src/screens/game.js";
import { validateMeld } from "../../src/engine/index.js";

const listeners = new Set();
let commandOrdinal = 0;
let pendingAction = null;
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
      ownHandCardIds: [
        "clubs:4",
        "diamonds:4",
        "clubs:5",
        "clubs:6",
        "clubs:8",
        "clubs:J",
        "diamonds:9"
      ],
      handCountsBySeat: { a: 7, b: 3 },
      melds: [{
        id: "run-1",
        type: "RUN",
        originatingSeatId: "b",
        slots: [
          { slotId: "run-1:1", cardId: "clubs:7", represented: { rank: "7", suit: "clubs" } },
          { slotId: "run-1:2", cardId: "hearts:4", represented: { rank: "8", suit: "clubs" } },
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
  submit(type, payload) {
    const commandId = `game-flow:${++commandOrdinal}`;
    pendingAction = { commandId, type, payload: structuredClone(payload) };
    snapshot = structuredClone(snapshot);
    snapshot.lastAction = { commandId, phase: "PENDING" };
    snapshot.network = {
      state: "RUNNING",
      pendingCommandIds: [commandId]
    };
    for (const listener of listeners) listener();
    return { queued: true, commandId };
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
  projectPendingAction() {
    if (!pendingAction) return false;
    if (pendingAction.projected) return true;
    snapshot = structuredClone(snapshot);
    if (pendingAction.type === "LAY_OFF") {
      const target = snapshot.view.hand.melds.find((meld) =>
        meld.id === pendingAction.payload.meldId
      );
      const added = structuredClone(pendingAction.payload.slots ?? []);
      if (target) {
        target.slots = pendingAction.payload.placement === "START"
          ? [...added, ...target.slots]
          : [...target.slots, ...added];
      }
      const laidOffIds = new Set(added.map((slot) => slot.cardId));
      snapshot.view.hand.ownHandCardIds = snapshot.view.hand.ownHandCardIds
        .filter((cardId) => !laidOffIds.has(cardId));
    } else if (pendingAction.type === "REPLACE_WILD") {
      const target = snapshot.view.hand.melds.find((meld) =>
        meld.id === pendingAction.payload.meldId
      );
      const slot = target?.slots.find((candidate) =>
        candidate.cardId === pendingAction.payload.wildCardId
      );
      if (slot) slot.cardId = pendingAction.payload.naturalCardId;
      snapshot.view.hand.ownHandCardIds = snapshot.view.hand.ownHandCardIds
        .filter((cardId) => cardId !== pendingAction.payload.naturalCardId);
      if (!snapshot.view.hand.ownHandCardIds.includes(pendingAction.payload.wildCardId)) {
        snapshot.view.hand.ownHandCardIds.push(pendingAction.payload.wildCardId);
      }
    } else if (pendingAction.type === "DRAW_STOCK") {
      snapshot.view.hand.ownHandCardIds.push("diamonds:2");
      snapshot.view.hand.handCountsBySeat.a += 1;
      snapshot.view.hand.stockCount -= 1;
      snapshot.view.hand.phase = "TABLE_PLAY";
    } else if (pendingAction.type === "DRAW_DISCARD") {
      const drawnCardId = snapshot.view.hand.discardCardIds.pop();
      if (drawnCardId) {
        snapshot.view.hand.ownHandCardIds.push(drawnCardId);
        snapshot.view.hand.handCountsBySeat.a += 1;
      }
      snapshot.view.hand.phase = "TABLE_PLAY";
    } else if (pendingAction.type === "CREATE_MELD") {
      const checked = validateMeld(pendingAction.payload.meld, {
        wildRank: snapshot.view.hand.wildRank
      });
      if (!checked.ok) return false;
      snapshot.view.hand.melds.push(structuredClone(checked.meld));
      const meldCardIds = new Set(checked.meld.slots.map((slot) => slot.cardId));
      snapshot.view.hand.ownHandCardIds = snapshot.view.hand.ownHandCardIds
        .filter((cardId) => !meldCardIds.has(cardId));
      snapshot.view.hand.handCountsBySeat.a -= meldCardIds.size;
    }
    snapshot.view.revision += 1;
    pendingAction.projected = true;
    for (const listener of listeners) listener();
    return true;
  },
  acceptPendingAction() {
    if (!pendingAction) return false;
    if (!pendingAction.projected) {
      this.projectPendingAction();
    }
    snapshot = structuredClone(snapshot);
    snapshot.lastAction = {
      commandId: pendingAction.commandId,
      phase: "ACCEPTED",
      accepted: true,
      authoritativeSequence: snapshot.view.revision
    };
    snapshot.network = {
      state: "RUNNING",
      pendingCommandIds: []
    };
    pendingAction = null;
    for (const listener of listeners) listener();
    return true;
  },
  pendingAction() {
    return structuredClone(pendingAction);
  },
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
  },
  passDrawTurnToAster() {
    snapshot = structuredClone(snapshot);
    snapshot.view.revision += 1;
    snapshot.view.hand.activeSeatId = "a";
    snapshot.view.hand.phase = "AWAITING_DRAW";
    snapshot.view.hand.turnNumber = (snapshot.view.hand.turnNumber ?? 1) + 1;
    for (const listener of listeners) listener();
  },
  notify() {
    for (const listener of listeners) listener();
  }
});

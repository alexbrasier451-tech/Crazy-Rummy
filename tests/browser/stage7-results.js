import { createCompletedMatchSummary } from "../../src/local/completed-summary.js";
import { finalResultScreen, handResultScreen } from "../../src/screens/results.js";

const app = document.querySelector("#app");
const rules = {
  rulesVersion: "stage-7-browser",
  handCount: 13,
  handSchedule: Array.from({ length: 13 }, (_, offset) => ({
    index: offset + 1,
    wildRank: String(offset + 1),
    label: `Rank ${offset + 1}`
  }))
};
const seats = {
  a: { displayName: "Alex", cumulativeScore: 18, status: "ACTIVE" },
  b: { displayName: "Blair", cumulativeScore: 24, status: "ACTIVE" },
  c: { displayName: "Casey", cumulativeScore: 31, status: "ACTIVE" }
};
const scoreEntriesBySeat = {
  a: { total: 0 },
  b: { total: 2 },
  c: { total: 3 }
};
const completedHands = Array.from({ length: 13 }, (_, offset) => ({
  index: offset + 1,
  wildRank: String(offset + 1),
  dealerSeatId: ["a", "b", "c"][offset % 3],
  participantSeatIds: ["a", "b", "c"],
  result: {
    reason: "WENT_OUT",
    winnerSeatId: "a",
    scoreEntriesBySeat
  }
}));
const completeView = {
  lifecycle: "COMPLETE",
  gameId: "stage-7-complete",
  revision: 240,
  rules,
  seatOrder: ["a", "b", "c"],
  activeSeatOrder: ["a", "b", "c"],
  seats,
  winners: ["a"],
  completedHands,
  completion: null,
  hand: { index: 13 }
};
const retainedOnlineSummary = createCompletedMatchSummary(completeView, { mode: "ONLINE" });
const unrelatedLocalCompletion = {
  ...completeView,
  gameId: "unrelated-local-completion",
  seats: {
    ...seats,
    a: { ...seats.a, displayName: "Wrong local result" }
  }
};

let handSnapshot;
let handListeners = new Set();
let replayCalls = 0;
let replayResolve;
let copiedText = "";
const localSession = {
  getSnapshot() {
    return {
      view: unrelatedLocalCompletion,
      preferences: {
        motion: "Reduced",
        haptics: false
      }
    };
  }
};
const onlineGameSession = {
  getSnapshot() {
    return handSnapshot;
  },
  subscribe(listener) {
    handListeners.add(listener);
    return () => handListeners.delete(listener);
  },
  async submit() {
    return { queued: true, commandId: "ack-stage-7" };
  }
};

function replace(screen) {
  app.firstElementChild?.disposeScreen?.();
  app.replaceChildren(screen);
}

function renderHand() {
  handListeners = new Set();
  handSnapshot = {
    localSeatId: "b",
    lastAction: null,
    view: {
      lifecycle: "IN_PROGRESS",
      rules,
      seatOrder: ["a", "b", "c"],
      activeSeatOrder: ["a", "b", "c"],
      seats,
      completedHands: [completedHands[0]],
      hand: {
        index: 1,
        dealerSeatId: "a",
        phase: "HAND_COMPLETE",
        result: {
          reason: "WENT_OUT",
          winnerSeatId: "a",
          scoreEntriesBySeat,
          acknowledgedBySeatIds: [],
          ownScoreEntry: {
            total: 2,
            cards: [{ cardId: "hearts:2", value: 2 }]
          }
        }
      }
    }
  };
  replace(handResultScreen({
    navigate(path) { globalThis.__stage7Results.lastNavigation = path; },
    localSession,
    onlineGameSession
  }));
}

function acceptAcknowledgement() {
  handSnapshot = {
    ...handSnapshot,
    lastAction: { phase: "ACCEPTED", commandId: "ack-stage-7" },
    view: {
      ...handSnapshot.view,
      hand: {
        ...handSnapshot.view.hand,
        result: {
          ...handSnapshot.view.hand.result,
          acknowledgedBySeatIds: ["b"]
        }
      }
    }
  };
  for (const listener of handListeners) listener(handSnapshot);
}

function renderStoredFinal() {
  replayResolve = null;
  replace(finalResultScreen({
    navigate(path) { globalThis.__stage7Results.lastNavigation = path; },
    localSession,
    completedSummary: retainedOnlineSummary,
    onCopyResultSummary(text) { copiedText = text; },
    onStartNewMatch() {
      replayCalls += 1;
      return new Promise((resolve) => { replayResolve = resolve; });
    }
  }));
}

function renderForfeit() {
  const view = {
    ...completeView,
    gameId: "stage-7-forfeit",
    revision: 7,
    activeSeatOrder: ["a"],
    seats: {
      ...seats,
      b: { ...seats.b, status: "DROPPED" },
      c: { ...seats.c, status: "DROPPED" }
    },
    completedHands: [],
    winners: ["a"],
    completion: {
      reason: "FORFEIT",
      winnerSeatId: "a",
      droppedSeatIds: ["b", "c"]
    },
    hand: { index: 1 }
  };
  replace(finalResultScreen({
    navigate(path) { globalThis.__stage7Results.lastNavigation = path; },
    localSession,
    completedSummary: createCompletedMatchSummary(view, { mode: "ONLINE" }),
    onStartNewMatch() {}
  }));
}

globalThis.__stage7Results = {
  renderHand,
  acceptAcknowledgement,
  renderStoredFinal,
  renderForfeit,
  resolveReplay() { replayResolve?.(); },
  replayCalls() { return replayCalls; },
  copiedText() { return copiedText; },
  lastNavigation: null
};

renderHand();

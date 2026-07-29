import assert from "node:assert/strict";
import test from "node:test";

import {
  completedSummaryView,
  completionPresentation,
  copySafeResultSummary,
  finalStandingRows,
  handHistoryRows,
  handScoreRows,
  nextHandPreview,
  ownScoreBreakdown
} from "../../src/game-ui/results-presenters.js";

function view(overrides = {}) {
  return {
    lifecycle: "IN_PROGRESS",
    rules: {
      handCount: 13,
      handSchedule: [
        { index: 4, wildRank: "4", label: "Fours" },
        { index: 5, wildRank: "5", label: "Fives" }
      ]
    },
    seatOrder: ["a", "b", "c"],
    activeSeatOrder: ["a", "c"],
    seats: {
      a: { displayName: "Alex", cumulativeScore: 42, status: "ACTIVE" },
      b: { displayName: "Blair", cumulativeScore: 18, status: "DROPPED" },
      c: { displayName: "Casey", cumulativeScore: 42, status: "ACTIVE" }
    },
    hand: {
      index: 4,
      dealerSeatId: "a",
      result: {
        reason: "WENT_OUT",
        winnerSeatId: "a",
        scoreEntriesBySeat: {
          a: { total: 0 },
          b: { total: 18 },
          c: { total: 7 }
        },
        ownScoreEntry: {
          total: 7,
          cards: [{ cardId: "hearts:5", value: 7 }]
        }
      }
    },
    completedHands: [{
      index: 4,
      wildRank: "4",
      dealerSeatId: "a",
      participantSeatIds: ["a", "b", "c"],
      result: {
        reason: "WENT_OUT",
        winnerSeatId: "a",
        scoreEntriesBySeat: {
          a: { total: 0 },
          b: { total: 18 },
          c: { total: 7 }
        }
      }
    }],
    winners: [],
    completion: null,
    ...overrides
  };
}

test("hand rows retain scored dropped seats without manufacturing a zero", () => {
  const state = view();
  assert.deepEqual(handScoreRows(state, state.hand.result).map((row) => [row.id, row.hand, row.state]), [
    ["a", 0, null],
    ["b", 18, "Dropped"],
    ["c", 7, null]
  ]);
  assert.deepEqual(finalStandingRows(state).map((row) => row.id), ["a", "c"]);
});

test("next-hand preview advances clockwise across active seats and schedule", () => {
  assert.deepEqual(nextHandPreview(view()), {
    handIndex: 5,
    wildRank: "5",
    wildLabel: "Fives",
    dealerSeatId: "c"
  });
  assert.equal(nextHandPreview(view({ hand: { index: 13, result: {} } })), null);
});

test("own score detail accepts only the explicitly projected authenticated entry", () => {
  assert.deepEqual(ownScoreBreakdown(view().hand.result), {
    total: 7,
    cards: [{ cardId: "hearts:5", value: 7 }]
  });
  assert.equal(ownScoreBreakdown({ scoreEntriesBySeat: { a: { cards: [{ cardId: "secret", value: 1 }] } } }), null);
});

test("history keeps every public penalty and completion variants are truthful", () => {
  const normal = view({
    lifecycle: "COMPLETE",
    winners: ["a", "c"],
    completion: null
  });
  assert.deepEqual(handHistoryRows(normal)[0].scores.map((row) => [row.name, row.hand]), [
    ["Alex", 0], ["Blair", 18], ["Casey", 7]
  ]);
  assert.deepEqual(completionPresentation(normal), {
    kind: "normal",
    context: "Journey complete",
    title: "Alex and Casey tie",
    status: "Journey complete · final standings."
  });
  const forfeit = view({
    lifecycle: "COMPLETE",
    activeSeatOrder: ["a"],
    winners: ["a"],
    completion: { reason: "FORFEIT", winnerSeatId: "a", droppedSeatIds: ["b", "c"] }
  });
  assert.deepEqual(completionPresentation(forfeit), {
    kind: "forfeit",
    context: "Match ended",
    title: "Alex wins by forfeit",
    status: "Match ended by forfeit. Only accepted hand results are shown."
  });
});

test("copy-safe result text is deterministic and excludes private card identities", () => {
  const state = view({ lifecycle: "COMPLETE", winners: ["a", "c"] });
  const summary = copySafeResultSummary(state);
  assert.match(summary, /Alex and Casey tie/);
  assert.match(summary, /Blair: \+18/);
  assert.equal(summary.includes("hearts:5"), false);
  assert.equal(summary.includes("ownScoreEntry"), false);
  assert.equal(copySafeResultSummary(state), summary);
});

test("a retained public summary rehydrates only the final-result presenter shape", () => {
  const restored = completedSummaryView({
    mode: "ONLINE",
    rules: { handCount: 13 },
    seats: [
      { seatId: "a", displayName: "Alex", cumulativeScore: 0, status: "ACTIVE" },
      { seatId: "b", displayName: "Blair", cumulativeScore: 18, status: "DROPPED" }
    ],
    activeSeatOrder: ["a"],
    winners: ["a"],
    completedHands: [],
    completion: {
      reason: "FORFEIT",
      winnerSeatId: "a",
      droppedSeatIds: ["b"],
      duringHandIndex: 1
    },
    roomSecret: "never-project-this"
  });
  assert.equal(restored.lifecycle, "COMPLETE");
  assert.equal(restored.hand.index, 1);
  assert.deepEqual(restored.activeSeatOrder, ["a"]);
  assert.equal(JSON.stringify(restored).includes("roomSecret"), false);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  createCompletedMatchSummary
} from "../../src/local/completed-summary.js";
import {
  PLAYER_STATISTICS_STORAGE_PREFIX,
  applyPlayerStatisticsEvent,
  createPlayerStatisticsStorage,
  derivePlayerStatisticsDelta
} from "../../src/local/player-statistics.js";
import { createMemoryStorage } from "../../src/local/index.js";

function completedSummary({
  gameId = "stats-game",
  scoreA = 38,
  scoreB = 54,
  winners = ["a"],
  mode = "LOCAL",
  completion = null
} = {}) {
  const hands = completion ? [] : [
    {
      index: 1,
      wildRank: "A",
      dealerSeatId: "a",
      participantSeatIds: ["a", "b"],
      result: {
        reason: "WENT_OUT",
        winnerSeatId: "a",
        scoreEntriesBySeat: { a: { total: 0 }, b: { total: 24 } }
      }
    },
    {
      index: 2,
      wildRank: "2",
      dealerSeatId: "b",
      participantSeatIds: ["a", "b"],
      result: {
        reason: "STOCK_EXHAUSTED",
        winnerSeatId: null,
        scoreEntriesBySeat: { a: { total: 9 }, b: { total: 12 } }
      }
    }
  ];
  return createCompletedMatchSummary({
    lifecycle: "COMPLETE",
    gameId,
    revision: 42,
    rules: { rulesVersion: "stats-rules", handCount: 2 },
    seatOrder: ["a", "b"],
    activeSeatOrder: completion ? ["a"] : ["a", "b"],
    seats: {
      a: { displayName: "Alex", cumulativeScore: scoreA, status: "ACTIVE" },
      b: {
        displayName: "Blair",
        cumulativeScore: scoreB,
        status: completion ? "DROPPED" : "ACTIVE"
      }
    },
    winners,
    completedHands: hands,
    completion,
    hand: completion ? { index: 1 } : { index: 2 }
  }, { mode });
}

test("normal completions derive player-only wins, hands, and score statistics", () => {
  const summary = completedSummary({ winners: ["a", "b"], scoreA: 38 });
  assert.deepEqual(derivePlayerStatisticsDelta(summary, { localSeatId: "a" }), {
    matchesRecorded: 1,
    matchesFinished: 1,
    matchesEndedEarly: 0,
    matchWins: 1,
    jointWins: 1,
    forfeitWins: 0,
    handsPlayed: 2,
    handsWon: 1,
    stockExhaustedHands: 1,
    scoredMatches: 1,
    totalFinalScore: 38,
    bestFinalTotal: 38,
    mode: "LOCAL"
  });
  assert.equal(derivePlayerStatisticsDelta(summary, { localSeatId: "missing" }), null);
});

test("statistics events are idempotent and retain the lowest completed final total", () => {
  const first = applyPlayerStatisticsEvent(null, {
    eventId: "local:one:42",
    summary: completedSummary({ scoreA: 38 }),
    localSeatId: "a"
  });
  assert.equal(first.applied, true);
  assert.equal(first.statistics.matchesRecorded, 1);
  assert.equal(first.statistics.matchWins, 1);
  assert.equal(first.statistics.bestFinalTotal, 38);

  const duplicate = applyPlayerStatisticsEvent(first.statistics, {
    eventId: "local:one:42",
    summary: completedSummary({ scoreA: 38 }),
    localSeatId: "a"
  });
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.reason, "ALREADY_RECORDED");
  assert.deepEqual(duplicate.statistics, first.statistics);

  const second = applyPlayerStatisticsEvent(first.statistics, {
    eventId: "local:two:42",
    summary: completedSummary({ gameId: "same-public-game-id", scoreA: 31 }),
    localSeatId: "a"
  });
  assert.equal(second.statistics.matchesRecorded, 2);
  assert.equal(second.statistics.bestFinalTotal, 31);
  assert.deepEqual(second.statistics.matchesByMode, { LOCAL: 2, ONLINE: 0 });
});

test("forfeits are recorded separately and never distort final-score statistics", () => {
  const summary = completedSummary({
    mode: "ONLINE",
    completion: {
      reason: "FORFEIT",
      winnerSeatId: "a",
      droppedSeatIds: ["b"],
      duringHandIndex: 1
    }
  });
  const result = applyPlayerStatisticsEvent(null, {
    eventId: "online:forfeit:9",
    summary,
    localSeatId: "a"
  });
  assert.equal(result.statistics.matchesRecorded, 1);
  assert.equal(result.statistics.matchesFinished, 0);
  assert.equal(result.statistics.matchesEndedEarly, 1);
  assert.equal(result.statistics.forfeitWins, 1);
  assert.equal(result.statistics.scoredMatches, 0);
  assert.equal(result.statistics.bestFinalTotal, null);
  assert.deepEqual(result.statistics.matchesByMode, { LOCAL: 0, ONLINE: 1 });
});

test("versioned per-player storage partitions profiles, excludes private data, and clears only statistics", () => {
  const storage = createMemoryStorage({ unrelated: "keep-me" });
  const statistics = createPlayerStatisticsStorage({ storage });
  const summary = completedSummary();
  const alex = statistics.recordCompletedSummary({
    playerId: "player/alex",
    localSeatId: "a",
    eventId: "local:alex:42",
    summary
  });
  const blair = statistics.recordCompletedSummary({
    playerId: "player/blair",
    localSeatId: "b",
    eventId: "local:blair:42",
    summary
  });
  assert.equal(alex.applied, true);
  assert.equal(blair.applied, true);
  assert.equal(statistics.read("player/alex").matchWins, 1);
  assert.equal(statistics.read("player/blair").matchWins, 0);

  const stored = [...Array(storage.length).keys()]
    .map((index) => storage.key(index))
    .filter((key) => key.startsWith(PLAYER_STATISTICS_STORAGE_PREFIX))
    .map((key) => storage.getItem(key))
    .join(" ");
  for (const privateValue of ["Alex", "Blair", "cardId", "roomSecret", "seatSecret"]) {
    assert.equal(stored.includes(privateValue), false);
  }

  statistics.clearAll();
  assert.equal(statistics.read("player/alex"), null);
  assert.equal(statistics.read("player/blair"), null);
  assert.equal(storage.getItem("unrelated"), "keep-me");
});

test("corrupt records and unavailable storage fail closed without blocking gameplay", () => {
  const storage = createMemoryStorage();
  const statistics = createPlayerStatisticsStorage({ storage });
  const key = `${PLAYER_STATISTICS_STORAGE_PREFIX}${encodeURIComponent("alex")}`;
  storage.setItem(key, JSON.stringify({ statisticsVersion: 99 }));
  assert.equal(statistics.read("alex"), null);

  const unavailable = createPlayerStatisticsStorage({ storage: {} });
  const result = unavailable.recordCompletedSummary({
    playerId: "alex",
    localSeatId: "a",
    eventId: "local:unavailable:42",
    summary: completedSummary()
  });
  assert.equal(result.applied, false);
  assert.equal(result.reason, "STORAGE_UNAVAILABLE");
});

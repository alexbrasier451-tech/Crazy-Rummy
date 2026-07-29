import { validateCompletedMatchSummary } from "./completed-summary.js";

export const PLAYER_STATISTICS_VERSION = 1;
export const PLAYER_STATISTICS_STORAGE_PREFIX = "crazy-rummy.stats.v1.";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function integer(value) {
  return Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (isRecord(value)) Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function copy(value) {
  return value == null ? value : structuredClone(value);
}

function emptyStatistics() {
  return {
    statisticsVersion: PLAYER_STATISTICS_VERSION,
    matchesRecorded: 0,
    matchesFinished: 0,
    matchesEndedEarly: 0,
    matchWins: 0,
    jointWins: 0,
    forfeitWins: 0,
    handsPlayed: 0,
    handsWon: 0,
    stockExhaustedHands: 0,
    scoredMatches: 0,
    totalFinalScore: 0,
    bestFinalTotal: null,
    matchesByMode: { LOCAL: 0, ONLINE: 0 },
    appliedEventIds: []
  };
}

function validateStatistics(value) {
  if (!isRecord(value) || value.statisticsVersion !== PLAYER_STATISTICS_VERSION) return null;
  const counters = [
    "matchesRecorded",
    "matchesFinished",
    "matchesEndedEarly",
    "matchWins",
    "jointWins",
    "forfeitWins",
    "handsPlayed",
    "handsWon",
    "stockExhaustedHands",
    "scoredMatches",
    "totalFinalScore"
  ];
  if (!counters.every((key) => integer(value[key]))) return null;
  if (
    value.matchesRecorded !== value.matchesFinished + value.matchesEndedEarly
    || value.jointWins > value.matchWins
    || value.matchWins > value.matchesFinished
    || value.forfeitWins > value.matchesEndedEarly
    || value.handsWon > value.handsPlayed
    || value.stockExhaustedHands > value.handsPlayed
    || value.scoredMatches > value.matchesFinished
  ) return null;
  if (
    value.bestFinalTotal !== null
    && (!Number.isFinite(value.bestFinalTotal) || value.bestFinalTotal < 0)
  ) return null;
  if (
    !isRecord(value.matchesByMode)
    || !integer(value.matchesByMode.LOCAL)
    || !integer(value.matchesByMode.ONLINE)
    || value.matchesByMode.LOCAL + value.matchesByMode.ONLINE !== value.matchesRecorded
  ) return null;
  if (
    !Array.isArray(value.appliedEventIds)
    || new Set(value.appliedEventIds).size !== value.appliedEventIds.length
    || !value.appliedEventIds.every((id) => typeof id === "string" && id.length > 0)
  ) return null;
  return freeze(copy(value));
}

function defaultStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function keyFor(playerId, prefix = PLAYER_STATISTICS_STORAGE_PREFIX) {
  return `${prefix}${encodeURIComponent(playerId)}`;
}

export function derivePlayerStatisticsDelta(summary, { localSeatId } = {}) {
  const valid = validateCompletedMatchSummary(summary);
  if (!valid || typeof localSeatId !== "string" || !localSeatId) return null;
  const seat = valid.seats.find((candidate) => candidate.seatId === localSeatId);
  if (!seat) return null;

  const normal = valid.completion === null;
  const winner = valid.winners.includes(localSeatId);
  const participatingHands = valid.completedHands.filter((hand) =>
    hand.participantSeatIds.includes(localSeatId)
  );
  const scored = normal && seat.status !== "DROPPED";
  const mode = valid.mode === "ONLINE" ? "ONLINE" : "LOCAL";
  return freeze({
    matchesRecorded: 1,
    matchesFinished: normal ? 1 : 0,
    matchesEndedEarly: normal ? 0 : 1,
    matchWins: normal && winner ? 1 : 0,
    jointWins: normal && winner && valid.winners.length > 1 ? 1 : 0,
    forfeitWins: !normal && winner ? 1 : 0,
    handsPlayed: participatingHands.length,
    handsWon: participatingHands.filter((hand) => hand.result.winnerSeatId === localSeatId).length,
    stockExhaustedHands: participatingHands.filter((hand) => hand.result.reason === "STOCK_EXHAUSTED").length,
    scoredMatches: scored ? 1 : 0,
    totalFinalScore: scored ? seat.cumulativeScore : 0,
    bestFinalTotal: scored ? seat.cumulativeScore : null,
    mode
  });
}

export function applyPlayerStatisticsEvent(current, {
  eventId,
  summary,
  localSeatId
} = {}) {
  if (typeof eventId !== "string" || !eventId) {
    return freeze({ applied: false, reason: "INVALID_EVENT_ID", statistics: null });
  }
  const previous = current == null ? freeze(emptyStatistics()) : validateStatistics(current);
  if (!previous) {
    return freeze({ applied: false, reason: "INVALID_STATISTICS", statistics: null });
  }
  if (previous.appliedEventIds.includes(eventId)) {
    return freeze({ applied: false, reason: "ALREADY_RECORDED", statistics: previous });
  }
  const delta = derivePlayerStatisticsDelta(summary, { localSeatId });
  if (!delta) {
    return freeze({ applied: false, reason: "INVALID_COMPLETION", statistics: previous });
  }
  const next = {
    ...copy(previous),
    matchesRecorded: previous.matchesRecorded + delta.matchesRecorded,
    matchesFinished: previous.matchesFinished + delta.matchesFinished,
    matchesEndedEarly: previous.matchesEndedEarly + delta.matchesEndedEarly,
    matchWins: previous.matchWins + delta.matchWins,
    jointWins: previous.jointWins + delta.jointWins,
    forfeitWins: previous.forfeitWins + delta.forfeitWins,
    handsPlayed: previous.handsPlayed + delta.handsPlayed,
    handsWon: previous.handsWon + delta.handsWon,
    stockExhaustedHands: previous.stockExhaustedHands + delta.stockExhaustedHands,
    scoredMatches: previous.scoredMatches + delta.scoredMatches,
    totalFinalScore: previous.totalFinalScore + delta.totalFinalScore,
    bestFinalTotal: delta.bestFinalTotal === null
      ? previous.bestFinalTotal
      : previous.bestFinalTotal === null
      ? delta.bestFinalTotal
      : Math.min(previous.bestFinalTotal, delta.bestFinalTotal),
    matchesByMode: {
      ...previous.matchesByMode,
      [delta.mode]: previous.matchesByMode[delta.mode] + 1
    },
    appliedEventIds: [...previous.appliedEventIds, eventId]
  };
  return freeze({ applied: true, reason: null, statistics: validateStatistics(next) });
}

export function createPlayerStatisticsStorage({
  storage,
  prefix = PLAYER_STATISTICS_STORAGE_PREFIX
} = {}) {
  const target = defaultStorage(storage);

  function read(playerId) {
    if (typeof playerId !== "string" || !playerId) return null;
    try {
      const value = JSON.parse(target?.getItem?.(keyFor(playerId, prefix)) ?? "null");
      return validateStatistics(value);
    } catch {
      return null;
    }
  }

  function recordCompletedSummary({
    playerId,
    localSeatId,
    eventId,
    summary
  } = {}) {
    if (typeof playerId !== "string" || !playerId) {
      return freeze({ applied: false, reason: "INVALID_PLAYER_ID", statistics: null });
    }
    const result = applyPlayerStatisticsEvent(read(playerId), {
      eventId,
      summary,
      localSeatId
    });
    if (!result.applied) return result;
    if (typeof target?.setItem !== "function") {
      return freeze({ applied: false, reason: "STORAGE_UNAVAILABLE", statistics: read(playerId) });
    }
    try {
      target.setItem(keyFor(playerId, prefix), JSON.stringify(result.statistics));
      return result;
    } catch (error) {
      return freeze({
        applied: false,
        reason: error instanceof Error ? error.message : String(error),
        statistics: read(playerId)
      });
    }
  }

  function clearAll() {
    try {
      if (typeof target?.key !== "function" || !Number.isInteger(target.length)) return;
      const keys = [];
      for (let index = 0; index < target.length; index += 1) {
        const key = target.key(index);
        if (typeof key === "string" && key.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => target.removeItem?.(key));
    } catch {
      // Statistics are optional and must never block device-data clearing.
    }
  }

  return Object.freeze({ read, recordCompletedSummary, clearAll });
}

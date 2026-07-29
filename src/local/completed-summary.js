/**
 * A completed-match record is deliberately a small public projection. It is
 * separate from recoverable match state, which can contain private cards and
 * resume credentials and must be removed when a match ends.
 */
export const COMPLETED_SUMMARY_VERSION = 1;
export const COMPLETED_SUMMARY_STORAGE_VERSION = 1;
export const COMPLETED_SUMMARY_STORAGE_KEY = "crazy-rummy.local.v1.completed-summary";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (isRecord(value)) Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function integer(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function copyRules(rules) {
  if (!isRecord(rules) || !nonEmptyString(rules.rulesVersion) || !integer(rules.handCount, { minimum: 1, maximum: 13 })) {
    return null;
  }
  return {
    rulesVersion: rules.rulesVersion,
    handCount: rules.handCount,
    ...(typeof rules.aceLowRuns === "boolean" ? { aceLowRuns: rules.aceLowRuns } : {}),
    ...(typeof rules.wildsAllowedInOpeningMeld === "boolean" ? { wildsAllowedInOpeningMeld: rules.wildsAllowedInOpeningMeld } : {}),
    ...(typeof rules.reclaimedWildMayBeHeld === "boolean" ? { reclaimedWildMayBeHeld: rules.reclaimedWildMayBeHeld } : {}),
    ...(typeof rules.stockExhaustionEndsAfterTurn === "boolean" ? { stockExhaustionEndsAfterTurn: rules.stockExhaustionEndsAfterTurn } : {}),
    ...(typeof rules.jointLowestScoreWins === "boolean" ? { jointLowestScoreWins: rules.jointLowestScoreWins } : {})
  };
}

function copySeatOrder(view) {
  if (!Array.isArray(view?.seatOrder) || view.seatOrder.length === 0 || new Set(view.seatOrder).size !== view.seatOrder.length || !view.seatOrder.every(nonEmptyString)) {
    return null;
  }
  if (!isRecord(view.seats)) return null;
  const seats = view.seatOrder.map((seatId) => {
    const seat = view.seats[seatId];
    if (!isRecord(seat) || !nonEmptyString(seat.displayName) || !Number.isFinite(seat.cumulativeScore)) return null;
    return {
      seatId,
      displayName: seat.displayName,
      cumulativeScore: seat.cumulativeScore,
      status: seat.status === "DROPPED" ? "DROPPED" : "ACTIVE"
    };
  });
  return seats.includes(null) ? null : seats;
}

function copyResult(result, seatIds, participantSeatIds = seatIds) {
  if (!isRecord(result) || !nonEmptyString(result.reason) || !isRecord(result.scoreEntriesBySeat)) return null;
  if (result.winnerSeatId !== null && result.winnerSeatId !== undefined && !seatIds.includes(result.winnerSeatId)) return null;
  const participants = Array.isArray(participantSeatIds)
    ? participantSeatIds.filter((seatId) => seatIds.includes(seatId))
    : [];
  if (participants.length === 0 || new Set(participants).size !== participants.length) return null;
  const scores = {};
  for (const seatId of participants) {
    const source = result.scoreEntriesBySeat[seatId];
    const total = Number.isFinite(source) ? source : source?.total;
    if (!Number.isFinite(total) || total < 0) return null;
    scores[seatId] = { total };
  }
  return {
    reason: result.reason,
    winnerSeatId: result.winnerSeatId ?? null,
    scoreEntriesBySeat: scores
  };
}

function copyCompletedHands(completedHands, seatIds, handCount, forfeit) {
  if (
    !Array.isArray(completedHands)
    || completedHands.length > handCount
    || (!forfeit && completedHands.length !== handCount)
  ) return null;
  const result = [];
  for (const [offset, hand] of completedHands.entries()) {
    if (!isRecord(hand) || !integer(hand.index, { minimum: 1, maximum: handCount }) || hand.index !== offset + 1 || !nonEmptyString(hand.wildRank) || !seatIds.includes(hand.dealerSeatId)) {
      return null;
    }
    const participantSeatIds = Array.isArray(hand.participantSeatIds) && hand.participantSeatIds.length
      ? hand.participantSeatIds
      : Object.keys(hand.result?.scoreEntriesBySeat ?? {});
    const copiedResult = copyResult(hand.result, seatIds, participantSeatIds);
    if (!copiedResult) return null;
    result.push({
      index: hand.index,
      wildRank: hand.wildRank,
      dealerSeatId: hand.dealerSeatId,
      participantSeatIds: [...participantSeatIds],
      result: copiedResult
    });
  }
  return result;
}

/**
 * Create the only shape that may be written as a completed-match summary.
 * Callers supply a player/public view, never canonical state.
 */
export function createCompletedMatchSummary(view, { mode = "LOCAL" } = {}) {
  if (!isRecord(view) || view.lifecycle !== "COMPLETE" || !nonEmptyString(view.gameId) || !integer(view.revision, { minimum: 0 })) {
    return null;
  }
  const rules = copyRules(view.rules);
  const seats = copySeatOrder(view);
  if (!rules || !seats) return null;
  const seatIds = seats.map(({ seatId }) => seatId);
  if (!Array.isArray(view.winners) || view.winners.length === 0 || new Set(view.winners).size !== view.winners.length || !view.winners.every((seatId) => seatIds.includes(seatId))) {
    return null;
  }
  const completion = isRecord(view.completion) && view.completion.reason === "FORFEIT"
    ? {
        reason: "FORFEIT",
        winnerSeatId: view.completion.winnerSeatId ?? view.winners[0] ?? null,
        droppedSeatIds: Array.isArray(view.completion.droppedSeatIds)
          ? view.completion.droppedSeatIds.filter((seatId) => seatIds.includes(seatId))
          : [],
        duringHandIndex: integer(view.hand?.index, { minimum: 1, maximum: rules.handCount })
          ? view.hand.index
          : null
      }
    : null;
  const completedHands = copyCompletedHands(
    view.completedHands,
    seatIds,
    rules.handCount,
    completion?.reason === "FORFEIT"
  );
  if (!completedHands) return null;
  const activeSeatOrder = Array.isArray(view.activeSeatOrder)
    ? view.activeSeatOrder.filter((seatId) => seatIds.includes(seatId))
    : seats.filter((seat) => seat.status !== "DROPPED").map((seat) => seat.seatId);

  return freeze({
    summaryVersion: COMPLETED_SUMMARY_VERSION,
    mode: String(mode).toUpperCase() === "ONLINE" ? "ONLINE" : "LOCAL",
    gameId: view.gameId,
    revision: view.revision,
    rules,
    seats,
    activeSeatOrder,
    winners: [...view.winners],
    completedHands,
    completion
  });
}

/** Return a frozen allowlisted summary, or null for malformed/incompatible data. */
export function validateCompletedMatchSummary(value) {
  if (!isRecord(value) || value.summaryVersion !== COMPLETED_SUMMARY_VERSION) return null;
  if (!Array.isArray(value.seats)) return null;
  const summary = createCompletedMatchSummary({
    lifecycle: "COMPLETE",
    gameId: value.gameId,
    revision: value.revision,
    rules: value.rules,
    seatOrder: value.seats.map((seat) => seat?.seatId),
    seats: Object.fromEntries(value.seats.map((seat) => [seat?.seatId, seat])),
    activeSeatOrder: value.activeSeatOrder,
    winners: value.winners,
    completedHands: value.completedHands,
    completion: value.completion,
    hand: value.completion?.duringHandIndex
      ? { index: value.completion.duringHandIndex }
      : null
  }, { mode: value.mode });
  return summary;
}

function defaultStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

/** A versioned browser storage boundary for the latest safe completed summary. */
export function createCompletedSummaryStorage({
  storage,
  key = COMPLETED_SUMMARY_STORAGE_KEY,
  storageVersion = COMPLETED_SUMMARY_STORAGE_VERSION
} = {}) {
  const target = defaultStorage(storage);
  return Object.freeze({
    read() {
      try {
        const record = JSON.parse(target?.getItem?.(key) ?? "null");
        return record?.version === storageVersion
          ? validateCompletedMatchSummary(record.value)
          : null;
      } catch {
        return null;
      }
    },
    write(summary) {
      const valid = validateCompletedMatchSummary(summary);
      if (!valid) return "Completed-match summary is invalid.";
      try {
        target?.setItem?.(key, JSON.stringify({ version: storageVersion, value: valid }));
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    remove() {
      try { target?.removeItem?.(key); } catch {}
    }
  });
}

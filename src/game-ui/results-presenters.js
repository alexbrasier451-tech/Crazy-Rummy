function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function orderedActiveSeatIds(view) {
  const active = Array.isArray(view?.activeSeatOrder) && view.activeSeatOrder.length
    ? view.activeSeatOrder
    : (Array.isArray(view?.seatOrder) ? view.seatOrder : []);
  return [...active];
}

function displayName(view, seatId, nameForSeat) {
  return nameForSeat?.(seatId)
    ?? view?.seats?.[seatId]?.displayName
    ?? seatId
    ?? "A player";
}

function scoreEntryRows(view, result, nameForSeat) {
  if (!isRecord(result?.scoreEntriesBySeat)) return [];
  const entries = result.scoreEntriesBySeat;
  const preferredOrder = Array.isArray(result?.participantSeatIds) && result.participantSeatIds.length
    ? result.participantSeatIds
    : (Array.isArray(view?.seatOrder) ? view.seatOrder : Object.keys(entries));
  const seatIds = [
    ...preferredOrder.filter((seatId) => Object.hasOwn(entries, seatId)),
    ...Object.keys(entries).filter((seatId) => !preferredOrder.includes(seatId))
  ];
  return seatIds.map((seatId) => ({
    id: seatId,
    name: displayName(view, seatId, nameForSeat),
    hand: Number.isFinite(entries[seatId]?.total) ? entries[seatId].total : 0,
    total: Number.isFinite(view?.seats?.[seatId]?.cumulativeScore)
      ? view.seats[seatId].cumulativeScore
      : 0,
    state: view?.seats?.[seatId]?.status === "DROPPED" ? "Dropped" : null
  }));
}

/**
 * Rehydrate the public-only completed-summary allowlist into the smaller view
 * shape consumed by final-result presenters. No private hand data is invented.
 */
export function completedSummaryView(summary) {
  if (
    !isRecord(summary)
    || !Array.isArray(summary.seats)
    || !Array.isArray(summary.completedHands)
    || !Array.isArray(summary.winners)
    || !isRecord(summary.rules)
  ) return null;
  const seatOrder = summary.seats.map((seat) => seat?.seatId);
  if (seatOrder.some((seatId) => typeof seatId !== "string")) return null;
  const seats = Object.fromEntries(summary.seats.map((seat) => [seat.seatId, {
    displayName: seat.displayName,
    cumulativeScore: seat.cumulativeScore,
    status: seat.status
  }]));
  const duringHandIndex = summary.completion?.duringHandIndex;
  return {
    lifecycle: "COMPLETE",
    rules: summary.rules,
    seatOrder,
    seats,
    activeSeatOrder: Array.isArray(summary.activeSeatOrder)
      ? [...summary.activeSeatOrder]
      : seatOrder.filter((seatId) => seats[seatId]?.status !== "DROPPED"),
    winners: [...summary.winners],
    completedHands: summary.completedHands,
    completion: summary.completion ?? null,
    hand: {
      index: Number.isInteger(duringHandIndex)
        ? duringHandIndex
        : summary.rules.handCount
    }
  };
}

/** Public, result-scoped rows never invent a score for a dropped/nonparticipant seat. */
export function handScoreRows(view, result, nameForSeat) {
  return scoreEntryRows(view, result, nameForSeat);
}

/** Final rankings are limited to winner-eligible active seats. */
export function finalStandingRows(view, nameForSeat) {
  const winners = new Set(Array.isArray(view?.winners) ? view.winners : []);
  return orderedActiveSeatIds(view)
    .map((seatId) => ({
      id: seatId,
      name: displayName(view, seatId, nameForSeat),
      total: Number.isFinite(view?.seats?.[seatId]?.cumulativeScore)
        ? view.seats[seatId].cumulativeScore
        : 0,
      state: winners.has(seatId) ? "Winner" : null
    }))
    .sort((left, right) => left.total - right.total || left.name.localeCompare(right.name));
}

/** The next dealer follows original clockwise order while skipping dropped seats. */
export function nextHandPreview(view) {
  const hand = view?.hand;
  const handCount = view?.rules?.handCount;
  if (!isRecord(hand?.result) || !Number.isInteger(hand?.index) || hand.index >= handCount) return null;
  const schedule = Array.isArray(view?.rules?.handSchedule) ? view.rules.handSchedule : [];
  const nextIndex = hand.index + 1;
  const nextSchedule = schedule.find((entry) => entry?.index === nextIndex);
  const seatOrder = Array.isArray(view?.seatOrder) ? view.seatOrder : [];
  const active = new Set(orderedActiveSeatIds(view));
  const dealerIndex = seatOrder.indexOf(hand.dealerSeatId);
  let dealerSeatId = null;
  if (dealerIndex >= 0 && active.size) {
    for (let offset = 1; offset <= seatOrder.length; offset += 1) {
      const candidate = seatOrder[(dealerIndex + offset) % seatOrder.length];
      if (active.has(candidate)) {
        dealerSeatId = candidate;
        break;
      }
    }
  }
  return {
    handIndex: nextIndex,
    wildRank: nextSchedule?.wildRank ?? null,
    wildLabel: nextSchedule?.label ?? null,
    dealerSeatId
  };
}

export function ownScoreBreakdown(result) {
  const entry = result?.ownScoreEntry;
  if (!isRecord(entry)) return null;
  return {
    total: Number.isFinite(entry.total) ? entry.total : 0,
    cards: Array.isArray(entry.cards)
      ? entry.cards
        .filter((card) => typeof card?.cardId === "string" && Number.isFinite(card?.value))
        .map((card) => ({ cardId: card.cardId, value: card.value }))
      : []
  };
}

export function handHistoryRows(view, nameForSeat) {
  return (Array.isArray(view?.completedHands) ? view.completedHands : []).map((hand) => {
    const result = hand?.result ?? {};
    return {
      index: hand?.index,
      wildRank: hand?.wildRank,
      dealerName: displayName(view, hand?.dealerSeatId, nameForSeat),
      outcome: result.winnerSeatId
        ? `${displayName(view, result.winnerSeatId, nameForSeat)} went out`
        : "Stock exhausted",
      scores: scoreEntryRows(view, {
        ...result,
        participantSeatIds: hand?.participantSeatIds
      }, nameForSeat)
    };
  });
}

export function completionPresentation(view, nameForSeat) {
  const forfeit = view?.completion?.reason === "FORFEIT";
  const winners = (Array.isArray(view?.winners) ? view.winners : [])
    .map((seatId) => displayName(view, seatId, nameForSeat));
  const winnerText = winners.length === 1 ? winners[0] : winners.join(" and ");
  if (forfeit) {
    return {
      kind: "forfeit",
      context: "Match ended",
      title: winnerText ? `${winnerText} wins by forfeit` : "Match ended by forfeit",
      status: "Match ended by forfeit. Only accepted hand results are shown."
    };
  }
  return {
    kind: "normal",
    context: "Journey complete",
    title: winners.length === 1 ? `${winnerText} wins` : `${winnerText} tie`,
    status: "Journey complete · final standings."
  };
}

/** Deterministic public text: no card IDs, join data, recovery data, or game IDs. */
export function copySafeResultSummary(view, nameForSeat) {
  const presentation = completionPresentation(view, nameForSeat);
  const standings = finalStandingRows(view, nameForSeat);
  const history = handHistoryRows(view, nameForSeat);
  const lines = [
    "Crazy Rummy result",
    `${presentation.context}: ${presentation.title}`,
    "Final standings:",
    ...standings.map((row, index) => `${index + 1}. ${row.name} — ${row.total}${row.state ? ` (${row.state})` : ""}`),
    "Hand results:",
    ...history.map((hand) => [
      `Hand ${String(hand.index).padStart(2, "0")} (${hand.wildRank} wild; dealer ${hand.dealerName}): ${hand.outcome}.`,
      ...hand.scores.map((score) => `  ${score.name}: +${score.hand}`)
    ].join("\n"))
  ];
  return lines.join("\n");
}

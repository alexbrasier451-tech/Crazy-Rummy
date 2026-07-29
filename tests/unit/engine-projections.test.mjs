import assert from "node:assert/strict";
import test from "node:test";

import { COMMAND_TYPE, EVENT_TYPE, RULES_VERSION, SCHEMA_VERSION } from "../../src/engine/constants.js";
import { executeCommand } from "../../src/engine/commands.js";
import {
  migrateSnapshot,
  playerView,
  projectEvent,
  publicView,
  snapshotFor
} from "../../src/engine/projections.js";
import { createLobbyState, createSeat } from "../../src/engine/state.js";

function fixtureState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    gameId: "game-visibility",
    lifecycle: "IN_PROGRESS",
    revision: 17,
    rules: {
      rulesVersion: RULES_VERSION,
      minimumPlayers: 3,
      maximumPlayers: 6,
      cardsPerPlayer: 7,
      handCount: 13,
      clockwise: true,
      aceLowRuns: true,
      wildsAllowedInOpeningMeld: true,
      reclaimedWildMayBeHeld: true,
      stockExhaustionEndsAfterTurn: true,
      jointLowestScoreWins: true,
      handSchedule: [{ index: 1, wildRank: "A", label: "Aces" }],
      privateRuleNote: "rules-secret"
    },
    hostSeatId: "north",
    seatOrder: ["north", "east", "south"],
    seats: {
      north: { seatId: "north", playerId: "player-north-secret", displayName: "North", ready: true, cumulativeScore: 21 },
      east: { seatId: "east", playerId: "player-east-secret", displayName: "East", ready: true, cumulativeScore: 34 },
      south: { seatId: "south", playerId: "player-south-secret", displayName: "South", ready: false, cumulativeScore: 55 }
    },
    currentHandIndex: 4,
    initialDealerSeatId: "north",
    dealerSeatId: "east",
    hand: {
      id: "game-visibility:hand:4",
      index: 4,
      wildRank: "4",
      dealerSeatId: "east",
      activeSeatId: "south",
      phase: "TABLE_PLAY",
      turnNumber: 9,
      stockCardIds: ["stock-secret-1", "stock-secret-2"],
      discardCardIds: ["clubs:7", "hearts:K"],
      handsBySeat: {
        north: ["north-private-1", "north-private-2"],
        east: ["east-private-1"],
        south: ["south-private-1"]
      },
      openedBySeat: { north: true, east: false, south: true },
      melds: [{
        id: "meld-1", type: "RUN", originatingSeatId: "north", suit: "hearts",
        slots: [{ slotId: "slot-1", cardId: "hearts:7", represented: { rank: "7", suit: "hearts" } }],
        internalNote: "meld-secret"
      }],
      drawnCardId: "south-private-1",
      drawSource: "stock",
      drewFinalStock: false,
      result: null
    },
    completedHands: [{
      handId: "old-hand", index: 3, wildRank: "3", dealerSeatId: "north",
      result: {
        reason: "WENT_OUT", winnerSeatId: "north", acknowledgedBySeatIds: ["north"],
        scoreEntriesBySeat: {
          north: { cardIds: [], cards: [], total: 0 },
          east: { cardIds: ["east-old-private"], cards: [{ cardId: "east-old-private", value: 8 }], total: 8 }
        }
      }
    }],
    winners: [],
    shuffleSeed: "shuffle-secret",
    commandLedger: { "command-secret": { private: true } }
  };
}

function assertNoSecrets(value, secrets) {
  const json = JSON.stringify(value);
  for (const secret of secrets) assert.equal(json.includes(secret), false, `${secret} leaked`);
}

test("public projection uses a strict allowlist and reveals only public hand information", () => {
  const view = publicView(fixtureState());
  assert.equal(view.hand.stockCount, 2);
  assert.deepEqual(view.hand.handCountsBySeat, { north: 2, east: 1, south: 1 });
  assert.deepEqual(view.hand.discardCardIds, ["clubs:7", "hearts:K"]);
  assert.equal("drawnCardId" in view.hand, false);
  assert.deepEqual(view.completedHands[0].result.scoreEntriesBySeat.east, { total: 8 });
  assert.equal(Object.isFrozen(view), true);
  assertNoSecrets(view, [
    "stock-secret", "north-private", "east-private", "south-private",
    "shuffle-secret", "command-secret", "player-east-secret", "east-old-private", "rules-secret", "meld-secret"
  ]);
});

test("a player view adds only the authenticated player's ordered hand", () => {
  const view = playerView(fixtureState(), "north");
  assert.deepEqual(view.hand.ownHandCardIds, ["north-private-1", "north-private-2"]);
  assert.deepEqual(snapshotFor(fixtureState(), "north"), view);
  assertNoSecrets(view, ["east-private", "south-private", "stock-secret"]);
  assert.equal("ownHandCardIds" in playerView(fixtureState(), "missing").hand, false);
});

test("only the authenticated player receives remaining-card score detail", () => {
  const state = fixtureState();
  state.hand.phase = "HAND_COMPLETE";
  state.hand.result = {
    reason: "STOCK_EXHAUSTED",
    winnerSeatId: null,
    acknowledgedBySeatIds: [],
    scoreEntriesBySeat: {
      north: { total: 7, cards: [{ cardId: "north-current-private", value: 7 }] },
      east: { total: 50, cards: [{ cardId: "east-current-private", value: 50 }] }
    }
  };

  const publicResult = publicView(state);
  const north = playerView(state, "north");
  const east = playerView(state, "east");

  assert.equal("ownScoreEntry" in publicResult.hand.result, false);
  assert.deepEqual(north.hand.result.ownScoreEntry, {
    total: 7,
    cards: [{ cardId: "north-current-private", value: 7 }]
  });
  assert.deepEqual(north.completedHands[0].result.ownScoreEntry, { total: 0, cards: [] });
  assert.deepEqual(east.hand.result.ownScoreEntry, {
    total: 50,
    cards: [{ cardId: "east-current-private", value: 50 }]
  });
  assertNoSecrets(north, ["east-current-private", "east-old-private"]);
  assertNoSecrets(east, ["north-current-private"]);
  assert.deepEqual(publicResult.hand.result.scoreEntriesBySeat, {
    north: { total: 7 },
    east: { total: 50 }
  });
});

test("event projection redacts stock draws but keeps publicly known discard draws", () => {
  const stockEvent = {
    schemaVersion: SCHEMA_VERSION, rulesVersion: RULES_VERSION, gameId: "game-visibility", handId: "hand-4",
    sequence: 18, type: EVENT_TYPE.CARD_DRAWN, commandId: "draw-1", commandFingerprint: "private-fingerprint",
    actorSeatId: "north", payload: { source: "stock", cardId: "north-private-3", seed: "shuffle-secret" },
    facts: [{ cardId: "north-private-3", privateDeal: "north-private-3" }]
  };
  const publicEvent = projectEvent(stockEvent);
  const actorEvent = projectEvent(stockEvent, "north");
  assert.equal("cardId" in publicEvent.payload, false);
  assert.equal(actorEvent.payload.cardId, "north-private-3");
  assert.deepEqual(publicEvent.facts, []);
  assertNoSecrets(publicEvent, ["north-private", "shuffle-secret", "private-fingerprint"]);

  const discardEvent = projectEvent({
    ...stockEvent,
    payload: { source: "discard", cardId: "hearts:K" }
  });
  assert.equal(discardEvent.payload.cardId, "hearts:K");
});

test("event projection retains the public readiness value", () => {
  const event = projectEvent({
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    gameId: "game-visibility",
    handId: null,
    sequence: 3,
    type: EVENT_TYPE.SEAT_READY_CHANGED,
    commandId: "ready-1",
    actorSeatId: "north",
    payload: { ready: true }
  });
  assert.deepEqual(event.payload, { ready: true });
});

test("event projection retains safe audit outcomes while dropping private fact values", () => {
  const event = projectEvent({
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    gameId: "game-visibility",
    handId: "hand-4",
    sequence: 20,
    type: EVENT_TYPE.CARD_DISCARDED,
    commandId: "discard-1",
    commandFingerprint: "fingerprint-secret",
    actorSeatId: "north",
    payload: { cardId: "hearts:K" },
    facts: [{
      type: "HAND_COMPLETED",
      handIndex: 4,
      reason: "STOCK_EXHAUSTED",
      winnerSeatId: null,
      stockCount: 0,
      cardId: "north-private-4",
      deckCardIds: ["north-private-4"],
      shuffleSeed: "shuffle-secret",
      commandFingerprint: "fingerprint-secret",
      scoreEntriesBySeat: { north: 0 }
    }]
  });
  assert.deepEqual(event.facts, [{
    type: "HAND_COMPLETED",
    handIndex: 4,
    reason: "STOCK_EXHAUSTED",
    winnerSeatId: null,
    stockCount: 0
  }]);
  assertNoSecrets(event, ["north-private", "shuffle-secret", "fingerprint-secret"]);
});

test("migration re-allowlists snapshots and rejects unsupported schema or rules", () => {
  const snapshot = playerView(fixtureState(), "north");
  const migrated = migrateSnapshot({ ...snapshot, shuffleSeed: "shuffle-secret", commandLedger: { leak: true } });
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.snapshot.hand.ownHandCardIds, ["north-private-1", "north-private-2"]);
  assertNoSecrets(migrated.snapshot, ["shuffle-secret", "commandLedger"]);

  assert.deepEqual(migrateSnapshot({ ...snapshot, schemaVersion: 99 }), {
    ok: false, reason: "UNSUPPORTED_SCHEMA", detail: "SCHEMA_VERSION"
  });
  assert.deepEqual(migrateSnapshot({ ...snapshot, rulesVersion: "other" }), {
    ok: false, reason: "UNSUPPORTED_SCHEMA", detail: "RULES_VERSION"
  });
});

test("migration round-trips every public hand field for public and player snapshots", () => {
  const state = fixtureState();
  const expectedPublicHand = publicView(state).hand;
  const expectedPlayerHand = playerView(state, "north").hand;

  const migratedPublic = migrateSnapshot(publicView(state));
  const migratedPlayer = migrateSnapshot(playerView(state, "north"));

  assert.equal(migratedPublic.ok, true);
  assert.equal(migratedPlayer.ok, true);
  assert.deepEqual(migratedPublic.snapshot.hand, expectedPublicHand);
  assert.deepEqual(migratedPlayer.snapshot.hand, expectedPlayerHand);
});

test("a fresh authoritative game round-trips through public and player migration", () => {
  let state = createLobbyState({ gameId: "fresh-projection-migration" });
  for (const seatId of ["a", "b", "c"]) {
    const joined = executeCommand(state, {
      type: COMMAND_TYPE.JOIN_SEAT,
      gameId: state.gameId,
      actorSeatId: seatId,
      clientCommandId: `join-${seatId}`,
      expectedRevision: state.revision,
      seat: createSeat({ seatId, playerId: `player-${seatId}`, displayName: seatId })
    });
    assert.equal(joined.accepted, true);
    state = joined.state;

    const readied = executeCommand(state, {
      type: COMMAND_TYPE.SET_SEAT_READY,
      gameId: state.gameId,
      actorSeatId: seatId,
      clientCommandId: `ready-${seatId}`,
      expectedRevision: state.revision,
      ready: true
    });
    assert.equal(readied.accepted, true);
    state = readied.state;
  }
  const started = executeCommand(state, {
    type: COMMAND_TYPE.START_GAME,
    gameId: state.gameId,
    actorSeatId: "a",
    clientCommandId: "start",
    expectedRevision: state.revision,
    initialDealerSeatId: "b",
    shuffleSeed: "fresh-projection-seed"
  });
  assert.equal(started.accepted, true);
  state = started.state;

  const publicSnapshot = publicView(state);
  const playerSnapshot = playerView(state, "a");
  const migratedPublic = migrateSnapshot(publicSnapshot);
  const migratedPlayer = migrateSnapshot(playerSnapshot);
  assert.equal(migratedPublic.ok, true);
  assert.equal(migratedPlayer.ok, true);
  assert.deepEqual(migratedPublic.snapshot.hand, publicSnapshot.hand);
  assert.deepEqual(migratedPlayer.snapshot.hand, playerSnapshot.hand);
});

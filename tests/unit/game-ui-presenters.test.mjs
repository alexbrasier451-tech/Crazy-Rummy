import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMeldCandidate,
  buildLayoffSlots,
  buildMeld,
  cardParts,
  phaseCopy,
  rejectionCopy,
  sortCardIds
} from "../../src/game-ui/presenters.js";

test("card parts include the suit glyph used by compact meld-card rendering", () => {
  assert.deepEqual(cardParts("clubs:Q"), {
    id: "clubs:Q",
    suit: "clubs",
    rank: "Q",
    symbol: "♣"
  });
  assert.deepEqual(cardParts("hearts:2"), {
    id: "hearts:2",
    suit: "hearts",
    rank: "2",
    symbol: "♥"
  });
});

test("hand sorting keeps custom order and deterministically sorts suit and rank", () => {
  const cards = ["spades:2", "clubs:K", "clubs:3", "hearts:A"];
  assert.deepEqual(sortCardIds(cards, "custom"), cards);
  assert.deepEqual(sortCardIds(cards, "suit"), ["clubs:3", "clubs:K", "hearts:A", "spades:2"]);
  assert.deepEqual(sortCardIds(cards, "rank"), ["hearts:A", "spades:2", "clubs:3", "clubs:K"]);
});

test("meld construction keeps an explicit wild representation and a stable slot identity", () => {
  const meld = buildMeld({
    id: "meld-7",
    type: "RUN",
    actorSeatId: "alex",
    wildRank: "4",
    cardIds: ["hearts:3", "clubs:4", "hearts:5"],
    representations: { "clubs:4": { rank: "4", suit: "hearts" } }
  });
  assert.equal(meld.suit, "hearts");
  assert.deepEqual(meld.slots[1], {
    slotId: "meld-7:2",
    cardId: "clubs:4",
    represented: { rank: "4", suit: "hearts" }
  });
});

test("meld candidates preserve selection meaning without inventing a type", () => {
  assert.deepEqual(buildMeldCandidate({
    id: "meld-auto",
    actorSeatId: "alex",
    wildRank: "4",
    cardIds: ["hearts:3", "clubs:4", "hearts:5"],
    representations: { "clubs:4": { rank: "4", suit: "hearts" } }
  }), {
    id: "meld-auto",
    originatingSeatId: "alex",
    slots: [
      { slotId: "meld-auto:1", cardId: "hearts:3" },
      {
        slotId: "meld-auto:2",
        cardId: "clubs:4",
        represented: { rank: "4", suit: "hearts" }
      },
      { slotId: "meld-auto:3", cardId: "hearts:5" }
    ]
  });
});

test("lay-off slots expose the same explicit wild representation seam", () => {
  assert.deepEqual(buildLayoffSlots({
    meld: { id: "table-run" },
    cardIds: ["spades:4"],
    wildRank: "4",
    representations: { "spades:4": { rank: "10", suit: "hearts" } }
  }), [{
    slotId: "table-run:add:1",
    cardId: "spades:4",
    represented: { rank: "10", suit: "hearts" }
  }]);
});

test("phase and rejection presenters give a usable action and precise live copy", () => {
  assert.deepEqual(phaseCopy("AWAITING_DRAW", true), {
    title: "Your turn · draw",
    detail: "Draw from the stock or take the visible discard before playing.",
    step: "draw"
  });
  assert.match(rejectionCopy("PLAYER_NOT_OPENED"), /Open with a complete set or run/);
  assert.match(rejectionCopy("INVALID_MELD", "RUN_NOT_CONSECUTIVE"), /run not consecutive/i);
});

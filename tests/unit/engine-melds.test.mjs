import assert from "node:assert/strict";
import test from "node:test";

import { MELD_TYPE, REJECTION } from "../../src/engine/constants.js";
import {
  validateLayoff,
  validateMeld,
  validateWildReplacement
} from "../../src/engine/melds.js";

function slot(slotId, cardId, represented) {
  return represented == null ? { slotId, cardId } : { slotId, cardId, represented };
}

function meld(type, slots, extra = {}) {
  return { id: "meld-1", type, originatingSeatId: "seat-1", slots, ...extra };
}

test("validates and canonicalises natural and wild-assisted sets", () => {
  const natural = validateMeld(meld(MELD_TYPE.SET, [
    slot("a", "clubs:8"), slot("b", "diamonds:8"), slot("c", "hearts:8")
  ]), { wildRank: "4" });
  assert.equal(natural.ok, true);
  assert.equal(natural.meld.rank, "8");
  assert.deepEqual(natural.meld.slots[0].represented, { rank: "8" });

  const wild = validateMeld(meld(MELD_TYPE.SET, [
    slot("a", "clubs:8"), slot("b", "diamonds:8"), slot("wild", "spades:4", { rank: "8" })
  ], { rank: "8" }), { wildRank: "4" });
  assert.equal(wild.ok, true);
  assert.deepEqual(wild.meld.slots[2].represented, { rank: "8" });
  assert.equal(Object.isFrozen(wild.meld), true);
  assert.equal(Object.isFrozen(wild.meld.slots[2]), true);
});

test("requires declared interpretations for all-wild melds and rejects invalid sets", () => {
  const allWild = validateMeld(meld(MELD_TYPE.SET, [
    slot("a", "clubs:4", { rank: "8" }),
    slot("b", "diamonds:4", { rank: "8" }),
    slot("c", "hearts:4", { rank: "8" })
  ]), { wildRank: "4" });
  assert.equal(allWild.ok, true);
  assert.equal(allWild.meld.rank, "8");

  assert.equal(validateMeld(meld(MELD_TYPE.SET, [
    slot("a", "clubs:4"), slot("b", "diamonds:4", { rank: "8" }), slot("c", "hearts:4", { rank: "8" })
  ], { rank: "8" }), { wildRank: "4" }).detail, "WILD_REPRESENTATION_REQUIRED");
  assert.equal(validateMeld(meld(MELD_TYPE.SET, [
    slot("a", "clubs:8"), slot("b", "diamonds:8"), slot("c", "hearts:8"), slot("d", "spades:8"), slot("e", "clubs:4", { rank: "8" })
  ]), { wildRank: "4" }).detail, "SET_TOO_LARGE");
});

test("orders valid runs by their declared positions and permits Ace only low", () => {
  const run = validateMeld(meld(MELD_TYPE.RUN, [
    slot("three", "hearts:3"),
    slot("wild", "clubs:4", { suit: "hearts", rank: "2" }),
    slot("ace", "hearts:A")
  ]), { wildRank: "4" });
  assert.equal(run.ok, true);
  assert.deepEqual(run.meld.slots.map(({ slotId }) => slotId), ["ace", "wild", "three"]);

  const invalidWrap = validateMeld(meld(MELD_TYPE.RUN, [
    slot("queen", "clubs:Q"), slot("king", "clubs:K"), slot("ace", "clubs:A")
  ]), { wildRank: "4" });
  assert.equal(invalidWrap.ok, false);
  assert.equal(invalidWrap.reason, REJECTION.INVALID_MELD);
  assert.equal(invalidWrap.detail, "RUN_NOT_CONSECUTIVE");
});

test("rejects ambiguous or duplicate run positions", () => {
  assert.equal(validateMeld(meld(MELD_TYPE.RUN, [
    slot("a", "clubs:4", { suit: "hearts", rank: "5" }),
    slot("b", "diamonds:4", { suit: "hearts", rank: "5" }),
    slot("c", "hearts:6")
  ]), { wildRank: "4" }).detail, "DUPLICATE_RUN_POSITION");

  assert.equal(validateMeld(meld(MELD_TYPE.RUN, [
    slot("a", "clubs:4"), slot("b", "diamonds:4", { suit: "hearts", rank: "5" }), slot("c", "hearts:6")
  ]), { wildRank: "4" }).detail, "WILD_REPRESENTATION_REQUIRED");
});

test("allows only set growth or contiguous run end extensions", () => {
  const baseRun = meld(MELD_TYPE.RUN, [
    slot("four", "hearts:4"), slot("five", "hearts:5"), slot("six", "hearts:6")
  ]);
  const added = validateLayoff(baseRun, [slot("seven", "hearts:7")], {
    wildRank: "8", placement: "END"
  });
  assert.equal(added.ok, true);
  assert.deepEqual(added.meld.slots.map((entry) => entry.represented.rank), ["4", "5", "6", "7"]);

  assert.equal(validateLayoff(baseRun, [slot("eight", "hearts:8")], {
    wildRank: "9", placement: "END"
  }).detail, "RUN_NOT_CONSECUTIVE");
  assert.equal(validateLayoff(baseRun, [slot("three", "hearts:3")], {
    wildRank: "8", placement: "END"
  }).detail, "RUN_EXTENSION_MUST_USE_END");

  const baseSet = meld(MELD_TYPE.SET, [
    slot("clubs", "clubs:8"), slot("diamonds", "diamonds:8"), slot("hearts", "hearts:8")
  ]);
  assert.equal(validateLayoff(baseSet, [slot("spades", "spades:8")], { wildRank: "4" }).ok, true);
  assert.equal(validateLayoff(baseSet, [slot("spades", "spades:8"), slot("wild", "clubs:4", { rank: "8" })], {
    wildRank: "4"
  }).detail, "SET_TOO_LARGE");
});

test("replaces wilds atomically with the exact legal natural while retaining the slot", () => {
  const run = meld(MELD_TYPE.RUN, [
    slot("seven", "hearts:7"),
    slot("wild-eight", "clubs:3", { suit: "hearts", rank: "8" }),
    slot("nine", "hearts:9")
  ]);
  const replaced = validateWildReplacement(run, {
    wildCardId: "clubs:3", naturalCardId: "hearts:8"
  }, { wildRank: "3" });
  assert.equal(replaced.ok, true);
  assert.equal(replaced.reclaimedWildCardId, "clubs:3");
  assert.deepEqual(replaced.meld.slots[1], {
    slotId: "wild-eight", cardId: "hearts:8", represented: { suit: "hearts", rank: "8" }
  });

  const invalid = validateWildReplacement(run, {
    wildCardId: "clubs:3", naturalCardId: "spades:8"
  }, { wildRank: "3" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, REJECTION.WILD_NOT_REPLACEABLE);

  const set = meld(MELD_TYPE.SET, [
    slot("clubs", "clubs:8"), slot("diamonds", "diamonds:8"), slot("wild", "clubs:4", { rank: "8" })
  ], { rank: "8" });
  assert.equal(validateWildReplacement(set, {
    wildCardId: "clubs:4", naturalCardId: "hearts:8"
  }, { wildRank: "4" }).ok, true);
});

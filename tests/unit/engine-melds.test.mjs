import assert from "node:assert/strict";
import test from "node:test";

import { MELD_TYPE, REJECTION } from "../../src/engine/constants.js";
import {
  inferMeldType,
  legalMeldInterpretations,
  legalRunExtensionRanks,
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

test("orders valid runs with Ace low or high without allowing rank wraparound", () => {
  const run = validateMeld(meld(MELD_TYPE.RUN, [
    slot("three", "hearts:3"),
    slot("wild", "clubs:4", { suit: "hearts", rank: "2" }),
    slot("ace", "hearts:A")
  ]), { wildRank: "4" });
  assert.equal(run.ok, true);
  assert.deepEqual(run.meld.slots.map(({ slotId }) => slotId), ["ace", "wild", "three"]);

  const invalidWrap = validateMeld(meld(MELD_TYPE.RUN, [
    slot("king", "clubs:K"), slot("ace", "clubs:A"), slot("two", "clubs:2")
  ]), { wildRank: "4" });
  assert.equal(invalidWrap.ok, false);
  assert.equal(invalidWrap.reason, REJECTION.INVALID_MELD);
  assert.equal(invalidWrap.detail, "RUN_NOT_CONSECUTIVE");

  const aceHigh = validateMeld(meld(MELD_TYPE.RUN, [
    slot("ace", "clubs:A"), slot("queen", "clubs:Q"), slot("king", "clubs:K")
  ]), { wildRank: "4" });
  assert.equal(aceHigh.ok, true);
  assert.deepEqual(
    aceHigh.meld.slots.map(({ represented }) => represented.rank),
    ["Q", "K", "A"]
  );
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

test("infers a complete meld as a set or run without a caller-supplied type", () => {
  const set = inferMeldType(meld(undefined, [
    slot("clubs", "clubs:8"),
    slot("diamonds", "diamonds:8"),
    slot("wild", "spades:4", { rank: "8" })
  ]), { wildRank: "4" });
  assert.equal(set.ok, true);
  assert.equal(set.type, MELD_TYPE.SET);
  assert.equal(set.meld.rank, "8");

  const run = inferMeldType(meld(undefined, [
    slot("five", "hearts:5"),
    slot("wild", "clubs:4", { rank: "6", suit: "hearts" }),
    slot("seven", "hearts:7")
  ]), { wildRank: "4" });
  assert.equal(run.ok, true);
  assert.equal(run.type, MELD_TYPE.RUN);
  assert.equal(run.meld.suit, "hearts");
  assert.deepEqual(run.meld.slots.map((entry) => entry.represented.rank), ["5", "6", "7"]);
});

test("meld inference waits for required wild meaning and rejects non-meld selections", () => {
  const incompleteWild = inferMeldType(meld(undefined, [
    slot("clubs", "clubs:8"),
    slot("diamonds", "diamonds:8"),
    slot("wild", "spades:4")
  ]), { wildRank: "4" });
  assert.equal(incompleteWild.ok, false);
  assert.equal(incompleteWild.detail, "MELD_DETAILS_REQUIRED");

  const invalid = inferMeldType(meld(undefined, [
    slot("one", "clubs:3"),
    slot("two", "diamonds:8"),
    slot("three", "hearts:K")
  ]), { wildRank: "4" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.detail, "MELD_TYPE_NOT_INFERRED");
});

test("meld composition derives only legal wild meanings from the selected cards", () => {
  const setInterpretations = legalMeldInterpretations(meld(undefined, [
    slot("diamonds", "diamonds:10"),
    slot("clubs", "clubs:10"),
    slot("wild", "clubs:A")
  ]), { wildRank: "A" });
  assert.equal(setInterpretations.length, 1);
  assert.equal(setInterpretations[0].type, MELD_TYPE.SET);
  assert.deepEqual(
    setInterpretations[0].meld.slots.find(({ cardId }) => cardId === "clubs:A").represented,
    { rank: "10" }
  );

  const runInterpretations = legalMeldInterpretations(meld(undefined, [
    slot("ten", "diamonds:10"),
    slot("jack", "diamonds:J"),
    slot("wild", "clubs:A")
  ]), { wildRank: "A" });
  assert.deepEqual(
    runInterpretations.map(({ meld: candidate }) => (
      candidate.slots.find(({ cardId }) => cardId === "clubs:A").represented
    )),
    [
      { rank: "9", suit: "diamonds" },
      { rank: "Q", suit: "diamonds" }
    ]
  );

  const gapInterpretations = legalMeldInterpretations(meld(undefined, [
    slot("ten", "hearts:10"),
    slot("queen", "hearts:Q"),
    slot("wild", "spades:A")
  ]), { wildRank: "A" });
  assert.deepEqual(
    gapInterpretations.map(({ meld: candidate }) => (
      candidate.slots.find(({ cardId }) => cardId === "spades:A").represented
    )),
    [{ rank: "J", suit: "hearts" }]
  );

  const aceLowInterpretations = legalMeldInterpretations(meld(undefined, [
    slot("ace", "clubs:A"),
    slot("two", "clubs:2"),
    slot("wild", "diamonds:4")
  ]), { wildRank: "4" });
  assert.deepEqual(
    aceLowInterpretations.map(({ meld: candidate }) => (
      candidate.slots.find(({ cardId }) => cardId === "diamonds:4").represented
    )),
    [{ rank: "3", suit: "clubs" }]
  );

  const aceHighInterpretations = legalMeldInterpretations(meld(undefined, [
    slot("queen", "clubs:Q"),
    slot("king", "clubs:K"),
    slot("wild", "clubs:A")
  ]), { wildRank: "A" });
  assert.deepEqual(
    aceHighInterpretations.map(({ meld: candidate }) => (
      candidate.slots.find(({ cardId }) => cardId === "clubs:A").represented
    )),
    [
      { rank: "J", suit: "clubs" },
      { rank: "A", suit: "clubs" }
    ],
    "the wild Ace can complete J-Q-K or occupy the high-A position in Q-K-A"
  );

  assert.deepEqual(legalMeldInterpretations(meld(undefined, [
    slot("ten", "clubs:10"),
    slot("jack", "hearts:J"),
    slot("wild", "diamonds:4")
  ]), { wildRank: "4" }), []);
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

  const highRun = meld(MELD_TYPE.RUN, [
    slot("jack", "hearts:J"), slot("queen", "hearts:Q"), slot("king", "hearts:K")
  ]);
  assert.deepEqual(
    legalRunExtensionRanks(highRun, { wildRank: "8", placement: "END", count: 1 }),
    [["A"]],
    "the UI-facing extension helper must offer Ace at the high end"
  );
  const highAce = validateLayoff(highRun, [slot("ace", "hearts:A")], {
    wildRank: "8", placement: "END"
  });
  assert.equal(highAce.ok, true);
  assert.deepEqual(
    highAce.meld.slots.map(({ represented }) => represented.rank),
    ["J", "Q", "K", "A"]
  );
  assert.deepEqual(
    legalRunExtensionRanks(highAce.meld, { wildRank: "8", placement: "START", count: 1 }),
    [["10"]]
  );
  assert.deepEqual(
    legalRunExtensionRanks(highAce.meld, { wildRank: "8", placement: "END", count: 1 }),
    []
  );
  assert.equal(validateLayoff(highAce.meld, [slot("two", "hearts:2")], {
    wildRank: "8", placement: "END"
  }).detail, "RUN_NOT_CONSECUTIVE");

  const lowRun = meld(MELD_TYPE.RUN, [
    slot("ace", "spades:A"), slot("two", "spades:2"), slot("three", "spades:3")
  ]);
  assert.equal(validateLayoff(lowRun, [slot("king", "spades:K")], {
    wildRank: "8", placement: "START"
  }).detail, "RUN_NOT_CONSECUTIVE");

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

# Phase 2 Engine Contract

**Status:** Implemented and verified 29 July 2026  
**Scope:** Roadmap Phase 2.1–2.6 only

This file fixes the module seams used while the deterministic engine is built.
The approved authority remains
[`docs/phase-0/RULES_AND_STATE_CONTRACT.md`](../phase-0/RULES_AND_STATE_CONTRACT.md).
If this implementation note conflicts with that record, the Phase 0 record
wins.

## Boundary

Phase 2 adds pure browser-native JavaScript modules under `src/engine/`. They
must not import the DOM, storage, a clock, network APIs, or UI fixtures. UI
integration begins in Phase 3. Presence, persistence, transport, reconnection,
and provider work remain later phases.

## Canonical authoritative state

The engine state is a plain immutable value with this shape:

```text
{
  schemaVersion, rulesVersion, gameId, lifecycle, revision,
  rules, hostSeatId, seatOrder, seats,
  currentHandIndex, initialDealerSeatId, dealerSeatId,
  hand, completedHands, winners, shuffleSeed, commandLedger
}
```

`seats` is keyed by stable seat ID. A seat records stable player identity,
display name, readiness, and cumulative score. `seatOrder` is the immutable
clockwise order after the game starts.

An in-progress hand has this shape:

```text
{
  id, index, wildRank, dealerSeatId, activeSeatId, phase, turnNumber,
  stockCardIds, discardCardIds, handsBySeat, openedBySeat, melds,
  drawnCardId, drawSource, drewFinalStock, result
}
```

The stock is top-first. The top discard is the final item in
`discardCardIds`. Card identities are stable strings of the form
`"suit:rank"`. Zone membership exists only in stock, discard, player hands, or
meld slots.

A meld has an immutable type and stable slots:

```text
{
  id, type, originatingSeatId, rank?, suit?,
  slots: [{ slotId, cardId, represented: { rank, suit? } }]
}
```

Every wild slot stores its represented identity. Run slots are ordered by
represented rank. A set fixes its represented rank and never exceeds four
cards. Replacing a wild retains the slot ID.

## Shared public surfaces

- `cards.js`: stable card catalogue, parsing, wild detection.
- `deck.js`: deterministic seeded shuffle and deal utilities. Production
  entropy is injected as a seed or committed deck order; reducers do not
  obtain randomness themselves.
- `rules.js`: immutable rule configuration and hand schedule helpers.
- `state.js`: lobby state and canonical cloning/freezing helpers.
- `invariants.js`: authoritative post-command checks.
- `melds.js`: set/run validation returning `{ ok, meld }` or
  `{ ok: false, reason, detail? }`.
- `scoring.js` and `lifecycle.js`: scoring, deal, hand completion, dealer
  rotation, next-hand creation, and final standings.
- `events.js`: revisioned event reducer.
- `commands.js`: command validation/idempotency facade returning an accepted or
  rejected result without mutating its input.
- `projections.js`: explicit-allowlist public/player snapshots and event
  projections.
- `index.js`: the final stable Phase 2 barrel.

Every state-changing command includes `type`, `gameId`, `actorSeatId`,
`clientCommandId`, and `expectedRevision`; in-progress commands also include
`handId`. Rejected commands return the original state object. Accepted commands
advance the authoritative revision once and add one ordered event. Events may
carry several `facts` when a single atomic command causes related domain facts
such as deal completion, turn start, player opening, hand scoring, or game
completion.

`commandLedger` records accepted command fingerprints and their original
results. An identical retry returns that original result without changing
state. Reusing the ID for a different command is rejected.

The command facade is:

```text
executeCommand(state, command) ->
  { accepted: true, duplicate, state, event, events: [event], revision }
  { accepted: false, state, reason, detail? }
```

`applyCommand` is an alias for `executeCommand`. A successful command creates
one event with this envelope:

```text
{
  schemaVersion, rulesVersion, gameId, handId,
  sequence, type, commandId, commandFingerprint, actorSeatId,
  payload, facts
}
```

The event sequence equals the resulting state revision. Event payloads contain
only the deterministic inputs needed by `reduceEvent`; event projection removes
private values. `reduceEvent(state, event)` rejects schema mismatches and
revision gaps. `replayEvents(initialState, events)` applies them in sequence.

Command payload conventions are:

- `JOIN_SEAT`: `seat`
- `LEAVE_SEAT`: no extra payload
- `SET_SEAT_READY`: `ready`
- `START_GAME`: `initialDealerSeatId` plus `shuffleSeed` or a complete
  `deckCardIds`
- `DEALER_INITIAL_DISCARD` / `DISCARD`: `cardId`
- `DRAW_STOCK` / `DRAW_DISCARD`: no extra payload
- `CREATE_MELD`: a complete proposed `meld`
- `LAY_OFF`: `meldId`, `slots`, and `placement`
- `REPLACE_WILD`: `meldId`, `wildCardId`, and `naturalCardId`
- `FINISH_TABLE_PLAY`: no extra payload
- `ACKNOWLEDGE_HAND_RESULT`: no extra payload

The reducer derives later-hand decks from the accepted game shuffle seed and
hand index unless a complete committed deck is supplied by the authority. This
is reproducible evidence, not a production entropy source.

## Visibility

Public and player projections are built from allowlists. Public values include
rules, seats, dealer/turn/phase, stock count, discard history, hand counts,
opened flags, melds, scores, and outcomes. They never include stock order,
shuffle evidence, the command ledger, or private hand identities. A player
projection adds only that player's own hand. Event projection follows the same
boundary.

## Completion evidence

The Phase 2 suite must cover roadmap chunks 2.1–2.6, all Phase 0 acceptance
examples A–K, all 17 post-command invariants, seeded deterministic replay,
duplicate/stale/delayed delivery, redaction, thirteen-hand progression, and at
least one fresh generated case. The existing Phase 1 `pnpm check` remains the
broader regression gate.

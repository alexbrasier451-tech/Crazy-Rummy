# Phase 2 Build Report

**Status:** Complete  
**Date verified:** 29 July 2026  
**Scope:** Deterministic game engine

## Delivered

- Pure browser-native JavaScript engine modules with no DOM, storage, clock,
  network, or UI-fixture dependency.
- Stable 52-card catalogue, immutable rules and state records, deterministic
  seeded shuffles, exact committed-deck evidence, clockwise deals, and
  evidence-derived unbiased initial-dealer selection.
- Complete set/run validation for natural, wild-assisted, and all-wild melds;
  Ace-high-or-low/no-wrap runs; immutable represented wild slots; end lay-offs; and
  transactional wild replacement.
- Revisioned lobby and gameplay commands covering seats/readiness, start,
  dealer opening discard, both draw sources, opening melds, lay-offs, wild
  replacement, table-play completion, final discard, go-out, and result
  acknowledgement.
- Thirteen-hand lifecycle with moving wild ranks, clockwise dealer rotation,
  mandatory final discard, final-stock completion, per-card score evidence,
  cumulative totals, and joint lowest-score winners.
- Ordered authoritative events, stable public-safe rejection codes,
  accepted-command idempotency/conflict handling, deterministic replay, safe
  audit facts, and schema/revision-gap boundaries.
- Explicit-allowlist public/player snapshots and event projections that hide
  stock order, shuffle evidence, command ledger data, other hands, and private
  stock draws. Versioned snapshot migration re-applies the same allowlists.
- Post-command invariants for card conservation, legal melds/phases, opening,
  score derivation/history, dealer and hand progression, final winners, and
  command-ledger consistency.

The stable engine entrypoint is `src/engine/index.js`. Its detailed state and
module contract is recorded in
[`ENGINE_CONTRACT.md`](ENGINE_CONTRACT.md).

## Verification evidence

The supported combined command remains:

```text
pnpm check
```

The Phase 2 completion run includes:

- 74 passing Node unit tests in total: 50 deterministic-engine tests plus the
  24 retained Phase 1 contracts;
- focused card/deck/state, meld, lifecycle/scoring, command/event, projection,
  migration, invariant, API, and contract-acceptance fixtures;
- every Phase 0 acceptance example A-K, including command-driven final-stock
  and go-out flows;
- 24 fresh seeded generated games that preserve all 52 cards through complete
  ordinary turns and deterministic event replay;
- a complete thirteen-hand match driven only through accepted commands and
  ordered events, followed by replay to the identical final authoritative
  state; and
- the existing Phase 1 production build, responsive/navigation browser smoke,
  and PWA install/update/offline lifecycle gates.

## Stage boundary

Phase 2 supplies the deterministic authority and redacted state contracts. It
does not connect the existing visual fixtures to live game state, persist a
match, discover remote players, or transport commands between devices. The
playable local integration harness begins in Phase 3; presence and networking
remain Phases 4 and 5.

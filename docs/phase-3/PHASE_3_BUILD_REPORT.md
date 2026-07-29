# Phase 3 Build Report

**Status:** Complete  
**Date verified:** 29 July 2026  
**Scope:** Playable local integration harness

## Delivered

- A browser-local authority facade that enriches UI intents and passes every
  mutation through the stable Phase 2 command boundary.
- Player-scoped rendering: the game and result routes consume only the
  selected seat's redacted projection while opponents expose counts and shared
  state.
- Complete dealer-opening and normal draw/table/discard orchestration with
  keyboard/tap card selection and deliberate confirmation.
- Atomic new-meld, lay-off, and wild-replacement workspaces with explicit wild
  meaning, repairable precise rejection feedback, accessible non-drag paths,
  and accepted-state motion.
- Accepted hand scores, all-seat result acknowledgement, dealer/wild
  progression, all thirteen hands, final standings, and hand-by-hand public
  history.
- Versioned local accepted-state, selected-seat, identity, preference, and
  completed-summary persistence with invariant-checked restore and corrupt
  fail-closed recovery.
- A deterministic full-match browser fixture that uses accepted commands, not
  production-rule shortcuts.

The detailed boundary and API are recorded in
[`LOCAL_HARNESS_CONTRACT.md`](LOCAL_HARNESS_CONTRACT.md).

## Verification evidence

The supported combined command remains:

```text
pnpm check
```

The Phase 3 completion run includes:

- 84 passing Node unit tests, including all retained Phase 1 and Phase 2
  contracts plus local session, recovery, privacy, presenter, and full-match
  checks;
- refresh recovery at the exact accepted revision during dealer opening,
  awaiting draw, table play, awaiting discard, and hand complete;
- a browser-played legal opening discard, stock draw, valid wild-assisted
  opening meld, table completion, discard, and complete first hand;
- rejected-meld feedback that retains the staged composer for correction;
- a browser-driven accepted-command traversal through all thirteen hands,
  final standings, completed-history restore, and new-match reset;
- local identity and preference save/refresh recovery;
- private-hand DOM checks, keyboard/touch controls, 320 px and 200% text
  reflow, reduced motion, forced colours, and minimum tap targets;
- the production build and retained responsive/navigation browser smoke; and
- the retained install, update, cache cleanup, offline art, and relaunch PWA
  lifecycle check.

## Stage boundary

Phase 3 proves the UI, engine, results, and local recovery without network
timing. Lobby discovery and remote table formation remain illustrative.
Provider-neutral presence begins in Phase 4; peer transport, acknowledgements,
uncertain intents, reconnect, and cross-device resynchronisation remain Phases
5 and 6.

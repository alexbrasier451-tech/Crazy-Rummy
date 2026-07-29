# Phase 3 Local Harness Contract

**Status:** Implemented and verified 29 July 2026  
**Scope:** Roadmap Phase 3.1–3.5 only

## Boundary

The local harness connects the Phase 1 browser UI to the Phase 2 deterministic
engine without transport timing. It is a developer and browser-test authority,
not an offline multiplayer mode or a replacement same-room product. Presence,
remote table formation, signalling, WebRTC, reconnect countdowns, and
cross-device resynchronisation remain later phases.

The engine remains pure. Browser storage, DOM state, navigation, animation,
fixture control, and local identity live outside `src/engine/`.

## Session seam

`src/local/index.js` exports `createLocalGameSession()` and a memory-storage
adapter for tests. A session provides:

```text
getSnapshot()
subscribe(listener)
execute(command) or execute(type, payload)
setLocalSeat(seatId)
setIdentity(identity)
setPreferences(preferences)
reset()
runAutomatedMatch()
```

`getSnapshot().view` is the selected seat's allowlisted Phase 2 player
projection. Game and result screens render this projection and do not fall
through to the authoritative private state. The snapshot also retains
authoritative state for the local controller and deterministic verification;
it is not a UI payload or future network contract.

Every high-level command is enriched with the current game, hand, actor,
revision, and unique client command ID, then passed through
`executeCommand`. Only a non-duplicate accepted result replaces and persists
authority. Rejections preserve the prior state and the repairable UI
selection/composer context.

## Playable workspace

The `/game` route supports:

- a selected local seat with only that seat's private hand face-up;
- dealer discard-only opening, stock/discard draw, table-play completion, and
  deliberate confirmed discard;
- tap and keyboard card selection plus suit/rank/custom sorting;
- atomic new set/run composition with explicit wild representation;
- lay-off destination and before/after controls;
- wild replacement preview and confirmation;
- public player counts, scores, melds, stock count, discard, dealer, active
  seat, wild rank, hand phase, and 13-hand route;
- precise assertive engine rejection feedback; and
- acknowledged-state-only motion with reduced-motion, forced-colour, phone
  reflow, Escape/back, focus-return, and focus-trap equivalents.

The developer seat selector lets tests exercise each private projection without
putting multiple hands in the DOM at once.

## Local persistence

Versioned browser-storage records separately retain:

- the latest accepted authoritative local fixture;
- selected local seat;
- local identity;
- preferences; and
- a completed-match summary without private card history.

Construction validates schema/rules and all engine invariants before restoring.
Corrupt or incompatible authority fails closed to a fresh deterministic
fixture. Refresh restores the accepted revision in dealer-opening, draw,
table-play, discard, and hand-complete phases. It never blindly replays a
game-changing command.

## Progression fixture

Ordinary controls can complete a legal turn and a complete hand. The
acknowledgement screen advances only after every fixture seat has accepted the
hand result. `runAutomatedMatch()` uses only accepted Phase 2 commands to drain
remaining stock, score, acknowledge, rotate the dealer and wild rank, and
finish all thirteen hands. Final standings and hand-by-hand public results
come from the accepted engine projection.


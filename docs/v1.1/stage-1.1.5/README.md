# Stage 1.1.5 — results, reference, settings, and resilient routes

## Scope and authority

This slice implements the Stage 5 programme from the v1.1 roadmap against the
owner-approved Compartment Table signature map. It changes presentation only:
engine meaning, online acknowledgement, saved-summary allowlists, update
guards, device-local privacy claims, and clear-data scope remain authoritative.

The controller imports `src/styles/v11-results-reference.css` through the
shared style entry point after the foundation, pre-game, and gameplay layers.

## Authored route coverage

| Route or state | Composition | Truth and accessibility protection |
| --- | --- | --- |
| Accepted hand result | Thirteen-stop route ledger, accepted score ticket, separately labelled private breakdown, quiet next-hand ticket, continuation deck | No score animation obscures totals; only the authenticated projection supplies card identities; acknowledgement and reconnect behaviour are unchanged |
| Final result | Terminus label, complete/early route, standings-led ticket, receding accepted history, separate action deck | Normal, tie, and forfeit presenter text remains authoritative; forfeit history stays accepted-only; copied text retains the public allowlist |
| Missing result | Dashed no-ticket composition with safe game/Lobby routes | Explicitly says no score or standings were invented |
| Rules | Immutable-preset ticket, 13-stop moving-wild timetable, section index, numbered handbook entries | Cached-reference language remains explicit; section controls scroll and move focus to ordinary headings; all examples remain textual |
| Settings | Your seat, Play comfort, Lobby, Install/offline, record, summary, and privacy tickets | Existing native input/select/checkbox/radio behaviour is retained; save feedback remains inline |
| Installing/checking/ready | Neutral or accepted install ticket | Copy describes static shell scope and shared-service requirement |
| Update ready | Brass update ticket | Existing online-play guard remains the sole enablement authority; copy makes no replay promise |
| Offline/unavailable | Dashed signal ticket | Cached local pages are distinguished from remote play; current-page usability is not represented as an account mode |
| Clear device data | Separate signal-red danger ticket and existing two-activation control | Full local scope remains visible and never claims to affect a cloud account or another device |

## Adaptive and resilient treatment

- All new grids use bounded `minmax(0, 1fr)` tracks and preserve document
  reading order at compact widths and high zoom.
- Rules destinations use focusable headings, not decorative anchors.
- Reduced-motion removes authored transitions; result truth is immediately
  present.
- Forced-colour mode removes material fills and retains solid/dashed state
  distinctions.
- The stylesheet does not set `appearance`, replace, or hide native form
  controls.
- Long history, names, status copy, and rules content use wrapping rather than
  ellipsis or fixed-height clipping.

## Verification record

Run with bundled Node
`C:\Users\alexb\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`.

- PASS — focused unit contracts: 15 tests across result presenters, reference
  and settings semantics, PWA update guard, and Stage 1.1.5 source contracts.
- PASS — `tests/browser/v11-stage-1-1-5.mjs`: hand, final, unavailable, rules,
  settings, offline, two-step clear-data, focus-transfer, native-control, and
  320 px / 400% text checks.
- PASS — existing `test:stage7-results`: online result acknowledgement,
  reconnect, rejection/retry, retained final summary, public copy, forfeit,
  and 400% reflow.
- PASS — existing `test:pwa` after the controller added the registered v1.1
  asset families to the versioned precache allowlist.
- PASS — existing `test:smoke` after the controller replaced the obsolete
  legacy-splash assertion with the approved wordmark/route contract.

Stage 1.1.7 records integrated production-route captures at 320 × 568,
390 × 844, and 768 × 900 without modifying an approved baseline.

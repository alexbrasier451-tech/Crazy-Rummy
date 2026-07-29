# Crazy Rummy — Codex-Sized Project Roadmap

This roadmap divides the game into bounded, reviewable chunks. Complete chunks
in order unless a chunk explicitly permits parallel work. Each chunk includes
its own focused checks; broader checks run at the end of every phase.

Reference documents:

- [Project scope](PROJECT_SCOPE.md)
- [App layout](APP_LAYOUT.md)
- [Decision register](docs/phase-0/STAGE_0_DECISION_REGISTER.md)
- [Rules and state contract](docs/phase-0/RULES_AND_STATE_CONTRACT.md)
- [ADR-0001](docs/decisions/ADR-0001-ONLINE-P2P-ARCHITECTURE.md)

Chunk sizes are **S** (one narrow contract/configuration/helper), **M** (one
complete component or flow), and **L** (a coherent integration slice that
should be decomposed again before implementation).

## Phase 0 — Decisions and implementation contract

### 0.1 — Confirm identity, audience, and distribution

**Size:** S · **Depends on:** none

- **Outcome:** Record Crazy Rummy, per-table Open/Closed audience, modern
  Android Chrome and iPhone Safari support, source/hosting intention, and the
  anonymous local identity boundary.
- **Done when:** The decision register has no blocking audience, identity, or
  distribution question.

### 0.2 — Freeze the family rules

**Size:** M · **Depends on:** none

- **Outcome:** Accept the thirteen-hand rules plus all edge cases needed by a
  deterministic engine.
- **Work:** Encode Ace-low runs, wilds permitted in opening melds,
  reclaim-and-hold wilds, natural J/Q/K at 10, current wilds at 50, and the
  documented basic edge defaults.
- **Done when:** Every rule fixture has one legal result and the owner accepts
  the rules/state contract.

### 0.3 — Confirm trust, fairness, and failure policy

**Size:** M · **Depends on:** 0.1

- **Outcome:** Decide whether a host-authoritative trust model is adequate.
- **Work:** Record deck generation, visibility, command authority, host
  inspection risk, five-minute non-host reconnect/drop, five-minute host
  recovery then abandonment, forfeit behaviour, turn waiting, and whether
  anti-cheat is explicitly out of scope.
- **Done when:** The app can describe exactly what happens when any one phone
  disconnects and makes no unsupported fairness claim.

### 0.4 — Freeze lobby and table formation

**Size:** M · **Depends on:** 0.1, 0.3

- **Outcome:** Define online presence, polling, user-selected Open/Closed
  tables, invitations/codes, capacity, expiry, compatibility, privacy, and
  abuse boundaries.
- **Done when:** Host and guest lobby journeys have deterministic transitions,
  expiry rules, and acceptance examples.

### 0.5 — Complete managed rendezvous/WebRTC spike

**Size:** M · **Depends on:** 0.3, 0.4

- **Outcome:** Prove one no-server-administration route for presence,
  signalling, STUN, and TURN from representative mobile networks.
- **Work:** Compare realistic managed/serverless options, record estimated
  limits/costs, build a disposable two-phone probe, and measure direct versus
  relay connection results.
- **Done when:** ADR-0001 names an accepted provider/adapter boundary and a
  real-phone probe exchanges ordered data on separate networks, or the product
  explicitly falls back to manual invite exchange.

**Current evidence:** the public GitHub Pages probe passes both direct exchange
and Metered forced TURN with `relay`/`relay` candidates. Metered is on
hard-capped free signalling and 500MB TURN with `$0` overage and auto-recharge
off. The broadband-desktop/cellular-phone run passed with direct
`srflx`/`srflx` and forced `relay`/`relay` candidates over UDP.

### 0.6 — Align scope, rules, screen map, and roadmap

**Size:** S · **Depends on:** 0.2, 0.3, 0.4, 0.5

- **Outcome:** Remove contradictions among all Phase 0 records.
- **Done when:** Every MVP requirement maps to a screen, state rule, roadmap
  chunk, and verification path.

### 0.7 — Sign off Phase 0

**Status:** Complete — approved 29 July 2026

**Size:** S · **Depends on:** 0.6

- **Outcome:** Authorise Phase 1 without leaving an implicit rule, provider,
  trust, support, or distribution decision to the implementer.
- **Done when:** The owner accepts the Phase 0 records and
  `PHASE_0_SIGNOFF.md` is Approved.

**Phase 0 exit:** Product, rules, lobby, trust, failure behaviour, visual
direction, client stack, and the no-admin network dependency are explicit.

## Phase 1 — Mobile PWA foundation and design system

**Status:** Complete — verified 29 July 2026

### 1.1 — Scaffold the static client

**Status:** Complete

**Size:** S · **Depends on:** Phase 0

- Create the accepted Vite/static PWA structure and documented module
  boundaries without gameplay features.
- Add development, build, unit, and browser-smoke commands.
- **Done when:** The shell runs, builds, and its minimal checks pass.

### 1.2 — Add design tokens and responsive shell

**Status:** Complete

**Size:** M · **Depends on:** 1.1

- Implement the inherited dark/cream/green/red/gold language, safe areas,
  typography, tap sizes, focus, reduced motion, and phone widths.
- **Done when:** Shared token fixtures pass contrast and representative-width
  visual checks.

### 1.3 — Build shared card-game components

**Status:** Complete

**Size:** M · **Depends on:** 1.2

- Build playing card, card back, hand fan/list, player chip, score strip,
  connection state, modal/sheet, toast, and confirmation components.
- Include reusable, reduced-motion-safe primitives for card deal, travel,
  settle, flip, and hand reflow; do not bind them to unacknowledged network
  state.
- **Done when:** All states are keyboard/touch accessible and card identity is
  not colour-only.

### 1.4 — Implement navigation and placeholder screens

**Status:** Complete

**Size:** M · **Depends on:** 1.3

- Add first launch, menu, lobby, waiting room, game table, hand result, final
  result, rules, and settings routes with recovery-safe navigation.
- **Done when:** The screen map is traversable at supported phone widths.

### 1.5 — Add manifest, service worker, and offline shell

**Status:** Complete

**Size:** M · **Depends on:** 1.4

- Cache only versioned static assets and present an honest remote-play-offline
  state.
- **Done when:** install, offline relaunch, and update tests pass.

## Phase 2 — Deterministic game engine

**Status:** Complete — verified 29 July 2026

### 2.1 — Define cards, deck, seats, and match state

**Status:** Complete

**Size:** M · **Depends on:** 1.1, Phase 0 rules

- Implement immutable identifiers, versioned state, views, and seeded test
  deck utilities.
- **Done when:** schema and visibility fixtures pass.

### 2.2 — Implement set and run validation

**Status:** Complete

**Size:** M · **Depends on:** 2.1

- Validate natural and wild-assisted melds with explicit immutable wild
  representation.
- **Done when:** accepted and rejected contract examples pass.

### 2.3 — Implement turn commands

**Status:** Complete

**Size:** M · **Depends on:** 2.2

- Implement opening discard, draw, atomic table play, opening, lay-off, wild
  replacement, discard, and go-out.
- **Done when:** every command preserves hand/card conservation and phase
  invariants.

### 2.4 — Implement hand lifecycle and scoring

**Status:** Complete

**Size:** M · **Depends on:** 2.3

- Deal, rotate dealer, advance wild rank, handle stock exhaustion, score, ties,
  and final standings.
- **Done when:** all thirteen hands run deterministically from fixtures.

### 2.5 — Add event reducer, redacted views, and command idempotency

**Status:** Complete

**Size:** M · **Depends on:** 2.4

- Create ordered events, public/player projections, rejection reasons,
  duplicate-command handling, snapshots, and schema migration boundaries.
- **Done when:** multiple reducers reach identical state under duplicate and
  delayed delivery tests without leaking hands.

### 2.6 — Complete engine property and regression checks

**Status:** Complete

**Size:** M · **Depends on:** 2.5

- Test card conservation, unique ownership, legal phases, score totals,
  deterministic replay, redaction, and fresh generated cases.
- **Done when:** the full engine suite is green.

## Phase 3 — Playable local integration harness

**Status:** Complete — verified 29 July 2026

This phase proves the complete UI and engine before introducing network timing.
It is a developer/test harness, not a replacement same-room product.

### 3.1 — Build private hand and draw/discard interaction

**Status:** Complete

**Size:** M · **Depends on:** Phase 2, 1.3

- **Done when:** a fixture player can complete a legal turn without drag-only
  input, and acknowledged draw/discard animations never run for rejected or
  uncertain commands.

### 3.2 — Build meld composer and table

**Status:** Complete

**Size:** M · **Depends on:** 3.1

- Support new melds, lay-offs, wild positions, wild replacement, previews, and
  atomic submit/cancel.
- **Done when:** all rules fixtures have accessible UI paths and precise error
  feedback, with accepted meld/wild motion and equivalent reduced-motion state
  changes.

### 3.3 — Build dealer opening and turn orchestration

**Status:** Complete

**Size:** M · **Depends on:** 3.2

- **Done when:** the UI enforces draw/table/discard phases and the dealer's
  discard-only opening.

### 3.4 — Build hand and match progression

**Status:** Complete

**Size:** M · **Depends on:** 3.3

- **Done when:** an automated browser fixture traverses all thirteen hands and
  final standings.

### 3.5 — Add local persistence and recovery

**Status:** Complete

**Size:** M · **Depends on:** 3.4

- Persist identity, preferences, summaries, and recoverable accepted state.
- **Done when:** refresh during every turn phase restores without duplicating
  an action.

## Phase 4 — Presence, polling, and table service

**Status:** Complete — verified 29 July 2026

### 4.1 — Implement the provider-neutral lobby adapter

**Status:** Complete

**Size:** M · **Depends on:** Phase 1, ADR-0001

- Define heartbeat, list, invite/table, accept, cancel, lease, error, and
  compatibility contracts without provider logic in UI modules.
- **Done when:** fake-service contract tests cover expiry, backoff, and stale
  responses.

### 4.2 — Implement the selected managed/serverless endpoint

**Status:** Complete

**Size:** L · **Depends on:** 4.1, Phase 0 spike

- Implement minimum storage, validation, expiry, rate limits, configuration,
  deployment documentation, and operational limits.
- **Done when:** no administrative secret ships in the PWA and endpoint
  integration tests pass.

### 4.3 — Build the online lobby

**Status:** Complete

**Size:** M · **Depends on:** 4.2

- Add go-online/offline, presence freshness, polling with visibility-aware
  backoff, invitations/open tables, and waiting room.
- **Done when:** two to six devices can reliably assemble a compatible room
  and stale clients disappear.

### 4.4 — Complete lobby privacy and abuse checks

**Status:** Complete

**Size:** M · **Depends on:** 4.3

- Verify minimum data, escaping, unguessable secrets, expiry, rate limiting,
  request bounds, and the selected audience controls.
- **Done when:** the accepted threat/abuse checklist is green.

## Phase 5 — Peer transport and resynchronisation

**Status:** Implementation complete — verified 29 July 2026; live two-phone
direct/forced-relay revalidation remains a release gate

### 5.1 — Implement signalling adapter and connection state machine

**Size:** M · **Depends on:** Phase 4

- Exchange WebRTC offers, answers, ICE candidates, and short-lived TURN
  credentials through the accepted service.
- **Done when:** two real phones connect on separate networks and show honest
  connection state.

### 5.2 — Implement two-to-six-player topology

**Size:** M · **Depends on:** 5.1

- Establish the accepted host/star or other topology, per-peer channels,
  schema/version handshake, heartbeats, and clean closure.
- **Done when:** all seats exchange ordered test events under direct and relay
  paths.

### 5.3 — Add reliable command/event protocol

**Size:** M · **Depends on:** 5.2, 2.5

- Add command IDs, sequence numbers, acknowledgements, rejection, retry,
  snapshots, and redacted per-player payloads.
- **Done when:** fault-injection tests cannot create duplicate accepted moves,
  divergence, or cross-hand leakage.

### 5.4 — Implement reconnect and agreed host-loss policy

**Size:** M · **Depends on:** 5.3

- Rebind a returning identity/room secret, request missed events/snapshot,
  pause/resume, apply the five-minute non-host drop/forfeit rule, and abandon
  honestly after unrecovered host loss.
- **Done when:** every seat's disconnect fixture matches the Phase 0 contract.

## Phase 6 — End-to-end online game

**Status:** Implementation complete — locally verified 29 July 2026;
three-phone separate-network and forced-relay revalidation remains a release
gate

### 6.1 — Connect lobby, transport, authority, engine, and UI

**Status:** Complete

**Size:** L · **Depends on:** Phases 3–5

- **Done when:** three remote phones complete a rules fixture with identical
  public state and correct private views.

### 6.2 — Add network-aware action feedback

**Status:** Complete

**Size:** M · **Depends on:** 6.1

- Show pending, accepted, rejected, reconnecting, paused, and incompatible
  states without optimistic ambiguity.
- **Done when:** slow/drop tests always leave the player knowing whether an
  action happened.

### 6.3 — Complete full-match and adversarial transport tests

**Status:** Complete for the local automated boundary

**Size:** L · **Depends on:** 6.2

- Run thirteen hands with delay, loss, duplication, refresh, direct/relay
  changes, illegal commands, and malformed payloads.
- **Done when:** all clients finish with identical scores or stop through the
  documented safe failure path.

## Phase 7 — Results, settings, rules, and polish

**Status:** Implementation complete — locally verified 29 July 2026;
representative Android Chrome and iPhone Safari physical-device polish remains
part of the Phase 8 beta/release gate

### 7.1 — Complete hand and final result experiences

**Status:** Complete

**Size:** M · **Depends on:** Phase 6

### 7.2 — Add rules and house-rule display

**Status:** Complete

**Size:** S · **Depends on:** Phase 0 contract

### 7.3 — Add settings and completed-match summaries

**Status:** Complete

**Size:** M · **Depends on:** 7.1

### 7.4 — Complete visual, motion, haptic, and sound polish

**Status:** Complete for the local automated boundary; audio remains
intentionally absent and optional

**Size:** M · **Depends on:** 7.1–7.3

- Tune the already functional shuffle/deal, draw, discard, meld, wild-swap,
  sort, and completion animations on representative phones; keep audio
  optional and out of the basic animation dependency.
- **Done when:** motion is smooth, interruptible, privacy-safe, synchronized to
  accepted state, and equivalent with reduced motion enabled.

### 7.5 — Complete responsive and accessibility verification

**Status:** Complete for the local automated boundary

**Size:** M · **Depends on:** 7.4

**Phase 7 exit:** The complete product is understandable, accessible, and
visually consistent on supported phones.

## Phase 8 — Real-phone beta and release gate

### 8.1 — Document deployment, limits, privacy, and recovery

**Size:** M · **Depends on:** Phase 7

### 8.2 — Run multi-network real-phone beta

**Size:** L · **Depends on:** 8.1

- Include direct and TURN-relayed sessions, background/foreground transitions,
  screen lock, refresh, service update, stale presence, reconnect, and at least
  one full thirteen-hand match.

### 8.3 — Resolve beta defects and rerun complete flows

**Size:** L · **Depends on:** 8.2

### 8.4 — Apply source and hosted-release gates

**Size:** M · **Depends on:** 8.3

- Confirm provider accounts, budget alerts, domain/configuration, security,
  privacy notice, support route, licence, and whether the hosted build is
  private, small-community, or public.
- **Done when:** the owner explicitly releases or withholds the hosted game.

## Critical path

`Phase 0 rules + trust + network spike → PWA shell → deterministic engine → local integration harness → lobby service → peer transport → full online game → real-phone beta`

Do not begin provider-specific lobby implementation before the Phase 0
real-phone rendezvous/WebRTC spike. Do not debug rules through a live network:
the deterministic local fixtures are the authority for game behaviour.

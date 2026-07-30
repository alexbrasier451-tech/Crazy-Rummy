# Crazy Rummy v1.1 — Graphics-overhaul roadmap

**Status:** Stages 1.1.2–1.1.6 implemented; Stage 1.1.7 automated evidence
complete; public release remains gated by immutable-source reconciliation,
physical-device/accessibility proof, and owner creative acceptance  
**Creative authority:** [Creative execution directive](CREATIVE_EXECUTION_DIRECTIVE.md)  
**Coordination authority:** [Beta coordination](BETA_COORDINATION.md)

## Purpose and operating boundary

Version 1.1 is a complete, premium presentation rebuild for **The Midnight
Limited**, not a safe reskin of the MVP. It preserves Crazy Rummy's game rules,
routes, privacy boundaries, acknowledgement semantics, offline honesty, and
accessibility commitments while maximising authored visual identity, card
craft, environmental atmosphere, route-specific composition, and directed
game-event feedback.

The existing beta is an active source of truth for live route, state, DOM, and
interaction contracts. Until the project owner explicitly signs that beta
complete and its exact revision reaches an agreed integration window, this
roadmap authorises only planning, concept work, canonical-fixture keyframes,
token and asset/provenance preparation, and documentation. It does not
authorise production CSS, markup, component, test-baseline, manifest, or asset
changes. The owner beta-complete gate and
[beta reconciliation gate](BETA_COORDINATION.md#beta-reconciliation-gate)
remain required before public release acceptance.

The project owner's 30 July 2026 controller instruction expressly opened
implementation through Stage 1.1.7 against the approved Compartment Table
direction. It did not supply an immutable Git revision or waive release
evidence, so those controls remain open for public activation.

All production work is free-only: no paid software, asset licence, hosting,
CDN, payment card, or metered runtime dependency. Original local SVG, CSS,
open-font, and selectively generated raster assets are permitted only with the
provenance required by the [zero-budget toolchain](ZERO_BUDGET_TOOLCHAIN.md).

## Stage 0 — v1.1 contract and owner sign-off

**Goal:** authorise a coherent visual programme without treating approval as
evidence that implementation has happened.

### Required sign-off record

Before the owner signs Stage 0, the package must contain or explicitly point to:

1. The proposed creative north star, avoid-list, product constraints, quality
   priority order, and free-only boundary in [the design bible](VISUAL_DESIGN_BIBLE.md)
   and [the v1.1 overview](README.md), presented for explicit owner acceptance.
2. The binding creative ambition, transformation-depth, signature-moment,
   authored-card, environmental, three-way divergence, and owner-final-judgement
   requirements in [the directive](CREATIVE_EXECUTION_DIRECTIVE.md).
3. The complete route, state, interaction, accessibility, and acknowledgement
   contract in [the screen and flow specification](SCREEN_AND_FLOW_SPEC.md).
4. A delivery sequence, architecture boundaries, performance constraints, and
   release proof requirements in [the implementation plan](IMPLEMENTATION_PLAN.md)
   and [QA acceptance](QA_ACCEPTANCE.md).
5. This roadmap's stage gates and the beta baseline/reconciliation contract in
   [beta coordination](BETA_COORDINATION.md).
6. A named owner, dated decision, and one of **Approved**, **Approved with
   recorded conditions**, **Hold**, or **Rejected**. An approval with conditions
   must name the condition owner and re-review point; it cannot silently turn
   into production authorisation.

### Stage 0 approval questions

- Does the owner accept that generic dark-green/brass recolouring, boxed
  dashboard repetition, decorated default cards, and convenient restraint are
  failures rather than acceptable delivery shortcuts?
- Does the owner accept the Midnight Limited direction, avoid-list, hierarchy
  of truth/clarity/accessibility/performance before craft/spectacle, and final
  subjective authority over whether the boat was pushed out sufficiently?
- Is the planned work clearly a presentation overhaul, with no implied change
  to rules, server/host authority, hidden information, route paths, or the
  acknowledgement boundary?
- Are the Stage 1 concept deliverables and their canonical beta fixtures
  sufficient to make a real creative decision rather than approve vague mood
  language?
- Is the active beta chain identified, with a baseline revision and future
  integration window still to be set under beta coordination?

### Stage 0 exit and what it does *not* prove

Stage 0 is ready for sign-off when the questions above are answered, the linked
package is internally consistent, and the owner chooses a dated verdict. It
permits **concept development only** while beta remains active.

It does not prove a route has been rebuilt, a card has been implemented, a
motion sequence is truthful, a device is performant, an asset is licensed, or
an accessibility state works. Those are implementation and release-evidence
gates, not Stage 0 evidence. No completed checklist can override the owner's
final creative judgement.

## Stage 1 — three-way creative divergence and keyframe approval

**Goal:** make a deliberate artistic choice before components constrain it.

**Controller record:** The reproducible three-way package is built in
[Stage 1.1.1](stage-1.1.1/README.md), and the owner approved Compartment Table
on 30 July 2026. The exact immutable-beta reconciliation remains open.

For both the 390 × 844 lobby and a busy six-player 390 × 844 live-game fixture,
produce three materially different concepts. They must differ in composition,
depth, card staging, information hierarchy, and environmental idea—not merely
colour, spacing, texture, or ornament. Every concept records its Crazy Rummy
specificity, its interaction/accessibility protection, the selected treatment,
and why rejected concepts were generic, weak, or otherwise non-preferred.

Required approval set:

- Lobby: healthy-online and empty/offline variants.
- Live game: active local turn, large private hand, stock/discard, melds, six
  seats, current wild rank, score/progress, and an honest connection state.
- Responsive live-game variations at 320 × 568 and 768 × 900.
- Reduced-motion and forced-colour representations of the selected gameplay
  state.
- An initial route/moment signature map covering every mandatory moment in the
  directive, including arrival, deal, turn, draw, discard, meld, reconnect,
  hand result, next wild rank, and final reveal.

Reduced-motion and forced-colour concept representations demonstrate the
intended alternative design treatment only. They do not constitute
implementation, interaction, accessibility, or device evidence.

**Exit evidence:** source boards/keyframes, exports, fixture identity and
revision, concept-selection rationale, initial asset-register entries, and
owner-approved direction. This approval selects a direction; it is not
permission to implement against a stale beta baseline.

## Stage 2 — foundations and asset production plan

**Goal:** make a local, performant authored system ready to integrate.

- Define semantic colour, typography, geometry, depth, texture, z-order, and
  motion roles; include forced-colour, increased-contrast, reduced-motion, and
  degraded/data-saving variants.
- Finalise open-font choice, subsetting policy, local SVG rules, and asset
  provenance register before any production import.
- Design original wordmark/insignia, route notation, ticket marks, wild-rank
  marks, status/loading treatments, card back, card face, and court or abstract
  card language as one system.
- Evaluate high-impact raster/generated assets only where they materially beat
  CSS/SVG; record provenance, source, licence/terms, optimisation, dimensions,
  fallbacks, and intended route.
- Plan measurable first-paint, route-art, decoded-image, and font budgets from
  [QA acceptance](QA_ACCEPTANCE.md#7-asset-loading-and-resilience-budgets).

**Exit evidence:** annotated masters, planned optimised outputs, provenance
records, semantic token map, and budget forecast. Production integration waits
for the beta reconciliation gate.

## Stage 3 — shell and pre-game route programme

**Goal:** give arrival, identity, lobby, creation/join, and waiting their own
directed Midnight Limited experiences—not a shared dashboard shell.

- Arrival and restoration: route-line resolve, identity/recovery truth, and a
  designed offline or unavailable state.
- Identity: a compact personal ticket/seat composition with validation and
  single-flight acknowledgement feedback.
- Lobby: a living departure board/table discovery composition, with clearly
  distinct healthy, stale, empty, error, offline, create, join, and capacity
  states.
- Waiting room: a carriage/seat arrangement whose readiness, ownership,
  reconnection, copy/share, and start blockers remain explicit.

**Exit evidence:** all pre-game route/state captures, keyboard/touch/reduced
motion behaviour, route-signature record entries, and beta-aligned fixture
tests.

## Stage 4 — gameplay and authored-card hero programme

**Goal:** rebuild the live table as the operational centrepiece while preserving
private/public boundaries and authoritative truth.

- Compose match header, shared table, seat signals, stock/discard, meld field,
  private hand, action dock, network rail, and decision sheets around active
  play rather than decorative panels.
- Deliver cards as a single authored system: face/back, court or abstract
  art, wild rank, selected/playable/invalid/grouped/new/discard-candidate and
  pending/rejected states, compact legibility, hand fan/reflow, public piles,
  and movement continuity.
- Direct the accepted deal, opening hand, turn cue, draw, discard pickup,
  arrange/sort, meld, layoff, wild replacement, invalid action, discard,
  next-player, and reconnect moments. Pending or uncertain actions must never
  complete visually before acknowledgement.
- Provide equivalent touch, keyboard, screen-reader, forced-colour, and
  reduced-motion behaviour for every card movement and state.

**Exit evidence:** gameplay capture matrix, motion/acknowledgement traces,
card-behaviour mapping, six-player/long-hand/short-viewport review, and
creative-coverage record updates.

## Stage 5 — results, reference, and resilient-route programme

**Goal:** make hand result, final result, rules, settings, install/update,
offline, and error states feel authored and complete.

- Treat hand score reveal and next-wild-rank progression as concise editorial
ticket/route moments.
- Give final results a distinctive terminus/winner composition without hiding
ties, forfeits, history, retry, or return-to-lobby truth.
- Make rules a readable timetable/reference, and settings an honest preference
surface rather than a decorative duplicate of the lobby.
- Design loading, reconnecting, conflict, unavailable, update, offline, and
empty states with the same authored care as successful routes.

**Exit evidence:** route-specific captures for normal and adverse states,
truthfulness checks, long-content/zoom review, and signature-map completion.

## Stage 6 — motion, feedback, and performance reconciliation

**Goal:** make spectacle directed and reliable rather than expensive ambient
decoration.

- Bind meaningful card and route motion to local selection or accepted
authoritative revisions; provide immediate stable feedback for pending,
rejected, paused, and uncertain actions.
- Audit transforms, paint scope, image decode, texture density, motion
interruption, resize, route change, recovery, reduced motion, and battery
behaviour against the approved budgets.
- Evaluate optional sound/haptics only if they remain optional, do not reveal
private state, and have accessible silent equivalents.

**Exit evidence:** scripted timing traces, real-device recordings, performance
measurements, degraded-mode captures, and recorded mitigation for any budget
or interaction constraint.

## Stage 7 — QA, real-device proof, and creative release evidence

**Goal:** prove both dependable behaviour and substantial visual transformation.

- Run the full route/state, viewport, zoom, forced-colour, reduced-motion,
  keyboard, screen-reader, offline/PWA, direct/relay, reconnect, and
  orientation matrix in [QA acceptance](QA_ACCEPTANCE.md).
- Use actual Android Chrome, Android installed PWA, iPhone Safari, iPhone
  installed PWA, and desktop browser evidence; emulation cannot close a
  physical-device gate. The constrained Android and iPhone capability classes
  in [QA acceptance](QA_ACCEPTANCE.md#browser-and-physical-device-release-set)
  are mandatory; faster devices may supplement but cannot replace them.
- Produce the directive's creative-coverage record: every route, signature
  moment, card state/movement behaviour, environmental technique disposition,
  original asset/provenance, and constraint-driven reduction in spectacle.
- Treat creative underreach as P1. “Too difficult,” “too much work,” or an
  adequate old component are never reasons to close the gate.

**Release exit:** all technical and human evidence is present, no P0/P1 blocker
remains without an explicit approved exception, and the owner judges the result
to have pushed the boat out sufficiently. Automated success alone cannot pass
this gate.

## Cross-stage control rules

1. The creative directive governs where a less ambitious reading of a planning
   document would otherwise be possible.
2. Production work requires the project owner's explicit beta-complete
   sign-off and reconciliation against that exact immutable revision. If the
   signed beta revision changes, the completion decision and reconciliation
   gate reopen. A final reconciliation is required immediately before release
   baseline capture; no screenshot baseline survives an unreviewed contract
   change.
3. Every lower-spectacle alternative must name the higher-priority constraint
   or measured budget requiring it and show the strongest compliant replacement.
4. Route and state completeness includes loading, empty, stale, offline,
   recoverable, blocking, long-content, and resumed states—not just happy-path
   screenshots.
5. Owner approval is a deliberate gate, never a substitute for implementation
   evidence or an automatic permission to broaden scope beyond presentation.
6. Production implementation may be developed, tested, and merged incrementally
   by stage only behind a disabled development flag or otherwise isolated
   integration path. Public activation must be atomic: all in-scope routes must
   use the accepted v1.1 presentation system before any of them are enabled in
   production. The legacy presentation must remain available as the rollback
   path until Stage 7 release acceptance is complete. A mixed legacy/v1.1
   production experience is not an acceptable intermediate release.

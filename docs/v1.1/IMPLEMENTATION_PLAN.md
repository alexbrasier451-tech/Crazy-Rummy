# Crazy Rummy v1.1 — Graphics Overhaul Implementation Plan

**Status:** Stage 0 and Compartment Table direction owner-approved; beta
application promoted to `1.0.0`; production implementation is not authorised
by this document until immutable-beta reconciliation closes  
**Budget constraint:** No paid software, asset licence, hosting, CDN, or
metered runtime dependency  
**Integration authority:** One v1.1 release owner
**Beta authority:** [Beta coordination and reconciliation](BETA_COORDINATION.md)

## 1. Delivery strategy

The overhaul should evolve the existing presentation layer rather than replace
the application architecture. Crazy Rummy already has semantic screen
composition, deterministic game rules, authoritative online state, a PWA
boundary, and a broad test suite. Rewriting those foundations would consume
the budget of attention that should go into polish.

While the beta chain is changing, this plan authorises documentation, three-way
concept divergence, canonical-fixture keyframes, token and asset/provenance
planning, and reconciliation preparation only. Workstreams A–E may enter
production implementation only after the owner approves the Stage 1 visual
evidence, the project owner explicitly signs the beta complete, and the
[beta reconciliation gate](BETA_COORDINATION.md#beta-reconciliation-gate)
records that exact signed revision and its integration window.

Recommended approach:

- keep the current vanilla JavaScript screen and component contracts;
- introduce a v1.1 token layer before changing individual screens;
- treat graphics as local, versioned build inputs;
- add progressive enhancement for motion and visual effects;
- keep the existing route and gameplay tests green after every work package;
- capture approved screenshot fixtures for human review without turning
  pixel-level diffs into the only correctness oracle;
- ship only when every public route and gameplay state has crossed the new
  visual system.

## 2. Architecture boundaries

### 2.1 Stable by default

Do not change unless a visual requirement proves it necessary:

- engine, event, scoring, projection, and privacy logic;
- online provider, signalling, transport, host-authority, and recovery logic;
- route paths and deep-link behaviour;
- accepted-action feedback semantics;
- saved game and completed-summary formats;
- service-worker honesty and GitHub Pages base-path behaviour;
- existing semantic labels, live-region policy, focus containment, and
  reduced-motion preference.

### 2.2 Expected presentation changes

- design tokens and typography;
- app shell, layout primitives, panels, actions, chips, forms, overlays, and
  feedback surfaces;
- card faces, card backs, hand tray, meld groups, stock, and discard pile;
- startup, lobby, waiting room, gameplay, results, rules, and settings
  composition;
- local SVG/raster/font assets and their build paths;
- motion primitives and optional progressive view transitions;
- test fixtures and screenshot harnesses needed to verify the new states;
- PWA icons, splash treatment, manifest theme colours, and metadata imagery.

### 2.3 Dependency policy

The runtime should remain dependency-light. Prefer CSS, SVG, Web Animations,
and small local utilities over a UI framework, component library, icon runtime,
canvas engine, or animation framework. A new dependency requires:

1. a named capability the platform cannot reasonably provide;
2. compatible open-source licensing;
3. local/offline operation;
4. a measured size and performance cost;
5. an exit path that does not require redesigning the application.

## 3. Preparation gate — approve two keyframes

Before production work:

1. Obtain the project owner's explicit beta-complete sign-off and record its
   exact immutable revision; concept work may precede this, production work may
   not.
2. Produce at least three materially different lobby compositions and three
   materially different live-game compositions. They must differ in structure
   or visual concept, not merely colour, spacing, texture, or ornament.
3. For each selected direction, explain what makes it distinctive, why it
   belongs to Crazy Rummy, how it exceeds a conventional PWA reskin, how it
   protects interaction, and what was rejected as too generic, weak, or
   expensive.
4. Create a 390 × 844 lobby keyframe with empty and healthy-online variants
   from the selected direction.
5. Create a 390 × 844 six-player live-game keyframe with a busy table, large
   hand, current action, and network status.
6. Create the same live-game state at 320 × 568 and 768 × 900.
7. Create reduced-motion and forced-colour representations.
8. Approve the palette, typography, card face, card back, action hierarchy,
   and material density.
9. Map a distinctive visual idea to every major route and every named moment
   in the [creative execution directive](CREATIVE_EXECUTION_DIRECTIVE.md).
10. Reconcile the selected direction against the exact owner-signed beta
    revision under [beta coordination](BETA_COORDINATION.md).
11. Reject or revise the direction before producing the full asset set.

**Exit evidence:** all concept alternatives, the selection/rejection rationale,
approved exports, source files, the route/moment signature map, design decision
notes, and initial asset-register entries.

## 4. Workstream A — foundations

### A1. Token architecture

- Map legacy tokens to the proposed semantic v1.1 roles.
- Add colour, typography, spacing, geometry, depth, texture, motion, and
  z-order tokens.
- Define increased-contrast, forced-colour, reduced-motion, and
  data-saving/degraded variants.
- Remove literal colour names from component decisions where a semantic role
  exists.

**Focused checks:** token contrast contracts, design-system unit tests, forced
colour inspection, legacy token usage report.

### A2. Font and icon foundation

- Acquire approved open-font files and licence texts.
- Subset only the characters and weights justified by the UI.
- Add preload only if measurement shows it improves first render.
- Curate a small local SVG icon set; do not bundle an entire library.
- Establish icon sizing, optical alignment, label, and filled-state rules.

**Focused checks:** offline load, fallback-font layout, 200% text, licence
register completeness, font/icon byte budget.

### A3. Material and asset pipeline

- Create source and optimised directories.
- Produce card-back, texture, route, ticket, wild, wordmark, and icon masters.
- Export deterministic SVG/AVIF/WebP/PNG variants as applicable.
- Add an asset register and build-time validation for required provenance
  fields.
- Confirm every raster has intrinsic dimensions and a lightweight fallback.

**Focused checks:** clean offline build, missing-asset failure, visual inspection
at 1×/2×/3×, image decode and total-byte reports.

**Foundation exit:** a component gallery can show all tokens, type roles,
materials, icons, cards, actions, fields, statuses, and overlays without
screen-specific styling.

## 5. Workstream B — shell, startup, and lobby

### B1. App shell

- Rebuild page depth, header, safe areas, content rhythm, skip link, and global
  focus treatment.
- Add the carriage-board title pattern and quiet atmospheric background.
- Preserve no-overflow behaviour and route semantics.

### B2. Startup and identity

- Replace the heavy splash dependency with the approved responsive composition
  and lightweight fallback.
- Apply the wordmark, single hero transition, route-status copy, identity
  ticket, field states, and offline/resume truth.

### B3. Lobby and table formation

- Establish the primary-action hierarchy.
- Redesign open tables, players, freshness, offline, empty, error, create, join,
  code, and quota/availability surfaces.
- Use ticket geometry for codes and table metadata.
- Keep polling changes calm and prevent layout thrash.

### B4. Waiting room

- Create a two-to-six-seat carriage layout with host, local, ready, dropped,
  and reconnecting distinctions.
- Make share/copy and start-state ownership unmistakable.
- Add a restrained ready progression without implying unaccepted state.

**Focused checks:** startup, smoke, lobby, waiting-room, online/offline, 320 px,
long names, six seats, 200% text, keyboard, and reduced-motion tests.

**Workstream exit:** every pre-game route uses v1.1 with no legacy surface
visible.

## 6. Workstream C — gameplay centrepiece

This is the highest-risk and highest-value workstream. It should follow the
approved keyframes and stable foundations rather than run concurrently with
token decisions.

### C1. Live-game shell and table

- Separate turn status, shared table, private hand, and action dock as clear
  visual and semantic regions.
- Apply baize field, player-seat signals, stock/discard hierarchy, meld
  grouping, route progress, and network truth.
- Preserve public/private boundaries at every width.

### C2. Card system

- Implement the approved face and back.
- Validate compact rank/suit legibility and high-contrast/forced-colour states.
- Rework selection, focus, disabled, pending, accepted, rejected, wild, and
  public-card treatments.
- Ensure overlap does not reduce accessible target size.

### C3. Hand and manipulation

- Redesign hand fan/scroll continuation, sort control, selection summary, and
  reflow.
- Keep keyboard and non-drag alternatives first-class.
- Ensure focused cards become fully visible.

### C4. Action dock and decision sheets

- Redesign draw, take discard, play meld, lay off, replace wild, discard,
  validation, uncertain action, confirmation, and leave flows.
- Keep the current legal action visually dominant.
- Preserve composed work on recoverable rejection where safe.

### C5. Authoritative motion

- Connect motion triggers to accepted revisions.
- Implement deal, draw, meld, lay-off, wild replacement, discard, sort, and
  route advancement with interruptible transform/opacity choreography.
- Provide immediate/reduced-motion equivalents.
- Cancel or reconcile motion safely on rerender, resize, route change, and
  recovery.

**Focused checks:** game UI presenters, local complete hand/match, online
three-seat game, delayed/duplicate/rejected actions, recovery, 320 px, short
viewport, 200%/400% text, keyboard, forced colours, reduced motion, and
animation-state tests.

**Workstream exit:** the original local and online end-to-end cases remain
green and the gameplay screenshot matrix is approved.

## 7. Workstream D — results and reference surfaces

### D1. Hand result

- Convert the score reveal into an editorial ticket/route moment.
- Keep owner-only detail, forfeits, ties, and zero-history cases accurate.
- Make “continue” the clear next action without turning routine hand results
  into a victory spectacle.

### D2. Final result

- Use the one permitted celebratory composition: route terminus, winner ticket,
  complete standings, match history, copy/share, and new-match action.
- Handle ties and non-winning local players with equal polish.

### D3. Rules, settings, statistics, and summaries

- Improve scanning with destination labels, anchored sections, compact tables,
  and clear preference controls.
- Preserve cached-version disclosure, privacy copy, device-specific settings,
  destructive data controls, and long-form readability.
- Do not wrap every paragraph in a decorative ticket.

### D4. Install, update, offline, and error surfaces

- Bring PWA lifecycle and recovery messaging into the same visual language.
- Ensure update and offline states remain honest and do not resemble
  gameplay failure.

**Focused checks:** results presenters, reference/settings, completed summary,
statistics, PWA update/offline, refresh restoration, owner-only detail, copy,
320 px, 400% reflow, and keyboard tests.

**Workstream exit:** all non-gameplay routes use v1.1 and long-form content
remains calmer than decision surfaces.

## 8. Workstream E — polish and release proof

### E1. Optional sound and haptic pass

- Produce only the approved minimal original sound set.
- Add explicit preference and user-gesture gating.
- Validate silence as a fully equivalent experience.
- Tune haptics on representative hardware; unsupported devices remain clean.

This package may be cut without delaying the graphics overhaul.

### E2. Performance reconciliation

- Measure cold start, warm start, route change, busy-table interaction,
  animation frames, memory, layout shift, and cache size.
- Remove or simplify effects in the degradation order from the visual bible.
- Verify the initial experience does not depend on the largest visual asset.

### E3. Broad visual and accessibility pass

- Execute the matrix in [QA and acceptance](QA_ACCEPTANCE.md).
- Review every route in default, loading, empty, healthy, stale, offline,
  recoverable error, blocking error, long-name, six-player, and resumed states
  where applicable.
- Complete keyboard, screen-reader, touch, zoom, contrast, forced-colour,
  reduced-motion, orientation, and virtual-keyboard checks.

### E4. Real-phone release gate

- Test representative iPhone Safari and Android Chrome devices.
- Include one constrained/older supported phone for frame pacing and memory.
- Validate installed-PWA mode, safe areas, rotation, background/resume,
  vibration, audio gating, touch spacing, and a complete thirteen-hand match.

**Release exit:** all required automated and human evidence is green; the
creative-coverage record is complete and owner-approved; every accepted
exception has an owner, concrete higher-priority constraint, strongest
compliant alternative, rationale, expiry, and visible user impact.

## 9. Suggested issue and pull-request structure

Use one tracking milestone: `v1.1-graphics-overhaul`.

Suggested labels:

- `v1.1/foundation`
- `v1.1/shell`
- `v1.1/gameplay`
- `v1.1/results`
- `v1.1/motion`
- `v1.1/assets`
- `v1.1/accessibility`
- `v1.1/performance`
- `v1.1/physical-device`
- `visual-regression`
- `needs-art-approval`
- `licence-review`

Pull requests should be coherent vertical slices, not arbitrary file batches.
Each includes:

- before/after captures at the affected required viewports;
- the route-specific signature idea and named moments affected;
- the materially different approaches considered and the selection/rejection
  rationale for a principal surface;
- listed state coverage;
- changed asset-register entries;
- measured byte/performance impact;
- reduced-motion and forced-colour evidence;
- focused and broad checks actually run;
- explicit note when real-device evidence remains pending.

Do not merge screenshots that show ideal fixture data only when the component
also supports empty, error, long, or live network-driven data.

## 10. Rollout and rollback

Develop on a `codex/`-prefixed feature branch or equivalent v1.1 branch.
During implementation, a development-only theme switch may compare legacy and
v1.1 screens. Incremental stage work may be developed, tested, and merged only
behind that disabled development flag or an otherwise isolated integration
path. Public activation is atomic: every in-scope route must use the accepted
v1.1 presentation system before any is enabled in production. A mixed
legacy/v1.1 production experience is not an acceptable intermediate release.

Keep rollback practical:

- retain the legacy presentation as the rollback path until Stage 7 release
  acceptance is complete;
- new assets use versioned filenames;
- manifest and cache revisions move with the visual release;
- stable screen/state contracts remain unchanged where possible;
- schema changes are avoided;
- old cached clients continue to fail honestly rather than loading a partial
  new asset set;
- the prior deployable version remains identifiable in GitHub.

## 11. Cut order if time, not money, becomes the constraint

Cut from the bottom upward:

1. Optional sound.
2. Final-result particles/foil.
3. Platform reflection and atmospheric raster layers.
4. View-transition enhancement.
5. Non-essential texture variants.

Do not cut:

- the creative execution directive's transformation depth, route-specific
  signature ideas, card-centred identity, or iteration requirement;
- card clarity and state distinctions;
- shell, lobby, gameplay, result, rules, and settings consistency;
- authoritative motion boundary;
- responsive and accessibility states;
- provenance and licence records;
- performance reconciliation;
- offline/PWA truth;
- real-phone release evidence.

## 12. Definition of done

Version 1.1 is done when:

1. Every user-facing route and major overlay uses the approved token,
   typography, material, card, icon, and component systems.
2. No legacy production surface appears during startup, online/offline lobby,
   table formation, complete local/online match, reconnect, results, rules,
   settings, install, update, or failure flows.
3. Every visual state reflects authoritative game/network truth and preserves
   private information.
4. The required screenshot, accessibility, motion, performance, offline/PWA,
   cross-browser, and physical-device gates are green.
5. All production assets have source, export, provenance, licence, and
   attribution records.
6. No critical path requires a paid plan, payment card, metered generation
   service, CDN, or third-party runtime.
7. The complete relevant automated suite and a fresh real-phone thirteen-hand
   case pass after the final visual integration.
8. The owner approves the final lobby, busy live game, hand result, final
   result, reduced-motion, forced-colour, and compact-phone captures.
9. Every major route contains a distinctive visual idea, every mandated moment
   has intentional presentation direction, and the card system is an authored
   centrepiece rather than decorated browser-default rectangles.
10. The result cannot reasonably be described by any failure condition in the
    [creative execution directive](CREATIVE_EXECUTION_DIRECTIVE.md).
11. The creative-coverage record maps every required route, moment, card
    behaviour, environmental technique, original asset, and reduction in
    spectacle, and the owner accepts that the result has pushed the boat out
    sufficiently.

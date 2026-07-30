# Crazy Rummy v1.1 — Graphics Overhaul

**Document status:** Stages 1.1.2–1.1.6 implemented in the working tree;
Stage 1.1.7 automated evidence complete; release acceptance remains open
pending immutable-source, physical-device, accessibility, and owner review  
**Scope:** Presentation implementation, local first-party assets, regression
coverage, automated visual evidence, and release-gate documentation  
**Prepared:** 29–30 July 2026  
**Working title:** **The Midnight Limited**

The Stage 1.1.1 controller package, concepts, exports, and remaining decision
gates are indexed in [the Stage 1.1.1 record](stage-1.1.1/README.md).

The 30 July 2026 controller instruction explicitly opened implementation of
Stages 1.1.2–1.1.7 against the approved Compartment Table direction. That
instruction does not manufacture the absent immutable Git revision or close
human and physical-device release acceptance. Delivery records are indexed in:

- [Stage 1.1.2 foundations](stage-1.1.2/README.md)
- [Stage 1.1.3 pre-game routes](stage-1.1.3/README.md)
- [Stage 1.1.4 gameplay](stage-1.1.4/README.md)
- [Stage 1.1.5 results and reference](stage-1.1.5/README.md)
- [Stage 1.1.6 performance reconciliation](stage-1.1.6/README.md)
- [Stage 1.1.7 release record](stage-1.1.7/RELEASE_RECORD.md)

## Decision summary

Version 1.1 is a complete presentation-layer revamp of Crazy Rummy. It keeps
the rules, privacy model, online truthfulness, route structure, and phone-first
interaction model intact while replacing the MVP visual language with a
cohesive premium game identity.

The direction is a contemporary luxury night-train card room: black enamel,
deep green baize, warm brass, cream ticket stock, crisp typography, controlled
light, and physical card motion. It is not steampunk, casino neon, a generic
glass dashboard, or a literal train simulator.

The zero-budget strategy is to spend craft instead of licence fees:

- retain the framework-free PWA and avoid a visual-engine rewrite;
- build the identity from CSS, small SVGs, self-hosted open fonts, original
  textures, and selectively generated concept material;
- reserve raster art for a small number of high-impact moments;
- use progressive enhancement for motion and effects;
- keep every production asset in the repository with recorded provenance;
- use GitHub issues, pull requests, Pages, and the existing automated browser
  suite as the production backbone.

“AAA-like” means visually ambitious, authored, cohesive, responsive,
state-complete, memorable, and polished. It does not mean photorealistic
assets, a large studio content volume, or unbounded effects. The target is
premium perceived quality on the hardware and network conditions the product
actually supports.

## Creative ambition mandate

This is not a theme swap, token refresh, component-library reskin, or restrained
modernisation exercise. Version 1.1 is expected to feel like a materially new,
premium game presentation built specifically for Crazy Rummy.

Within the product, accessibility, privacy, performance, and zero-budget
constraints, implementation should pursue the most distinctive, atmospheric,
and authored solution that can be delivered reliably. When several compliant
options exist, prefer the option with the strongest identity and greatest
perceived craft rather than the option that is easiest to implement.

Codex is explicitly expected to push beyond restyling existing controls. The
overhaul may introduce:

* bespoke route compositions rather than uniformly boxed dashboard layouts;
* layered environmental depth, controlled lighting, shadows, reflections,
  grain, wear, ticket embossing, baize texture, and other original material
  treatments;
* an authored Crazy Rummy card presentation rather than browser-default cards
  with decorative borders;
* physical-feeling dealing, drawing, sorting, discarding, melding, scoring,
  turn-change, and round-completion motion;
* cinematic but concise transitions for important game-state changes;
* distinctive loading, reconnecting, victory, defeat, empty, and error states;
* responsive ambient details that make the interface feel alive without
  obscuring game information;
* original SVG illustration, ornament, iconography, route diagrams, insignia,
  ticket marks, and decorative typography;
* a small number of high-impact raster or generated-production assets where
  they produce substantially greater visual value than CSS or SVG alone;
* route-specific visual moments rather than forcing every screen into the same
  component arrangement.

The visual system should create memorable moments, particularly when entering
the lobby, beginning a game, receiving cards, taking a turn, completing a meld,
ending a round, and revealing final results. These moments should feel
deliberately directed rather than merely animated.

The implementation must not use the constraints in this package as a reason to
default to minimalism. Restraint should be applied selectively to protect
clarity and performance, not used as the governing visual style.

A polished but generic dark interface is not an acceptable result. A collection
of existing components recoloured green, black, brass, and cream is not an
acceptable result. Decorative borders placed around the MVP layout are not an
acceptable result.

The target is for a returning player to recognise immediately that the entire
game has been rebuilt visually, while discovering that its rules, routes,
controls, privacy boundaries, and dependable behaviour remain intact.

The [push-the-boat-out execution directive](CREATIVE_EXECUTION_DIRECTIVE.md) is
binding on concept selection, implementation, review, and release sign-off.
Where this summary could be read conservatively, that directive controls.

## Stage 0 boundary

The v1.1 Stage 0 records are complete enough for the owner to accept or reject
the graphics-overhaul contract. The current verdict is **Pending owner
decision**; this package does not approve itself.

Stage 0 approval authorises Stage 1 concept divergence, keyframes, card-system
exploration, token proposals, and provenance planning. It does **not** authorise
production UI implementation.

Production implementation remains on hold while the beta chain is changing.
Before production work begins, the project owner must explicitly sign the beta
complete, that exact revision must pass the
[beta reconciliation gate](BETA_COORDINATION.md), and the owner must approve
the required Stage 1 concepts and keyframes. No v1.1 document may be used to
freeze, override, or misrepresent an evolving beta behaviour contract, and no
engineering record may substitute for the owner's beta-complete decision.

## Package index

1. [Stage 0 decision register](STAGE_0_DECISION_REGISTER.md) — resolved
   authority, constraints, precedence, beta boundary, and implementation
   consequences.
2. [Stage 0 sign-off](STAGE_0_SIGNOFF.md) — owner decision gate, evidence
   matrix, approval consequences, and explicitly deferred implementation
   evidence.
3. [v1.1 roadmap](ROADMAP.md) — staged delivery from creative divergence
   through beta reconciliation, production implementation, and release proof.
4. [Beta coordination](BETA_COORDINATION.md) — allowed concurrent work, hold
   boundary, delta log, baseline capture, and reconciliation exit test.
5. [Visual design bible](VISUAL_DESIGN_BIBLE.md) — the creative north star,
   tokens, typography, cards, components, materials, motion, sound, and
   accessibility constraints.
6. [Creative execution directive](CREATIVE_EXECUTION_DIRECTIVE.md) — mandatory
   transformation depth, signature experiences, divergence, authored detail,
   and explicit creative failure conditions.
7. [Screen and flow specification](SCREEN_AND_FLOW_SPEC.md) — the intended
   composition and state treatment for every route and major decision surface.
8. [Zero-budget toolchain](ZERO_BUDGET_TOOLCHAIN.md) — recommended Codex
   capabilities, external tools, licence policy, asset register, and export
   pipeline.
9. [Implementation plan](IMPLEMENTATION_PLAN.md) — delivery sequence,
   architecture boundaries, work packages, gates, and rollback strategy.
10. [QA and acceptance](QA_ACCEPTANCE.md) — visual matrices, performance
   budgets, accessibility checks, real-device evidence, and release sign-off.

## Non-negotiable product constraints

The overhaul must not:

- change game rules, scoring, hidden-information boundaries, or accepted-event
  semantics;
- depict a network action as complete before authoritative acknowledgement;
- animate or reveal an opponent's private card identity;
- make colour, motion, sound, drag, hover, or haptics the only carrier of
  meaning;
- require an account, paid design service, payment card, metered AI runtime,
  third-party CDN, or always-online asset host;
- weaken the existing 320 px, 200% text, 400% zoom, keyboard, screen-reader,
  forced-colour, reduced-motion, offline-shell, or safe-area expectations;
- hide an active action, validation message, reconnect status, or destructive
  scope behind decoration;
- copy a living artist's style, a protected game identity, railway brand
  marks, or recognisable copyrighted characters.

## Visual quality priorities

When constraints compete, use this order:

1. Game-state truth and privacy.
2. Legibility and action clarity.
3. Input reliability and accessibility.
4. Stable performance on supported phones.
5. Cohesion and authored detail.
6. Spectacle.

No effect survives by making a higher priority worse.

Within the limits established by priorities 1–4, Codex must maximise
priorities 5 and 6 rather than merely satisfy them.

## Stage 1 approval gates

Production implementation should begin only after the owner approves:

- the completed beta and its exact immutable revision;
- the reconciliation record for that owner-signed beta revision;
- the **Midnight Limited** direction and explicit avoid-list;
- three materially different structural concepts for each approval keyframe,
  with the selection and rejected alternatives explained;
- the proposed palette and type pairing;
- one 390 × 844 lobby keyframe;
- one 390 × 844 live-game keyframe containing a busy six-player state;
- one reduced-motion version of the same live-game state;
- the asset licence and provenance policy;
- the performance budgets and real-phone release gate.

Approval of a still keyframe does not approve its motion, responsive, error, or
accessibility states. Those remain independent acceptance gates.

Reduced-motion and forced-colour concept representations demonstrate the
intended alternative design treatment only. They do not constitute
implementation, interaction, accessibility, or device evidence.

## Recommended delivery boundary

Version 1.1 must ship as one coherent visual release after all in-scope routes
use the accepted presentation system. Incremental development, testing, and
merge are permitted only behind a disabled development flag or otherwise
isolated integration path. Public activation must be atomic. The legacy
presentation remains available as the rollback path until Stage 7 release
acceptance is complete. A mixed legacy/v1.1 production experience is not an
acceptable intermediate release.

The safest implementation order is foundations, shell and lobby, gameplay,
results/reference surfaces, motion and feedback, then broad visual QA. See the
[implementation plan](IMPLEMENTATION_PLAN.md) for the full sequence.

# Crazy Rummy v1.1 — Stage 0 Decision Register

**Status:** Owner-approved on 30 July 2026 through the controlling Codex task  
**Date opened:** 30 July 2026  
**Decision owner:** Crazy Rummy project owner  
**Stage boundary:** Graphics-overhaul authority only; this record does not
approve production UI implementation, dependencies, or production assets.

## Purpose and decision rule

This register turns the v1.1 graphics-overhaul package into a decision-ready
Stage 0 authority record. It preserves the approved product contract from the
original Phase 0 while setting the creative, technical, and evidence boundaries
for the new presentation work.

An owner approval of this Stage 0 authorises **Stage 1 concept and keyframe
exploration only**. It does not authorise production CSS, component, route,
PWA, dependency, runtime, or asset integration. Those changes remain on hold
until the project owner signs the beta complete, that exact revision has been
reconciled, and the owner approves the selected keyframes and their required
variants. Reconciliation preparation while beta is active does not satisfy
that gate.

The owner retains final authority over visual sufficiency. Completing a
checklist, automated evidence, or later technical gates cannot substitute for
that judgement.

## Confirmed v1.1 decisions for owner sign-off

| ID | Decision | Authority and implementation consequence |
| --- | --- | --- |
| V11-C01 | **Version and scope.** v1.1 is a complete, presentation-layer graphics overhaul of Crazy Rummy, not a rules, privacy, online-authority, route-contract, or product-model rewrite. | Preserve the existing game/state contracts and route behaviour. Transform every user-facing presentation surface as one coherent release rather than shipping a generic partial reskin. |
| V11-C02 | **Creative direction.** The working direction is **The Midnight Limited**: a contemporary luxury night-train card room using black enamel, deep green baize, warm brass, cream ticket stock, crisp typography, controlled lighting, and physical card motion. | Pursue an abstract, authored night-train world. Avoid steampunk, casino neon, literal railway simulation, generic glass dashboards, copied railway brands, and protected identities. |
| V11-C03 | **Creative ambition is binding.** v1.1 must be visually ambitious, authored, cohesive, responsive, state-complete, memorable, and polished. A tasteful dark reskin, green/brass recolour, decorative borders around the MVP, generic luxury dashboard, or conventional cards with ornament is a failure. | When compliant options exist, choose the strongest Crazy Rummy identity and perceived craft—not the easiest implementation. Additional effort alone is never a valid reason to reduce ambition. |
| V11-C04 | **Priority order.** Game-state truth and privacy, legibility/action clarity, input reliability/accessibility, and stable supported-phone performance take precedence over cohesion/authored detail and spectacle. | No visual treatment may imply an accepted action before acknowledgement, reveal private cards, obscure a decision, or degrade access/performance. Within priorities 1–4, maximise priorities 5–6 rather than merely satisfy them. |
| V11-C05 | **Presentation replacement permission.** Existing MVP presentation structures are not protected merely because they exist. | Stage 1 may propose materially different markup anatomy, card arrangement, hierarchy, route composition, responsive staging, decorative systems, and choreography, provided product semantics remain intact. |
| V11-C06 | **Cards are the hero system.** Cards are the visual and interactive centrepiece, not browser-default rectangles with styling. | The selected system must eventually cover face/back, rank/suit/wild legibility, states, overlap/fan, deck/discard/meld/score presentation, authoritative movement, touch, keyboard, screen reader, reduced motion, and rejection/recovery. |
| V11-C07 | **Route and moment direction.** Every major route requires a route-specific visual idea, and every named game-flow moment requires intentional presentation direction. | Arrival, lobby, table formation, live-game transition, deal, turn, card actions, meld, rejection, reconnect, hand/round progress, kings hand, and final results cannot be treated as ordinary DOM updates with generic transitions. |
| V11-C08 | **Concept divergence.** Before selecting each approval keyframe and principal gameplay surface, at least three materially different structural or presentation concepts must be considered. | Alternatives must differ in composition or visual concept, not only colour, spacing, texture, or ornament. The selection and rejected alternatives require a concise rationale. |
| V11-C09 | **Zero-budget boundary.** v1.1 must not require a paid plan, payment card, paid software, asset licence, hosted CDN, third-party runtime asset host, or metered generation/runtime dependency. | Use local, versioned, licence-compatible sources and runtime derivatives. A free tool/service may be explored only when it is not a release-critical paid/hosted dependency and has a documented local fallback. |
| V11-C10 | **Asset provenance.** Every production visual, font, sound, imported source, generated source, and substantial derivative must be traceable. | Production adoption requires an asset-register entry with source/derived paths, origin, rights/licence evidence, version/date, modifications, review, hashes, notices, and generated-art prompt/brief provenance where applicable. Unknown or unclear material stays quarantined. |
| V11-C11 | **Runtime and dependency boundary.** The PWA remains dependency-light and local-first. | Prefer CSS, SVG, Web Animations, and small local utilities. A new dependency needs a named platform gap, compatible licence, local/offline operation, measured size/performance cost, and a practical exit path. No visual-engine rewrite is authorised by Stage 0. |
| V11-C12 | **Accessibility and resilient operation.** The v1.1 experience must preserve the existing 320 px, zoom/text-scale, keyboard, screen-reader, forced-colour, reduced-motion, offline-shell, safe-area, and PWA-truth boundaries. | Colour, motion, sound, drag, hover, and haptics are never the only carrier of meaning. Visual degradation removes spectacle before clarity, interaction, privacy, or honest recovery states. |
| V11-C13 | **Authoritative state and privacy.** Presentation does not change accepted-event semantics or hidden-information boundaries. | Pending, uncertain, rejected, stale, offline, and accepted states remain visibly distinct. Card travel, score/turn advances, and victory feedback occur only after authoritative acceptance; opponents’ private card identities are never exposed. |
| V11-C14 | **Beta-concurrent working mode.** The active beta chain may continue to change routes, screens, state shapes, and integration boundaries. | Documentation, direction boards, concept exploration, keyframes, asset policy, motion/reduced-motion concepts, and a beta-delta log may proceed concurrently. Do not freeze beta work or infer its final presentation contract from this register. |
| V11-C15 | **Production implementation hold.** Production visual changes must wait for the project owner's beta-complete sign-off, exact-revision reconciliation, and owner keyframe approval. | Before any production UI implementation, record the immutable beta revision the project owner signed complete, reconcile the selected direction against its routes, state contracts, gameplay flows, accessibility states, and integration point, then obtain owner approval for the required keyframes/variants. If that signed revision changes, both beta completion and reconciliation reopen. |
| V11-C16 | **Creative acceptance evidence.** Creative ambition must be demonstrated, not asserted. | Before release, a creative-coverage record maps routes, signature moments, card states/movements and input alternatives, environmental treatments, original assets/provenance, and every constrained reduction in spectacle. A rejected/deferred treatment needs the preferred design, concrete constraint, violated higher priority or measured budget, and strongest compliant alternative. |
| V11-C17 | **Owner authority.** The owner decides whether the result has pushed the boat out sufficiently. | Automated checks, completed work packages, visual-regression passes, and technical compliance do not override owner judgement. |

## Governing evidence

The following documents govern this record. Their existence defines the
contract; it does **not** mean their future keyframes, assets, test captures,
or implementation evidence already exist.

| Governing document | Stage 0 relevance | Evidence status |
| --- | --- | --- |
| [v1.1 package overview](README.md) | Scope, decision summary, constraints, priority order, approval gates, and coherent-release boundary. | Stage 0 owner-approved; Compartment Table direction owner-approved. |
| [v1.1 roadmap](ROADMAP.md) | Stage 0 consequence, Stage 1 divergence, beta reconciliation, production workstreams, and release proof. | Proposed delivery authority; production hold explicit. |
| [Beta coordination](BETA_COORDINATION.md) | Allowed concurrent work, owner beta-complete authority, canonical fixtures, baseline/delta ownership, integration window, reruns, and no-stale-baseline rule. | Binding coordination gate; owner beta-complete decision, baseline, and integration window intentionally pending. |
| [Visual design bible](VISUAL_DESIGN_BIBLE.md) | Midnight Limited north star, identity, materials, cards, motion, responsive and accessibility principles. | Proposed direction; no approved keyframes or production assets claimed. |
| [Creative execution directive](CREATIVE_EXECUTION_DIRECTIVE.md) | Binding ambition, divergence, route/moment, card-hero, environmental, failure, and owner-authority requirements. | Binding requirement for selection, implementation, review, and release sign-off. |
| [Screen and flow specification](SCREEN_AND_FLOW_SPEC.md) | Route-specific composition, truthful states, flow moments, semantic and accessibility constraints. | Design specification; requires beta reconciliation before production use. |
| [Zero-budget toolchain](ZERO_BUDGET_TOOLCHAIN.md) | Free-only tool/asset policy, local ownership, provenance, quarantine, export, and runtime boundaries. | Policy selected; no v1.1 asset adoption claimed. |
| [Implementation plan](IMPLEMENTATION_PLAN.md) | Stage sequence, preparation gate, workstreams, dependency policy, beta-safe delivery and definition of done. | Stage 0 plan ready; production implementation not authorised by this record. |
| [QA and acceptance](QA_ACCEPTANCE.md) | Release evidence, creative-ambition gate, accessibility, performance, PWA, and device acceptance. | Planned criteria; no v1.1 checks or release evidence claimed. |
| [Original Phase 0 decision register](../phase-0/STAGE_0_DECISION_REGISTER.md) | Approved product, rules, privacy, online, phone, zero-cost, and reconnect boundaries that v1.1 must not rewrite. | Approved baseline contract. |
| [Original Phase 0 sign-off](../phase-0/PHASE_0_SIGNOFF.md) | Confirms the original implementation foundation and limits of its authorisation. | Approved baseline; does not approve v1.1 production work. |

## Remaining Stage 1 gates

Stage 0 is decision-ready, but Stage 1 remains responsible for producing—not
retroactively claiming—the following evidence:

1. Reconcile the current beta implementation into a dated delta log covering
   routes, state contracts, gameplay moments, screen variants, and integration
   risks relevant to v1.1.
2. Produce three materially different lobby concepts and three materially
   different busy six-player live-game concepts at 390 × 844, with selection
   and rejection rationale.
3. Produce the selected 390 × 844 lobby and busy live-game keyframes, plus the
   required 320 × 568 and 768 × 900 live-game variants and reduced-motion and
   forced-colour representations.
4. Define the selected palette/type pairing, card face/back direction, action
   hierarchy, material density, and the initial route/moment signature map.
5. Record the concept assets and any proposed original/imported/generated
   material in the appropriate provenance workflow before production use.
6. Obtain explicit owner approval of the reconciled selected keyframes and
   variants. Only then may a later authority decision open production UI work.

## Owner decision checklist

The owner should mark each line explicitly. A blank, unmarked, or conditional
line is not approval.

| Decision | Owner mark / date | Notes or conditions |
| --- | --- | --- |
| Approve v1.1 as a presentation-layer graphics overhaul that preserves the approved product contract. | ____________________ | ____________________ |
| Approve **The Midnight Limited** direction and avoid-list. | ____________________ | ____________________ |
| Accept the binding creative execution directive, including owner final authority and failure conditions. | ____________________ | ____________________ |
| Accept the priority order: truth/privacy, clarity, accessibility/input, performance, then craft and spectacle. | ____________________ | ____________________ |
| Authorise Stage 1 concept/keyframe exploration, beta-reconciliation preparation, and pre-production documentation only. | ____________________ | ____________________ |
| Confirm that production UI implementation, dependencies, and production asset integration remain on hold pending owner beta-complete sign-off, exact-revision reconciliation, and keyframe approval. | ____________________ | ____________________ |
| Approve the free-only, local/provenance, dependency-light production boundary. | ____________________ | ____________________ |
| Approve the Stage 1 gates and requirement for later creative-coverage evidence. | ____________________ | ____________________ |

## Stage 0 consequence

**If approved:** Stage 1 may explore, document, compare, and present concepts
and keyframes while beta development continues. It may not alter production UI
or claim release readiness.

**If not approved:** v1.1 remains documentation-only. Existing beta work and
the approved original product contract continue unchanged.

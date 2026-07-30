# Stage 1.1.1 build report

**Status:** Built, verified, and owner-approved  
**Controller:** Codex primary agent  
**Date:** 30 July 2026

## Scope

This work package builds reproducible pre-production concepts and review
evidence. It does not modify `src/` or `public/`, add a production dependency,
or claim that a still representation proves runtime accessibility, motion,
performance, device behaviour, or final creative acceptance.

## Built surfaces

- three structurally different 390 × 844 lobby concepts;
- three structurally different 390 × 844 busy six-seat game concepts;
- recommended Compartment Table healthy and empty/offline lobby variants;
- recommended gameplay at 320 × 568, 390 × 844, and 768 × 900;
- recommended reduced-motion and forced-colour gameplay representations;
- visible fixture/provenance plates on every export;
- controller decision, fixture/privacy, route signature, and asset records.

## Verification

This section is completed from commands actually run after integration.

| Check | Result |
| --- | --- |
| Pre-change `pnpm test:unit` | 246 passed |
| Pre-change `pnpm build` | Passed |
| Focused Stage 1 contract test | 3 passed |
| Focused Stage 1 browser/export check | Passed: three concepts, lobby/game, offline truth, privacy, 320/390/768 containment, 44 px controls, reduced motion, forced colours, 11 exact-size temporary exports |
| Repository keyframe capture | Passed: 11 PNGs plus manifest regenerated from source |
| Post-promotion production unit suite | 250 passed, including package/in-app `1.0.0` agreement |
| Post-promotion production build | Passed; JavaScript content hash advanced and bundle sizes remained stable |
| Post-promotion browser smoke | Passed: navigation, accessibility, and responsive smoke checks |
| Supported broader `pnpm check` | Passed: unit, build, online lobby/transport/game, gameplay flow, PWA, GitHub Pages, Stage 7, and local game |

## Human visual review

The controller inspected the recommended 320 × 568, 390 × 844, 768 × 900,
forced-colour, healthy lobby, and offline lobby exports plus the two rejected
390 × 844 gameplay alternatives.

The first visual pass rejected technically contained captures because the
provenance plate crowded the phone frames, the compact game omitted the hand
and actions, the 390 selected concept lost its defining perimeter, public card
objects were text-only, and forced-colour button labels were not readable.
The source and assertions were revised, all exports were regenerated, and the
second pass confirmed:

- the complete compact decision hierarchy fits in one 320 × 568 frame;
- the 390 selected frame restores the adaptive six-seat perimeter without
  overlapping the public table;
- the tablet frame shows all eight local cards;
- stock, discard, and the represented wild are staged as labelled cards;
- forced-colour actions retain visible labels and redundant boundaries; and
- offline Create/Join controls are disabled while the safe saved-rules path
  remains available.

## Open gates

1. Exact immutable beta source/build/deployment evidence.
2. Dated final reconciliation against that immutable revision.
3. Separate owner decision opening production UI implementation after
   reconciliation.

## Owner outcome

On 30 July 2026 the project owner approved **Compartment Table** and authorised
the beta application version promotion from `0.1.0` to `1.0.0`.

Until those gates close, this package is decision evidence rather than
production authority.

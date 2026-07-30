# Stage 1.1.7 release record

**Date:** 30 July 2026  
**Implementation state:** complete in beta candidate
`bec38badd57720e6d38457e98df4d6939e69ddc1`  
**Automated release evidence:** complete  
**Public release acceptance:** open

## Completed evidence

- 268 unit tests pass.
- The production build and versioned asset-provenance gate pass.
- Lobby, transport, online game, gameplay flow, PWA update/offline, GitHub
  Pages, responsive/accessibility smoke, online results, and local-game browser
  suites pass.
- Stage-specific pre-game and results/reference browser suites pass.
- The v1.1 visual harness passes 32 captures: 27 route/viewport captures,
  three high-risk gameplay captures, and two player-scoped authority captures.
- Reduced motion, forced colours, 44 px targets, horizontal containment,
  local-only asset requests, legacy-splash exclusion, privacy-safe fixture
  output, and pending-before-accepted authority are asserted automatically.
- Every Stage 1.1.6 transfer and decorative budget passes.

Automated PNGs and their manifest are in the task-scoped visualization
directory outside the repository and outside approved baseline locations. The
manifest records `baselineUpdate: false`, `automatedEvidenceOnly: true`, and
source revision `bec38badd57720e6d38457e98df4d6939e69ddc1`.

## Open release gates

The following cannot be truthfully closed by the repository build:

1. owner acceptance and final beta reconciliation of candidate
   `bec38badd57720e6d38457e98df4d6939e69ddc1` as the release baseline;
2. owner/design review of the complete contact sheet and intentional
   before/after creative result;
3. physical constrained Android and iPhone installed-PWA evidence;
4. VoiceOver, TalkBack, and NVDA evidence;
5. physical performance, unreliable-network, thermal, rotation, keyboard, and
   ten-minute match traces;
6. current Firefox and WebKit breadth where required by the release matrix;
7. named engineering, design/product, accessibility, QA, and release-owner
   approvals.

Until those records are attached, Stage 1.1.7 engineering work is complete but
the v1.1 public-release gate remains open. The application version therefore
remains `1.0.0`; this record does not label the working tree as a released
`1.1.0`.

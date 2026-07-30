# Stage 1.1.7 build report

**Date:** 30 July 2026

## Delivered

- deterministic production-route matrix definition for all nine routes at
  320 × 568, 390 × 844, and 768 × 900;
- reduced-motion, forced-colour, and compact decision-sheet lanes;
- deterministic player-scoped online pending/accepted captures;
- local-asset, legacy-splash, overflow, target-size, privacy, route-signature,
  and authority-revision assertions;
- caller-owned output manifest with explicit automated-only evidence limits;
- focused unit contract for matrix completeness and baseline safety.

## Verification status

- Focused release-evidence unit contract: 3 passed, 0 failed.
- Integrated browser matrix: 32 captures passed.
  - 27 production-route captures;
  - 3 high-risk gameplay captures;
  - 2 player-scoped authority-fixture captures.
- Browser: Chromium 151.0.7922.34.
- Source revision: `UNCOMMITTED`.
- Output: the task-scoped Codex visualization directory, outside the repository
  and outside every approved baseline location.

The initial `C:\tmp` setup attempt was blocked by host permissions before the
build or browser ran. Two subsequent harness defects were corrected: safe
privacy copy was initially mistaken for secret material, and the compact-sheet
fixture waited for its post-interaction signature too early. The final complete
run passed after those corrections.

No approved baseline was read, compared, replaced, or updated.

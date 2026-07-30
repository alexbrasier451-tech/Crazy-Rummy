# Stage 1.1.1 authority and beta-baseline disposition

**Recorded:** 30 July 2026  
**Source of authority:** Project-owner statement in the controlling Codex task  
**Authority received:** Stage 0 officially signed off; beta test complete;
Stage 1.1.1 authorised

## Locally observable beta identifiers

| Identifier | Observed value | Authority |
| --- | --- | --- |
| Git branch | `master` (unborn) | `git status` |
| Immutable source commit | **Unavailable — no commits exist** | `git rev-parse --verify HEAD` fails |
| Package/app version | `1.0.0` | `package.json`, `src/config.js`; owner-authorised promotion on 30 July 2026 |
| UI rules label | `phase-0-2026-07-29-2p-ace-high` | `src/config.js` |
| Engine schema | `2` | `src/engine/constants.js` |
| Engine rules | `crazy-rummy/3` | `src/engine/constants.js` |
| Local build | Vite build passes on 30 July 2026 | Controller baseline check |
| Deployment identifier/URL | **Unavailable locally** | No signed deployment record supplied |

The existing `dist` files are local build output. Their cache identifier is not
an immutable source revision and is not used as a substitute for a beta commit
or deployment identifier.

## Reconciliation disposition

The owner's declaration is sufficient authority to build this pre-production
concept package. It is not enough to invent the immutable provenance fields
required by the beta-reconciliation gate.

The current disposition is:

- owner Stage 0 decision: **approved**;
- owner beta-complete declaration: **received**;
- exact signed beta SHA/build/deployment evidence: **unavailable**;
- contract inventory for Stage 1 fixtures: **locally audited**;
- dated delta comparison from a signed immutable baseline: **blocked by the
  missing baseline**;
- Stage 1 concept work: **authorised**;
- Stage 1 owner direction decision: **Compartment Table approved**;
- beta application version: **promoted to `1.0.0`**;
- production UI implementation: **not authorised by this record**.

Every concept plate and manifest entry therefore uses:

> Locally derived uncommitted beta snapshot · 2026-07-30 · not a signed
> immutable beta baseline.

## Evidence still needed before production

1. The exact source branch and immutable commit SHA the owner signed complete.
2. The reviewed build/deployment identifier and URL, or an explicit
   locally-verified build record tied to that SHA.
3. Accepted beta limitations/open items and the supported browser, device,
   network, PWA, privacy, accessibility, and recovery boundary.
4. A dated comparison between that revision and the selected Stage 1
   direction, with all six reconciliation sections completed.
5. An explicit production-opening decision after the immutable-revision
   reconciliation. The creative-direction decision itself is complete.

If the eventual signed SHA differs from the present workspace, every affected
fixture and export must be rechecked and either marked compatible or regenerated.

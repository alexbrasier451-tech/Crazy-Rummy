# Crazy Rummy v1.1 — Beta coordination and reconciliation

**Status:** Binding coordination gate for v1.1 planning and implementation  
**Applies to:** all v1.1 work while the beta chain is active  
**Related documents:** [v1.1 roadmap](ROADMAP.md), [implementation plan](IMPLEMENTATION_PLAN.md), [QA acceptance](QA_ACCEPTANCE.md), [online beta](../phase-8/GITHUB_ONLINE_BETA.md)

## Purpose

The active beta chain may change routes, states, semantic DOM, interaction
flows, test fixtures, acknowledgement timing, and recovery behaviour. Version
1.1 must not freeze, override, or decorate an obsolete version of those
contracts. This document keeps visual ambition moving through concept work
without allowing production implementation to drift away from the beta.

The beta owns product behaviour until its chosen baseline is reconciled. The
v1.1 release owner owns visual integration. Neither party may silently alter
the other's contract. The owner resolves product/creative trade-offs and has
final authority over v1.1 acceptance. The project owner alone decides when the
beta is finished; an engineering status, green test run, branch label, or
reconciliation record cannot make that decision on the owner's behalf.

## Work allowed before reconciliation

Until the project owner signs the beta complete and a named baseline and
integration window are approved, v1.1 may:

- maintain this documentation package and its Stage 0 sign-off record;
- produce three-way concept boards, keyframes, and motion storyboards against
  clearly labelled canonical fixtures;
- define token roles, original-asset briefs, font/licence selections,
  provenance entries, performance hypotheses, and acceptance matrices;
- identify weak MVP presentation structures that may later be replaced without
  altering semantics;
- update the creative-coverage record as a plan, clearly marked **planned**
  rather than implemented.

It may not change production CSS, DOM/markup, JavaScript, route behaviour,
component contracts, screenshot baselines, tests, PWA metadata, production
assets, dependencies, or beta deployment configuration. No v1.1 implementation
claim is valid before the reconciliation gate passes.

## Owner beta-complete gate

The project owner will sign the beta complete only when satisfied that it is
finished. Before that explicit decision, v1.1 remains limited to the
pre-production work listed above.

The beta-complete record must name:

- the owner's decision and date;
- the exact immutable beta commit SHA and build/deployment identifier reviewed;
- any accepted beta limitations or open items that v1.1 must preserve rather
  than silently repair;
- the supported route, state, browser, phone, network, offline/PWA, privacy,
  accessibility, and recovery boundary being signed; and
- the beta evidence the owner used to make the decision.

If the signed revision changes, or an accepted limitation is materially
reinterpreted, beta completion is reopened and production v1.1 work pauses
until the project owner signs the replacement revision complete.

## Canonical fixture rule

Concept artefacts must identify the source fixture, revision/date, viewport,
route, state, player count, local seat, card/public-information boundary,
network condition, motion/colour preference, and any deliberate mock data.
They must use only data that the corresponding player could legitimately see.
An attractive board with invented public/private state is not a valid v1.1
baseline or approval artefact.

## Beta reconciliation gate

After the owner beta-complete gate passes and before the first production v1.1
change, the v1.1 release owner and beta owner must create a dated reconciliation
record against the exact signed revision containing all of the following.

### 1. Baseline revision

- Exact beta branch, immutable commit SHA, build identifier, and deployment
  URL (where available).
- Date/time captured, responsible owners, supported device/browser scope, and
  whether the baseline is locally verified or has live beta evidence.
- Explicit statement that all prior visual captures are either compatible,
  superseded, or awaiting rework. A branch name alone is insufficient.

### 2. Contract inventory

Inventory the beta's current contract for every affected route and overlay:

- route path, deep-link/restore behaviour, headings/landmarks, semantic DOM
  anchors, focus order, live-region and error-announcement policy;
- state names, legal transitions, authority/acknowledgement timing, pending,
  rejected, stale, reconnecting, paused, recovered, and terminal behaviour;
- public versus private data, redaction, seat ownership, and any information
  that may never appear in visual fixtures or transitions;
- touch, keyboard, non-drag, screen-reader, forced-colour, reduced-motion,
  offline, update, and safe-area requirements;
- stable tests, fixtures, screenshot helpers, selectors, and release evidence
  already relied on by beta.

The inventory distinguishes **stable**, **changing**, **proposed**, and
**unknown** items. Unknown contracts block only the affected v1.1 work package;
they do not permit a visual substitute to invent behaviour.

### 3. Delta log

Maintain a dated delta log from the baseline through integration. Each entry
states:

| Field | Required content |
| --- | --- |
| Change | Concise route/state/DOM/interaction/test/asset change. |
| Source | Beta revision, issue, pull request, or agreed owner decision. |
| Impact | Affected v1.1 concepts, work packages, tests, fixtures, and creative-coverage entries. |
| Disposition | Compatible, requires visual rework, blocks integration, or supersedes a baseline. |
| Owner and due point | Person/role who resolves it and the next verification point. |

“No known changes” is not a delta review. The owners must compare the current
revision with the reconciled baseline before claiming that result.

### 4. Conflict ownership and resolution

- **Beta owner:** rules, authority, privacy, routes, state transitions,
  interaction semantics, recovery, and existing behaviour/test contract.
- **v1.1 release owner:** visual composition, authored cards/assets, tokens,
  environmental techniques, motion staging after accepted state, and visual
  acceptance evidence.
- **Shared:** semantic DOM changes, focus/live regions, component anatomy,
  fixtures, screenshot tests, performance budgets, PWA surfaces, and any
  change that alters both presentation and behaviour.
- **Project owner:** resolves unresolved shared conflicts, signs Stage 0 and
  the beta-complete gate, signs final creative acceptance, and alone may accept
  a documented constraint-led reduction in spectacle.

A v1.1 proposal that needs semantic changes must state the behaviour it would
touch, the beta owner who reviewed it, and a fallback that preserves the beta
contract. Neither side may land a conflicting change merely because it is
locally green.

### 5. Integration window

Record a bounded window with start condition, expected beta revision range,
named reviewers, protected files/contracts, merge order, and abort condition.
The start condition is the reconciled baseline; the finish condition is a
fresh contract comparison, focused checks, and an agreed result. If beta moves
outside the agreed range or changes an affected stable contract, pause the
affected v1.1 package, log the delta, and reconcile again.

The window does not freeze unrelated beta development. It only prevents v1.1
from claiming a stale baseline as current.

### 6. Rerun requirements

After any relevant beta delta, rerun the affected v1.1 canonical fixtures,
concept/keyframe review, contract-inventory rows, focused route/state tests,
and screenshot captures. Re-run the full relevant acceptance lane when a
change affects shared DOM, accessibility, motion triggers, privacy/redaction,
route restoration, cards, network truth, PWA/update behaviour, or performance.

Immediately before release baseline capture, reconcile against the exact
release-candidate SHA and rerun the complete relevant QA matrix. Earlier green
screenshots, concept approvals, or test reports are evidence of history—not
evidence of the release candidate.

## No-stale-baseline rule

No v1.1 board, screenshot baseline, keyframe, test expectation, acceptance
record, or release claim may be labelled current without its source revision
and reconciliation disposition. When a beta change invalidates an artefact,
mark it **superseded**; do not leave it as an apparently valid reference.

The strongest approved design should be re-applied to the current contract. A
beta update never authorises a retreat to a generic or easier visual solution.
If the prior treatment cannot survive a higher-priority product, privacy,
accessibility, or measured-performance constraint, record the preferred
treatment, the exact constraint, and the strongest compliant alternative in
the creative-coverage record. Extra effort alone is not a valid reason.

## Coordination checkpoints

| Checkpoint | Trigger | Required outcome |
| --- | --- | --- |
| Planning check | Stage 0 review | Status recorded as planning-only; beta chain and owner identified. |
| Concept check | Stage 1 keyframe review | Canonical fixture revision recorded; concepts marked non-production until reconciliation. |
| Beta-complete gate | Before final reconciliation or production work | Project owner signs an exact immutable beta revision complete. |
| Integration gate | Before first production v1.1 change | Owner beta-complete gate passed; all six reconciliation sections complete against that revision; both owners agree the window. |
| Mid-window check | Any relevant beta delta | Delta disposition, affected reruns, and continue/pause decision recorded. |
| Baseline refresh | Before screenshot baseline update | Exact build SHA reconciled; stale captures superseded. |
| Release-candidate check | Before release sign-off | Full current-contract comparison and required QA/creative evidence rerun. |

## Stage 0 readiness versus implementation evidence

Stage 0 can be ready for the project owner's v1.1 sign-off while beta changes
continue: the decision package, creative mandate, roadmap, coordination gate,
and concept scope are sufficient to approve planning. This does **not** open
production work unless the owner has subsequently signed the beta complete and
the integration gate has passed against that exact revision.

Implementation evidence begins only after an agreed baseline and must show the
actual current application: source revision, automated and human checks,
physical-device evidence, asset provenance, performance measurements,
accessibility behaviour, and the directive's creative-coverage record. Stage
0 approval, a keyframe approval, or a completed roadmap row cannot stand in
for that evidence.

## Required final coordination record

The release evidence contains the final baseline revision, complete delta log,
all resolved/shared-conflict decisions, integration-window outcome, rerun
results, and a list of superseded visual baselines. It links these to the
creative-coverage record required by the directive and [QA acceptance](QA_ACCEPTANCE.md#9-triage-roles-and-release-sign-off).

Absence of this record is a failed v1.1 release gate, not an implied waiver.

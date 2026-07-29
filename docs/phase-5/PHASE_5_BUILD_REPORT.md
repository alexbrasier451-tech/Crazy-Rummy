# Phase 5 Build Report

**Status:** Implementation complete; local automated gate green  
**Verified:** 29 July 2026  
**Live-device gate:** Separate-network phones and forced TURN must be rerun
with the Stage 5 build before release

## Delivered

### 5.1 — Signalling and connection state

- strict expiring provider-neutral signalling envelopes;
- accepted Metered `SignallingClient` adapter;
- provider-injected or deployment-supplied short-lived ICE configuration;
- offer, answer, ICE candidate, pair identity, and clean-close exchange;
- truthful idle/signalling/connecting/handshaking/connected/disconnected/
  failed/closed snapshots; and
- a configured runtime factory that owns one peer's provider lifecycle.

### 5.2 — Three-to-six-player topology

- explicit host-and-spoke topology rather than a shared-room mesh;
- five maximum host links and exactly one link per guest;
- distinct transport, engine schema, and engine rules handshake fields;
- seat-proof verification independent of untrusted provider metadata;
- ordered per-link application events, gap buffering, heartbeats, stale
  detection, guest forwarding through the host, and clean closure.

### 5.3 — Reliable command/event protocol

- stable command IDs, authoritative revision sequences, acknowledgements,
  rejection, bounded retry, missed-event replay, and snapshot fallback;
- host-only engine execution and engine-owned idempotency;
- negative reconciliation tombstones that prevent a delayed pre-reconnect
  command from committing after the host has declared it uncommitted;
- duplicate/stale/reordered detection and bounded client buffering;
- strict per-seat event and snapshot projections; and
- fault-injection coverage for loss, duplicate delivery, reorder, uncertain
  acknowledgement, divergence, and hidden-hand sentinels.

### 5.4 — Reconnect and host-loss policy

- room plus seat-secret rebind with the last accepted sequence;
- versioned host and guest recovery records;
- explicit pause, reconnect, reconcile, resume, drop, forfeit, and abandonment
  protocol states;
- authoritative five-minute guest and host deadlines; and
- terminal recovery-clearing seams.

## Changed implementation

- `src/online/transport/` — signalling, WebRTC pair, and star topology.
- `src/online/sync/` — command/event authority, client convergence, recovery.
- `src/online/runtime.js` — configured pair lifecycle factory.
- `src/online/index.js` — public Stage 5 exports.
- `tests/unit/peer-transport.test.mjs` — six transport contracts.
- `tests/unit/online-sync.test.mjs` — eight sync/recovery contracts.
- `tests/unit/online-runtime.test.mjs` — two lifecycle contracts.
- `tests/browser/online-transport.*` — real Chromium three-seat acceptance.
- `package.json` — Stage 5 browser gate included in `pnpm check`.

## Evidence

The pre-Stage 5 baseline passed 106 tests through the bundled Node runtime.
The sixteen focused Stage 5 contracts then passed together. The final unit
suite passed all 118 contracts. The Stage 5 Chromium
harness connected three seats over real local WebRTC pair links, forwarded
three ordered guest events through the host, displayed a truthful peer closure,
and remained contained at 320 CSS pixels.

The final retained unit, production build, browser smoke, Stage 4 lobby, Stage
5 peer transport, PWA lifecycle, and Stage 3 local-game checks are run as the
single `pnpm check` completion gate.

## Honest boundary and remaining release evidence

The automated Stage 5 implementation is complete. Phase 6 still owns lobby to
transport to authority to game-screen composition, network-aware action UI,
and engine application of dropped-seat gameplay state.

The local browser harness does not satisfy Roadmap 5.1's two-real-phone,
separate-network statement or prove a current forced-relay candidate pair.
Phase 0 already recorded broadband/cellular direct and forced-TURN architecture
evidence, but a release must rerun that opt-in procedure with this Stage 5
implementation and retain only redacted candidate-type/result evidence.

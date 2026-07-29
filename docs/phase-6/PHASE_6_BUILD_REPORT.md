# Phase 6 Build Report

**Status:** Implementation complete; local automated gate green  
**Verified:** 29 July 2026  
**Live-device gate:** A three-phone rules fixture plus separate-network direct
and forced-TURN runs must be completed before release

## Delivered

### 6.1 — End-to-end online composition

- host-only, all-ready waiting-room start and locked two-to-six-seat
  membership;
- private recipient-scoped match bootstraps and exact seat-proof checks;
- configured lobby-to-host-star-to-sync-to-engine-to-screen composition;
- host canonical authority and guest-only redacted projections;
- protected match-scoped host and guest recovery with authenticated rebind;
- online hand-result acknowledgement by the local seat only; and
- replayable engine-owned dead-hand, active-seat, forfeit, and host-loss
  behavior.

### 6.2 — Network-aware action feedback

- command-ID-correlated pending, accepted, rejected, and uncertain states;
- no optimistic card, meld, discard, or motion acknowledgement;
- preserved staged choices after rejection;
- distinct paused, reconnecting, incompatible, forfeit, and abandonment
  presentation; and
- accessible live status plus 320 px containment.

### 6.3 — Full-match and adversarial verification

- three-seat public convergence and correct private views;
- illegal and malformed input rejection without state mutation;
- command/event duplication, delay, reorder, loss, replay, snapshot, and
  authenticated rebind;
- a complete thirteen-hand online authority traversal; and
- a real local-Chromium three-seat WebRTC game acceptance.

The detailed seams and evidence are recorded in
[`ONLINE_MATCH_CONTRACT.md`](ONLINE_MATCH_CONTRACT.md) and
[`ADVERSARIAL_ONLINE_CHECKLIST.md`](ADVERSARIAL_ONLINE_CHECKLIST.md).

## Verification evidence

The supported completion command is:

```text
pnpm check
```

The final Stage 6 run includes 141 unit contracts, a production build, the
retained navigation/accessibility smoke, Stage 4 six-seat lobby, Stage 5
host-star transport, new Stage 6 online-game acceptance, PWA lifecycle, and
Stage 3 local-game acceptance.

Focused evidence includes:

- 24 engine-drop and online-sync contracts covering authorization, exact
  expiry, recovery, card conservation, projection secrecy, compound facts,
  dealer rotation, direct host drop, and a fresh six-seat case;
- two Stage 6 authority tests, including a complete thirteen-hand match under
  duplication, delay, reorder, loss, and rebind; and
- a three-seat real local-Chromium `RTCPeerConnection` browser run at 320 px.

## Honest boundary

The repository proves Stage 6 locally and is ready for Phase 7 implementation.
It does not claim that three remote phones have completed the fixture, that a
current internet-direct candidate was selected, or that current traffic used
TURN relay. Those live-device checks remain release evidence and must retain
only redacted candidate-type and outcome data.

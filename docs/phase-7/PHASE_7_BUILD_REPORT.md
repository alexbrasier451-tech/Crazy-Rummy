# Phase 7 Build Report

**Status:** Implementation complete; local automated gate green  
**Verified:** 29 July 2026  
**Live-device gate:** Representative modern Android Chrome and iPhone Safari
polish/accessibility checks remain part of Phase 8

## Delivered

### 7.1 — Hand and final results

- public hand penalties plus authenticated-owner-only card breakdown;
- cumulative totals, next active dealer, next moving-wild rank, and explicit
  per-seat continuation;
- dropped-seat-safe scoring and truthful normal, tie, stock, and forfeit copy;
- all accepted hand-by-hand public results;
- copy-safe summaries; and
- refresh-restored final results from the public-only retained summary; and
- single-flight local/online play-again lifecycle seams.

### 7.2–7.3 — Rules, settings, and summaries

- cached, active-version-labelled rules with the complete moving-wild schedule;
- applied marker, card-size, sort, motion, contrast, discard, haptic, and lobby
  refresh preferences;
- immediate lobby polling stop/restart when auto-refresh changes;
- latest public-only local/online completed-match storage;
- retention across a new match and explicit scoped device-data clearing; and
- terminal private recovery cleanup after the public summary is stored.

### 7.4–7.5 — Polish, responsive behaviour, and accessibility

- action-specific, cancellable accepted-state motion and optional haptics;
- no optimistic motion for pending, rejected, or uncertain network actions;
- explicit reduced-motion override and high-contrast suit labels;
- persistent reconnect `MM:SS` with concise announcement thresholds;
- semantic meld summaries;
- 320 px/short-phone, 430 px phone, tablet, 200% text, 400% reflow,
  keyboard, forced-colour, and reduced-motion browser coverage; and
- a named `pnpm test:stage7` gate retaining responsive smoke and complete
  local-game/result acceptance, including online acknowledgement, replay,
  forfeit, refresh restoration, and final-result reflow.

Detailed boundaries are recorded in
[`RESULTS_SETTINGS_CONTRACT.md`](RESULTS_SETTINGS_CONTRACT.md) and
[`POLISH_ACCESSIBILITY_CHECKLIST.md`](POLISH_ACCESSIBILITY_CHECKLIST.md).

## Verification

The supported completion command remains:

```text
pnpm check
```

It runs the full unit contract set, production build, Stage 4 lobby, Stage 5
transport, Stage 6 online-game, PWA lifecycle, and Stage 7
responsive/results/settings browser gate.

## Honest boundary

The repository proves the local automated Stage 7 boundary. It does not claim
that current iPhone Safari or Android Chrome physical-device runs, real haptic
feedback, VoiceOver/TalkBack gestures, current internet-direct WebRTC, or TURN
relay revalidation have passed. Those remain Phase 8 release evidence.

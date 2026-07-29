# Phase 0 Sign-off

**Status:** Approved  
**Date reviewed:** 29 July 2026  
**Decision owner:** Crazy Rummy project owner  
**Authorised next phase:** Phase 1 — Mobile PWA foundation and design system

## Sign-off verdict

Phase 0 is **approved**.

The product, rules, table model, visual direction, card-animation boundary, and
five-minute reconnect outcomes are sufficiently defined. The provider-neutral
WebRTC probe also passes its direct two-context data-channel test.

The Metered free provider route satisfies the owner's strict zero-cost
constraint in dashboard evidence. Direct and forced-TURN checks pass from the
deployed public GitHub Pages probe and between a broadband desktop and a phone
using cellular data. The owner accepts the casual trusted-host limitation and
does not require anti-cheat.

## Resolved contract

- Product name: **Crazy Rummy**.
- Phones: practical modern Android Chrome and iPhone Safari, following the
  Murder Darts PWA approach.
- Audience: creator-selected **Open** publicly listed tables or **Closed**
  invite/code-only tables.
- Opening melds may contain wild cards.
- A reclaimed wild may be played, held, or discarded.
- Natural J/Q/K score 10; cards of the current wild rank score 50.
- A disconnected non-host has five minutes to return, then is dropped.
- A disconnected host has five minutes to return, then the match is abandoned
  without a result; host migration is not promised.
- Basic acknowledged-state card animations are in scope.
- Operating cost must remain exactly zero: no paid plan, payment card, or
  automatic overage.
- Trusted-host P2P is accepted. The host may technically inspect or manipulate
  the game; no anti-cheat system is required.

## Evidence status

| Phase 0 item | Evidence | State |
| --- | --- | --- |
| Product, audience, and phones | [Decision register](STAGE_0_DECISION_REGISTER.md) | Resolved |
| Exact family rules | [Rules/state contract](RULES_AND_STATE_CONTRACT.md) | Resolved |
| Lobby and reconnect UI | [App layout](../../APP_LAYOUT.md) | Aligned |
| Roadmap and scope | [Project scope](../../PROJECT_SCOPE.md), [roadmap](../../ROADMAP.md) | Aligned |
| Direct WebRTC harness | [Spike results](../../spikes/webrtc-turn/RESULTS.md) | Passed in two isolated desktop Chromium contexts |
| Forced TURN | Spike results | Passed through Metered with `relay`/`relay` candidates and acknowledged payload |
| Hosted HTTPS probe | [Live GitHub Page](https://alexbrasier451-tech.github.io/Crazy-Rummy/) | Deployed; direct and forced relay both pass in isolated Chromium contexts |
| Cellular phone/different network | Spike results, test code `ZTFYVZ` | Passed: direct `srflx`/`srflx` and forced `relay`/`relay`, acknowledged payloads over UDP |
| Trusted-host boundary | [ADR-0001](../decisions/ADR-0001-ONLINE-P2P-ARCHITECTURE.md) | Accepted; anti-cheat out of scope |
| Zero-cost provider | ADR-0001 | Resolved: hard-capped free signalling and 500MB TURN, `$0` overage, auto-recharge off |

## Approval result

There are no remaining Phase 0 blockers. Phase 1 may begin. Cross-platform,
background/foreground, interruption, reconnect, quota-exhaustion, and full
two-to-six-phone coverage remain explicit later implementation and beta
gates; Phase 0 approval does not waive them.

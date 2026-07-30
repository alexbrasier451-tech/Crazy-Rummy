# Crazy Rummy

Crazy Rummy is a phone-first online version of the thirteen-hand moving-wild
rummy game also known in some families as Railway Rummy or Benny.

**Phase 0 is approved. Phases 1–7 implementation is complete.** The installable
static client, design system, accessible card-game primitives, honest offline
shell, deterministic thirteen-hand rules engine, and recoverable playable
local integration harness are implemented. The provider-neutral online lobby,
Metered realtime table-service bridge, transient host authority, Open/Closed
table journeys, leases, polling, abuse bounds, pair-scoped WebRTC star
transport, ordered command/event synchronisation, five-minute recovery policy,
private match bootstrap, host-authoritative online game composition,
network-truthful action UI, adversarial thirteen-hand convergence, complete
hand/final results, cached versioned rules, applied device settings,
privacy-safe latest-match summaries, accepted-state feedback, recovery
countdowns, and Stage 7 responsive/accessibility polish are also implemented.
The online service stays disabled unless deployment supplies an
origin-restricted publishable key. Three-phone, separate-network,
forced-relay, and representative Android/iPhone physical-device revalidation
remain release gates.

The Phase 1 evidence is recorded in the
[Phase 1 build report](docs/phase-1/PHASE_1_BUILD_REPORT.md). The real-network
WebRTC/TURN evidence and disposable Phase 0 probe remain under
[`spikes/webrtc-turn`](spikes/webrtc-turn/README.md).
The Phase 2 engine evidence is recorded in the
[Phase 2 build report](docs/phase-2/PHASE_2_BUILD_REPORT.md).
The playable local UI, recovery, and full-match evidence is recorded in the
[Phase 3 build report](docs/phase-3/PHASE_3_BUILD_REPORT.md).
The online lobby/service evidence and deployment boundary are recorded in the
[Phase 4 build report](docs/phase-4/PHASE_4_BUILD_REPORT.md).
The peer transport, reliable synchronisation, recovery, and remaining
live-device evidence are recorded in the
[Phase 5 build report](docs/phase-5/PHASE_5_BUILD_REPORT.md).
The complete online game, action-feedback, dropped-seat, and adversarial
evidence is recorded in the
[Phase 6 build report](docs/phase-6/PHASE_6_BUILD_REPORT.md).
The results, settings, polish, privacy, responsive, and accessibility evidence
is recorded in the
[Phase 7 build report](docs/phase-7/PHASE_7_BUILD_REPORT.md).
The GitHub-hosted online-beta source, credential boundary, emergency stop, and
tester entry procedure are recorded in the
[Phase 8 GitHub online-beta runbook](docs/phase-8/GITHUB_ONLINE_BETA.md).

## Version 1.1 graphics overhaul

The v1.1 graphics-overhaul [Stage 0 package is owner-approved](docs/v1.1/STAGE_0_SIGNOFF.md),
and the authorised [Stage 1.1.1 concept package](docs/v1.1/stage-1.1.1/README.md)
is built for direction review. The
complete [v1.1 documentation index](docs/v1.1/README.md) defines the
**Midnight Limited** art direction, binding push-the-boat-out execution
directive, route and state specifications, zero-budget production/tool and
licensing plan, beta-coordination boundary, implementation sequence, and
visual-quality release gate.

The owner has declared Stage 0 approved and the beta complete, approved
**Compartment Table** as the Stage 1 direction, and authorised promotion of the
beta application to version `1.0.0`. Production visual implementation remains
gated by reconciliation against an exact immutable beta source/build revision;
the local repository has no commit history from which that revision can
currently be recorded. No v1.1 production-asset integration is claimed by the
Stage 1 package.

## Development

Crazy Rummy requires Node.js 22 or later and pnpm:

```text
pnpm install
pnpm dev
pnpm check
```

`pnpm check` runs unit contracts, a production build, responsive/navigation
browser smoke checks, the Stage 4 Open/Closed six-seat lobby acceptance, the
Stage 5 real-Chromium three-seat host-star acceptance, the Stage 6
real-Chromium three-seat online-game acceptance, the install/cache/offline PWA
lifecycle check, and the Stage 7 responsive/results/settings browser gate
(which retains the complete playable local-game acceptance).

## Phase 0 documents

- [Project scope](PROJECT_SCOPE.md)
- [Mobile app layout](APP_LAYOUT.md)
- [Implementation roadmap](ROADMAP.md)
- [Decision register](docs/phase-0/STAGE_0_DECISION_REGISTER.md)
- [Rules and state contract](docs/phase-0/RULES_AND_STATE_CONTRACT.md)
- [Online/P2P architecture decision](docs/decisions/ADR-0001-ONLINE-P2P-ARCHITECTURE.md)
- [Phase 0 sign-off gate](docs/phase-0/PHASE_0_SIGNOFF.md)

## Current architectural direction

The intended client is an installable mobile Progressive Web App in the same
family as Murder Darts: compact, dark, tactile, and built around large phone
controls.

Players are remote rather than on the same local network. The app will poll a
small internet rendezvous service to show available players or tables and to
exchange WebRTC connection details. Match traffic should travel directly
between phones when the network permits.

The project owner does not have or want to administer a server and has fixed a
zero operating budget. Phase 0 proved a hard-capped managed free-tier
rendezvous and TURN route with no overage charging. A reliable internet-wide
online-player list is not possible with a static browser app alone.

Lobby discovery and online table formation use the Phase 4 provider-neutral
session and Metered adapter when deployment configuration is present. Phase 5
adds pair-scoped WebRTC links, a two-to-six-seat host star, per-seat
authoritative projections, reliable command/event delivery, and recovery
policy. Phase 6 locks ready rooms into private matches, composes those links
with host authority and player-scoped game screens, persists recoverable match
state, and applies dropped-seat consequences through the deterministic engine.
Without provider configuration, the lobby shows an honest unavailable state
and never invents remote tables.

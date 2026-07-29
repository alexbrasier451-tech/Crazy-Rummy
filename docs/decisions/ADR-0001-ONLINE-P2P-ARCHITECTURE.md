# ADR-0001: Online discovery and peer-to-peer game architecture

- **Status:** Accepted
- **Date:** 2026-07-29
- **Scope:** Remote internet play for 3–6 players in a static mobile PWA

## Context

Players are remote rather than merely in the same room. Each table creator
chooses **Open** or **Closed**. Open tables appear in a public availability
list; Closed tables are absent from that list and require an unguessable invite
or code. Clients refresh/poll online availability and then establish the match.

The owner has no server to run and has fixed the operating budget at **zero**.
That means no VM or daemon, no paid plan or payment card, and no automatic
usage-based overage.

There is a hard technical boundary:

> “No server to operate” is feasible. “No reachable internet service at all”
> is incompatible with automatic discovery of arbitrary remote phones.

Browsers cannot discover unknown browsers directly. They need a reachable
rendezvous for presence and WebRTC signalling. WebRTC deliberately leaves the
signalling transport to the application
([WebRTC signalling](https://webrtc.org/getting-started/peer-connections),
[MDN signalling guide](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling)).

WebRTC connectivity also needs:

- **STUN**, which helps a phone discover a reachable address; and
- **TURN**, which relays traffic when NAT/firewall restrictions prevent a
  direct peer path
  ([MDN WebRTC protocols](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols)).

TURN-relayed WebRTC data channels remain encrypted at the WebRTC layer
([MDN data channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels)),
but TURN introduces a provider account, bandwidth quota, and network metadata.

## Decision drivers

- Remote Android Chrome and modern iPhone Safari.
- Open and Closed tables with automatic online discovery.
- Three to six players and private hands.
- Static, installable PWA in the Murder Darts app family.
- No owner-administered machine or long-running process.
- Strict zero operating cost with a hard failure at free-plan limits.
- Safe reconnection without duplicated commands or hidden-card leakage.
- Minimal identity and stored personal data.

## Options considered

### A. Managed presence/signalling with WebRTC gameplay

A managed service supplies short-lived presence and signalling. The game uses a
host-and-spoke WebRTC topology: the creator is authoritative and each guest has
one data channel to that host. Direct transport is preferred; TURN is the
fallback.

This best matches the requested experience while keeping game traffic mostly
peer-to-peer. It still requires a service account and is not cheat-proof: the
host owns the full deck and every hand.

### B. Fully hosted authoritative game service

A hosted stateful process owns the deck, validates actions, and sends redacted
views to each phone. It has the cleanest fairness and recovery model but makes
all gameplay dependent on a backend and is unnecessary for a trusted casual
first release. It is rejected for the zero-budget P2P MVP.

### C. No backend, manual signalling exchange

Players could exchange WebRTC offer/answer blobs through another messaging app.
This has no automatic online list, is awkward for 3–6 phones, and still needs
TURN on restrictive networks. It does not meet the stated lobby experience.

### D. Hosted relay for all game messages

A managed WebSocket channel can remove WebRTC/TURN complexity, but then gameplay
is no longer normally peer-to-peer and a quota failure interrupts every action.
This remains a fallback only.

## Decision

Prototype **Option A** with a **host-and-spoke WebRTC topology**.

For `n` players, full mesh needs `n(n-1)/2` connections: 3 at three players and
15 at six. Host-and-spoke needs only `n-1`: 2 to 5 connections.

The provider-neutral spike in
[`spikes/webrtc-turn`](../../spikes/webrtc-turn/README.md) has demonstrated:

- peer-scoped polling/signalling semantics;
- relay mode refusing to run without credentialed TURN;
- two isolated browser contexts negotiating a WebRTC data channel;
- ordered payload/acknowledgement round-trip over the direct path; and
- a Metered forced-relay exchange with `relay` selected on both ends over UDP,
  including an acknowledged data round-trip.

The later representative run also demonstrated the public probe between a
broadband desktop and a phone using cellular data, on both direct and forced
relay paths. Mobile background/foreground and network hand-off recovery remain
later implementation/beta gates. Actual quota exhaustion has not been induced;
the dashboard's documented hard-stop behaviour remains a release-time
operational check rather than an assumed result.

## Zero-cost provider finding

### Rejected for this project: Cloudflare Realtime TURN

Cloudflare is technically attractive for a single-vendor Worker/D1/TURN design,
but its current TURN offer is usage-billed after the included allowance. The
official pricing states a 1,000 GB free tier followed by $0.05/GB, and describes
self-serve plans as credit-card plans
([Cloudflare TURN FAQ](https://developers.cloudflare.com/realtime/turn/faq/)).
That conflicts with the owner's “cannot ever cost money” boundary.

Cloudflare Workers Free and D1 Free remain suitable examples of hard-limited
rendezvous infrastructure: Workers Free includes 100,000 requests/day and D1
Free includes 5 million rows read/day and 100,000 rows written/day; D1
operations fail after the free limit rather than becoming paid
([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)).
However, combining them with chargeable Cloudflare TURN still fails the
all-in-one route.

### Selected Phase 0 route: Metered free signalling + TURN

Metered currently advertises a no-credit-card free TURN plan and a free
signalling/presence service
([Metered TURN pricing](https://www.metered.ca/stun-turn),
[Metered free signalling](https://www.metered.ca/tools/openrelay/webrtc-signaling-server/)).
Its Realtime Messaging documentation says the free plan uses hard caps and
does not support overages
([Metered limits](https://www.metered.ca/docs/realtime-messaging/limits-and-quotas/)).
The service can inject TURN configuration into a browser connection through a
publishable key
([Metered authentication](https://www.metered.ca/docs/realtime-messaging/sdk-javascript/guides/authentication/)).

The created Crazy Rummy account is verified on `signalling_free`; its dashboard
states that free tiers have hard caps and no overage billing, and auto-recharge
is off. TURN is on Trial Global 500MB at `$0/month`; the dashboard shows `$0`
overage and states that relay service stops when its allowance is exhausted.

The frontend-safe publishable key is restricted to the required Subscribe,
Publish, Presence, and Send actions with TURN auto-injection on. The disposable
static probe intentionally exposes this client key; no Metered secret or
administrative credential is committed.

The forced-relay run completed at `2026-07-29T01:12:56Z`: both Chromium peers
reported configured TURN, connected/open state, `relay` local and remote
candidates over UDP, and a successful acknowledged payload round-trip.

The same direct and forced-relay checks subsequently passed from the deployed
public HTTPS probe at <https://alexbrasier451-tech.github.io/Crazy-Rummy/>.

## Protocol outline

### Identity, presence, and tables

- Generate a random installation-local player ID and store a chosen display
  name; do not require email, phone number, contacts, or a public profile.
- Becoming visible is opt-in each launch.
- Open table leases expose only table ID, safe host display name, capacity,
  rules/protocol version, coarse status, and authoritative expiry.
- Closed tables never appear in public results and use an unguessable room
  secret.
- Clients refresh availability while the lobby is visible and pause when the
  page is hidden. Use jittered backoff after errors.
- Presence and abandoned signalling records expire automatically.
- Creation/join must be conditional so two phones cannot claim the same final
  seat.

### Match bootstrap and transport

- The creator is the host. Each guest establishes one ordered WebRTC data
  channel to that host.
- Signalling records/messages are match- and recipient-scoped, idempotent, and
  short-lived.
- Production uses `iceTransportPolicy: "all"` with direct candidates preferred
  and TURN fallback. Acceptance also runs `iceTransportPolicy: "relay"` to
  prove that TURN really carries the data.
- Never place an administrative or long-lived TURN secret in static
  JavaScript. Browser credentials must be publishable/restricted or
  short-lived.
- SDP, ICE candidates, room secrets, deck order, and hands are excluded from
  application logs.

### Authority, privacy, and ordering

- The host owns canonical state, deck order, and every hand.
- Each guest receives only its own hand plus public state.
- Actions contain `matchId`, `playerId`, `clientActionId`,
  `expectedStateVersion`, and the requested command.
- Accepted events receive monotonically increasing `eventSeq` and
  `stateVersion` values.
- Duplicate commands/events are ignored; gaps request a redacted snapshot.
- Protocol versions must match before joining.
- The UI must state that a determined host can inspect or manipulate the game;
  transport encryption does not protect players from the host.

### Disconnect and reconnection

- A returning phone proves possession of its local seat/resume secret, submits
  its last received sequence, and requests a player-specific snapshot.
- Every disconnected seat gets a five-minute authoritative recovery window.
- If a non-host does not return, drop that seat. Its hand becomes a dead,
  unplayable zone. Continue while two or more active players remain; one active
  player wins by forfeit.
- If the host does not return, abandon the match without a result after five
  minutes and invalidate the room. Peers cannot safely elect a replacement
  because they do not possess the host's full private state.
- Never blindly replay an action whose acknowledgement was lost.

## Abuse and operational controls

- Sanitize and length-limit display names; prohibit links/control characters.
- Rate-limit presence, table creation, joins, and signalling messages.
- Cap payload sizes, room capacity, and rooms per installation identity.
- Restrict publishable keys by origin and the narrowest available channel
  pattern/capability.
- Keep a public-discovery kill switch and preserve Closed-table/local UI when
  the free quota is exhausted.
- Open tables do not include chat, public profiles, rankings, or money play.
- Provider dashboards and APIs must be checked for actual plan/overage state
  before every release.

## Consequences

The PWA remains static and the owner runs no server process, but remote
discovery and reliable peer connectivity still depend on managed services and
accounts. Zero budget means online play may become temporarily unavailable at a
hard quota; that is preferable to a bill.

The owner accepts host authority and does not require anti-cheat. Host
migration, durable cross-device identity, moderation at public scale, or
competitive play would require a later architecture decision.

## Phase 0 evidence result

The public probe passed between a broadband desktop and a phone using cellular
data. The automatic run selected direct `srflx`/`srflx` candidates; the
forced-TURN run selected `relay`/`relay` candidates. Both exchanged an
acknowledged payload over UDP. Background/reconnect and broader phone coverage
remain later implementation and beta gates.

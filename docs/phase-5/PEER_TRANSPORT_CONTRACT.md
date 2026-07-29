# Phase 5 Peer Transport Contract

**Status:** Implemented and locally verified 29 July 2026  
**Scope:** Roadmap 5.1–5.2  
**Architecture:** Pair-scoped WebRTC links in a host-and-spoke topology

## Boundary

Phase 5 supplies the transport needed by the later online game integration. It
does not start a match from the lobby, render the networked game table, or
claim that an action was accepted before the synchronisation authority assigns
its sequence. Those responsibilities remain Phase 6.

Every non-host has exactly one WebRTC data-channel link to the host. A host has
between one and five links for a supported two-to-six-seat table. Guests
never create a guest-to-guest edge; a guest message for another guest is
forwarded through the host. This avoids treating Metered's shared-room mesh
helper as though it were the accepted star topology.

## Pair-scoped signalling

`createManagedSignallingAdapter` wraps the accepted Metered
`SignallingClient`-shaped boundary:

- connect and subscribe to one private pair scope;
- publish an offer, answer, ICE candidate, or clean-close signal;
- use a provider direct route only after authenticated composition explicitly
  registers it, while retaining the pair-scoped publish path;
- reject malformed, oversized, expired, future-dated, self-addressed, or
  incompatible signalling envelopes;
- deduplicate signal identifiers; and
- expose only safe state such as whether ICE servers exist and when credentials
  expire, never their credential values.

The production composition must derive an opaque pair scope from the accepted
room/seat authority. A shared public room is not a valid match-data scope.
Provider peer metadata and a claimed player ID are untrusted.

`createConfiguredPeerConnection` owns one provider client, signalling adapter,
and WebRTC peer lifecycle. Phase 6 may use it as the `createPeer` factory for a
`createHostStarTransport` instance after the lobby assigns seats and pair
scopes.

## WebRTC state and handshake

`createWebRtcPeerConnection` exposes these honest states:

`idle → signalling → connecting → handshaking → connected`

Connection loss becomes `disconnected`; incompatible input or a WebRTC/data
channel failure becomes `failed`; explicit or remote closure becomes `closed`.
The state cannot become `connected` until:

1. offer/answer negotiation has completed;
2. the ordered data channel is open;
3. both peers agree on the transport protocol version, engine schema version,
   and engine rules version; and
4. the remote peer proves possession of the assigned seat proof through the
   injected verifier.

The version fields are deliberately distinct. The current engine uses numeric
schema `2` and rules version `crazy-rummy/3`; the lobby separately uses its
Phase 4 compatibility vocabulary. The transport does not compare unlike
versions.

Application payloads receive a monotonically increasing per-link sequence.
Duplicate events are ignored, reordered events are buffered until gaps close,
heartbeats detect a stale peer, and clean closure stops timers and listeners.

## ICE and TURN

Production uses `iceTransportPolicy: "all"` so direct candidates are preferred
and TURN may be selected when required. Forced-relay acceptance uses
`iceTransportPolicy: "relay"`.

ICE configuration accepts STUN plus browser-safe TURN credentials. TURN
credentials must be injected by the connected provider event or a deployment
credential provider; their explicit expiry must be unexpired and no more than
one hour away. STUN-only entries may omit expiry. Administrative keys and
long-lived TURN secrets are forbidden in the static client.

The local browser acceptance proves the application state machine over real
Chromium `RTCPeerConnection` instances. It cannot prove a separate-network
candidate path or forced relay. The existing Phase 0 broadband/cellular direct
and relay probe remains architecture evidence; the Stage 5 implementation
still requires opt-in two-phone direct and forced-relay revalidation before a
release can claim that live-device gate.

## Privacy and logging

- SDP, ICE candidates, seat proofs, provider routes, and TURN credentials are
  signalling-only values and are never included in state snapshots.
- Transport errors expose a bounded code, safe message, and retryable flag.
- The implementation does not log network payloads or credentials.
- The data channel is only a private delivery path; player-view redaction is
  owned by the synchronisation authority and engine projection seams.

## Verification

- `tests/unit/peer-transport.test.mjs` covers strict signalling, provider ICE
  injection, offer/answer/ICE negotiation, version and seat proof handshake,
  ordered events, heartbeat timeout, clean close, and all six seats in a star.
- `tests/browser/online-transport.mjs` uses real Chromium WebRTC connections
  for a three-seat star, verifies guest-to-guest forwarding through the host,
  renders honest connected/disconnected state, and checks 320 CSS pixel
  containment.

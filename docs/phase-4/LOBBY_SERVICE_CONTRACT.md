# Phase 4 Lobby Service Contract

**Status:** Implemented and verified 29 July 2026  
**Scope:** Roadmap Phase 4.1–4.4 only

## Boundary

`src/online/core/` defines the provider-neutral lobby boundary. UI modules know
only an online session; they do not import Metered, channel names, publishable
keys, request envelopes, or provider scopes. Phase 4 forms and maintains a
waiting room. It does not start WebRTC, carry game commands, recover a live
match, or claim Phase 5/6 network synchronisation.

`createOnlineLobbySession()` exposes:

```text
getSnapshot()
subscribe(listener)
goOnline()
goOffline()
refresh()
createTable({ visibility, capacity })
joinTable({ tableId, revision? })
joinByCode({ code })
accept()
setReady(boolean | { ready })
leave()
cancelTable()
dispose()
```

The snapshot contains online/presence state, safe Open-table projections, the
current room, invite details only for that room, polling freshness/backoff, and
structured errors. Provider scopes, room secrets, seat secrets, and Closed
codes never appear in public discovery or UI table lists.

## Timing and ordering

- Visible lobbies poll around every five seconds with injectable jitter and
  exponential error backoff.
- Presence heartbeat is around 15 seconds; presence and table leases expire
  after 45 seconds unless renewed.
- Hidden documents pause polling and resume with a fresh request.
- Each session sequences requests. A late response cannot overwrite a newer
  refresh.
- Table mutations carry the last observed revision in both the neutral
  `expectedRevision` and provider `expectedTableVersion` fields.
- Seat claims, acceptance, readiness, leave, cancellation, and renewal are
  idempotent or conditional at the host authority.

## Provider implementation

`src/online/providers/` implements the accepted Metered Realtime Messaging
route over an injected `SignallingClient`. Metered is transient pub/sub, not a
database. Each creator therefore runs the bounded host authority:

- the Open index carries discovery requests and expiring safe advertisements;
- Closed lookup uses a SHA-256 scope derived from a 192-bit invite;
- the host owns capacity, seats, revisions, lease expiry, and idempotency;
- direct replies are used when Metered supplies the requesting peer ID;
- a host dispatches its own heartbeat/create/owned-table operations locally
  because pub/sub does not echo to the sender; and
- Open advertisements exclude invite and internal routing data.

The installed runtime is opt-in. `VITE_METERED_PUBLISHABLE_KEY` accepts only a
restricted `pk_live_` browser key, and
`VITE_CRAZY_RUMMY_ONLINE_ENABLED=false` is the deployment kill switch.
Without valid configuration the PWA renders an unavailable online state and
never falls back to fake production discovery.

## Deterministic service

`createFakeLobbyService()` is the test/developer authority. It follows the same
expiry, compatibility, capacity, revision, visibility, and acceptance
contract, but it is never selected by the production bootstrap.

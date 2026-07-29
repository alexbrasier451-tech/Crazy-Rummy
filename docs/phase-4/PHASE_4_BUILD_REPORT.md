# Phase 4 Build Report

**Status:** Complete  
**Date verified:** 29 July 2026  
**Scope:** Presence, polling, and table service

## Delivered

- Provider-neutral lobby contracts, structured errors, safe input validation,
  deterministic fake authority, session snapshots, subscriptions, ordering,
  visibility-aware polling, heartbeat, lease renewal, jitter, and backoff.
- Open and Closed table creation, compatible public discovery, invite lookup,
  conditional seat claims, explicit acceptance, readiness, leave, host
  cancellation, capacity limits, and expiry.
- Metered Realtime Messaging `SignallingClient` integration with a transient
  browser-hosted table authority, direct/request replies, hashed Closed scopes,
  safe Open advertisements, idempotency, request bounds, kill switch, quota
  errors, and no administrative credential in the PWA.
- Real lobby and waiting-room UI with explicit opt-in online/offline control,
  freshness/loading/empty/stale/error states, pending-action protection,
  six-seat reflow, Open previews, code joining, room readiness, and honest
  unavailable behavior without deployment configuration.
- A pinned `@metered-ca/realtime` runtime and documented `.env` deployment
  boundary.

The detailed seams are recorded in
[`LOBBY_SERVICE_CONTRACT.md`](LOBBY_SERVICE_CONTRACT.md),
[`METERED_DEPLOYMENT.md`](METERED_DEPLOYMENT.md), and
[`PRIVACY_ABUSE_CHECKLIST.md`](PRIVACY_ABUSE_CHECKLIST.md).

## Verification evidence

The supported command remains:

```text
pnpm check
```

The completion run includes:

- 102 passing Node unit contracts across retained Phases 1–3 and new Phase 4
  core, provider, privacy, expiry, compatibility, race, and UI presenters;
- deterministic two-client Metered bridge tests for Open discovery, Closed
  lookup, conditional joins, host-local dispatch, direct replies, expiry, and
  cleanup;
- a source-level browser acceptance that joins an Open table, fills all six
  seats, marks players ready, cancels as host, then proves a Closed table stays
  absent from discovery and is joinable by code at 320 px;
- the retained production build, responsive/navigation browser smoke,
  install/update/cache/offline PWA lifecycle, and Stage 3 full local-game
  browser acceptance.

## Stage boundary

Phase 4 forms a compatible remote waiting room and maintains transient
presence. Phase 5 still owns WebRTC signalling, connection topology, TURN use,
transport acknowledgements, and reconnect. Phase 6 still owns connecting that
transport to the deterministic engine and gameplay UI.

The provider path is deployable when an origin-restricted publishable key and
enabled kill switch are supplied. A live restricted-key multi-browser run and
dashboard plan/overage confirmation remain external deployment/release
evidence; the repository does not claim that evidence was performed here.

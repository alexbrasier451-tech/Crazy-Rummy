# Phase 4 Lobby Privacy and Abuse Checklist

**Status:** Green for the implemented Phase 4 boundary  
**Date verified:** 29 July 2026

| Control | Result |
| --- | --- |
| Minimum identity | Local opaque ID and 1–24 character safe display name only; no account, email, contacts, profile, or chat. |
| Safe names | NFKC normalisation, whitespace collapse, control-character/link rejection, length bounds, and text-node rendering. |
| Open/Closed separation | Only Open tables enter discovery. Closed lookup requires a 192-bit invite and a SHA-256-derived channel scope. |
| Secret projection | Provider scopes and invite/room/seat secret fields are stripped before public/UI table snapshots. |
| Capacity and races | Capacity is 3–6; conditional revisions reject stale/final-seat races. |
| Idempotency | Mutations carry bounded request and idempotency IDs; the host caches accepted results for the lease window. |
| Expiry | Presence and abandoned tables expire; Open advertisements carry authoritative expiry and stale entries are discarded. |
| Rate and size bounds | Local operation debounce, provider rate/error mapping, bounded IDs/channels/names, and an 8 KiB request limit. Host validation repeats client validation. |
| Provider credentials | Only an origin/action/channel-restricted `pk_live_` key may ship. Administrative, payment, TURN secret, and dashboard credentials are rejected or prohibited. |
| Kill switch/quota | Missing/disabled configuration fails closed. Quota/offline errors become recoverable unavailable UI states rather than aggressive retry. |
| Payload privacy | No hands, deck, SDP, ICE candidates, signalling records, or game commands exist in Phase 4 lobby payloads. |
| Output escaping | Lobby and waiting-room content uses DOM `textContent`; tests retain unsafe-looking names as inert text. |
| Cleanup | Going offline, cancel, leave, expiry, and disposal remove state or unsubscribe channels as applicable. |

This is a bounded casual trusted-host MVP, not a moderation service,
anti-cheat system, durable identity provider, or cryptographic access-control
backend. Live dashboard plan/origin/capability verification and a configured
multi-browser provider run remain deployment/release checks.

# Metered Phase 4 deployment boundary

Phase 4 selects Metered Realtime Messaging only for the static PWA's
rendezvous traffic. The published JavaScript SDK is a transient realtime
transport; it is **not** a durable table database and it does not offer
authoritative compare-and-swap storage. Crazy Rummy therefore uses a
host-authoritative table-service protocol over Metered channels. A host checks
capacity, lease expiry, `expectedTableVersion`, and the request idempotency key
before it publishes a reply.

This is appropriate for the accepted trusted-host MVP. It is not an
authoritative backend, anti-cheat system, durable recovery system, or a claim
that concurrent browser writers are server-atomic.

## Browser configuration

The static client may receive only a Metered restricted publishable key:

```js
const hostTableService = createMeteredHostTableService();
const metered = createMeteredService({
  SignallingClient,
  apiKey: "pk_live_REPLACE_AT_DEPLOYMENT",
  config: {
    enabled: true,
    origin: "https://example.invalid",
    openIndexChannel: "crazy-rummy/v1/open-index",
    channelPrefix: "crazy-rummy/v1",
    leaseTtlMs: 45_000,
    requestTimeoutMs: 8_000,
    maxRequestBytes: 8_192,
  },
  hostTableService,
});
```

Do not commit a key to source. Do not put an administrative key, payment
credential, long-lived TURN credential, API secret, or provider dashboard
token in the PWA, `public/`, a generated bundle, test fixture, console log, or
CI transcript. `validateMeteredConfig` rejects secret-like configuration names
and a non-`pk_live_` key.

Configure the publishable Metered key before release with only the actions the
protocol needs: Subscribe, Publish, Presence, and Send. Restrict it to the
production HTTPS origin and the `crazy-rummy/v1/...` channels, as narrowly as
the Metered dashboard permits. Metered's publishable-key model does not give
this application a stable trusted peer ID or trusted peer metadata, so each
protocol request carries bounded anonymous installation/table IDs and the host
must validate them.

The existing Phase 0 probe proves a different, but useful, browser SDK path:
`new MeteredPeer({ apiKey, rtcPeerConnectionFactory })` followed by
`await peer.join(room)`. It proves publishable-key TURN injection and peer
signalling, not table storage. The Phase 4 bridge uses Metered's documented
`SignallingClient` operations: construct with `new SignallingClient({ apiKey
})`, subscribe/unsubscribe to channels, publish messages, and react to
`message`, `presence`, `disconnected`, and `server-error` events. The
application pins `@metered-ca/realtime` 1.2.0 and the runtime bootstrap
constructs `SignallingClient` only when an identity, enabled kill switch, and
publishable deployment key are all present.

## Channel and record protocol

- `crazy-rummy/v1/open-index` contains only Open discovery requests and short
  host advertisements. Advertisements contain safe table fields only: table
  ID, safe display name, capacity, rules/protocol versions, coarse state, and
  expiry. They never contain an invite code, room secret, hand, SDP, ICE
  candidate, deck, or chat.
- A new client subscribes to the Open index, publishes a discovery request,
  and collects only short-lived Open advertisements. The host refreshes its
  lease advertisement while visible; clients discard expired entries.
- A Closed table gets a 192-bit random invite. Its channel is
  `crazy-rummy/v1/closed/<sha256(invite)>`; the invite itself is never used as
  a channel name and is never sent to the Open index. A guest must look up the
  invite before it can make a table mutation.
- Create/lookup replies return an opaque `providerScope`, retained internally
  by the Phase 4 core. Later joins, ready changes, leave/cancel, and renewals
  use that scope. The scope never appears in public table snapshots.
- Every mutation envelope has a unique `requestId` and an idempotency key.
  Conditional mutations carry `expectedTableVersion`; the host increments the
  version only after accepting the request. A stale or duplicate reply is not
  an accepted seat claim.

Metered messaging is transient. The host owns the live table record and must
clean up expired presence, advertisements, table leases, and unanswered
requests. A host reconnect or browser close can lose state; Phase 5/6 need
their own reconnect and match-recovery design. The current protocol gives a
closed table channel obscurity plus provider channel restrictions, not an
encryption or durable-access-control guarantee.

## Limits, kill switch, and failures

Keep the Metered account on its hard-capped free plan, with no overage and no
auto-recharge. Before every release, check the actual dashboard plan, cap,
overage status, origin restrictions, action restrictions, and channel
restrictions. The ADR records the existing account evidence; quota exhaustion
has not yet been induced and must not be assumed to behave correctly.

The application config's `enabled: false` is the public-discovery kill switch.
It fails locally with `ONLINE_DISABLED` and must leave Closed-table/local play
available. Metered quota/limit errors normalize to `METERED_QUOTA_EXHAUSTED`;
network/timeout/disconnect errors normalize to `METERED_OFFLINE`; other
provider failures become `METERED_PROVIDER_FAILURE`. The lobby should pause,
apply visibility-aware backoff, and show an honest unavailable state rather
than retrying aggressively.

Client-side request protection is deliberately bounded: 8 KiB max envelope,
2–6 capacity, 1–32 printable-character display names, 10–60 second lease,
and per-operation debounce/rate limits. It is not an abuse boundary; the host
handler must repeat all validation and rate limiting because clients are
modifiable. `createMeteredHostTableService` repeats the lease, seat-capacity,
input, version, idempotency, and expected-revision checks for the browser host.

## Deployment and integration procedure

1. Create or verify the Metered free plan has a hard cap, no overage, and no
   auto-recharge. Stop if the dashboard cannot demonstrate that state.
2. Create a restricted `pk_live_` publishable key. Add the exact production
   HTTPS origin and the minimum Publish/Subscribe/Presence/Send actions and
   allowed channel patterns. Do not paste an admin key anywhere in the PWA.
3. Supply the key only through the deployment configuration that builds the
   static client. Inspect the generated `dist/` output and browser network/
   console logs to confirm no secret-like value, invite, SDP, ICE candidate,
   deck, or hand was emitted.
4. Run the provider unit suite without network or CDN access. Then run two
   isolated real browsers with a restricted test key: Open discovery appears,
   expired advert disappears, Closed invite is absent from the index and can
   join only through its hashed scope, duplicate/stale join is rejected by the
   host, quota/offline failures activate the kill-safe UI path, and cleanup
   unsubscribes channels.
5. Run the existing `spikes/webrtc-turn/run-metered-probe.mjs` with the
   frontend-safe key and retain only its redacted report. It validates TURN
   injection/relay separately from this lobby protocol.

The code path is deployable when the PWA wires `createMeteredService` to a
pinned Metered `SignallingClient`, a restricted key, and
`createMeteredHostTableService`. The host authority is intentionally transient:
host reload/loss expires its table rather than silently claiming durable state.
Live restricted-key multi-browser acceptance remains required external release
evidence; do not claim that evidence until the procedure above is green.

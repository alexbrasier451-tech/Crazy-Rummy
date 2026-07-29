# WebRTC/TURN feasibility probe

This disposable Phase 0 probe answers one narrow question:

> Can two browser clients establish an ordered WebRTC data channel through the
> configured ICE service, exchange a payload, and prove from browser statistics
> whether TURN relay candidates were selected?

It is not the Crazy Rummy application, production signalling service, or a
substitute for the two-real-phone test.

See [RESULTS.md](RESULTS.md) for the evidence captured on 29 July 2026 and the
remaining real-phone gate.

## Contents

- `probe-server.mjs` serves the static probe, short-lived ICE configuration,
  and an in-memory polling signalling queue.
- `index.html` and `probe.js` are the two-peer browser probe.
- `run-probe.mjs` opens isolated host and guest browser contexts, waits for an
  acknowledged payload, and verifies the selected ICE candidate pair.

No ICE credential is stored in this directory. The local server reads it from
the process environment and keeps signalling only in memory.

## Automated direct-path check

Set `PLAYWRIGHT_PACKAGE` to an installed Playwright or `@playwright/test`
package directory if it is not resolvable from this project:

```powershell
$env:PLAYWRIGHT_PACKAGE = 'C:\path\to\node_modules\playwright'
node .\spikes\webrtc-turn\run-probe.mjs --mode=direct
```

This uses Cloudflare's public STUN address and permits direct candidates. It
proves the probe and signalling harness, not TURN.

## Automated forced-relay check

Obtain short-lived test credentials from the selected TURN provider and supply
the provider's complete `iceServers` array:

```powershell
$env:ICE_SERVERS_JSON = '[{"urls":["turn:provider.example:3478?transport=udp"],"username":"short-lived","credential":"secret"}]'
$env:PLAYWRIGHT_PACKAGE = 'C:\path\to\node_modules\playwright'
node .\spikes\webrtc-turn\run-probe.mjs --mode=relay
```

Relay mode sets `iceTransportPolicy: "relay"` and fails unless the selected
local and remote candidates are both reported as `relay`.

Never commit or paste a production TURN key, provider administration token, or
long-lived credential into this repository. A production static PWA should
request short-lived ICE credentials from an authenticated managed endpoint.

For this project's strict zero-cost boundary, Metered hard-capped free
signalling and Trial Global 500MB TURN are selected for the Phase 0 route.
Dashboard evidence shows `$0` overage and auto-recharge off. Cloudflare Realtime
TURN is not accepted because its allowance becomes usage-billed after the free
tier.

The local Metered forced-relay runner accepts the frontend-safe publishable key
through the environment:

```powershell
$env:METERED_PUBLISHABLE_KEY = 'pk_live_REPLACE_ME'
$env:PLAYWRIGHT_PACKAGE = 'C:\path\to\node_modules\playwright'
node .\spikes\webrtc-turn\run-metered-probe.mjs
```

## Hosted desktop/cellular-phone check

Open the deployed launcher:

<https://alexbrasier451-tech.github.io/Crazy-Rummy/>

Use the desktop link on a PC connected to home broadband. Copy the paired phone
link to one supported phone with Wi-Fi disabled so it uses 4G/5G.

Both pages must show `Passed`. Save the redacted report shown on each phone. It
must include:

- `payloadRoundTrip: true`;
- `connectionState: "connected"`;
- `localCandidateType: "relay"` and `remoteCandidateType: "relay"` for the
  forced-relay run;
- browser/platform names and timestamps recorded separately by the tester.

The in-memory signalling server is intentionally unsuitable for deployment:
it has no authentication, durable state, multi-instance coordination, or
production abuse controls.

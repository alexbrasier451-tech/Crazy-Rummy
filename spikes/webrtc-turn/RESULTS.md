# WebRTC/TURN spike results

**Run date:** 2026-07-29  
**Status:** Passed, including broadband desktop versus cellular phone

## Evidence captured

### Static and contract checks — passed

- `probe.js`, `probe-server.mjs`, and `run-probe.mjs` pass Node syntax checks.
- Three server contract tests pass:
  - relay mode refuses to start without a TURN URL;
  - relay mode refuses TURN without a username and credential;
  - ICE configuration and polling signalling remain peer-scoped.

### Direct WebRTC data channel — passed

Two isolated Chromium browser contexts completed an ordered data-channel
exchange through the local polling-signalling harness.

| Evidence | Host | Guest |
| --- | --- | --- |
| Connection | `connected` | `connected` |
| Data channel | `open` | `open` |
| Payload round-trip | `true` | `true` |
| Local candidate | `host` | `host` |
| Remote candidate | `host` | `host` |
| Protocol | UDP | UDP |

The final rerun finished at `2026-07-29T00:50:05.852Z`. It proves the probe,
signalling flow, ordered payload/acknowledgement, and candidate inspection. It
does not prove communication between separate NATs or mobile browsers.

### Forced relay without credentials — rejected as designed

Running `--mode=relay` without a TURN URL and short-lived username/credential
exited with code `1` and `Relay mode requires a TURN URL.` This prevents a
direct connection from being mistaken for a TURN success.

### Metered forced TURN — passed

The Crazy Rummy provider account was verified as:

- Realtime Messaging plan `signalling_free`, with hard caps and no overage
  billing;
- TURN Trial Global 500MB at `$0/month`, with `$0` overage and hard stop at
  exhaustion; and
- auto-recharge off.

The frontend-safe publishable key has Subscribe, Publish, Presence, and Send
enabled with TURN auto-injection on. The disposable public probe intentionally
contains this publishable client key; it contains no Metered secret or
administrative credential.

Two isolated Chromium contexts then ran with
`iceTransportPolicy: "relay"`. Both completed at approximately
`2026-07-29T01:12:56Z` with:

| Evidence | Host | Guest |
| --- | --- | --- |
| TURN injected | `true` | `true` |
| Connection | `connected` | `connected` |
| Data channel | `open` | `open` |
| Payload round-trip | `true` | `true` |
| Local candidate | `relay` | `relay` |
| Remote candidate | `relay` | `relay` |
| Protocol | UDP | UDP |
| Relay protocol | UDP | UDP |

This proves Metered signalling, TURN injection, forced relay selection, and
ordered P2P data-channel exchange in desktop Chromium. It does not replace the
physical-phone/different-network test.

### Hosted GitHub Pages probe — passed

The tested static probe is deployed at:

<https://alexbrasier451-tech.github.io/Crazy-Rummy/>

GitHub Actions deployment run `30414445422`, attempt 2, completed successfully.
Two isolated Chromium contexts then loaded the public HTTPS origin and passed:

- automatic/direct mode with an acknowledged payload round-trip and
  `host`/`host` candidates over UDP; and
- forced-relay mode with an acknowledged payload round-trip and
  `relay`/`relay` candidates over UDP.

The live forced-relay run finished at `2026-07-29T02:10:43.941Z`. This proves
that the deployed page, Metered rendezvous, TURN injection, and data channel
work together. It still does not prove a cellular carrier/NAT path.

## Provider finding

Cloudflare Realtime TURN is unsuitable for the strict zero-budget boundary
because usage after its included tier is chargeable.

Metered is accepted for the Phase 0 route based on the verified hard-capped free
account and successful live forced-relay run. A cellular-phone run is still
required before Phase 0 sign-off.

## Representative acceptance procedure — completed

1. Open the hosted launcher on a desktop using home broadband.
2. Copy each paired phone link to one phone with Wi-Fi disabled and run it over
   4G/5G.
3. Confirm both the direct and forced-relay pages report `Passed`; the forced
   run must report `relay` for both candidate types.

Android/iPhone cross-platform coverage and interruption/reconnect testing remain
release-beta work.

## Representative real-network run — passed

On 29 July 2026, the owner ran the public probe between a broadband desktop and
a phone using cellular data. Both devices used test code `ZTFYVZ`.

The automatic run completed with:

| Evidence | Result |
| --- | --- |
| Signalling | peer joined |
| Remote role | guest |
| Connection/data channel | connected/open |
| Payload round-trip | `true` |
| Local/remote candidate | `srflx` / `srflx` |
| Protocol | UDP |
| Selected path | direct |
| Final result | passed |

The forced-TURN run completed with:

| Evidence | Result |
| --- | --- |
| Signalling | peer joined |
| Remote role | guest |
| Connection/data channel | connected/open |
| Payload round-trip | `true` |
| Local/remote candidate | `relay` / `relay` |
| Protocol / relay protocol | UDP / UDP |
| Selected path | relay |
| Final result | passed |

The acknowledged guest payload proves the second device participated; the
candidate reports prove both a real direct path and a forced Metered relay path.
This closes the Phase 0 representative-network gate.

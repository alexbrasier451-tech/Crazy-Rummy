# Stage 1.1.3 — shell and pre-game route programme

**Direction:** Owner-approved Compartment Table  
**Scope:** `/`, `/identity`, `/lobby`, `/waiting-room`  
**Behaviour boundary:** presentation-only; existing routes, online authority,
private recovery, invite disclosure, readiness, and start acknowledgement
remain authoritative.

## Implemented route signatures

| Route | Production signature | State treatment |
| --- | --- | --- |
| `/` | One lit node resolves a thirteen-stop line above the registered route-node wordmark and continuation dock. | Saved/no-seat copy is derived only from device-local identity; no room code, recovery secret, or card identity enters arrival. |
| `/identity` | A clipped personal seat ticket with stamped, visibly named marker tags. | Native validation retains the entered value; save is single-flight; the page says this is device-local and not an account. |
| `/lobby` | An illuminated threshold board opens into paired ticket gates and offset public departure tickets. | Loading, healthy, stale, empty, offline, incompatibility, and error truth remain in the existing session snapshot and status presenters; retained results are not cleared on refresh failure. |
| `/waiting-room` | A table ticket leads to an ordered carriage seating plan around a recessed baize oval and departure line. | Accepted, ready, reconnecting, local, open-seat, no-room, connecting, started, and start-blocked states remain explicit in text. Host authority never auto-starts. |

The compositions deliberately do not share one dashboard silhouette. Shared
screen/component semantics remain intact while each route has a separate
spatial idea.

## Accessibility and adaptation

- Native controls and DOM order remain the keyboard and screen-reader order.
- Marker choices expose spoken names and visible labels; selection has a check
  and heavy outline in addition to colour.
- Seats name acceptance, readiness, connection, and the local player in text.
- Controls retain the shared minimum target contract. At narrow reflow, the
  seating oval becomes a heading-like station followed by a one-column ordered
  seat list.
- Reduced motion resolves arrival and table state immediately, removes route
  drawing, platform light, ticket travel, loading sweep, and ready rim motion.
- Forced colours removes material dependence, restores two-pixel system
  boundaries, and preserves selected/ready patterns and labels.

## Verification

See [verification](VERIFICATION.md) for commands and the remaining integration
item. This stage does not claim physical-device evidence or owner creative
acceptance; those remain later roadmap gates.

## Reproducible captures

The focused browser check writes the following when
`CRAZY_RUMMY_CAPTURE_PREGAME=1`:

- `captures/startup-390x844.png`
- `captures/identity-390x844.png`
- `captures/lobby-healthy-390x844.png`
- `captures/lobby-offline-empty-390x844.png`
- `captures/waiting-room-390x844.png`
- `captures/lobby-forced-colour-reduced-motion-320x568.png`

These are implementation review evidence, not substitutes for the later
physical-device, screen-reader, zoom, or owner-judgement gates.

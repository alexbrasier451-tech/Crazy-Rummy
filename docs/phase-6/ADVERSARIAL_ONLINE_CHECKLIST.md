# Phase 6 Adversarial Online Checklist

**Status:** Green for the local automated Stage 6 boundary  
**External evidence:** Three-phone separate-network and forced-relay
revalidation remains a release gate

| Control | Evidence |
| --- | --- |
| One authority | Only host sync executes canonical engine commands. |
| Correct privacy | Every seat converges to the same public projection while receiving only its own private hand. |
| Pending truth | Submission stays pending until a matching authoritative command ID is delivered. |
| Rejection truth | Illegal and stale commands preserve the accepted projection and staged UI. |
| Duplicate safety | Duplicate command and event delivery advances one authoritative revision. |
| Delay and reorder | Gap buffering plus missed-event replay drains reordered sequences. |
| Loss recovery | A deliberately lost event is recovered from retained host history. |
| Authenticated rebind | Room and seat secrets rebind at the last accepted sequence. |
| Refresh recovery | Host canonical state and guest player projection restore from private match-scoped records. |
| Malformed input | Invalid sync and wire envelopes fail closed without state mutation. |
| Dropped-seat causality | Engine `DROP_SEAT` precedes control, conserves 52 cards, redacts dead cards, and replays. |
| Compound facts | Drop-triggered scoring and next-hand transitions emit the same safe facts as their ordinary equivalents. |
| Host loss | Host expiry abandons without a scored result or migration. |
| Full match | Thirteen hands finish with identical public state, scores, and winners on all clients. |
| Mobile layout | Three online views and network status remain contained at 320 CSS pixels. |

The retained `pnpm check` gate includes the Stage 6 unit and browser
acceptance. Local link recreation is recovery-path evidence only; it is not a
claim of real ICE direct-to-relay migration.

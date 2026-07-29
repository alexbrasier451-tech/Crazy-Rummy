# Phase 5 Privacy and Resynchronisation Checklist

**Status:** Green for the implemented Phase 5 protocol boundary  
**External evidence:** Two-phone direct and forced-relay revalidation remains
a release gate

| Control | Evidence |
| --- | --- |
| Host authority | Only `createHostSyncSession` executes engine commands and owns canonical state. |
| Player-scoped delivery | Events use engine `projectEvent`; snapshots use engine `snapshotFor` for the destination seat. |
| No cross-hand leakage | Six-seat fault injection serialises every guest delivery and asserts that another seat's private card sentinel is absent. |
| Explicit versions | Sync protocol, sync schema, engine schema, and engine rules versions are validated independently. |
| Authoritative ordering | Accepted engine revisions are the event sequence; a result is acknowledged only with that authoritative sequence. |
| Duplicate safety | The engine idempotency ledger owns duplicate command results; transport retries retain one command ID. |
| Negative reconciliation | A bounded seat-and-command tombstone records the command fingerprint, so a delayed original intent remains uncommitted and reuse of its ID with different content is rejected as a conflict. |
| Lost acknowledgement | Bounded retry ends in an explicit resynchronisation request rather than a blind new command. |
| Gap recovery | Delayed and reordered events are buffered within a bound; a gap requests missed events or a player-scoped snapshot. |
| Rebind proof | A returning guest supplies both the room secret and its seat-specific secret plus the last accepted sequence. |
| Private recovery | Guest recovery exports only its player-scoped snapshot, pending intent metadata, sequence, and local secrets. |
| Host recovery | Host recovery exports canonical state, the bounded event tail, idempotency-owned command outcomes, seat status, and authoritative deadlines for protected local storage. |
| Clear-on-terminal | Client `clearRecovery` and both sessions' `shouldClearRecovery` seams remove private recovery after forfeit or abandonment. Phase 6 owns calling the storage writer. |
| Guest disconnect | The host pauses at its own timestamp, accepts rebind before expiry, and at exactly 300,000 ms marks the seat dropped with dead-hand metadata. |
| Guest forfeit | Two or more active seats may resume; one remaining active seat produces the protocol's forfeit terminal state. |
| Host disconnect | Guests enter a read-only reconnecting state and abandon without a result at exactly 300,000 ms. No host migration is attempted. |
| Signalling privacy | SDP, ICE, TURN credentials, room secrets, and seat proofs are absent from public snapshots and logs. |
| Bounded inputs | Signalling has type, size, address, identifier, timestamp, expiry, and schema validation; sync rejects unknown, cross-match, or incompatible envelopes. |

## Persistence contract

The exported recovery records are versioned data for protected local storage.
The composition layer must store them under a match-scoped key and preserve:

- transport protocol, engine schema, and engine rules versions;
- match ID, local seat ID, host role, and latest accepted sequence;
- the local room/seat resume secrets;
- the last safe player-scoped snapshot on a guest;
- canonical state, a bounded event tail, and bounded negative-reconciliation
  tombstones on the host;
- pending intent ID and retry/uncertain status; and
- authoritative disconnect timestamps and recovery deadlines.

The storage layer must never put these values in a URL, console output,
analytics event, service-worker precache, public lobby projection, or generated
diagnostic report. It must remove them on confirmed leave, drop, abandonment,
finished-room invalidation, or explicit local-data clearing.

## Phase 6 boundary

Phase 5 emits dropped-seat, dead-hand, forfeit, pause, resume, and abandonment
policy state. It does not fabricate an engine scoring or turn-advance event for
a dropped player. Phase 6 owns applying the accepted dead-card/next-active-seat
gameplay policy through an explicit engine integration and rerunning the full
online game flow.

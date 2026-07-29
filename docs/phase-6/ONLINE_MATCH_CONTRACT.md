# Phase 6 Online Match Contract

**Status:** Implemented and locally verified 29 July 2026  
**Scope:** Roadmap 6.1–6.2

## Composition boundary

The online match session is the browser composition root between a locked
waiting room and the existing game screens. It owns the private match
bootstrap, host-star transport, host or guest synchronisation session,
match-scoped recovery record, and UI-facing projection.

The UI receives only:

- the authenticated player's redacted engine projection;
- the local seat ID;
- public transport and synchronisation status;
- pending command IDs; and
- the last command's pending, accepted, rejected, or uncertain outcome.

It never receives canonical host state on a guest, another player's hand,
room or seat secrets, pair scopes, seat proofs, SDP, ICE candidates, or TURN
credentials.

## Match formation

Only the table host can start. Start requires three to six accepted seats, all
ready at one matching table revision. The authority locks membership, creates
a fresh match ID, room secret, per-seat recovery secrets and proofs, and
pair-scoped signalling channels.

Each seated player obtains only their recipient-scoped bootstrap. Provider
bootstrap replies require an authenticated direct route and are never included
in the lobby snapshot, Open-table advertisement, URL, log, or diagnostic
report. Remote seat proofs are compared exactly during the peer handshake.

## Authority and action truth

The host alone executes engine commands. Guests send intents through their
single host link. A submitted intent is only **pending** until the
authoritative event or command result identifies the same command ID.

- accepted actions update the projection and may trigger acknowledged motion;
- rejected actions retain staged UI choices and state that nothing changed;
- uncertain actions remain blocked while reconciliation determines whether
  the original command committed;
- paused, reconnecting, incompatible, forfeit, and abandoned states disable
  gameplay with distinct accessible status copy.

Host actions use the same UI contract even though host authority can decide
them synchronously.

## Recovery and dropped seats

Recovery persists a versioned, match-scoped private composition record with
the bootstrap and player-scoped sync record. Restore fails closed on a
match/seat/version mismatch. A guest reconstructs transport and rebinds from
the recovered authoritative sequence. A host restores canonical engine state,
negative-reconciliation tombstones, seat status, and deadlines rather than
starting a fresh game.

At the exact five-minute guest deadline, host sync submits the replayable
engine `DROP_SEAT` command before sending protocol control. The engine:

- keeps original seat order and completed score history;
- moves the dropped private hand into a non-projectable dead-card zone;
- preserves accepted melds;
- removes the seat from active turns, future deals, acknowledgements, dealer
  rotation, scoring, and winner eligibility;
- records every compound hand or next-hand transition in safe event facts; and
- completes by forfeit, without a fabricated normal hand score, when one
  active player remains.

The host cannot be dropped. Unrecovered host loss remains abandonment without
a result.

## External boundary

The local Chromium acceptance proves the application protocol over real local
`RTCPeerConnection` links. It does not prove an internet-direct candidate,
TURN relay, or a three-phone mobile run. Separate-network phone direct and
forced-relay revalidation remains a release gate.

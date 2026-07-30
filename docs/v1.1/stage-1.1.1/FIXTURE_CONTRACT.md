# Stage 1.1.1 canonical fixture and privacy contract

**Fixture family:** `v111-stage1-local-2026-07-30`  
**Source:** Current local beta contracts and deterministic test construction  
**Revision status:** Uncommitted source snapshot; immutable beta SHA pending  
**Locale/time:** `en-GB`; deterministic display copy; no live timestamps  
**Purpose:** Concept/keyframe review only

## Lobby fixture

The healthy `/lobby` concept may show only public discovery fields:

- public title: `Crazy Rummy table`;
- host display name: `Pat`;
- occupancy: `1 of 6`;
- state: `Open · Waiting`;
- rules label: `Crazy Rummy · 13 hands`;
- connection: `Online lobby · just now`.

It must not show a raw table ID, lease, revision, invite code, room/seat secret,
peer/signalling data, Closed table, or the identities of players not exposed by
public discovery.

The offline variant contains no discovered tables and states that online play
is unavailable. It may offer safe local navigation, but must not imply that a
remote refresh or join succeeded.

## Busy six-seat game fixture

| Field | Value |
| --- | --- |
| Fixture ID | `v111-busy-six` |
| Route/state | `/game` · `TABLE_PLAY` · active local turn |
| Lifecycle/revision | `IN_PROGRESS` · local derived revision `19` |
| Connection | `RUNNING` · online/synchronised |
| Match progress | Hand `1 of 13`; current wild `A`; turn `6` |
| Local seat | `p1` · Pat · dealer · current turn |
| Public seats | Pat 8 cards; Alex 4; Lee 7; Jo 7; Mina 7; Sam 7 |
| Public scores | All `0` |
| Stock | `3` cards |
| Public discard | Top card `Q♠` |
| Public meld | Alex: heart run `WILD (A♣ → 7♥), 8♥, 9♥` |
| Local private hand | `Q♣, 6♣, 5♣, 5♦, 2♣, 5♠, 8♦, 9♠` |

The construction path and shuffle seed are fixture provenance, not visible
board data. No opponent card identity, stock order, full raw discard history,
room/invite/seat secret, connection credential, or raw engine state may enter
the rendered concept or export metadata.

## Preserved semantic contract

- Routes remain `/`, `/identity`, `/lobby`, `/waiting-room`, `/game`,
  `/hand-result`, `/final-result`, `/rules`, and `/settings`.
- The concept reading order is connection/turn truth, shared players/table,
  local private hand, then current actions.
- Shared seat items name the player, current/dropped/connection state, card
  count, and score in text.
- Public melds are non-interactive articles/groups; local cards are labelled
  controls in a real implementation and their concept labels include rank,
  suit, wild, selection, and position where applicable.
- Pending, accepted, rejected, uncertain, reconnecting, paused, and terminal
  states are visually and textually distinct. Concepts may not depict accepted
  travel before authority.
- All state cues survive without colour. Forced-colour and reduced-motion
  representations are alternative concept treatments, not implementation proof.

## Export plate

Every export visibly identifies:

- concept and concept-only status;
- fixture family and local source-revision status;
- capture date;
- route/state and viewport;
- player count/local seat where relevant;
- connection, motion, and colour modes;
- mock-data and private-data boundary.

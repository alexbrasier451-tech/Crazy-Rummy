# Crazy Rummy — Phase 0 Rules and State Contract

## 1. Purpose and status

This approved document is the rules and state contract for the remote
multiplayer Crazy Rummy game (the Railway Rummy/Benny family described by the
players). It defines the same observable game result for every participant,
independent of UI, device, network transport, or authority topology.

The terms below have precise meanings:

- **Confirmed**: supplied by the game owner and safe to implement as a rule.
- **Accepted default**: a deterministic family/setup choice accepted at the
  Phase 0 sign-off and safe to implement unless the owner reopens it.
- **Unresolved**: a known house-rule choice. The implementation must not hide
  this choice or silently infer it from play.

There are no unresolved Phase 0 rule choices. Accepted defaults remain
represented in the immutable per-game rule configuration rather than scattered
as hard-coded exceptions. A persisted game records that resolved configuration
at creation and does not change it after the first deal.

## 2. Rule decision register

| Topic | Status | Contract |
| --- | --- | --- |
| Players | Confirmed | 2–6 seated players |
| Pack | Confirmed | One standard 52-card pack; no physical jokers |
| Direction | Confirmed | Clockwise |
| Hand count | Confirmed | 13 hands, ending after the Kings hand |
| Moving wild | Confirmed | The rank matching the hand number/name is wild |
| Deal | Confirmed | 7 cards to each non-dealer; 8 to the dealer |
| Dealer opening | Confirmed | Dealer's only opening action is to discard one of the 8 cards; no draw and no meld |
| First normal player | Confirmed | Player immediately left of dealer |
| Normal turn | Confirmed | Draw, optional table play, then mandatory discard |
| Opening | Confirmed | A player's first table cards must form at least one complete meld |
| Layoff | Confirmed | After opening, a player may add legal cards to any player's table combinations |
| Going out | Confirmed | The player must finish with a final discard; melding/laying off every card is not sufficient |
| Hand scoring | Confirmed | Winner scores 0; every other player scores remaining cards |
| Game result | Confirmed | Lowest cumulative score after hand 13 wins |
| Opening meld wilds | Confirmed | A player's first complete set or run may contain one or more wild cards |
| Reclaimed wild | Confirmed | A reclaimed wild enters the replacing player's hand and may be held, played, or discarded normally |
| Ace in runs | Confirmed | Aces are low: A-2-3 is legal; Q-K-A and K-A-2 are illegal |
| Court-card score | Confirmed | A natural Jack, Queen, or King always scores 10 |
| Wild-card score | Confirmed | Every card of the current hand's wild rank scores 50 while left in hand, regardless of its printed rank |
| Stock exhaustion | Accepted basic default | The player who draws the final stock card completes the turn; if they do not go out, the hand then ends and all remaining hands are scored |
| Wild count | Confirmed basic rule | A meld may contain any number of wilds if it has one explicit legal interpretation |
| Set-wild replacement | Confirmed basic rule | Any missing-suit natural card of the set's rank may replace a wild in that set |
| One-card hand | Accepted supplied-summary default | Use the normal draw/play/discard turn; no special stock-only or forced-replacement restriction |
| Draw then discard | Accepted supplied-summary default | The card just drawn may be the final discard |
| Initial dealer | Accepted setup default | Select uniformly at random from occupied seats and record the result |
| Final tie | Accepted result default | All players tied for the lowest cumulative score are joint winners |

Wild cards are permitted in a player's first complete set or run. The opening
must still have one explicit legal meld interpretation and satisfy every
ordinary set/run rule.

The owner supplied Ace-low play as part of the rules. The remaining basic-rule
and setup defaults in the register are accepted when the owner signs off
Phase 0 unless explicitly changed before then.

## 3. Hand schedule

The hand index, wild rank, and hand label are fixed:

| Hand | Wild rank | Hand label |
| ---: | --- | --- |
| 1 | Ace | Aces |
| 2 | 2 | Twos |
| 3 | 3 | Threes |
| 4 | 4 | Fours |
| 5 | 5 | Fives |
| 6 | 6 | Sixes |
| 7 | 7 | Sevens |
| 8 | 8 | Eights |
| 9 | 9 | Nines |
| 10 | 10 | Tens |
| 11 | Jack | Jacks |
| 12 | Queen | Queens |
| 13 | King | Kings |

All four cards of the designated rank are wild for that hand. They cease to be
wild when the next hand begins. There is no per-hand contract or minimum meld
pattern beyond the normal set/run rules supplied here.

The initial dealer is selected uniformly at random from the occupied seats and
recorded in the first accepted game event. After every hand, the deal moves one
occupied seat clockwise.

## 4. Card and meld semantics

### 4.1 Card identity

Each physical card has a stable identity `(suit, rank)` and exists in exactly
one zone. Suit is one of clubs, diamonds, hearts, or spades. Rank is Ace, 2–10,
Jack, Queen, or King. A card whose printed rank equals the current wild rank is
a **wild card**; all others are **natural cards**.

Shuffling changes order, never card identity. Any randomized shuffle must
produce a committed, auditable order or equivalent reproducible evidence. It
must not permit a player to choose or alter cards after learning hidden order.

### 4.2 Set

A set is exactly 3 or 4 cards representing one rank. Natural members must have
that rank. Wild members may represent missing members. Since there is one pack,
the same physical card cannot appear twice and a set cannot grow beyond four
cards.

Each wild in a set records its represented rank and a deterministic slot
identity. Its represented suit does not need to be declared. Any
not-already-used natural suit of the set's rank may replace a wild slot, and
the slot adopts that natural card's suit.

### 4.3 Run

A run is 3 or more consecutive ranks of one suit. A wild may occupy a missing
position, but its represented `(suit, rank)` must always be recorded and visible
on the table. Under the confirmed Ace-low rule, A-2-3 is consecutive and
Q-K-A is not. Runs never wrap: K-A-2 is always illegal.

A meld may contain more than one wild, including all-wild cards, provided the
creating player declares one complete legal set or run interpretation. That
meld type, represented rank/suit, and each wild slot are then immutable except
through legal extension or replacement.

A run may be extended at either legal end. Inserting a card or replacing a wild
must leave a single consecutive same-suit sequence. A run cannot contain two
cards representing the same `(suit, rank)`.

### 4.4 Complete meld and opening

A **complete meld** is a legal set or run at its minimum size or greater. Before
a player is opened, their first table-play command must place one or more
complete new melds from their hand. A partial meld cannot be staged across
commands or turns.

Once that opening command succeeds, the player is opened immediately and may,
in the same table-play phase, create more melds, lay off, and replace wilds.
They may add to combinations owned by any player. Table combinations retain an
originating player for display/audit only; ownership does not restrict legal
layoff or affect scoring.

## 5. Hand setup and turn state machine

### 5.1 Setup

1. Record hand index, wild rank, dealer seat, rule configuration, and occupied
   clockwise seat order.
2. Shuffle all 52 cards.
3. Deal 7 cards to every non-dealer and 8 cards to the dealer.
4. Place all remaining cards face down as the ordered stock.
5. Start in `DEALER_INITIAL_DISCARD`.

Dealing must account for all 52 cards. No ordinary discard pile exists before
the dealer's initial discard.

### 5.2 Dealer initial discard

Only the dealer may act. The only legal command is
`DealerInitialDiscard(cardId)`, and `cardId` must be in the dealer's hand. The
card becomes the first face-up discard. The dealer now has 7 cards. The dealer
does not draw, meld, lay off, replace a wild, or go out during this action.

The turn then passes to the next occupied seat clockwise (the player left of
the dealer) in `AWAITING_DRAW`. The dealer receives a normal turn only when play
later rotates back to them.

### 5.3 Normal turn

A normal turn has these ordered phases:

1. `AWAITING_DRAW`: exactly one `DrawStock` or `DrawDiscard` succeeds.
2. `TABLE_PLAY`: zero or more legal table actions may succeed.
3. `AWAITING_DISCARD`: the active player chooses to finish table play.
4. `TURN_COMPLETE`: exactly one card is discarded, unless the hand has already
   reached a separately defined terminal state.

An implementation may combine `FinishTablePlay` and `Discard(cardId)` in one UI
action, but the authoritative command is legal only after a draw and after all
table changes validate atomically.

After a non-winning discard, the next occupied clockwise seat becomes active in
`AWAITING_DRAW`, unless the draw consumed the final stock card. In that case the
current player still completes table play and discards normally; if the discard
does not make them go out, the hand ends immediately by stock exhaustion and no
next turn begins. After a winning discard, no further turn begins.

## 6. Commands and legality

Every state-changing command includes game ID, hand ID, actor/player ID,
client command ID, and expected authoritative revision. A command is rejected
without mutation when the actor is not authorized, the revision is stale, the
phase is wrong, a referenced card is not in an actor-accessible zone, or the
result violates a rule or invariant.

Required game commands are:

- `JoinSeat` / `LeaveSeat` during lobby only; a started game has fixed seats.
- `StartGame` with 2–6 ready occupied seats and a resolved initial dealer.
- `DealerInitialDiscard(cardId)`.
- `DrawStock`.
- `DrawDiscard`, which takes only the current top discard.
- `CreateMeld(cardIds, meldType, declaredWildSlots)`.
- `LayOff(cardIds, meldId, placement, declaredWildSlots)`.
- `ReplaceWild(meldId, wildCardId, naturalCardId, resultingPlacement)`.
- `FinishTablePlay`.
- `Discard(cardId)`.
- `AcknowledgeHandResult` or equivalent readiness command before the next hand.

The following legality rules are normative:

- Only the active player may issue turn commands.
- A normal turn must draw exactly once and discard exactly once.
- A player cannot discard before drawing.
- A player cannot make table plays before opening except by creating at least
  one complete opening meld.
- All cards played from hand, replacements, and resulting meld layouts must
  validate as one atomic table action. Failure restores the exact prior state.
- A player may not discard a card already committed to the table.
- Drawing the top discard exposes no deeper discard cards and grants no right
  to take them.
- The card drawn from either source may be the card discarded at the end of
  that turn.
- Having one card at the start of a turn adds no special restriction: the
  player may draw from either source and otherwise follows the normal phases.
- The final discard may be any card still legally in hand, including a wild or
  a wild reclaimed earlier in the same turn.
- A player goes out only when a successful discard leaves their hand empty.
- A table action that leaves the player with zero cards is illegal because it
  makes the mandatory final discard impossible.

### Wild replacement transaction

The actor must already be opened. The natural card must be in the actor's hand
and match the represented slot: exact suit and rank for a run, or the
missing-suit same-rank set rule in section 4.2. The replacement commits
atomically: the natural card moves from the actor's hand to the meld and the
reclaimed wild moves from the meld into the actor's hand.

Once reclaimed, the wild is an ordinary card in that player's hand. It may be
used in another legal table play later in the same turn, retained for a later
turn, or used as the mandatory discard. Reclaiming it creates no
immediate-reuse obligation.

## 7. State model

### 7.1 Authoritative entities

- **Game**: ID, lifecycle (`LOBBY`, `IN_PROGRESS`, `COMPLETE`), immutable rule
  configuration, seat order, current hand index, cumulative scores, winner(s),
  and revision.
- **Seat**: stable seat index, player identity, presence/connection status,
  readiness, and cumulative score.
- **Hand**: ID, index, wild rank, dealer seat, active seat, phase, stock order,
  discard order, player hands, opened flags, table melds, hand-result status,
  and hand revision.
- **Card**: stable card ID, printed suit/rank, current zone, and position within
  an ordered zone where relevant.
- **Meld**: stable meld ID, type (`SET` or `RUN`), originating player, ordered
  slots, member card IDs, and explicit represented identity for each wild.
- **Turn**: active player, turn number, phase, draw source/card, atomic table
  operations, replacements, and final discard.
- **Score entry**: hand, player, remaining card IDs, per-card values, hand
  total, and cumulative total.

Connection status is not turn ownership and does not change game rules. A
disconnect neither removes a seat nor silently advances a turn. Any timeout,
forfeit, bot substitution, or host-migration policy is outside the supplied
rules and must be separately approved.

### 7.2 Zones

Every card is in exactly one of:

- ordered face-down stock;
- ordered face-up discard pile;
- one player's private hand;
- one public table meld.

## 8. Information visibility

Public information includes game/rule configuration, seats and presence,
dealer and active player, hand index and wild rank, turn phase, stock count
(not order), top discard and public discard history if the UI exposes it,
opened flags, all meld cards and wild representations, hand-card counts, all
accepted public actions, scores, and outcomes.

Private information includes each player's own hand identities and stock
identity/order. A player receives only their own private hand projection.
Other players receive only that hand's count. Presence discovery must not
expose a private game, hand contents, or stock data.

Diagnostics, logs, analytics, crash reports, and rejected-command responses
must follow the same secrecy boundary. An error may say “card unavailable” but
must not reveal whether a hidden card is in another hand or in stock.

## 9. Events, audit, and idempotency

Transport and authority topology are deliberately not selected here. Whatever
component accepts authoritative commands must serialize them into a single
revisioned game history and emit enough evidence for all peers to converge.

Every accepted command records:

- game/hand IDs, command ID, actor, authoritative sequence/revision, and time;
- rule configuration/version used for validation;
- command type and public arguments;
- deterministic state changes and resulting revision;
- random-operation commitment/evidence where relevant;
- private payloads in access-controlled projections only.

Rejected commands record command ID, actor, attempted revision, and a stable
public-safe reason code, without becoming game-state events.

Required domain events include game/seat readiness, game start, shuffle/deal
completion, dealer initial discard, turn start, draw (public source, private
card where needed), meld creation, layoff, wild replacement/reuse, discard,
player opened, player went out, hand score, dealer advance, hand start, and game
completion.

Client command IDs are idempotency keys. Replaying the same accepted command
returns its original result and must not draw, play, discard, or score twice.
Conflicting reuse of a command ID is rejected. Stale-revision commands are
rejected and trigger resynchronization.

## 10. Reconnection and convergence

A reconnecting player obtains a snapshot plus all later events, or an
equivalent current snapshot, from the game's abstract authoritative state
source. The protocol must not assume that polling presence is sufficient for
game recovery.

The public snapshot contains:

- game and hand IDs, schema/rules version, and authoritative revision;
- lifecycle, immutable rule choices, occupied seat order, dealer, active seat,
  and turn phase;
- hand index/wild rank, stock count, discard pile, table melds with represented
  wild slots, opened flags, hand counts, scores, and pending hand result;
- presence metadata as advisory information.

The authenticated player's private projection additionally contains their own
ordered hand card IDs and any active-turn private draw data they are authorized
to see. It never contains another hand or unrevealed stock order.

Applying the snapshot and subsequent events must yield the same state and legal
command set on every participant. Duplicate and out-of-order deliveries cannot
produce duplicate actions; a revision gap requires a fresh range or snapshot.

## 11. Scoring and end conditions

A hand normally ends at a successful final discard: the discarding player wins
the hand and scores 0, and each other player's cards still in hand are valued
and summed. If the final stock card was drawn and the player completes the turn
without going out, the hand instead ends by stock exhaustion: there is no hand
winner and every player's remaining hand is valued and added.

- Ace: 1 when natural;
- 2–10: face value when natural;
- Jack, Queen, King: 10 each when natural;
- any card whose printed rank is the current wild rank: 50.

Wild scoring takes precedence over every natural rank value. Thus an Ace in
hand during hand 1 is worth 50, not 1; a Queen in hand during hand 12 is worth
50, not 10; and a King in hand during hand 13 is worth 50, not 10. Cards
already on the table score nothing because they are not in hand.

The complete score breakdown is recorded before cards are gathered. The next
dealer is the next occupied seat clockwise. After hand 13 is scored, the game
is complete. The player with the lowest cumulative score wins.

Ties for lowest cumulative score are reported as joint winners.

## 12. Core invariants

These invariants hold after every committed command:

1. Exactly 52 distinct cards exist and every card is in exactly one zone.
2. No physical joker exists.
3. Hand index is 1–13 and determines exactly one wild rank.
4. Dealer, active player, and next player refer to occupied seats.
5. Immediately after the initial dealer discard, every player has 7 cards and
   the discard pile has exactly one card.
6. During a normal turn, exactly one card is drawn before any discard.
7. Every public meld is legal, and every wild has an unambiguous represented
   position.
8. `opened=true` can only follow a legal complete opening meld and never
   reverts within a hand.
9. Only opened players may lay off or replace table wilds.
10. A replaced wild enters the replacing player's hand and has the same legal
    uses as any other wild in that hand.
11. A hand winner has zero cards only after their successful final discard.
12. Score entries derive exactly from remaining hand cards and are written once
    per player per hand.
13. Cumulative score equals the sum of immutable completed-hand scores.
14. Every current-hand wild remaining in a hand scores exactly 50; natural
    Jacks, Queens, and Kings score exactly 10.
15. No event or projection reveals unauthorized hidden card identities.
16. A command ID can mutate a game at most once.
17. The game cannot complete before hand 13 is scored and cannot continue
    afterward.

## 13. Acceptance examples

### A. Initial deal and first action

With four players and seat 2 as dealer, seats 0, 1, and 3 receive 7 cards and
seat 2 receives 8. The stock contains 23 cards. Seat 2 may discard one card but
may not draw or meld. After that discard all hands contain 7 cards, stock still
contains 23, discard contains 1, and seat 3 (left/clockwise from seat 2) is in
`AWAITING_DRAW`.

### B. Moving wild rank

In hand 6, every printed Six is wild and is worth 50 if left in hand. In hand
7, Sixes return to natural cards worth 6 and every printed Seven becomes wild.

### C. Legal and illegal run under confirmed Ace-low rule

A♣-2♣-3♣ is a legal natural run. Q♣-K♣-A♣ and K♣-A♣-2♣ are illegal. In the
Queens hand, Q♣ may represent 6♥ in the public run 4♥-5♥-[Q♣ as 6♥], and that
represented position is visible to all players.

### D. Opening gate

An unopened player holding 9♣, 9♦, 9♥ may create that complete set and becomes
opened. In the same turn they may then add 6♠ to another player's
3♠-4♠-5♠ run. Attempting the layoff before a complete opening meld is rejected
without moving either card.

### E. Opening with a wild

In hand 4, 8♣-8♦-4♠ (4♠ representing an Eight) is structurally a complete set.
The opening succeeds because a first meld may contain a wild. The public meld
records 4♠ as representing the missing Eight.

### F. Replacing and keeping a wild

The table has 7♥-[3♣ as 8♥]-9♥ in hand 3. An opened player holds 8♥ and replaces
3♣. The committed result is 7♥-8♥-9♥ on the table and 3♣ in that player's hand.
The player may use 3♣ in another legal table play, keep it after discarding a
different card, or discard 3♣ to end the current turn.

### G. Mandatory final discard

After drawing, a player has three cards that form a legal set and no fourth
card. Playing all three would leave no final discard, so the action is rejected.
If the player instead has a fourth card, they may meld three and discard the
fourth; the discard leaves an empty hand and ends the hand.

### H. Score precedence

In hand 12, a losing hand containing A♠, 7♦, Q♣, and K♥ scores
`1 + 7 + 50 + 10 = 68`: Q♣ is a current-hand wild and the natural King is 10.
The winner scores 0 regardless of cards previously played to the table.

### I. Duplicate remote command

A player sends `DrawStock` with command ID `abc` at revision 40. It succeeds
and advances to revision 41. Retrying command ID `abc` returns the original
draw result; it does not remove a second stock card. A different draw command
based on revision 40 is stale and is rejected.

### J. Reconnection secrecy

A reconnecting seat receives all public table cards, discard history, hand
counts, and scores, plus the identities of cards in its own hand. It receives
neither other players' card identities nor stock order. Applying later events
from the snapshot revision produces the same public state as every connected
peer.

### K. Final stock card

A player draws the final stock card, optionally makes legal table plays, and
discards without going out. The hand ends immediately with reason
`STOCK_EXHAUSTED`; no next player draws. Every player receives the penalty
value of cards still in their hand and no player receives a winner's zero
unless their remaining-card value is itself zero, which cannot occur under the
mandatory-final-discard invariant.

## 14. Online boundary

Remote play requires players to discover which eligible peers are online,
form or join a 2–6 player lobby, and observe presence changes. Presence may be
found by polling, but presence is advisory: it cannot decide turn legality,
deal order, card ownership, or game outcome.

This contract intentionally does not choose peer-to-peer versus hosted
authority, polling intervals, WebSocket/HTTP/WebRTC, relay services, NAT
traversal, persistence technology, encryption mechanism, or host migration.
Any architecture must nevertheless satisfy the single revisioned history,
idempotency, secrecy, reconnection, and convergence requirements above.

## 15. Phase 0 closure checklist

- Preserve the confirmed opening-meld rule: the first complete meld may contain
  one or more wild cards.
- Accept or explicitly change the documented basic-rule/setup defaults for
  stock exhaustion, multiple wilds, set replacement, one-card hands,
  draw/discard, initial dealer, and joint winners.
- Test every invariant and acceptance example through authoritative state
  transitions and both public/private projections.

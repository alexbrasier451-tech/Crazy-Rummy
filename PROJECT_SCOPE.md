# Crazy Rummy — Project Scope

**Status:** Phase 0 approved; Phases 1–7 implementation complete  
**Product name:** Crazy Rummy  
**Rules variant:** Railway Rummy / moving-wild Crazy Rummy  
**Primary experience:** Remote multiplayer on phones

## Version 1.1 presentation-overhaul overlay

**Status:** Stage 0 and Compartment Table direction owner-approved; beta
application promoted to `1.0.0`; not production visual implementation
authority before immutable-beta reconciliation.

Version 1.1, **The Midnight Limited**, is a complete presentation-layer
overhaul. It must make the game feel materially rebuilt through authored card
design, route-specific composition, environmental identity, and directed game
moments—not a palette refresh or a decorative reskin. Its binding creative
contract is the [v1.1 creative execution directive](docs/v1.1/CREATIVE_EXECUTION_DIRECTIVE.md),
read with the [v1.1 design bible](docs/v1.1/VISUAL_DESIGN_BIBLE.md),
[screen and flow specification](docs/v1.1/SCREEN_AND_FLOW_SPEC.md), and
[implementation plan](docs/v1.1/IMPLEMENTATION_PLAN.md).

### Scope and authority

- v1.1 may replace weak MVP presentation markup, component anatomy, visual
  hierarchy, visual assets, motion choreography, and route composition where
  necessary to deliver the approved visual direction.
- The base product contracts remain authoritative for rules, scoring,
  route/interaction semantics, accepted-event truth, network/recovery,
  hidden-information, privacy, accessibility, PWA, and security boundaries.
  v1.1 governs presentation ambition only; it cannot weaken those boundaries.
- The overhaul remains genuinely zero-budget: no paid software, paid asset
  licence, payment card, metered generation/runtime, third-party asset CDN, or
  new recurring operating cost is permitted. Asset provenance and local
  fallbacks are mandatory under the [zero-budget toolchain](docs/v1.1/ZERO_BUDGET_TOOLCHAIN.md).

### Non-goals and readiness boundary

v1.1 does not change game rules, scoring, routes, identity/account policy,
online architecture, privacy model, or the meaning and timing of accepted
actions. It is not permission to ship a partial mixture of legacy and v1.1
production surfaces, nor to claim visual implementation, test, or approval
evidence before it exists.

The application is still under beta development. Before Stage 0 approval,
v1.1 remains documentation-only. If Stage 0 is approved, Stage 1 may prepare
concepts, provenance plans, signature-moment coverage, keyframes, and
reconciliation records. Production implementation still waits for the project
owner to sign the beta complete, reconciliation against that exact revision,
and owner-approved Stage 1 keyframes; no planning record may treat changing
beta UI/state contracts as frozen.

## Product summary

Crazy Rummy is an installable phone game for two to six remote players on
practical modern smartphones. Android Chrome is the primary QA target and
modern iPhone Safari is a first-class supported target; the product does not
promise every historic handset or abandoned browser. A complete match contains
thirteen hands. Aces are wild in the first hand, Twos
in the second, and so on through Kings in the thirteenth. Players draw, form
sets and suited runs, lay cards onto shared melds, replace wild cards where the
rules allow, discard, and accumulate penalty points. The lowest total after the
Kings hand wins.

The intended experience follows the existing Murder Darts and Fuel & Burn app
family: a lightweight mobile Progressive Web App (PWA), large tap targets,
dark tactile surfaces, warm text, green/red/gold accents, clear current-turn
feedback, local recovery, and no unnecessary framework or account ceremony.

Unlike the earlier local-first apps, online presence cannot be delivered by
static hosting alone. A browser cannot discover arbitrary phones across the
internet without a reachable rendezvous service. The working direction is
therefore a static PWA plus a managed/serverless presence and signalling
service, with WebRTC match traffic sent directly between phones when possible
and relayed through TURN when necessary. The project owner should not need to
own, patch, or administer a conventional server.

## Product goals

- Let a player become visible as available and find other online players with
  very little setup.
- Let two to six players create, join, and start a remote table from their
  phones.
- Preserve each player's private hand while presenting one clear shared table.
- Make every legal draw, meld, lay-off, wild replacement, discard, and scoring
  action easy to understand and hard to perform accidentally.
- Enforce the agreed family rules consistently on every device.
- Survive ordinary refreshes and short connection losses without silently
  changing match state.
- Make a thirteen-hand session easy to follow with visible wild rank, dealer,
  active player, hand number, round scores, and cumulative standings.
- Preserve the compact, polished visual language of the previous phone apps
  while giving the game its own card-table and railway identity.
- Use a small, purposeful card-animation set for shuffle/deal, draw, discard,
  meld placement, wild replacement, hand sorting, and hand completion without
  delaying authoritative play.
- Keep operating cost and backend administration proportionate to a personal
  or small-community game.

## Phase 0 implementation contract

Phase 0 was signed off on 29 July 2026. Its controlling records are:

- [Decision register](docs/phase-0/STAGE_0_DECISION_REGISTER.md)
- [Rules and state contract](docs/phase-0/RULES_AND_STATE_CONTRACT.md)
- [ADR-0001: Online discovery and P2P gameplay](docs/decisions/ADR-0001-ONLINE-P2P-ARCHITECTURE.md)
- [App layout](APP_LAYOUT.md)
- [Roadmap](ROADMAP.md)
- [Phase 0 sign-off gate](docs/phase-0/PHASE_0_SIGNOFF.md)

All blocking decisions have owner answers, the representative broadband versus
cellular direct/relay probe passed, and the Phase 1 shell, Phase 2
deterministic engine, and Phase 3 playable local integration harness are
complete. Phase 4 presence and table-service implementation, Phase 5 peer
transport/resynchronisation, and Phase 6 end-to-end online game integration
are complete for the local automated boundary. Three-phone separate-network
and forced-relay revalidation remains a release gate.

## Confirmed game boundary

- Two to six players use one standard 52-card deck with no physical Jokers.
- Deal and play move clockwise; the dealer moves clockwise after every hand.
- There are thirteen hands with Aces, Twos, Threes, Fours, Fives, Sixes,
  Sevens, Eights, Nines, Tens, Jacks, Queens, and Kings wild in that order.
- Each non-dealer receives seven cards. The dealer receives eight and begins
  only by discarding one card: no draw and no meld on that opening turn.
- A set contains three or four cards of one rank.
- A run contains three or more consecutive cards of one suit.
- Aces are low or high in natural runs: `A-2-3` and `Q-K-A` are valid; runs
  never wrap, so `K-A-2` is not.
- After the opening discard, a normal turn is draw, optional table play, then
  one final discard.
- A player's first table play must include a complete valid new set or run.
  Once opened, that player can lay suitable cards onto any player's melds.
- The current hand's designated rank is wild. A wild in a run has an explicit,
  immutable represented position.
- A player who has opened can replace a table wild with the natural card it
  represents and reclaim the wild. The reclaimed wild may be played, held, or
  discarded under the normal turn rules.
- Going out requires retaining and making a final discard.
- The player who goes out scores zero for the hand. Other players receive the
  agreed penalty value of cards left in hand.
- After the Kings-wild hand, the lowest cumulative penalty score wins.

The exact edge cases and provisional defaults are controlled by the
[rules and state contract](docs/phase-0/RULES_AND_STATE_CONTRACT.md), not by
this summary.

## MVP scope

### 1. Local player identity

- Store a display name and stable random device/player identifier locally.
- Let the player deliberately go online or offline.
- Publish only the minimum lobby identity selected in Phase 0.
- Expire stale presence automatically; closing a phone must not leave a player
  permanently shown online.

An account, password, email address, public profile, avatar upload, contact
book, and social graph are not assumed for the first release.

### 2. Online lobby and table formation

- Poll for available compatible players and open tables.
- Show last-seen freshness and whether a player is available, invited, waiting,
  or already in a match without exposing match cards.
- Let the creator choose **Open** or **Closed** audience. Open tables are
  publicly listed/joinable while seats are available, subject to host controls.
  Closed tables never appear publicly and require an unguessable invite/code.
- Create a table, invite or accept players, and wait for two to six seats.
- Give the table owner explicit Start and Cancel controls.
- Prevent incompatible app/rules versions from silently joining the same
  match.
- Apply rate limits, short leases, and safe display-name handling.

Open tables permit strangers; Closed tables support trusted friends/family.
Open-table support requires anonymous session identity, display-name
validation, rate limiting, host removal controls, and a public-discovery kill
switch. Chat and public profiles remain out of scope.

### 3. Private hand and shared table

- Show only the local player's hand face-up.
- Show opponents' card counts, connection state, opened state, current score,
  and cumulative score without revealing their cards.
- Show draw pile count, top discard, all table melds, dealer, active player,
  wild rank, and hand number.
- Support tap-first card selection and sorting; drag and drop may be an
  enhancement but cannot be the only input.
- Provide a meld composer that resolves wild-card meaning before submission.
- Validate an entire proposed table action atomically so partial illegal meld
  edits never become shared state.

### 4. Full rules flow

- Cryptographically shuffle a 52-card deck or use an equally appropriate
  unbiased platform random source.
- Deal private hands and perform the dealer's discard-only opening.
- Enforce draw source, opening meld, new meld, lay-off, wild replacement,
  discard, go-out, final-stock, and ordinary one-card-hand rules.
- Score every hand and rotate dealer.
- Continue through all thirteen wild ranks.
- Permit wild cards in a player's first complete set or run.
- Allow a reclaimed wild to be played, held for a later turn, or discarded.
- Score natural J/Q/K as 10 and every current-hand wild left in hand as 50.
- Resolve final standings and tied lowest scores deterministically.
- Offer an in-app rules reference generated from the same accepted contract.

### 5. Synchronisation and recovery

- Use one monotonically ordered match event stream and deterministic rules
  reducer so accepted actions produce the same public state on every device.
- Have one authority accept or reject commands in the trust-based MVP.
- Send each peer only the private information that peer needs through the
  normal user interface and protocol.
- Persist the local identity, room secret, latest accepted event number, and
  recoverable match snapshot locally.
- Detect stale, duplicate, reordered, or incompatible messages.
- Pause clearly during a connection loss and support rejoining the same seat.
- Reserve a disconnected non-host's seat for five minutes. At expiry, drop and
  forfeit that player, retain already accepted table melds, move their private
  hand to a dead-card zone, and continue with the next active seat. If only one
  active player remains, that player wins by forfeit.
- Give a disconnected host five minutes to return. Under host-authoritative
  P2P, expiry cannot transfer the full private state; the match is abandoned.
- Do not continue silently when authority or state ownership is uncertain.

Host migration, independent anti-cheat verification, and durable recovery when
the authoritative host never returns remain later architecture work.

### 6. Hand and match results

- Show every player's remaining-card penalty after a hand.
- Show the updated cumulative standings and the next hand's dealer/wild rank.
- Require a clear readiness/continue transition before dealing the next hand.
- Show final placement, all thirteen hand results, and the lowest-score winner
  or winners.
- Keep a local summary of completed matches; cloud history and global rankings
  are not MVP requirements.

### 7. Installable phone experience

- Install from a modern mobile browser as a PWA.
- Cache the application shell and rules reference for offline launch.
- Explain that lobby and remote play require connectivity.
- Preserve safe-area spacing, portrait use from 320 CSS pixels wide, reduced
  motion, visible focus, screen-reader names, and adequate contrast.
- Test representative Android phone widths and at least one second mobile
  browser family. Release QA includes modern Android Chrome and iPhone Safari.

## Explicitly out of scope for the first release

- Same-room Bluetooth or local-network discovery.
- A strictly offline online-player lobby, which is technically contradictory.
- Text, voice, or video chat.
- Real-money play, prizes, wagering, entry fees, or monetisation.
- Global rankings, seasons, achievements, or public match history.
- Bots, solo play, hints, or automatic best-meld suggestions.
- Spectators or mid-hand seat changes.
- Native Android/iOS packaging or app-store publication.
- Strong anti-cheat claims, competitive certification, or protection against a
  player inspecting code/state on a device they control.
- A conventional project-operated server fleet.
- Analytics, advertising, tracking SDKs, or sale of player activity.

## Core state boundaries

The detailed entities and invariants belong to the rules contract. The
architecture must nevertheless preserve these three views:

1. **Authoritative state:** deck order, every private hand, full command/event
   history, public table, scores, and connection/seat ownership.
2. **Player view:** the public match plus that player's own hand and legal
   actions.
3. **Lobby view:** minimal identity, availability, compatible version, table
   capacity, and expiring connection metadata; never deck or hand data.

Every network payload must declare its schema version, match identifier,
sender/seat, sequence or command identifier, and intended visibility.

## Online service, privacy, and security boundaries

- “No server” means no conventional server for the owner to administer. A
  managed rendezvous and relay service is still a backend dependency and needs
  explicit approval, credentials/configuration, usage limits, and a privacy
  statement.
- Static client code must contain no administrative credential, private key,
  or unrestricted write token.
- Presence is opt-in, short-lived, and removed by expiry even when an explicit
  offline request cannot be sent.
- Display names and all network strings are untrusted plain text.
- Lobby and signalling endpoints need request-size limits, rate limits,
  schema validation, origin policy, expiry, and abuse monitoring proportionate
  to the chosen audience.
- Invite/room secrets must not be guessable. Joining a match must bind a
  returning device to its prior seat without exposing another player's hand.
- TURN credentials must be short-lived when the selected provider supports
  ephemeral credentials.
- Logs must not contain deck order, private hands, room secrets, WebRTC session
  descriptions, or more identifying network data than operations require.
- The PWA needs an explicit online/offline indicator and must not imply that a
  direct peer connection is guaranteed.

## Visual direction

Carry forward the previous apps' family resemblance:

- near-black background and layered charcoal panels;
- warm cream primary text and muted stone secondary text;
- green for confirmed/legal/current progress, red for destructive/error
  actions, and gold for the current wild rank and key scoring highlights;
- large rounded controls, restrained shadows, inset highlights, and compact
  information cards;
- brief purposeful transitions that respect `prefers-reduced-motion`;
- basic acknowledged-state card motion: anonymous deal, local draw/discard,
  meld placement, wild swap, hand reflow, and a restrained final route-line;
- original offline-safe SVG/CSS graphics unless a licence is recorded.

Crazy Rummy should add a distinct identity through rail-ticket labels, subtle
parallel-line/track motifs, card-fan geometry, suit marks, and a green baize
undertone. Card rank and suit must never be conveyed by colour alone.

## Non-functional requirements

- Pure deterministic rules code independent of the DOM, storage, clock, and
  network.
- Unit fixtures for every accepted rule and edge case before online
  integration.
- Browser-level tests for setup, lobby, full turn, illegal action, reconnect,
  hand end, and thirteen-hand match end.
- Contract tests between lobby/signalling adapters and the static client.
- Resynchronisation tests with delayed, duplicate, and out-of-order messages.
- No accepted action is acknowledged to the player before its authoritative
  sequence is known.
- A normal reconnect must not reveal private state or duplicate a command.
- All destructive actions, including leaving or abandoning a live table, need
  clear scope and confirmation.
- Network retry uses bounded exponential backoff with jitter and respects page
  visibility and platform connection constraints.
- Hosted presence/signalling/TURN must remain within a true zero-cost plan.
  New online sessions stop before any quota could produce an overage; the
  project must not require a paid plan, payment card, or usage-based spend.
- The game remains usable with touch, keyboard, zoom, screen readers, and
  reduced motion.

## MVP acceptance criteria

The MVP is accepted when:

1. Two to six real phones can find or join a compatible remote table using
   the selected lobby model.
2. All participants complete the supplied reference turn, wild-replacement,
   hand-scoring, reconnect, and full thirteen-hand fixtures with identical
   accepted public state.
3. No normal player message or UI view exposes another player's hand.
4. Refreshing a guest phone during a match rejoins the same seat and state;
   the agreed host-loss behaviour is also demonstrated honestly.
5. Direct and TURN-relayed connection paths are both tested where the chosen
   provider supports them.
6. The installed PWA launches its shell offline and clearly explains why
   remote play is unavailable.
7. Automated unit, contract, browser, accessibility, and supported production
   build checks pass.
8. A real-phone beta completes at least one full thirteen-hand match without a
   state divergence or unrecoverable accidental action.
9. Basic card animations remain smooth on the supported test phones, never
   reveal opponent card identity, never depict an unacknowledged move as
   accepted, and reduce to immediate state changes or short fades when reduced
   motion is enabled.
10. A disconnected non-host can resume within five minutes and is dropped at
    expiry; a disconnected host can resume within five minutes and the match
    ends honestly if that host never returns.

## Source

The initial rules were supplied by the project owner and are based on
[Pagat's Crazy Rummy rules](https://www.pagat.com/rummy/crazy.html). Family
rules recorded by the project owner take precedence over generic published
variants.

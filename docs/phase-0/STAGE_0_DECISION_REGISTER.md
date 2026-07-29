# Phase 0 Decision Register

**Status:** Approved  
**Date opened:** 2026-07-29  
**Date approved:** 2026-07-29  
**Decision owner:** Project owner

This register separates owner-confirmed requirements from provisional design
defaults and unanswered questions. A provisional default may guide a spike or
document draft, but it is not authority for Phase 1 production code.

## Confirmed by the owner

| ID | Decision | Implementation consequence |
| --- | --- | --- |
| C-01 | Build a Crazy Rummy phone game using the supplied Railway Rummy rules. | The thirteen-hand moving-wild variant is the product, not generic configurable rummy. |
| C-02 | Follow the style of the owner's previous phone apps. | Use Murder Darts/Fuel & Burn as the technical and visual reference family. |
| C-03 | Players are remote, not merely in the same room. | Bluetooth, local-network-only, pass-and-play, and proximity discovery do not satisfy the product. |
| C-04 | Players should poll to find players who are online. | Phase 0 must define short-lived presence, lobby polling, invitations/tables, expiry, and backoff. |
| C-05 | The owner does not have a server. | Do not assume a conventional self-hosted backend; compare no-admin managed/serverless dependencies and the strict no-backend fallback honestly. |
| C-06 | Two to six players, one 52-card pack, no physical Jokers, clockwise play/deal, and thirteen wild-rank hands. | These are fixed engine boundaries unless the owner reopens them. |
| C-07 | Dealer receives eight, opens only by discarding, and does not draw or meld on that first turn. | Model a distinct `dealerOpeningDiscard` turn phase. |
| C-08 | A final discard is required to go out. | The engine may not accept a table action that leaves zero cards. |
| C-09 | The table creator chooses Open or Closed. Open tables are publicly listed; Closed tables require an unguessable invite/code and are not listed. | Lobby visibility is a per-table choice rather than one fixed audience for the whole product. |
| C-10 | The product name is Crazy Rummy and it should support practical modern phones in the Murder Darts style. | Android Chrome is the primary QA target and modern iPhone Safari is supported; historic/abandoned browsers are not promised. |
| C-11 | Opening melds may contain wilds; a reclaimed wild may be held; natural J/Q/K score 10; the current hand's wild cards score 50. | These are fixed family rules for validation, UI help, and scoring fixtures. |
| C-12 | Reconnect for up to five minutes. A missing non-host is then dropped; a missing host causes the match to be abandoned without a result because the authoritative state cannot migrate safely. | Both guest and host flows need an authoritative expiry and honest terminal UI. |
| C-13 | Operating cost is fixed at zero. | Do not require a paid plan or payment card and do not allow usage-based overages; public online play remains gated until a genuinely non-billable route is proven. |
| C-14 | Trusted-host P2P is acceptable; the owner does not require cheat resistance. | The table host may own the full deck and all hands. The product must be honest about this but need not prevent a modified host from cheating. |

## Technical facts, not optional product preferences

| ID | Constraint | Consequence |
| --- | --- | --- |
| F-01 | Static browsers cannot discover arbitrary internet peers without a reachable rendezvous mechanism. | A reliable online-player list requires some remote service, even if no server is administered by the owner. |
| F-02 | WebRTC does not define the signalling transport used to exchange connection setup data. | The project needs a signalling adapter, managed endpoint, or manual out-of-band exchange. |
| F-03 | NAT and mobile networks can prevent a direct peer path. | Reliable remote play needs STUN plus TURN fallback; TURN relays gameplay for affected connections. |
| F-04 | A host-authoritative browser necessarily holds information and authority that a determined host user can inspect or manipulate. | A trust-based P2P MVP cannot claim strong anti-cheat or competitive fairness. |
| F-05 | An online lobby exposed to strangers creates identity, impersonation, moderation, harassment, privacy, abuse, and availability obligations. | Trusted-community and public-stranger products are materially different risk surfaces. |

## Provisional defaults for Phase 0 spikes

| ID | Provisional default | Why it is provisional |
| --- | --- | --- |
| P-01 | Static installable PWA using Vite and browser-native modules, with pure deterministic rules and adapter-isolated networking. | Matches the previous apps, but exact language/tooling awaits sign-off. |
| P-02 | Metered `signalling_free` plus TURN Trial Global 500MB is the selected Phase 0 managed rendezvous/TURN route. | Dashboard evidence shows hard free caps, no overage billing, and auto-recharge off; automated forced relay and the representative broadband/cellular phone run passed. |
| P-03 | List poll around every 5 seconds while visible, presence heartbeat around every 15 seconds, 45-second expiry, jitter, and exponential backoff. | Needs provider-limit and real-phone measurement; values are not a promise. |
| P-04 | One host is authoritative and other phones connect to it in a WebRTC star with at most five host data channels. | The owner accepts that the host can inspect/manipulate game state. |
| P-05 | Pause and reserve a lost seat for five minutes. Drop an unrecovered guest; abandon without a result if the host does not return. | The timeout and terminal behaviour are owner-confirmed; implementation must still prove them. |
| P-06 | No chat, public profiles, global ranking, or money play. | Keeps first-release abuse and legal scope bounded; owner can reopen later. |
| P-07 | Lobby identity is a locally stored display name plus random opaque ID; no email/password account. | Open tables still require safe names, throttling, host controls, and a public-discovery kill switch. |
| P-08 | Aces are low or high in runs, but runs never wrap; opening melds may contain wilds; reclaimed wilds may be held; natural J/Q/K score 10; current wilds score 50. | These family rules are confirmed rather than provisional. |
| P-09 | The player who draws the final stock card completes the turn; if they do not go out, the hand ends and all remaining hands are scored. One-card hands use normal turn rules. | This uses the cited basic Crazy Rummy rule and treats the supplied summary's omitted special one-card restriction as not adopted. |

## Blocking and resolved owner decisions

### D-01 — Audience and table visibility — resolved

The creator selects **Open** or **Closed** for each table. Open tables are
publicly listed and may include strangers. Closed tables are absent from public
results and require an unguessable invitation or code. Open discovery must have
minimum anonymous identity, safe display names, rate limiting, host controls,
and a kill switch; chat and public profiles remain out of scope.

### D-02 — Zero-cost managed dependency — resolved

The owner will not accept any operating cost. Automatic internet-wide polling
still requires a reachable managed rendezvous, and dependable WebRTC still
requires TURN fallback. Therefore the provider route must require no paid plan
or payment card, must not permit automatic overage charges, and must expose
enforceable quota/kill-switch controls.

The Metered account is on `signalling_free`; its dashboard states that free
tiers have hard caps and no overage billing, and auto-recharge is off. TURN is
on Trial Global 500MB at `$0/month`; its dashboard reports `$0` overage and says
the relay stops when its quota is exhausted. The publishable frontend key has
the minimum required Subscribe, Publish, Presence, and Send actions with TURN
auto-injection enabled.

An automated forced-relay run passed with both selected candidate types
reported as `relay` over UDP and an acknowledged data round-trip. The
supported-phone/different-network exit test also passed between a broadband
desktop and a phone using cellular data.

### D-03 — Product identity and supported phones — resolved

The product is **Crazy Rummy**. It targets practical modern phones in the
Murder Darts app family: Android Chrome is the primary QA target and modern
iPhone Safari is supported. “All phones” means current capable smartphones,
not historic devices or abandoned browsers.

### D-04 — Ace position in natural runs — resolved

Ace may be low or high: `A-2-3` and `Q-K-A` are valid. Runs never wrap, so
`K-A-2` is invalid. An Ace acting as the hand's wild rank can represent any
otherwise legal position.

### D-05 — Opening meld and wild rules — resolved

A first complete meld may contain one or more wild cards. A reclaimed wild
returns to the player's hand and may be played, held, or discarded under the
normal turn rules. Every meld still needs one explicit legal interpretation.
In a set, any missing-suit natural card of the set's rank may replace a wild;
in a run, the exact represented suit/rank is required.

### D-06 — Penalty values — resolved

Natural Aces score 1. Natural Jacks, Queens, and Kings score 10 each. Every
card of the current hand's wild rank scores 50 while held in a losing hand.

### D-07 — Stock exhaustion and one-card restrictions — accepted default

The player who draws the final stock card finishes that turn. If they do not go
out, the hand ends and everyone scores their remaining hand. A player who
starts with one card follows the normal draw/play/discard rules; the generic
stock-only/forced-replacement restriction is not adopted. Phase 0 sign-off
accepts this unless the owner changes it.

### D-08 — Draw/discard and tie edge cases — accepted default

A player may immediately discard the card just drawn, playing a legal meld is
always optional, and tied lowest cumulative scores produce joint winners.
Phase 0 sign-off accepts these defaults unless the owner changes them.

### D-09 — Trust and host failure — resolved

Every disconnected seat gets a five-minute recovery window. An unrecovered
non-host is dropped; their cards become a dead, unplayable zone and the match
continues if at least two active players remain. If only one active player
remains, that player wins by forfeit. An unrecovered host cannot be dropped
while play continues because the authoritative deck and private state disappear
with that phone; after five minutes the whole match is abandoned without a
result. Deliberate Leave uses the same terminal result after confirmation.

The owner accepts a casual trusted-host model and does not care if a determined
host cheats. The player hosting a table can technically inspect or manipulate
the deck and all hands. Phase 0 therefore makes no cheat-resistance claim and
adds no anti-cheat system.

### D-10 — Lobby interaction — resolved

Players poll for Open tables and may join/request a seat while capacity
remains. Closed tables are reached only through an invite/code. The creator
chooses the visibility and controls the waiting room. Becoming publicly visible
is opt-in rather than silently restored after every launch.

## Phase 0 exit test

**Result:** Passed and approved on 29 July 2026.

- the resolved/accepted defaults in D-04, D-07, and D-08 are not contradicted
  by another Phase 0 record;
- the broadband-desktop/cellular-phone rendezvous/WebRTC spike proved direct
  and forced TURN paths on representative networks;
- the scope, rules contract, architecture ADR, app layout, and roadmap use the
  same terms and state transitions;
- the project makes no claim of being server-free when it relies on managed
  presence, signalling, STUN, or TURN;
- the owner accepts the resulting implementation contract.

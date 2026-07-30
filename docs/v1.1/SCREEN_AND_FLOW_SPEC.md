# Crazy Rummy v1.1 — Screen and flow specification

**Status:** Design specification only  
**Scope:** A complete visual and interaction-language overhaul of every current
user-facing route, sheet, status, and recovery state. This document does not
change rules, network authority, privacy boundaries, or route contracts.

## 1. Product truth and design intent

v1.1 should feel like a premium, focused tabletop game: *a private night-train
card room in your pocket*. It is not a casino, a generic admin dashboard, or a
literal period railway simulation. The core experience is a calm, tactile green
baize table set inside a precisely engineered rail-car shell. Cards are the
hero; scores, connection state, and decisions support play rather than compete
with it.

This specification refines the route and interaction truth in
[APP_LAYOUT.md](../../APP_LAYOUT.md). When it conflicts with a user-visible
rule, authoritative session state, privacy boundary, or accessibility
requirement, the existing product contract wins. In particular:

- A player may see their own cards, all public melds, public scores, card
  counts, and connection states; never another player’s private cards.
- Open tables are discoverable; closed tables are code/link only. Presence is
  informative, not an access grant.
- Online changes remain **staged → pending → accepted/rejected/uncertain**.
  Card travel and victory feedback occur only after authoritative acceptance.
- The match remains 2–6 players, uses the fixed signed-off Crazy Rummy rules
  preset, and ends after 13 hands unless an existing terminal state says
  otherwise.
- PWA caching is useful for the shell, rules, settings, and permitted last
  view; it does not make remote play work offline or replay an uncertain move.

### Visual north star

The design has three visual strata:

1. **Night exterior** — near-black surround, soft vignette, very faint grain;
   never a photograph or high-contrast moving background.
2. **Carriage hardware** — deep charcoal/olive header, precision seams,
   ticket-perforation dividers, fine brass/gold edges, and utility typography.
3. **The table** — a deep baize field with readable cream cards, a restrained
   rail-lattice card back, and a single luminous route line that makes the
   13-hand journey legible.

Use a deliberately small visual vocabulary: a station dot, rail line,
perforation, marker shape, card pip, and one warm highlight. Avoid gradients
that hide contrast, faux 3D chrome, casino neon, pulsing everything, decorative
text on cards, or AI-generated imagery that competes with the game state.

### Foundation tokens and type

Use the semantic roles, candidate values, and proposed Barlow Condensed/Inter
pairing in the [visual design bible](VISUAL_DESIGN_BIBLE.md). That document is
the single source of truth for implementation tokens; this screen
specification must not create a parallel palette.

Functional text remains legible in the system fallback stack, with tabular
figures for scores, hand numbers, card counts, and timers. Condensed display
type is never required to read a rule, timer, name, or action. Give every
interactive element a 2 px high-contrast focus ring plus a non-colour
shape/outline change. Candidate values are not a substitute for measured WCAG
2.2 AA contrast checks in the rendered component.

### Global composition

- **Detail routes:** small context over route title, a single top-right action,
  then the most important current decision before supporting information.
- **Live game:** distinct semantic regions in order: match header, shared
  table, private hand, action dock. The hand and current legal action remain
  reachable even on short phones.
- **Surfaces:** field < tactile card < decision sheet. Raised surfaces gain a
  quiet top edge and shadow, never a bright glow.
- **Status:** a compact, icon-plus-label status rail lives near the information
  it qualifies. It may expand into a blocking banner only when play is blocked.
- **Primary actions:** one unambiguous full-width action per moment. Secondary
  paths are quiet outlined controls; destructive actions are visually and
  verbally explicit.

## 2. Cross-route interaction system

### State language

Every route must have designed initial, loading, ready, empty, partial/stale,
offline, recoverable-error, blocking-error, disabled, and long-content states.
Keep previous safe content visible while refresh occurs. A skeleton represents
the geometry of the last-known layout; it never impersonates players, cards, or
an authoritative game state.

| State | Visual treatment | Required behaviour/copy |
| --- | --- | --- |
| Loading | Low-contrast rail shimmer or three static-to-subtle dots; preserve prior content. | Describe what is being checked, such as “Looking for open tables…”. |
| Pending | Action lock badge and inline progress at the affected action. | Prevent duplicates; say “Waiting for host acceptance. Nothing has changed yet.” |
| Accepted | Short settle flash at the real destination, then authoritative re-render. | Announce only the accepted outcome. |
| Rejected | Signal-red edge, specific repair text, staged choices retained where safe. | Never reset a composition merely because a network action failed. |
| Uncertain | Brass “Checking outcome” lock banner, immutable last safe view. | Do not offer repeat action until reconciliation resolves it. |
| Stale | Brass ticket notch and age stamp; data remains readable. | Include last checked time and manual retry. |
| Offline | Crossed signal icon, timestamp, and available safe actions. | Mark online-only controls unavailable; do not imply a queued remote action. |
| Blocking error | Full-width high-priority panel above blocked controls. | Explain cause, next action, and whether the last view remains safe. |

### Sheets, menus, and confirmations

Use full-height bottom sheets on phones for active game decisions; standard
modal sheets are appropriate for Menu, Rules shortcuts, and low-frequency
configuration. A sheet begins with a concise outcome-oriented title, one-line
instruction, visible staged-card preview where relevant, then the primary
action docked above the safe area. Backdrop/Escape/system Back closes the
topmost sheet first. Leaving a match, clearing data, cancelling a table, and
discarding a composed state require the existing explicit confirmation.

Focus moves into a sheet, stays contained, and returns to its invoker. Sheets
must remain useful with the software keyboard open: the primary action, current
field error, and close control may not be hidden behind the keyboard.

### Motion and soundless feedback

Motion is physical explanation, not decoration: press 120–160 ms; sheet
settle 180–240 ms; accepted card movement no longer than 300 ms. A rail segment
draws only when the hand advances. Selection rises 4 px with a check mark;
accepted draw/discard/meld/layoff/replacement moves cards to their authoritative
location; rejected and pending actions do not fake a destination.

Respect `prefers-reduced-motion` and the existing reduced-motion preference:
remove flips, travel, fan, rail drawing, and celebration; retain a short opacity
change and textual feedback. Haptics, if enabled and supported, are optional,
brief, and paired with a visible outcome. No autoplay audio.

### Signature-experience rule

Every major route must contain at least one distinctive visual idea created for
that route. The complete set of required moments—from application arrival,
deal and wild-rank announcement through reconnect, kings-hand completion, and
final winner reveal—must be mapped and reviewed against the binding
[creative execution directive](CREATIVE_EXECUTION_DIRECTIVE.md). Generic DOM
updates with interchangeable transitions do not satisfy this requirement.

## 3. Route and screen specifications

### 3.1 `/` — Startup and route restoration

**Composition:** a full-bleed, quiet night field. Centre a small rail-card mark
above the `CRAZY RUMMY` wordmark; a single horizontal 13-stop line sits below.
At the bottom, show a truthful route-status line and only a delayed Continue
control if startup takes longer than a brief check.

**Hierarchy and signature moment:** the mark appears as a single brass station
light, then the first route segment resolves; total automatic motion stays under
1.2 seconds and never repeats as a ceremony on normal resume.

**Routing states:**

- No local identity: “Choose your seat” → `/identity`.
- Identity and no active recovery: “Your seat is ready” → `/lobby`.
- Safe unfinished-match recovery: “Returning to your table” → reconnect gate
  or `/game` only after the player-scoped view is safe.
- Offline: “You’re offline. Rules and your last received table are available.”
  Show only applicable **View last table**, **Rules**, and **Try again** paths.
- Startup failure: stable error panel with **Try again**, **Rules**, and no
  false claim that a match was restored.

**Acceptance notes:** never expose a table code or private card name in a splash
message, browser title, or transition image. The screen works at 320 px and
with no animation.

### 3.2 `/identity` — Your seat

**Composition:** a ticket-style identity card leads the page, followed by a
large display-name field and a horizontal marker picker. The marker choices
look like stamped geometric luggage tags (diamond, circle, square, triangle),
but all remain text-labelled radio controls.

**Hierarchy:** ask “What should players call you?” before the field; show
“Stored on this device — not an account” immediately beneath the save action.
The primary dock is **Save and continue**; Rules stays a quiet top action.

**States:** preserve value and focus for validation; reserve space below the
field for name length, collision, and moderation messages. During save, retain
the entered name and use a single-flight button state. A recovered identity
shows “Change player” rather than implying profile management or cross-device
sync.

**Responsive/accessibility:** marker controls wrap without losing their visible
labels at 320 px/200% text. The selected marker gets a check, heavy outline,
and spoken name—not colour alone.

### 3.3 `/lobby` — Online lobby, create, join, and discovery

**Composition:** a compact identity/presence rail under the header, then a
two-action launchpad: **Create a table** as brass primary and **Join with a
code** as raised baize secondary. The rest is a live departures board: Open
tables are the primary list; optional presence follows as secondary context.

**Table card:** table name and occupancy are the first line; host, audience,
rules preset, and freshness are compact metadata. A circular station marker and
`3 / 6` count make availability scannable. Each card has one **Join table**
action, disabled only with a reason. Closed tables never appear here.

**Signature moment:** after an accepted refresh, new/changed rows settle in one
at a time with a 60 ms stagger (or immediate replacement under reduced motion),
without reordering focus or flashing the entire list.

**Create table panel:** use a sequence of tactile controls—name, 2–6 capacity,
audience (`Open`/`Closed` with plain-language disclosure), and the immutable
rules preset. Finish with a review strip: “Open · 4 seats · Crazy Rummy · 13
hands.” **Create table** is single-flight. If creation succeeds, the panel
compresses into the waiting-room hand-off rather than showing a transient fake
room.

**Join panel:** a high-clarity code field with automatic uppercase display
formatting only if the contract allows it, paste support, error space, and
**Join table**. After a valid lookup, show a truthful preview (name, host,
occupancy, rules) before the final join. An unavailable/full/started table
explains the condition and preserves the code.

**Empty/network variants:**

- Loading: retain cards or use neutral table-card skeletons; label freshness.
- Empty: “No open tables found right now. Create one or refresh.”
- Stale: preserve last good list with brass “May be out of date · 1m ago”.
- Offline: show timestamped prior results, disable online actions with the
  reason, offer **Try again** when connectivity returns.
- Error: “Couldn’t refresh” plus manual retry, without clearing last good data.

**Acceptance notes:** a player list cannot visually imply invitations,
availability, or entry to a closed table. Long names truncate visually but are
available to assistive technology and on deliberate detail/focus.

### 3.4 `/waiting-room` — Table assembly and host start

**Composition:** the table’s ticket header contains its name, audience badge,
and copy/share code action. A circular carriage seating plan is the hero: 2–6
shape-marked seat tiles around a subtle baize oval, each showing name, accepted
state, ready state, and connection state. Below it, a “Departure checks” panel
states exact start blockers in plain language.

**Hierarchy:** the local player’s tile gets an outlined “You” tab; the primary
action is **Ready** / **Not ready**. For the host, **Start match** is prominent
only when at least two accepted, ready players satisfy the existing rules;
otherwise it is disabled with the current blocker named. Host-only actions
(renew, cancel, restore/start as contract permits) sit behind a clearly labelled
host section, never merely a colour difference.

**Signature moment:** when every condition is met, the table route line joins
the lobby station to “Depart”; all seats receive a brief brass rim, then the
host sees the enabled start control. No automatic match start.

**States:** show join details/copy/share success without exposing secrets in
unrelated screens. On refresh or recovery, retain seat order and describe
changes: joined, left, ready, lost connection, or table needs attention.
If a table has already started, replace controls with a truthful **Join started
match** or safe return path according to existing authorization.

**Responsive/accessibility:** 2-column seating may begin at large-phone width;
phones keep an ordered vertical list as the DOM/reading order. Every seat says
its name, state, and reason in text.

### 3.5 `/game` — Live table, draw, hand, and action dock

**Composition:** this is the flagship screen. It uses a fixed, safe-area-aware
four-region shell:

1. **Match header:** `H 04 / 13`, contract, compact route progress, Menu, and
   a turn/status line. Network detail remains compact unless blocking.
2. **Shared table:** player rail, cumulative scores, public melds, stock, and
   discard. It may internally scroll on short screens, but no private content
   enters this region.
3. **Your hand:** a raised, labelled tray with count, Rank/Suit/Custom sort,
   horizontal card fan, selection check/outline, and visible overflow cue.
4. **Action dock:** one phase-specific primary action; it is always above the
   bottom safe area and never hidden by the hand fan.

**Shared table hierarchy:** current player is a bright outlined marker plus
“Current turn”; other seats retain marker shapes and card counts. Melds display
as intact mini card groups with textual `Set`/`Run`, owner, represented wilds,
and a deliberate destination affordance. Stock and discard are large enough to
recognise; the discard remains the visual focal point during Draw.

**Private hand hierarchy:** real card faces are cream, high-contrast, and use
corner rank/suit plus large centre pip. A wild carries the visible word `WILD`.
Selected cards lift and show a non-colour check. Card labels include rank, suit,
wild state, selection, and “card n of m.” Sorting preserves the current
selection and reflows rather than re-deals.

**Phase dock:**

| Authoritative phase | Dock message | Primary action(s) |
| --- | --- | --- |
| Dealer opening discard | “Choose one card to open play.” | **Choose opening discard** |
| Draw | “Your turn. Draw from the stock or take the discard.” | **Draw stock**, **Take discard** |
| Play | “You may play cards, then discard to end your turn.” | **Actions** (with selected-card count) |
| Discard | “Choose one card to end your turn.” | **Discard…** / quick-confirm variant |
| Not local turn | “Sam’s turn. You can sort your hand while you wait.” | Sort remains available; game-changing actions are unavailable with reason. |
| Hand complete | “Hand results are ready.” | **Acknowledge hand result** |

**Signature moment:** an accepted move traces a short brass route from the
origin card to its final public/private destination; then the current-turn ring
moves to the next player. It is skipped for reduced motion and never precedes
authority.

**Live network states:** a compact state rail expands above the table for
pending, uncertain, reconnecting, paused, incompatible, abandoned, or forfeit.
It shows persistent `MM:SS` countdowns where provided, freezes conflicting
actions, and retains the last safe player-scoped view. Reconnection return uses
“Back online · your table is up to date,” not a celebratory replay.

**Acceptance notes:** public card movements never reveal an opponent’s hand;
the deal shows anonymous backs travelling to marker positions and only the local
hand turns face-up. At 320 px the shared table may scroll internally; card size
does not shrink below recognisable/tappable proportions.

### 3.6 Game decision sheets — meld, layoff, wild, discard

All active game sheets use the same “decision bench” pattern: stage at top,
legality/explanation in the middle, and a safe-area action dock at bottom. The
game table remains dimly visible but cannot be activated behind the sheet.

#### Compose meld

Show selected cards twice only when useful: editable source row and resolved
destination sequence. A detected `Set` or `Run` is a labelled result, not just
colour. For run wilds, show legal represented rank choices in context; for sets,
state the automatic representation. Invalid/incomplete selection keeps the
cards staged and gives one precise repair message. **Place meld** activates only
for a complete legal interpretation; accepted cards leave the hand only after
authority confirms.

#### Add to table (layoff)

Show a thumbnail/text summary for each shared destination and a clear selected
destination outline. Runs expose **Add before** and **Add after** as labelled
radio choices; sets say their maximum/atomic constraint plainly. Any selected
wild offers only legal representation controls. The live preview reads, for
example, “Add 2 selected cards after this run.” **Add selected cards** stays
disabled with an explicit legal reason until valid.

#### Replace wild

Use a two-lane exchange receipt: **Your natural card → exact table slot** and
**Table wild → your hand**. The candidate wild selector states what it currently
represents. Require exactly one matching natural selection and explicitly say
that the reclaimed wild returns to the hand for normal play/discard. The
confirmation action is primary but not ambiguous: **Replace wild card**.

#### Discard and opening discard

The confirmation sheet enlarges the selected card, names it in text, and shows
the consequence: “This ends your turn” or “starts normal play.” Its dangerous
semantics are conveyed by label, icon, and border as well as red. **Back to
turn** returns unchanged staged work. Quick-confirm preference still displays a
concise non-modal consequence/status and remains undo-free once accepted.

### 3.7 Reconnect, conflict, and terminal interruption

**Composition:** a blocking signal panel uses the same table shell rather than
a generic error page. Keep the last safe table visibly desaturated beneath it.
Lead with connection role and outcome, then persistent countdown, then allowed
actions.

| Condition | Heading and visual | Required action/state |
| --- | --- | --- |
| Local reconnecting | “Reconnecting to table” with amber signal and `MM:SS`. | Freeze moves; retain staged work; do not invite a duplicate action. |
| Host lost / match paused | “Match interrupted — host reconnecting” with shared timer. | Explain that play resumes only if host returns; no migration promise. |
| Pending outcome uncertain | “Checking whether that move counted…” with locked brass ticket. | Reconcile then either render accepted state or restore explicit retry. |
| Guest recovery expires | “You were dropped after 5 minutes offline.” | Clear private recovery only as existing contract requires; safe Lobby path. |
| Host recovery expires | “Match abandoned.” | Explain no result was produced; safe Lobby path. |
| Incompatible table | “This table uses a different app, protocol, or rules version.” | Block play, offer safe exit/details; never attempt a risky conversion. |
| Forfeit result | “Match ended by forfeit.” | Route to the authoritative public result when available. |

Announce entry, one-minute warning, recovery, and expiry—not every countdown
tick. Reconnection success returns focus to the status heading only when it had
blocked play; otherwise preserve the user’s card selection/focus where safe.

### 3.8 `/hand-result` — Accepted hand result

**Composition:** a calm score-ticket screen. The top hero names the event
(“Jo went out” or “Stock exhausted”) and advances the current station on the
13-stop route. A score strip immediately separates accepted hand penalty from
cumulative total. The authenticated player’s own remaining-card breakdown is a
private, clearly labelled panel; no one else’s card identities appear.

**Hierarchy:** next-hand preview (contract, moving wild, dealer) follows the
score and is visually quieter. The final panel explains individual online
acknowledgement versus local shared continuation. **Continue to next hand**
shows accepted/waiting state after submission; **Return to Lobby** is secondary
and confirms early online leave as required.

**Signature moment:** only the completed station turns brass and the route
advances one segment; no score-counting animation that hides the actual totals.

**States:** while waiting for other seats, show named/count text without
revealing private detail. Rejected acknowledgement remains actionable. Refresh
must reconstruct permitted public result state safely.

### 3.9 `/final-result` — Journey complete

**Composition:** a restrained final ticket, not a slot-machine celebration.
The headline names winner(s), joint win, or forfeit truth. A complete route is
visible beside the total hand count. Final standings are the hero: rank, marker,
name, and final total in a stable table/list with tabular figures.

**Hierarchy:** hand-by-hand accepted public penalties form a collapsible or
well-separated history below standings. The action deck offers **Copy result
summary**, context-appropriate **Play again**/local new match, and **Return to
Lobby**. Copied-result success explicitly says it excludes private cards and
credentials.

**Variants:** normal 13-hand completion, joint lowest-score win, and forfeit
each have their own headline and explanatory copy. Forfeit history includes
only accepted hands, never fabricated scores. A missing/corrupt terminal view
uses a safe unavailable state with Lobby return rather than invented standings.

### 3.10 `/rules` — Rules reference

**Composition:** an editorial carriage handbook: title and active immutable
rules version, a compact moving-wild route/timetable, then a sticky-on-wide
section index with clear anchor focus. Each rule is a readable card with a
small numbered station marker, concise statement, and optional visual example
that remains fully text-described.

**Hierarchy:** make the 13-hand wild schedule quickly scannable; group turn
order, melds, replacement, going out, scoring, and ties in plain language.
The active table preset/version remains visible so this screen never implies
that a player can alter a running table’s rules.

**States/accessibility:** rules are usable from the cached shell offline.
Section links move focus to the destination heading. Avoid relying on a visual
card diagram to describe a legal meld.

### 3.11 `/settings`, Menu, install, update, offline, and privacy

**Settings composition:** group controls into calm ticket panels: **Your seat**
(name/marker), **Play comfort** (card size, sort, motion, discard confirmation,
high contrast, haptics), **Lobby** (auto-refresh), **Install and offline**,
**Your record**, and **Privacy and data**. The save result is an inline status,
not a toast that vanishes before it can be read.

**Menu:** use a standard modal menu from every menu-enabled route. It starts
with safe navigation (Rules, Settings), then route-relevant information/actions
(match details, refresh, return to lobby). In a live match, leave/report actions
are visually separated at the end and never appear equivalent to closing Menu.

**Install/update/offline states:**

- Installing/checking: show a neutral progress state and say this is the static
  app shell only.
- Ready/controlled: show “Offline shell ready” and explain remote play still
  needs a shared service.
- Unsupported/error: current page remains usable; offline relaunch may not be.
- Update ready: brass status ticket; **Update and reload** is blocked during
  online play by the existing guard and explains why. Never promise replay of a
  move after reload.
- Offline: distinguish cached Rules/settings/last permitted view from online
  actions; do not present offline as an installed-account mode.

**Privacy/data:** device-only data claims remain precise. The destructive clear
action occupies its own danger panel, gives the full local scope, requires the
existing second confirmation, and never claims to delete another player’s data
or a cloud account.

## 4. Responsive and adaptive layouts

| Viewport/context | Detail screens | Live game |
| --- | --- | --- |
| 320–479 px | 12–14 px gutters; one column; title actions may stack below title. | Compact header; horizontal hand fan; table gets the only internal scroll; dock remains reachable. |
| 480–719 px | Wider ticket cards; optional two-column metadata, never reading-order reversal. | Wider fan and 2-column waiting seats; maintain vertical public → private → action order. |
| 720 px+ / landscape | Center to roughly 920 px; Lobby/create can be two columns. | Table left/upper, private hand/actions right/lower; semantic DOM order stays public → private → action. |
| Keyboard/rotation/fold | Recalculate safe areas and reveal active field/action. | Never hide a selected card, validation message, or current dock control behind browser chrome, hinge, or keyboard. |

Support browser zoom/reflow, 200% text, 400% appropriate reflow, iPhone and
Android safe areas, pointer, keyboard, forced colors, and increased contrast.
Do not rely on hover, drag, long press, swipe, motion, haptics, or sound. Every
drag-like concept (card ordering, placement) has buttons/radios/selects.

## 5. Accessibility and acceptance checklist

The graphics overhaul is accepted only when the visual implementation proves:

- Contrast meets WCAG 2.2 AA for every text, border, focus, status, and card
  state; color never solely communicates suit, selection, legality, readiness,
  or connectivity.
- Controls and card hit targets remain at least 44 × 44 CSS px, with 48–56 px
  preferred for live game actions; card overlap does not reduce keyboard or
  touch access.
- Landmark, heading, list, form, dialog, button, and status semantics follow
  the visual hierarchy. Reading order is status → shared table → private hand
  → actions even when wider layout changes placement.
- Screen readers receive concise announcements for turn changes, accepted or
  rejected actions, connection loss/recovery, and terminal outcomes, never
  every poll, animation, or timer tick.
- Player chips include name, marker, state, current-turn status, and card
  count. Melds include owner/type/cards/represented wild summary in text.
- Each visual flow holds up with long names, six players, empty lists,
  background/reconnect, invalid input, stale data, offline shell, forced
  colours, keyboard-only use, reduced motion, and 320 px/200% text.
- A new visual asset is either original/appropriately licensed for free use,
  lightweight, local/cacheable, non-secret, and has a text alternative where it
  conveys meaning. No asset can encode a private card or credential.
- The live table tests verify that a rejected/uncertain online action has no
  premature card animation, and that authoritative acceptance is the only
  trigger for destination feedback.

## 6. Visual implementation hand-off

Implement this specification as a design system rather than isolated page
skins: reusable shell, surface, ticket divider, state rail, player marker,
route, card, sheet, and action-dock primitives. Build or source only free,
licence-compatible assets; prefer CSS/SVG geometry and the existing card DOM
over heavy image packs. Validate the rendered PWA against the established
functional tests and add visual/manual checks for every acceptance condition
above before describing v1.1 as complete.

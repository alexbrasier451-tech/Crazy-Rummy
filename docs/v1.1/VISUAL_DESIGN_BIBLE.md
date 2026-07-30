# Crazy Rummy v1.1 — Visual Design Bible

**Creative direction:** The Midnight Limited  
**Status:** Proposed  
**Applies to:** All application graphics, UI, motion, haptics, and optional
audio

## 1. Creative north star

Crazy Rummy should feel like entering a private card room on a modern sleeper
train just after midnight. The carriage is quiet, purposeful, and immaculate.
Dark enamel frames the experience; green baize holds the game; brass and
ticket cream identify the decisions that matter. Light is used like stage
direction, not decoration.

The fantasy is expressed through graphic design rather than literal scenery:

- fine parallel rails and route nodes;
- ticket perforations and clipped corners;
- carriage-number typography and compact destination labels;
- soft directional reflections suggesting a passing platform;
- restrained brass fittings and stitched baize edges;
- cards as the brightest, most physical objects on screen.

The design should be recognisable from a cropped card back, a single action
button, or a result screen with the logo removed.

## 2. Experience pillars

### 2.1 Authored, not decorated

Every visible element must have a role in hierarchy, state, atmosphere, or
affordance. Repeated motifs share proportions and geometry. Remove ornamental
lines, particles, glows, and badges that do not improve the composition.

### 2.2 The cards are the stars

Navigation and panels recede. Playing cards remain the highest-contrast,
clearest, most tactile interactive objects. Public cards, private cards, card
backs, selected cards, wild cards, disabled cards, and pending cards remain
distinguishable without colour.

### 2.3 Quiet luxury, sharp decisions

Default screens feel calm and low-contrast. The current turn, primary action,
blocking error, reconnect deadline, and final winner are allowed to become
bright. One visual focal point per decision state is the normal maximum.

### 2.4 Motion explains causality

Motion connects an acknowledged source to its authoritative destination. It
does not delay play, invent state, or provide ambient spectacle while the
player is trying to decide.

### 2.5 The interface tells the truth

Pending, accepted, rejected, stale, offline, interrupted, and uncertain states
have visibly different treatments. Optimistic visuals may show intent but may
not show a card settled at its final destination before acknowledgement.

## 3. Mood and avoidance

| Pursue | Avoid |
| --- | --- |
| Contemporary sleeper-train luxury | Steam engines, cogs, rivets, steampunk |
| Deep material contrast | Flat black boxes with gold borders everywhere |
| Controlled cinematic light | Constant glow, bloom, lens flare, particles |
| Editorial railway typography | Novelty western, circus, or casino type |
| Purposeful asymmetry | Dashboard grids of equal-weight cards |
| Tactile paper and baize | Fake wood, leather skeuomorphism, marble |
| Crisp standard playing cards | Ornate custom pips that slow recognition |
| Restrained celebration | Coins, loot bursts, slot-machine spectacle |
| Subtle depth | Glassmorphism that reduces contrast |
| Original rail motifs | Real operator logos, liveries, tickets, or maps |

## 4. Identity system

### 4.1 Name and wordmark

The product name remains **Crazy Rummy**. “The Midnight Limited” is an internal
creative-direction label, not a required public subtitle.

The wordmark should combine:

- a condensed uppercase **CRAZY** carriage-board label;
- a wider, calmer **RUMMY** line;
- a route stroke that enters before the C and terminates as a station node
  after the Y;
- no train silhouette, playing-card fan behind the text, crown, or poker chip.

Prepare horizontal, compact, monochrome, and maskable-icon variants. At 24 px,
use the route-node monogram rather than the full wordmark.

### 4.2 Signature motif

The signature line is a pair of 1 px rails separated by 3 px, interrupted by
round route nodes. Use it for progress, section boundaries, selected edges,
and loading skeletons. Never use more than two visible route-line systems in
one viewport.

### 4.3 Image direction

Hero imagery is abstract and material:

- macro baize fibres;
- soft carriage-window reflections;
- overlapping card silhouettes;
- paper fibres and blind embossing;
- rail geometry disappearing into shadow.

Avoid human characters, literal carriage interiors, photoreal trains, and
busy narrative scenes. They increase production cost, loading weight, and
brand inconsistency without improving play.

## 5. Colour system

The palette deepens the existing night-train identity while improving role
separation. Values are candidate implementation tokens and require automated
contrast verification in every applied combination.

| Token | Value | Primary role |
| --- | --- | --- |
| `midnight-1000` | `#07090B` | Page depth, overscroll, splash |
| `midnight-950` | `#0B100E` | Ink on light controls |
| `carriage-900` | `#121A17` | Navigation and decision surfaces |
| `baize-800` | `#123B2D` | Shared table field |
| `baize-700` | `#1B4A39` | Raised and selected field |
| `ticket-100` | `#F5EFDF` | Primary text and card stock |
| `ticket-300` | `#C6BDAA` | Secondary text |
| `brass-500` | `#E0B64F` | Primary action, active route node |
| `brass-300` | `#F3D98C` | Fine highlight only |
| `signal-green` | `#3DE0A5` | Legal, ready, connected, accepted |
| `signal-red` | `#FF746B` | Invalid, destructive, dropped |
| `signal-blue` | `#78B4FF` | Informational network state |
| `suit-red` | `#A82936` | Hearts and diamonds on card stock |
| `suit-black` | `#111411` | Clubs and spades on card stock |

Reference contrast ratios for the proposed core pairs:

| Pair | Ratio |
| --- | ---: |
| Ticket 100 on Midnight 1000 | 17.37:1 |
| Ticket 100 on Carriage 900 | 15.43:1 |
| Ticket 100 on Baize 800 | 10.83:1 |
| Ticket 300 on Carriage 900 | 9.50:1 |
| Brass 500 on Midnight 950 | 10.02:1 |
| Signal green on Midnight 1000 | 11.78:1 |
| Signal red on Midnight 1000 | 7.56:1 |
| Signal blue on Midnight 1000 | 9.28:1 |

These ratios do not approve translucent, gradient, small-text, disabled, or
over-image combinations. Test actual computed colours.

### 5.1 Colour discipline

- Brass means “important/current,” not merely “premium.”
- Green means legal, connected, ready, or accepted.
- Red means destructive, invalid, dropped, or time-critical failure.
- Blue is reserved for neutral network information and never replaces green
  for a healthy connection.
- Use at most one accent family as the dominant colour in a component.
- Disabled controls use reduced edge and text contrast but remain readable.
- Every coloured state also gets text, iconography, edge shape, or pattern.
- High-contrast and forced-colour modes may discard the material palette
  entirely while preserving hierarchy.

## 6. Typography

### 6.1 Proposed pairing

- **Display and route labels:** Barlow Condensed, variable or the minimum
  required static weights, self-hosted.
- **UI, rules, scores, and card metadata:** Inter, variable or the minimum
  required static weights, self-hosted.
- **Fallback:** the existing system sans stack.

Both font families must be sourced from their authoritative open-font
repositories, stored with their licence files, subset only when licence terms
allow it, and never fetched from a runtime CDN. Typography remains fully usable
before fonts load.

### 6.2 Type roles

| Role | Typeface | Treatment |
| --- | --- | --- |
| Hero wordmark | Barlow Condensed | 700–800, tight leading, custom spacing |
| Screen title | Barlow Condensed | 650–750, sentence case or short uppercase |
| Context/destination | Barlow Condensed | 600, uppercase, 0.08–0.12 em tracking |
| Body/control | Inter | 450–650, sentence case |
| Scores/timers/counts | Inter | 600–750, tabular numerals |
| Ticket metadata | Inter | 550, compact but never below the legibility floor |
| Playing-card rank | System-compatible serif or Inter | Bold, conventional |

### 6.3 Rules

- Never set paragraphs, legal text, rules, or validation copy in condensed
  type.
- Do not fake weight with text shadows or strokes.
- Headings may tighten but body copy keeps comfortable tracking and line
  height.
- Prefer text wrapping over ellipsis for player names and critical status.
- Use tabular numerals for scores, counts, table codes, timers, and hand
  progress.
- The visual hierarchy must survive with web fonts blocked.

## 7. Geometry, spacing, and depth

### 7.1 Shape language

- Base radius: 12 px on compact controls and 16 px on panels.
- Decision sheets: 24 px top corners on phone; 20 px all around when floating.
- Ticket panels: 12 px with one or two clipped/perforated edges.
- Playing cards: approximately 8% of card width, within familiar card
  proportions.
- Pills are limited to status chips, compact filters, and segmented choices.
- Primary action buttons are not pills.

### 7.2 Spacing

Use a 4 px base grid with named steps 4, 8, 12, 16, 24, 32, 48, and 64 px.
Visual groups use internal spacing smaller than the gap to neighbouring
groups. Safe-area insets add to, rather than replace, the appropriate step.

### 7.3 Depth layers

1. **Void:** page and overscroll.
2. **Field:** baize or carriage work area.
3. **Furniture:** panels, trays, and action rows.
4. **Object:** cards, chips, tickets, and focused controls.
5. **Decision:** modal sheets, confirmations, blocking recovery.
6. **Moment:** temporary accepted feedback or result celebration.

Depth comes from edge light, occlusion, and a short shadow before blur or
glow. Large black shadows should not swallow text or focus indicators.

### 7.4 Material recipes

**Black enamel**

- almost-black vertical gradient;
- 1 px warm neutral edge;
- narrow top reflection;
- no visible noise at normal phone viewing distance.

**Green baize**

- solid accessible base colour;
- low-opacity fibre texture sized to avoid moiré;
- gentle centre lift and edge falloff;
- texture disappears in forced colours and data-saving mode if offered.

**Brass**

- used on small edges, route nodes, focus, and one primary action;
- warm light-to-mid gradient is permitted;
- avoid metallic text and broad gold panels.

**Ticket stock**

- cream with faint paper grain;
- dark ink;
- perforations are decorative and never the only group boundary.

## 8. Iconography and graphic assets

- Use one outline family with a consistent 2 px optical stroke.
- Prefer locally stored, individually selected Lucide SVG paths for utility
  actions; customise terminals and bounding boxes only where the licence and
  register permit.
- Create original suit, rail, wild, table, and connection-state symbols.
- Icons accompany labels for primary, destructive, unfamiliar, and
  network-sensitive actions.
- Filled icons are reserved for active/selected states.
- Do not mix emoji with the production icon family.
- SVGs use `currentColor` where role-colouring is intentional and expose no
  unnecessary editor metadata.

## 9. Playing-card system

### 9.1 Card face

The card face is warm stock rather than pure white. It contains:

- large conventional rank and suit in both corners;
- a strong centre suit or pip group;
- redundant `WILD` text and star/route symbol for wild cards;
- an inner keyline that survives background-image loss;
- no texture behind rank or suit glyphs;
- no custom illustration that competes with card recognition.

The face must remain recognisable in a dense public meld and at the smallest
approved private-hand size. When space is insufficient, simplify the centre
before shrinking corner rank/suit below the legibility threshold.

### 9.2 Card back

The back is the hero brand asset:

- midnight field;
- cream or brass double-rail lattice;
- centred route-node monogram;
- mirrored geometry so orientation reveals nothing;
- an inner border that remains visible against baize;
- a static fallback with no shimmer.

Prepare normal, small, anonymous-deal, and high-contrast variants from the same
source SVG.

### 9.3 Interaction states

| State | Required treatment |
| --- | --- |
| Default | Clear edge, short shadow, full rank/suit |
| Hover-capable | Small light lift; no essential information |
| Focused | External high-contrast ring, unobscured corners |
| Selected | Vertical lift, check marker, stronger edge, `aria-pressed` |
| Pending intent | Selected state plus restrained progress rail |
| Accepted travel | Source-to-destination transform after acknowledgement |
| Rejected | Return to origin, persistent correction copy; no punitive shake in reduced motion |
| Disabled | Still legible, no lift, explicit reason nearby |
| Wild | Word `WILD`, distinct symbol and border pattern |
| Public/non-interactive | Article semantics, no button affordance |

Card overlap must never reduce a card's accessible hit target below 44 × 44
CSS px. Focused cards scroll fully into view.

## 10. Component language

### 10.1 App shell

The shell uses a deep edge-to-edge field. The header becomes a carriage-board:
context above, title on the main line, route/status detail below, and a compact
utility action aligned without colliding at 200% text. On large screens, the
content expands; the chrome does not grow into a desktop admin dashboard.

### 10.2 Panels

Panels are grouped by material and purpose:

- carriage panels for navigation and settings;
- baize wells for game objects;
- ticket panels for metadata, invitation codes, and result summaries;
- decision sheets for blocking or compositional work.

Avoid wrapping every text block in a panel. Page rhythm needs negative space.

### 10.3 Buttons

- Primary: brass fill, dark ink, strong verb, short press depth.
- Secondary: carriage or baize fill, cream label, visible edge.
- Quiet: text/icon treatment with a full target area.
- Positive: green edge/fill only when the action itself confirms or accepts.
- Destructive: red edge by default; solid red only at final confirmation.
- Pending: retain label context, add progress, and disable only conflicts.

Buttons never use glow as the only focus or disabled treatment.

### 10.4 Status and network truth

Connection state is a compact signal block with icon, label, and optional
detail. It never resembles a decorative badge. Reconnect and host-loss states
expand into a persistent rail with deadline and consequence. A spinning
indicator is used only when work is genuinely in progress.

### 10.5 Forms

Labels stay visible above fields. Codes and scores use tabular numerals.
Validation reserves space where practical to prevent layout jumps. Inputs use
clear default, focus, filled, invalid, disabled, and read-only states. Placeholder
text is never a substitute for a label.

### 10.6 Sheets and overlays

The background scrim reduces detail without removing situational context.
Sheets have a clear title, scope copy, body, and action zone. Focus enters,
remains contained, and returns. Full-height phone sheets keep the primary
action above the safe area and visible with the virtual keyboard.

### 10.7 Toasts and accepted feedback

Toasts confirm non-blocking accepted events only. Blocking failure and
uncertain network state remain in the relevant workspace. Toasts do not cover
the hand or action dock and are announced once.

## 11. Lighting and effects

The visual lighting model has one implied source above and slightly left.
Cards and raised panels share it. A low-opacity moving platform reflection may
appear once during startup or a route transition, but there is no looping
ambient light during play.

Permitted effects:

- one blurred radial lift behind the active decision;
- a thin specular edge on enamel;
- a local shadow beneath lifted cards;
- brief dust/foil flecks on final victory only;
- mask-based route-line reveal;
- subtle texture layers that compress cleanly.

Prohibited effects:

- continuous particles;
- animated grain;
- pulsing every primary button;
- multiple saturated glows;
- backdrop blur required for readability;
- perspective tilt that moves controls under the pointer;
- shake, flash, or chromatic aberration on ordinary errors.

## 12. Motion system

### 12.1 Motion roles

| Role | Duration | Typical use |
| --- | ---: | --- |
| Press | 90–140 ms | Button/card depression |
| State | 140–200 ms | Selection, chip, validation |
| Sheet | 180–260 ms | Menu, composer, confirmation |
| Object travel | 220–320 ms | Acknowledged card movement |
| Route | 320–520 ms | Hand completion/progress |
| Hero | 600–900 ms | Startup or final result, once |

Use ease-out for arrival, ease-in for departure, and a restrained spring-like
curve only for cards settling. Keep spatial direction consistent with the
object's destination.

### 12.2 Choreography

- Startup: the route line resolves, then the wordmark and primary status.
- Navigation: content changes as a short carriage-panel crossfade/translate,
  progressively enhanced with the View Transition API.
- Deal: anonymous backs leave the stock; only the local hand turns face-up.
- Draw: accepted card enters the local hand and neighbouring cards reflow.
- Meld: selected cards travel together, then settle into their public group.
- Wild replacement: the natural card occupies the exact public slot before
  the reclaimed wild returns to the local hand.
- Discard: the accepted card reaches the discard pile, then the turn signal
  advances.
- Reconnect: no decorative motion; status change and deadline are prioritised.
- Hand complete: the next route node illuminates once.
- Final result: the route reaches its terminus, winner ticket resolves, and a
  small foil response occurs once.

### 12.3 Reduced motion

Explicit reduced motion and `prefers-reduced-motion` remove travel, parallax,
route drawing, card fan/flip, spring, particles, and large transforms. Use
immediate layout changes or a 100 ms-or-less opacity transition. Gameplay,
focus order, announcements, and timing never depend on an animation finishing.

## 13. Optional sound and haptics

Sound is optional for v1.1 and must not block the graphics overhaul.

If included, use a small original interface set:

- paper/card set-down;
- soft brass route chime;
- low carriage click for accepted turn;
- restrained warning knock;
- connection restored cue;
- final terminus chord.

No background music, autoplay, casino bells, coin sounds, or opponent-private
audio cues. Keep effects short, normalised, compressible, and disabled by
default until a user gesture allows playback. Every cue duplicates visible and
accessible feedback.

Haptics retain the existing selection, accepted action, restored connection,
hand-complete, and destructive-warning roles. Do not vibrate for polling,
countdown ticks, hover, or animation.

## 14. Responsive composition

### 14.1 Compact phone: 320–479 px

- One focal column and 12–16 px safe gutters.
- Public table may scroll within its region; hand and action remain reachable.
- Cards may overlap horizontally but keep full accessible targets.
- Header utilities wrap under the title rather than truncate status.
- Decision sheets become full-height.
- Decorative side rails and secondary material layers are removed first.

### 14.2 Large phone and portrait tablet: 480–719 px

- Preserve one-handed action order.
- Increase card fan and table breathing room before adding columns.
- Waiting-room seats may use two columns.
- Result tickets can use a wider editorial layout.

### 14.3 Tablet and desktop: 720 px and above

- Centre within the existing approximately 920 px product boundary.
- Live play may split public table and private hand/actions, but reading order
  remains status, table, hand, actions.
- The design gains space, not extra private information.
- Background atmosphere may extend beyond the shell at low contrast.

### 14.4 Environmental changes

Rotation, browser chrome, virtual keyboard, display cut-outs, fold/hinge
insets, 200% text, and 400% zoom must not hide the focused control, validation,
reconnect deadline, or primary action.

## 15. Accessibility and inclusive appearance

- WCAG 2.2 AA is the minimum; critical game text should target stronger
  contrast where practical.
- Use semantic HTML and keep DOM reading order aligned with the interaction
  sequence.
- Preserve card names, positions, selected state, and meld summaries.
- Never place essential copy over unbounded imagery.
- Focus rings remain visible over every material and outside card clipping.
- Support forced colours with system colours, borders, checks, and text.
- Increased contrast removes subtle edges and strengthens separators.
- High-contrast deck mode may add suit labels or redundant pip shapes.
- Touch targets are at least 44 × 44 CSS px with practical separation.
- Drag, swipe, long-press, hover, motion, haptic, and sound always have direct
  alternatives.
- Live regions announce accepted actions, turn changes, blocking validation,
  connection loss/restoration, and hand completion—not decorative movement.
- Flashing content is prohibited.

## 16. Performance and graceful degradation

Visual quality must scale down before interaction quality:

1. Remove particles and non-essential blur.
2. Remove large texture layers.
3. Reduce shadow spread and simultaneous transforms.
4. Replace raster hero art with a gradient/SVG fallback.
5. Replace view transitions with immediate route updates.

Core play must remain complete with images blocked, web fonts unavailable,
motion disabled, forced colours active, service worker offline, and a narrow
320 px viewport.

Detailed byte, frame-pacing, and loading budgets are defined in
[QA and acceptance](QA_ACCEPTANCE.md).

## 17. Asset inventory

The minimum authored v1.1 set is:

- horizontal and compact wordmarks;
- maskable and any-purpose app icons;
- card-back master and compact/high-contrast derivatives;
- baize, paper, and enamel texture masters;
- route-line, route-node, rail-divider, ticket-edge, and wild symbols;
- selected utility icons;
- splash composition and lightweight fallback;
- connection/offline/recovery marks;
- victory ticket/route terminus;
- optional six-effect sound set;
- font files and licence texts;
- source files, optimised exports, and asset register entries.

Do not produce a large art pack before the lobby and live-game keyframes prove
the direction.

## 18. Design review checklist

A surface is ready for implementation review when:

- at least three materially different structural or presentation approaches
  were considered for an approval keyframe or principal gameplay surface, with
  the selected and rejected concepts explained;
- it has a distinctive route-specific idea rather than an interchangeable
  dashboard silhouette;
- its focal decision is obvious at a glance;
- its default, pressed, focused, selected, disabled, pending, accepted,
  rejected, stale, offline, and error states are specified as applicable;
- the card and network truth contracts are preserved;
- the 320 px, 390 px, 768 px, 200% text, reduced-motion, and forced-colour
  variants are represented;
- every asset has a proposed source, format, fallback, and licence category;
- decorative layers can be removed without losing meaning;
- no paid or metered runtime dependency is required;
- motion identifies its authoritative trigger and reduced-motion equivalent;
- a screenshot can be traced back to the token and component system rather
  than one-off styling.

The review fails even when every item above is technically valid if the result
is a polished reskin, generic luxury dashboard, decorated conventional card
interface, or otherwise forgettable. Apply the binding
[creative execution directive](CREATIVE_EXECUTION_DIRECTIVE.md).

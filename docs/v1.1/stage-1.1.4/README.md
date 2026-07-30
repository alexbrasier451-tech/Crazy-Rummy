# Stage 1.1.4 — Gameplay and authored-card hero programme

## Delivered scope

This stage implements the owner-approved **Compartment Table** direction in the
shared local/online game workspace and expands the existing card primitive into
one authored face/back/state system.

The production change is presentation-only. It does not alter engine rules,
session ownership, online command dispatch, acknowledgement timing, private
view construction, routes, or navigation.

Implemented composition:

- persistent connection rail and turn truth before the table;
- adaptive six-seat perimeter, cumulative-score rail, central stock/discard
  spine, and public-meld sidings;
- foreground private hand tray with overlap that retains native buttons and
  horizontal scrolling;
- full-width conductor call for the existing Actions entry point;
- decision-bench treatment for compose, layoff, wild replacement, and discard
  sheets while retaining focus containment and return;
- reconnect/pending/rejected/uncertain styling from the existing authoritative
  presentation state.

Implemented authored-card language:

- warm-stock face, inner keyline, conventional corner rank/suit and large centre
  suit;
- restrained abstract court mark for Jack, Queen, and King;
- mirrored midnight/brass rail back with redundant `CR` route-node monogram;
- wild word/pattern, selected check/lift, playable, invalid, grouped, newly
  drawn, discard-candidate, pending, rejected, and uncertain treatments;
- explicit public/private visibility and authority-state data;
- compact public meld cards and public discard treatment;
- reduced-motion and forced-colour alternatives.

## Contract preservation

DOM reading order remains:

1. connection and turn truth;
2. game details;
3. shared player/table content;
4. local private hand;
5. game actions;
6. an active decision sheet, when present.

Opponent DOM remains limited to name, marker, public state, score, and card
count. Card identities are still sourced only from the authenticated local
player view and public discard/meld data.

All card selection remains a native button with `aria-pressed`, a 44 CSS-pixel
minimum target from the existing component contract, direct click/tap/keyboard
activation, and no drag-only command. Existing command names and selectors are
unchanged.

## Integration

Import `src/styles/v11-gameplay.css` after the existing component and screen
styles. The file deliberately relies on cascade order and includes fallback
values for the v1.1 semantic tokens.

Foundation-owned card assets can replace the CSS card-back fallback later
without changing card semantics. This stage does not depend on those assets
being present.


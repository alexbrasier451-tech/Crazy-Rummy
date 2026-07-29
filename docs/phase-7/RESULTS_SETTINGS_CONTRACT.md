# Phase 7 Results, Rules, Settings, and Feedback Contract

**Status:** Implemented and locally verified 29 July 2026  
**Scope:** Roadmap 7.1–7.5

## Result visibility

Every player sees the accepted public penalty total for each participant. Only
the authenticated player projection adds that player's remaining-card
breakdown. Public views, other player views, copied summaries, and stored
completed summaries never receive those card identities.

The hand result separates the accepted hand penalty from the cumulative total,
identifies the next active dealer and moving wild rank, shows the 13-hand route,
and requires each active online seat to acknowledge only its own result.
Dropped seats are not given fabricated zero scores.

The final result distinguishes a normal thirteen-hand finish, joint lowest-score
winners, and an early forfeit. It lists every accepted public hand result and
provides deterministic copy-safe text. A refresh can reconstruct this screen
from the validated public-only summary after private recovery is removed.
Play again is single-flight: it creates a new local fixture or requests at most
one fresh online room, and never mutates or reuses a finished bootstrap.

## Completed-summary boundary

The device retains only the latest versioned public summary:

- rules version and public rules choices;
- public display names and cumulative totals;
- winner seat IDs;
- accepted hand number, wild rank, dealer, participants, reason, and public
  penalty totals; and
- a public forfeit marker when applicable.

The record also retains only the presentation facts needed after refresh:
whether the completed match was local or online, and, for a forfeit, the hand
during which it ended. Neither fact grants recovery authority.

The allowlist excludes card IDs and values, hand IDs, match recovery state,
table and invite codes, room/seat secrets, peer scopes, SDP, ICE candidates,
and TURN credentials. The summary is written before terminal private recovery
is removed. Corrupt or unsupported records fail closed. Starting a new match
keeps the latest public summary; explicit device-data clearing removes the
summary and every private match-recovery record on that device.

## Rules and settings

The cached rules screen displays the active immutable rules version, all
thirteen moving-wild hands, turn order, opening, sets/runs, table additions,
wild replacement, going out, stock exhaustion, scoring, and final ties.

Device settings apply:

- display name and seat marker;
- standard/large cards;
- rank/suit default hand sorting;
- system/reduced motion;
- optional capability-detected haptics;
- always/quick discard confirmation;
- high contrast with redundant visible suit labels; and
- lobby automatic polling on/off while retaining manual refresh.

Changing lobby automatic polling applies to the current session immediately:
turning it off cancels the scheduled poll, and turning it back on refreshes and
resumes the bounded polling loop.

Explicit data clearing states its device-only scope and requires a second
confirmation.

## Feedback and accessibility

Selection, deal, draw, discard, meld, lay-off, wild replacement, sort,
hand-complete, match-complete, and reconnect feedback is cancellable and uses
transform/opacity only. Game-changing feedback begins only from an
authoritative accepted outcome. Pending, rejected, and uncertain actions do
not travel to a destination. Reduced motion uses a short fade, and unsupported
or disabled haptics remain silent. Audio is optional by contract and is not
implemented; there is no autoplay.

Reconnect status contains a persistent `MM:SS` value. Its live region announces
entry, the one-minute warning, recovery, and the terminal outcome rather than
every second. Meld controls expose a text summary, including represented wild
positions, without nested interactive/card semantics.

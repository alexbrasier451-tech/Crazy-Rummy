# Phase 7 Polish and Accessibility Checklist

**Status:** Green for the local automated boundary  
**Verified:** 29 July 2026

## Automated checks

- WCAG AA token contrast and visible focus contracts;
- 44 × 44 CSS-pixel action and interactive-card targets;
- 320 × 568, 390 × 844, 430 × 932, and 768 × 900 Chromium layouts;
- no page-level horizontal overflow across every route;
- 200% text and 400% reflow on the live-game route;
- 320-pixel/400% reflow on a refresh-restored final-result route;
- short/virtual-keyboard viewport access to the decision-sheet primary action;
- keyboard navigation, skip-link focus, modal focus entry/return, and sheet
  focus containment;
- forced-colour borders and redundant selection state;
- system and explicit reduced-motion behaviour;
- owner-only score detail and public-only copy/storage summaries;
- persistent reconnect `MM:SS` formatting with gated announcements;
- semantic meld text with no nested card article inside a button;
- applied card-size, hand-sort, motion, high-contrast, marker, discard, haptic,
  and lobby auto-refresh preferences; and
- full thirteen-hand final history, copy action, retained latest summary, and
  new-match flow;
- online acknowledgement accepted/waiting status and disabled repeat action;
  and
- refresh-restored online results, zero-history forfeit copy, and single-flight
  online replay.

## Honest physical-device boundary

The automated browser gate uses the installed Chromium runtime. Modern iPhone
Safari/WebKit, Android Chrome GPU smoothness, safe areas under real browser
chrome, vibration behaviour, screen-reader gestures, rotation, backgrounding,
and physical touch spacing remain representative-device checks in Phase 8.
This document does not claim those physical runs have occurred.

Sound remains intentionally absent. The product contract makes audio optional,
forbids autoplay, and does not make sound a dependency of card feedback.

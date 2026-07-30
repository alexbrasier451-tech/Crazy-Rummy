# Stage 1.1.7 external evidence still required

Automated screenshots cannot close the v1.1 release. The following evidence
must be attached to the release record by the named review functions.

## Human creative review

Design/product and the project owner must review:

- the full route/state contact sheet and intentional before/after diffs;
- route-specific composition and all signature moments in the creative
  execution directive;
- whether cards read as one authored hero system rather than decorated browser
  rectangles;
- environmental depth, hierarchy, typography, legibility, and cohesive
  Midnight Limited identity;
- the three-way concept divergence and selected/rejected rationale;
- every deferred or reduced ambitious treatment and its concrete higher-priority
  constraint;
- whether the release has pushed the presentation far enough.

Automated green results cannot override this judgement.

## Physical devices and installed PWA

QA must record exact device, OS, browser, DPR, display/text scale, motion/colour
settings, network condition, cold/warm state, build revision, date, reviewer,
and result for:

- a physical ARM64 Android phone with no more than 4 GB RAM in the declared
  Snapdragon 695 / Dimensity 700 / Exynos 1280-or-slower support class;
- a physical 60 Hz A13-class iPhone with no more than 4 GB RAM;
- Android Chrome and installed PWA;
- iPhone Safari and installed PWA;
- desktop Chrome/Edge;
- the oldest supported Android and iOS majors declared for the release.

Runs must cover touch precision, browser/safe-area chrome, rotation with open
menus/sheets/actions, virtual keyboard, offline relaunch, update/reload, cache
cleanup, constrained performance, thermal behaviour, and a ten-minute match.

## Accessibility

Accessibility review must cover keyboard-only use plus:

- NVDA with Firefox or Chrome on Windows;
- VoiceOver with Safari on iPhone;
- TalkBack with Chrome on Android.

Cards, selection, action and confirmation sheets, menu focus containment and
return, results, validation, connection announcements, reduced motion,
forced/high contrast, update/install, 200% text, and 400% reflow all require
recorded results. Review must confirm announcements are concise and do not
expose player-only detail.

## Performance, resilience, and browser breadth

Engineering/QA still need:

- cold/warm Fast 3G and unreliable/offline profiles;
- production performance traces for a turn, sheet, result, reconnect, and
  rotation;
- long-task, layout-thrash, paint, dropped-frame, and input-latency review;
- current pinned Firefox and WebKit smoke captures where supported;
- PWA install, offline, update-from-old-revision, and storage-clearing proof.

The automated compressed first-paint, initial-shell, decoded decorative, font,
and route-art budgets are complete in
`../stage-1.1.6/MEASURED_BUDGET.json`; physical-device timing and trace evidence
remain open.

## Sign-off record

Final release evidence must name approvals from engineering, design/product,
accessibility, QA, and the release owner. Open P2/P3 issues and any time-bounded
P1 exception need an owner, risk, reason, approval, and target date. Missing
evidence is a failed gate.

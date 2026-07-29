# Phase 1 Build Report

**Status:** Complete  
**Date verified:** 29 July 2026  
**Scope:** Mobile PWA foundation and design system

## Delivered

- Vite 8 static client using browser-native JavaScript modules.
- Development, production build, unit, browser-smoke, PWA, and combined check
  commands.
- Night-train visual tokens, safe-area responsive shell, original CSS/SVG
  textures and install icons, AA contrast fixtures, forced-colour support, and
  reduced-motion handling.
- Accessible shared playing-card, card-back, hand, player, score, connection,
  sheet, toast, confirmation, route-progress, action, and motion primitives.
- Recovery-safe hash navigation through startup, identity, lobby, waiting
  room, game table, hand result, final result, rules, and settings.
- A phone-first web manifest and generated content-versioned service worker.
  Its precache is limited to hashed build assets, versioned install icons, the
  navigation shell, and the cached rules route.
- Honest offline launch: cached rules/settings remain available while remote
  play is explicitly unavailable until connectivity returns.

## Verification evidence

The supported combined command is:

```text
pnpm check
```

The completion run passed:

- 24 Node unit tests for route recovery, history-backed sheets, component
  contracts, contrast/tokens, responsive and reduced-motion CSS, and
  privacy-bounded PWA generation;
- the Vite production build (26 modules);
- Chromium navigation/accessibility/responsive smoke checks at 320, 390, and
  768 CSS pixels, including every Phase 1 route, keyboard-labelled controls,
  safe Menu Back behaviour, and no document-level horizontal overflow; and
- Chromium PWA checks for manifest/icon validity, versioned art caching, a real
  version 1 to version 2 update reaching the waiting state, explicit
  update-and-reload activation, controller change, obsolete-cache cleanup,
  version matching, and offline relaunch to cached rules with truthful
  online-play-unavailable copy and an offline card-back asset.

## Stage boundary

All identity, lobby, waiting-room, card, score, reconnect, and result data in
this phase are clearly labelled local visual fixtures. No real discovery,
network session, deterministic game engine, accepted gameplay action, or match
persistence is claimed. Those capabilities remain in later roadmap phases.

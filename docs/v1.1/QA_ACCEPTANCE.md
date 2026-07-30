# V1.1 Graphics Overhaul — Visual Quality Acceptance Plan

**Status:** Planned acceptance criteria — no V1.1 checks have been run.  
**Scope:** A zero-budget, phone-first PWA whose visual bar is intentional,
legible, responsive, and game-like. “AAA-like” here means craft and consistency,
not an assertion of console-scale content, native-engine rendering, or paid
services.

This is the release gate for the graphics/UI overhaul. It extends the Phase 7
automated boundary (responsive Chromium layouts, 44 × 44 CSS-pixel targets,
reflow, keyboard, forced-colours, reduced motion, PWA lifecycle, and gameplay
results) rather than replacing it. The Phase 7 checks are useful regression
coverage; they are not evidence that V1.1 art direction, animation quality, or
physical-device rendering has passed.

## 1. Acceptance rule and evidence labels

V1.1 can ship only when every applicable **P0** and **P1** item below is green,
with evidence attached to the release record. A deliberately deferred item must
have an owner, reason, risk, and target release; it cannot be silently omitted.

| Evidence label | What it proves | What it does not prove |
| --- | --- | --- |
| **Automated** | Repeatable assertions, screenshot diffs, build and budget measurements in a pinned browser/runtime. | Physical touch, GPU behaviour, browser chrome, assistive-tech gestures, or subjective craft. |
| **Human review** | Deliberate visual/art-direction inspection by a reviewer on captured states. | Real-device performance or accessibility behaviour. |
| **Real-device** | Observed behaviour on a named device, OS, browser, network condition, and build. | Coverage of other devices or browsers. |
| **Exploratory** | New/edge cases found while using the app. | A repeatable release gate until converted into an automated or scripted device check. |

All evidence identifies the commit/build revision, test data/fixture, route and
state, viewport, browser/device, colour/motion setting, network profile, date,
reviewer, and result. Screenshots/video must not contain room codes, identities,
or private hands unless an access-controlled test fixture explicitly permits it.

## 2. Screenshot and state matrix

Capture every matrix row at the baseline phone viewport (390 × 844 CSS px,
portrait, 100% browser zoom) in light-normal system settings. Rows marked
**A** must become deterministic automated visual-regression captures; **H**
requires human review; **D** requires a physical-device run. Dynamic timestamps,
network IDs, random card ordering, and build hashes must be frozen by fixtures
or narrowly masked with a documented reason. Never mask an area merely because
it is visually wrong.

| Route | Required states to capture | Evidence |
| --- | --- | --- |
| `/` startup | first visit; returning player; art loading/failure fallback; offline shell | A + H + D |
| `/identity` | empty; valid entry; validation error; long localised-style name; keyboard open | A + H + D |
| `/lobby` | empty/available; loading; refresh pending; unavailable/offline; recoverable error; populated list with long names | A + H + D |
| `/waiting-room` | no room; host and guest waiting; ready; refresh pending; disconnect/reconnect; error | A + H + D |
| `/game` | opening; active own turn; non-active turn; selected card; legal/illegal action guidance; action sheet open; confirmation; pending acknowledgement; accepted action; rejected action; reconnect/offline; developer/detail controls where exposed | A + H + D |
| `/hand-result` | normal result; tied/stock/forfeit variants; owner-only detail; public-only view; long player names and all seat counts | A + H + D |
| `/final-result` | normal final; tie/forfeit/zero-history variants; expanded history; copied state; refresh-restored summary; new-match transition | A + H + D |
| `/rules` | cached/online label; full long-form scroll; offline shell; in-page navigation/focus | A + H + D |
| `/settings` | defaults; every visual preference applied (card size, sort, contrast, marker, discard, haptics, motion); install/update states; offline shell; clear-data confirmation | A + H + D |

The following overlays and transitions are matrix dimensions, not optional
screens: menu/dialog open and closed, focus-visible, hover where available,
pressed/active, disabled, busy, selected, validation/error, success, loading,
empty, stale, offline, reconnecting, and failed network acknowledgement. For
online rows, capture both authoritative accepted state and explicitly uncertain
state; no screenshot may imply that an unacknowledged action succeeded.

### Viewport, orientation, zoom, and environment lanes

Run the full route/state matrix through the **baseline** lane. Run high-risk
game, results, settings, menu, sheet, and error states through every remaining
lane; any defect found expands coverage to its route/state family.

| Lane | Required setting | Evidence |
| --- | --- | --- |
| compact phone | 320 × 568 portrait | A + H |
| baseline phone | 390 × 844 portrait | A + H + D |
| large phone | 430 × 932 portrait, including safe-area inset | A + H + D |
| phone landscape | 844 × 390 and 932 × 430; rotate while a menu, sheet, and game action are open | A + H + D |
| tablet | 768 × 900 portrait and 1024 × 768 landscape | A + H + D |
| text/reflow | 200% text; 400% browser zoom/reflow at a 320-CSS-pixel effective width | A + H |
| virtual keyboard | short visual viewport and actual software keyboard while editing identity/settings and while a game decision is actionable | A + D |
| forced colours | `forced-colors: active`; inspect card borders, selected state, focus, icons, and status | A + H |
| high contrast | app high-contrast preference and OS high-contrast mode where the platform provides it | A + H + D |
| reduced motion | OS `prefers-reduced-motion: reduce` and in-app override | A + H + D |
| colour and scale | 125%/150% desktop scaling, Android display-size increase, and iOS Larger Text | H + D |

At every lane, there must be no horizontal page overflow, clipped critical
actions, overlap with browser/safe-area chrome, trapped focus, or inaccessible
primary decision. Rotation preserves the honest game/network state; it may
reflow the presentation but must not create, lose, or silently accept an action.

## 3. Visual-regression workflow

1. Build a production-equivalent revision with deterministic fixtures, fixed
   locale/time zone, reduced nonessential motion, stable fonts, and service
   worker policy recorded in the run.
2. Generate the required **A** captures in pinned Chromium at exact CSS
   viewport, DPR, colour scheme, motion, and forced-colours settings. Keep a
   manifest mapping each image to its matrix row and fixture.
3. Compare against approved baselines using a pixel diff plus a perceptual
   review. Set a conservative per-image tolerance only for known rasterisation
   noise; masks and tolerances are code-reviewed, documented, and visible in
   the report.
4. Treat layout movement, new clipping, missing imagery, changed hierarchy,
   unreadable text, contrast/focus loss, or a misleading state as a failure even
   when it falls below the numerical diff threshold.
5. A designer/product reviewer explicitly accepts intentional diffs. Updating a
   baseline requires before/after images, change rationale, reviewer, and
   linked issue/PR; tests never self-approve new images.
6. Re-run the affected matrix rows after every asset, CSS, component, font, or
   motion change, then run the release subset before sign-off. Archive the
   report and approved baseline revision with the release evidence.

Automated diffs are a detector, not an art director: the human review compares
visual hierarchy, tabletop atmosphere, cohesion of the night-train theme, and
whether the interface still reads as a card game at a glance.

## 4. Creative ambition gate

Creative ambition is a release requirement, not a discretionary polish score.
Human review must reject a technically compliant surface that stops at a
premium palette, generic dark-mode redesign, dashboard restyle, conventional
cards with ornament, or interchangeable route layouts.

| Gate | Required evidence | Failure |
| --- | --- | --- |
| Divergence | At least three materially different structural or presentation concepts for every approval keyframe and principal gameplay surface, plus the selection/rejection rationale. | Alternatives differ only in colour, spacing, texture, or trim; the first acceptable idea was implemented. |
| Route signatures | A route/moment map and captures showing one distinctive visual idea per major route and intentional direction for every moment named in the [creative execution directive](CREATIVE_EXECUTION_DIRECTIVE.md). | A route is an interchangeable stack of panels or a named moment is an ordinary DOM update with a generic transition. |
| Cards as hero | Face, back, court/abstract treatment, wild rank, state system, mobile fan, public piles/melds, movement continuity, input alternatives, and rejection/recovery behaviour are reviewed as one authored system. | The cards remain conventional browser rectangles with decorative styling. |
| Environmental world | Arrival, gameplay, transition, recovery, and results captures demonstrate an inhabited Midnight Limited world with purposefully varied depth and staging. | Railway motifs sit on top of an otherwise generic web interface. |
| Authored detail | The asset register and captures identify original Crazy Rummy insignia, card back, ticket/route marks, wild treatment, status/loading/empty states, event flourishes, and result presentation. | Generic libraries, stock motifs, or standard components form the primary identity. |
| Transformation depth | Side-by-side MVP and v1.1 review demonstrates changed composition, hierarchy, card anatomy, responsive staging, decorative system, and/or choreography—not only restyling. | The result is technically polished but can reasonably be described by a failure condition in the directive. |

The [creative execution directive](CREATIVE_EXECUTION_DIRECTIVE.md) is
satisfied only when the selected approach is both ambitious and reliable.
Accessibility or performance cannot be traded away to pass this gate, and
accessibility or performance cannot be invoked as a blanket justification for
generic minimalism.

## 5. Typography, cards, and compositional quality

Human review and device checks must confirm all of the following.

- A player can identify rank, suit, selected state, disabled state, and whose
  turn it is without relying on colour alone. Red/black suits, markers, and
  status retain a second cue in forced colours and high contrast.
- At the smallest supported phone width, any intentional card overlap preserves
  rank/suit recognition, focus visibility, and the full 44 × 44 CSS-pixel
  target; at the largest card-size preference, a hand remains operable by
  scroll/reflow rather than shrinking below legibility.
- Card rank/suit glyphs, button labels, score values, timers, error copy, and
  connection state are crisp at 100%, 200% text, 400% reflow, and device text
  scaling. No essential label is image-only or truncated without an accessible
  full name.
- Type roles are visibly distinct (display, section, body, metadata, control)
  but not decorative noise. Line length, wrapping, leading, and contrast allow
  unhurried reading on phone and tablet.
- The visual focal point follows the current task: active game decision before
  ornament, result before history, error/reconnect status before optional
  controls. Empty/loading/error screens retain the same hierarchy and polish.
- Art, texture, and effects support content rather than impairing contrast,
  reading, tap precision, battery life, or offline startup. There are no
  placeholder assets, broken-image icons, unlicensed assets, or text baked into
  art where it must localise/scale.

Automated checks enforce token contrast (WCAG AA for normal text), visible
focus, target sizes, overflow, and semantic labels. Human and real-device
review decides whether those minima still look balanced, premium, and legible.

## 6. Motion truthfulness and frame pacing

Motion only confirms an event that the UI can honestly claim: local selection,
opening/closing an overlay, or an authoritative accepted game action. Pending,
rejected, offline, and uncertain online actions use distinct stable feedback;
they must not animate cards, scores, or turn ownership as if the server/peer
had accepted them. Cancellation, retry, reconnect, and background/foreground
return leave the shown state truthful.

| Gate | Automated evidence | Human / real-device evidence |
| --- | --- | --- |
| Motion contract | Assert reduced-motion media and explicit preference collapse nonessential transitions and prevent accepted-state animation for pending/rejected/uncertain fixtures. | Confirm the remaining feedback is understandable without motion and no transition hides a state change. |
| Timing | Record animation start/end and interaction-to-feedback timing in deterministic browser tests. | On named mid-range Android and current iPhone, film/trace a game turn, menu, sheet, results, reconnect, and rotation. Target immediate feedback (normally within 100 ms for a local accepted input), stable 60 Hz pacing where hardware supports it, and no sustained visibly juddering or input-blocking sequence. |
| Frame health | Collect a production-build performance trace for the scripted flows; flag long tasks, layout thrash, and repeated full-screen paints during card interaction. | Review dropped-frame indicators/video and device thermal behaviour after a 10-minute match. A trace is diagnostic evidence, not a substitute for the observed run. |

Do not add perpetual decorative motion, autoplay video, or particle effects
unless it has an explicit reduced-motion/offline/battery behaviour and passes
the same frame and loading gates.

## 7. Asset, loading, and resilience budgets

These are V1.1 release budgets. Measurements use production output, compressed
transfer size (Brotli where served), plus uncompressed decoded image cost and
runtime requests. A budget breach is P1 unless an approved exception explains
the player benefit, affected devices, and remediation date.

| Budget | Limit / rule |
| --- | --- |
| Critical first paint | HTML, critical CSS/JS, fonts, and immediately visible startup art: **≤ 450 KiB compressed** on a cold load. |
| Initial app shell | All resources needed to reach usable startup/lobby without entering a match: **≤ 1.0 MiB compressed**. |
| Optional/route art | Lazy-load outside the first screen; each route’s newly required art: **≤ 500 KiB compressed** unless it replaces a larger prior payload. |
| Images | Use local SVG/CSS for simple UI graphics; responsive raster dimensions; no unused variants; decoded image memory and DPR variants reviewed. No external paid CDN or runtime image-generation dependency. |
| Fonts | Prefer system stack. If a custom font is retained, subset it, preload only the required face, provide metric-compatible fallback, and keep total font transfer **≤ 100 KiB compressed**. |
| Network | No render-blocking third-party tracker, font host, analytics, or art fetch. A failed optional asset shows a designed fallback and must not block play. |
| Cache | Versioned PWA cache includes the offline shell and required local art only; never cache private hands, tokens, room/match data, or unbounded responses. |

Test cold and warm cache on throttled Fast 3G and an intentionally unreliable
profile (latency, loss, offline transition). The app must expose loading,
offline, reconnect, and retry states without layout shifts that move a primary
action under the player’s finger. Online play must say it is unavailable or
uncertain rather than presenting stale lobby/game data as current.

## 8. Accessibility, PWA, browser, and device gates

### Accessibility

- Preserve semantic headings, landmarks, labelled controls, logical DOM and
  keyboard order, skip link, visible focus, modal focus entry/containment/return,
  and Escape/back behaviour already covered in the Phase 7 boundary.
- Verify every graphics/UI overhaul state with keyboard only and with a screen
  reader: NVDA + Firefox or Chrome on Windows, VoiceOver + Safari on iPhone,
  and TalkBack + Chrome on Android. Test cards, action sheet, menus, results,
  connection announcements, validation, and update/install controls.
- Meet WCAG 2.2 AA as the minimum: contrast, reflow, text spacing, target size,
  orientation, status messages, and no colour-only instruction. Human review
  confirms that announcements are concise, non-duplicative, and do not expose
  owner-only detail.

### Offline and installable PWA

- Install/relaunch on Android Chrome and iPhone Safari where supported; record
  standalone appearance, icon/maskable icon, splash/first screen, portrait
  behaviour, update prompt/reload, and storage-clearing result.
- From a warm cache, disable networking and relaunch `/`, `/rules`, `/settings`,
  and a completed-result summary. Required local art and copy load; online
  functions are explicitly unavailable/reconnecting; no private session data is
  resurrected.
- Verify update from an older cached revision to V1.1: the player sees a clear
  update choice, one controlled reload occurs, cache cleanup completes, and no
  in-progress match is falsely represented as recovered.

### Browser and physical-device release set

Automated browser evidence: current pinned Playwright Chromium on the full
matrix subset, plus current Firefox and WebKit smoke screenshots where the test
environment supports them. Human physical-device evidence, minimum one current
browser each: iPhone Safari, iPhone installed PWA, mid-range Android Chrome,
Android installed PWA, and desktop Chrome/Edge. Record exact model, OS,
browser version, DPR, display scale, colour/motion setting, and whether the
device was cold/warm and online/offline. A simulator/emulator is useful for
reproduction but cannot close an iOS/Android real-device gate.

The mandatory constrained-phone lanes are:

- **Android performance floor:** a physical ARM64 phone with no more than 4 GB
  RAM, a 60 Hz display, and a Snapdragon 695, Dimensity 700, Exynos 1280, or
  slower supported-equivalent performance class. It must run the oldest
  Android major that the release declares supported and the current Chrome
  available for that OS.
- **iPhone performance floor:** a physical 60 Hz, A13-class device with no more
  than 4 GB RAM, such as an iPhone 11 or iPhone SE (2nd generation), or a
  slower supported equivalent. It must run the oldest iOS major that the
  release declares supported and the current Safari available for that OS.

Before Stage 7 starts, the release record must name the exact oldest supported
Android and iOS majors and the exact devices assigned to these lanes.
“Modern,” “current,” emulated, or flagship-only coverage cannot close the
gate. A more capable replacement may be used only if the owner first approves
a documented change to the supported-device floor; faster devices may
supplement, but never substitute for, constrained-floor evidence.

## 9. Triage, roles, and release sign-off

| Severity | Definition | Release treatment |
| --- | --- | --- |
| **P0 — stop ship** | Crash, blank/broken critical UI, unavailable primary action, privacy leak, card/game state shown falsely, inaccessible blocker, data loss, or offline/update failure that strands a player. | Must be fixed and re-verified on the affected automated and real-device lanes. |
| **P1 — release blocker** | Material visual regression or creative underreach: clipped/overlapping content, illegible cards/text, focus/contrast/reflow failure, jank affecting play, budget breach, broken responsive/orientation state, inconsistent art direction, missing route signature, generic card system, absent divergence evidence, or a principal surface that meets a creative failure condition. | Must be fixed or have a written, time-bound exception approved by product, design, and engineering. |
| **P2 — fix before/after launch as scheduled** | Noticeable but non-blocking polish defect with a clear workaround and no loss of truthfulness/accessibility. | Logged with owner and target; reviewed in release risk. |
| **P3 — backlog** | Minor cosmetic inconsistency with no meaningful effect on comprehension, play, access, or performance. | Logged; does not block sign-off. |

Review roles are deliberately separate: engineering owns deterministic fixtures,
build/budget reports, automated gates, and defect fixes; design/product owns art
direction and intentional baseline approval; accessibility review owns keyboard,
screen-reader, contrast, and motion findings; QA owns matrix completeness,
device/network evidence, and severity consistency. The release owner may sign
only after each role supplies its evidence or documented exception.

The final release record contains:

- commit SHA/build revision and changelog of visual assets/tokens/components;
- automated command outputs and screenshot-diff manifest, including all
  approved masks/tolerances and baseline-review links;
- human-review contact sheet for every route/state family and approved diffs;
- the directive's creative-coverage record, including divergence boards,
  selection/rejection rationale, route/moment signature map, card behaviour
  mapping, environmental dispositions, original-asset provenance, and every
  justified reduction in spectacle;
- real-device matrix with device/OS/browser/network/settings, screenshots or
  short recordings, performance traces, and PWA install/offline/update results;
- measured asset/loading budget report for cold and warm cache;
- accessibility findings and screen-reader/keyboard evidence;
- open P2/P3 issues and any signed P1 exception, each with owner/date; and
- dated approvals from engineering, design/product, accessibility, QA, and the
  release owner.

Absence of evidence is a failed gate, not an implied pass.

The owner retains final authority over whether the result has pushed the boat
out sufficiently. Automated checks, completed work packages, technical
compliance, and a numerically green matrix do not override that judgement.

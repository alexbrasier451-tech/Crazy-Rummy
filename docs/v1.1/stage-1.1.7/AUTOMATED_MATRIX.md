# Stage 1.1.7 automated matrix

## Production-route lane

Each row is captured at 320 × 568, 390 × 844, and 768 × 900 in pinned headless
Chromium, DPR 1, `en-GB`, Europe/London, with service workers blocked.

| Route | Deterministic state | Required signature |
| --- | --- | --- |
| `/` | First visit | `.v11-arrival-route` |
| `/identity` | Empty identity | `.v11-identity-ticket` |
| `/lobby` | Offline/empty lobby | `.v11-lobby-threshold` |
| `/waiting-room` | No confirmed room | `.v11-waiting-empty` |
| `/game` | Local opening phase | `.game-compartment-table` |
| `/hand-result` | Result not authoritative yet | `.result-unavailable-ticket` |
| `/final-result` | Final result not authoritative yet | `.result-unavailable-ticket` |
| `/rules` | Full reference | `.rules-timetable` |
| `/settings` | Default device settings | `.settings-ticket` |

These are safe deterministic empty/local states. They do not replace the full
normal/error/loading/result variants required by the release plan.

## High-risk lanes

| State | Viewport | Environment | Automated truth |
| --- | --- | --- | --- |
| Selected local card | 390 × 844 | Reduced motion | Selection remains visible without transform or meaningful transition duration |
| Selected local card | 390 × 844 | Forced colours | Card boundary remains visible at 2 px or greater |
| Opening-discard decision bench | 320 × 568 | Normal | Sheet signature exists; primary/card targets and horizontal reflow remain valid |
| Online opening discard pending | 390 × 844 | Deterministic authenticated fixture | Command is queued, host revision remains 1, network mode says pending |
| Same online command accepted | 390 × 844 | Deterministic authenticated fixture | Player view reaches revision 2 and last action says accepted before capture |

## Not automated by this harness

The following required `A` rows still need purpose-built deterministic fixtures:

- startup art failure and warm-cache offline shell;
- identity validation, long-name, and keyboard-open states;
- lobby populated/loading/refresh/error variants;
- waiting-room host/guest/ready/reconnect/error variants;
- game non-active, invalid, rejected, uncertain, reconnect, and result-ready
  variants in the production build;
- hand-result and final-result normal/tie/stock/forfeit/history variants;
- every settings preference, update/install, clear-data confirmation, and
  offline relaunch state;
- 430 × 932, both landscape lanes, 1024 × 768, 200% text, 400% reflow,
  virtual-keyboard, app high-contrast, Firefox, and WebKit lanes;
- unreliable-network traces and frame-health traces.

Absence from this first automated subset is recorded as missing evidence, never
as an implied pass.

Asset/loading budget evidence is recorded separately by Stage 1.1.6 and passes
all declared limits.

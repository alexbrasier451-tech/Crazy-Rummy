# Stage 1.1.3 verification

**Runtime:** bundled Node 24 at
`C:\Users\alexb\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`

| Check | Result |
| --- | --- |
| `node --test --test-isolation=none tests/unit/stage1-1-3-pregame-contract.test.mjs` | Passed: 2/2 |
| `node --test --test-isolation=none "tests/unit/*.test.mjs"` | Passed after integration: 268/268 |
| `node tests/browser/stage1-1-3-pregame.mjs` | Passed: healthy lobby/waiting composition, 390 px containment, 320 px reduced-motion and forced-colour treatment |
| `$env:CRAZY_RUMMY_CAPTURE_PREGAME='1'; node tests/browser/stage1-1-3-pregame.mjs` | Passed and regenerated six route/adaptive captures under `captures/` |
| `node tests/browser/online-lobby.mjs` | Passed: existing open/closed create, join, ready, host start, copy, compatibility, and single-flight acceptance |
| `node node_modules/vite/bin/vite.js build` | Passed |
| `node tests/browser/smoke.mjs` | Passed after the controller updated the retired splash assertion to the registered v1.1 wordmark and 13-stop arrival route. |

## Integration result

`src/styles/v11-pregame.css` is imported after the shared foundation layer in
`src/styles/index.css`.

The foundation package supplies and the integrated route uses
`public/assets/brand/crazy-rummy-wordmark.v1.svg`. The visible wordmark text and
route composition remain an honest fallback if the SVG cannot load.

# Stage 1.1.2 asset and loading budget

## Release budgets

| Budget | Gate |
| --- | ---: |
| Critical first paint compressed | ≤ 450 KiB |
| Usable startup/lobby shell compressed | ≤ 1.0 MiB |
| New route art compressed | ≤ 500 KiB per route |
| Fonts compressed | ≤ 100 KiB |
| Single decorative asset | ≤ 250 KiB without exception |

## Foundation forecast

The five new first-party SVGs total 4,683 uncompressed bytes. No font, audio,
video, runtime generation, CDN, or third-party visual request is introduced.
All individual foundation assets are below 2 KiB.

The previous 2,068,701-byte splash alone breached the single-asset limit and
could not fit the initial shell budget. It is now quarantined outside `public/`.
Runtime compositions use SVG/CSS and retain solid-colour/text fallbacks.

Measured production output and compressed transfer evidence are refreshed
after Stage 1.1.6 integration; this file is a Stage 1.1.2 forecast, not that
later measurement.

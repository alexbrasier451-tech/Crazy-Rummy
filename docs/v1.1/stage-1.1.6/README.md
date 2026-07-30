# Stage 1.1.6 — motion, feedback, and performance reconciliation

**State:** Integrated and automatically verified on 30 July 2026.

## Implemented controls

- Existing accepted-feedback coordination remains the only presentation path
  for card/event travel. Pending, rejected, uncertain, offline, and missing
  target outcomes do not play accepted motion.
- CSS and Web Animations reduced-motion paths collapse travel and spring
  behaviour to immediate state plus at most an 80 ms opacity response.
- `src/app/quality.js` applies a deterministic `data-quality="degraded"` mode
  for data-saving requests. The token/foundation layer removes texture,
  reflection, and blur before changing interaction or information.
- `tools/report-v11-budgets.mjs` measures Brotli-equivalent transfer, total
  shell bytes, font bytes, route-art bytes, and the largest decoded decorative
  asset against the release budgets.

## Integrated measurement

The final production build passes every declared transfer and decorative
budget. `MEASURED_BUDGET.json` records the machine-readable result:

| Budget | Measured | Limit |
| --- | ---: | ---: |
| Critical first paint, Brotli-equivalent | 99,564 bytes | 460,800 bytes |
| Initial shell, Brotli-equivalent | 345,523 bytes | 1,048,576 bytes |
| Route art, Brotli-equivalent | 3,055 bytes | 512,000 bytes |
| Fonts, Brotli-equivalent | 0 bytes | 102,400 bytes |
| Largest decorative asset, decoded | 1,434 bytes | 256,000 bytes |

The integrated visual matrix covers accepted and pending authority, reduced
motion, forced colours, compact resize, and route changes. The broader
transport and gameplay suites cover rejected, uncertain, reconnect, and
accepted state reconciliation. Physical-device timing remains a Stage 1.1.7
external release gate.

Sound is not included. Haptics remain optional, user-controlled, nonessential,
and paired with visible/announced accepted feedback.

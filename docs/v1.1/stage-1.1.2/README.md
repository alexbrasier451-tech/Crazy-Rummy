# Stage 1.1.2 — foundations and asset production

**Direction:** Owner-approved Compartment Table  
**Controller date:** 30 July 2026  
**Implementation state:** Production foundation implemented; immutable Git
baseline and final release approval remain external gates.

## Delivered

- Semantic material, decision, motion, depth, texture, and z-order roles in
  `src/styles/tokens.css`, including increased-contrast, forced-colour,
  reduced-motion, reduced-data, and degraded-quality paths.
- A shared Midnight Limited material layer in
  `src/styles/v11-foundations.css`.
- Five compact first-party SVG masters/runtime assets: route wordmark, authored
  card back, wild seal, baize fibre, and thirteen-stop terminus.
- A hash-pinned production asset register and empty third-party notice record.
- Build-time provenance validation through the Vite `buildStart` gate plus the
  explicit `pnpm validate:v11-assets` command.
- Quarantine of the 2,068,701-byte illustrated legacy splash. It remains
  recoverable in `art/_incoming/` but no longer enters production output.

## Font decision

No custom font binary is shipped in Stage 1.1.2. The display stack prefers
Barlow Condensed when locally available, then metric-tolerant condensed system
faces; functional copy remains on the system UI stack. This keeps the font
transfer at 0 KiB, preserves offline/fallback layout, and avoids admitting an
unverified font source. A future self-hosted subset must include its exact OFL
file and register row before use.

## Evidence

- [Semantic token map](SEMANTIC_TOKEN_MAP.md)
- [Asset and loading budget](PERFORMANCE_BUDGET.md)
- [Baseline reconciliation status](BASELINE_RECONCILIATION.md)
- [Production asset register](../ASSET_REGISTER.csv)
- [Third-party notices](../THIRD_PARTY_NOTICES.md)

Focused automated evidence is implemented in
`tests/unit/v11-foundations.test.mjs`.

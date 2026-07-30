# Stage 1.1.1 initial asset register

**Scope:** Concept evidence only. No row is approved for production integration.  
**Runtime rule:** No CDN, remote font, stock motif, or external runtime
dependency.

| Asset ID | Concept source | Format / method | Origin and licence | Status / fallback |
| --- | --- | --- | --- | --- |
| `stage1-route-node` | Prototype CSS/SVG geometry | CSS borders and inline text node | Original project work; repository licence applies | Concept-only; plain line/node fallback |
| `stage1-compartment-lens` | Prototype CSS | Gradients, borders, shadows | Original project work; no external source | Concept-only; solid outlined field fallback |
| `stage1-ticket-perforation` | Prototype CSS | Repeating radial/linear gradients | Original project work; no external source | Concept-only; dashed edge fallback |
| `stage1-card-face` | Prototype DOM/CSS | Warm stock, rank/suit text, keyline | Original project work; conventional suit glyphs | Concept-only; plain bordered text card fallback |
| `stage1-card-back` | Prototype DOM/CSS | Mirrored double-rail lattice | Original project work informed by approved brief | Concept-only; solid back + `CARD` label fallback |
| `stage1-wild-seal` | Prototype DOM/CSS | `WILD` text, route star, double edge | Original project work | Concept-only; `WILD` text + double border fallback |
| `stage1-seat-plaque` | Prototype DOM/CSS | Named marker/count/state shape | Original project work | Concept-only; semantic list item fallback |
| `stage1-signal-rail` | Prototype DOM/CSS | Labelled connection edge and timer space | Original project work | Concept-only; bordered status text fallback |

## Candidate production asset plan

If the owner approves Compartment Table, Stage 2 should author and register:

1. Crazy Rummy route-node wordmark: horizontal, compact, monochrome, and
   maskable SVGs.
2. Midnight double-rail card-back master: normal, small, anonymous-deal, and
   forced-colour SVG variants.
3. Warm-stock card face anatomy and `WILD` route seal/state system.
4. Original baize fibre, enamel edge, ticket paper, and perforation masters with
   no baked-in interface text.
5. Seat-marker, current-turn, connection/reconnect, and route-station symbols.
6. An optional low-opacity abstract window reflection only if keyframe review
   proves it adds depth; CSS/SVG absence remains the required fallback.

For every production row record source/runtime paths, author/origin, licence and
URL, creation time, modifications, AI tool/model/prompt hash where applicable,
reviewer, approval issue/PR, lowercase SHA-256, fallback, and lifecycle status.

## Explicit exclusions

- `public/art/crazy-rummy-splash.v1.png` is not carried into the recommended
  direction. It is a roughly 2 MB literal carriage/character scene, conflicting
  with the abstract no-character direction and the first-paint budget.
- Existing `public/art` SVGs are candidate raw material only until their origin,
  licence, modifications, hashes, and approval are recorded.
- No generated raster image was needed for Stage 1.1.1. The source boards are
  intentionally browser-rendered so text, fixtures, forced colours, responsive
  structure, and provenance remain deterministic.

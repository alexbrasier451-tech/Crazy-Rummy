# v1.1 Graphics Overhaul — Zero-Budget Toolchain

**Research date:** 29 July 2026  
**Decision:** ship the v1.1 visual refresh with locally-owned source assets, open licences, and no paid service in the production path. Prices, quotas, plan features, terms, and licences can change: recheck each source and record the result in the asset register immediately before adoption or release.

This is a production plan for a premium-feeling web/PWA card game UI. “AAA” here means deliberate art direction, coherent motion, high-quality typography, tactile interaction, and ruthless QA—not expensive services or untraceable assets.

## 1. Non-negotiable rules

1. **No paywall dependency.** A build, release, or source-asset edit must not require a paid plan, a trial, a credit balance, a hosted AI generation quota, or a proprietary export format.
2. **Own the source.** Keep editable SVG, source raster, blend/source files, prompts, and licence evidence in the repository or its documented release archive; deploy only derived, optimized files.
3. **License before use.** A visual is not eligible for the game until its source URL, licence, exact version/download date, author, modifications, and reviewer are recorded.
4. **Design in tokens.** Colour, type, spacing, radius, elevation, timing, and motion-easing choices have named tokens. Components consume tokens; screens do not introduce private magic numbers.
5. **Readable play beats spectacle.** Keep cards, score, turn state, focus state, and actions legible at 320 CSS px, 200% zoom, keyboard-only use, reduced motion, and a low-end mobile GPU.

## 2. Chosen zero-budget production path

| Need | Primary (critical path) | Output / rule | Optional, never required to ship |
| --- | --- | --- | --- |
| Art direction, boards, components | **[Penpot](https://penpot.app/)** | Open design file; token sheet; annotated board exports. Penpot documents responsive UI, prototyping, components, design tokens, and open formats; its [Professional cloud plan](https://penpot.app/pricing) is currently listed at $0 with unlimited design files. | Figma Starter only as a personal/shared *review* surface; see §3. |
| Vector UI, card faces, badges, masks | **[Inkscape](https://inkscape.org/)** | Hand-authored `svg` source; clean paths, no raster surprise. Inkscape itself is GPL, while files created/exported remain the creator’s work. | Penpot exports for simple vectors. |
| Icons | **[Lucide](https://lucide.dev/)** or bespoke SVG | Pin icon name/version; retain required notices. Lucide is ISC, with a documented subset derived from Feather/MIT. | None; do not mix icon styles from random packs. |
| Game placeholders / generic props | **[Kenney](https://kenney.nl/support)** only where visually suitable | Treat each download as a versioned third-party import. Kenney asset pages are CC0; retain provenance anyway. | Original art made in Inkscape/Blender. |
| 3D-generated accent renders | **[Blender](https://www.blender.org/)** | Store `.blend`, texture/source provenance, render preset, and flattened PNG/WebP output. Blender is GPL/free and open source. | Use only for hero/table dressing, never a required gameplay affordance. |
| UI sounds / cleanup | **[Audacity](https://www.audacityteam.org/)** | Store editable WAV source, then derive compressed runtime audio. Audacity is free/open source. | Procedural Web Audio for simple clicks/shuffles. |
| Type | **[Google Fonts](https://fonts.google.com/)**, self-hosted | Pin family, axes/weights, licence file and subsets; serve `.woff2` locally. Google says its catalog is open-source and commercially usable under the family licence (commonly [SIL OFL](https://openfontlicense.org/open-font-license-official-text/), with some Apache/Ubuntu licences). | System stack for fallback only. |
| Image exploration / bespoke concepts | **Codex ImageGen** | Treat output as a concept/source candidate; record prompt, model/date, seed/reference details if exposed, review and transform before use. | Manual illustration; no release is blocked on generation. |
| Implementation/review history | **GitHub** | Issues/PRs hold a visual-change checklist, screenshot evidence, source links, and review decision. | GitHub Actions only where existing project capacity allows. |
| Static preview / playtest build | **[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)** | Public beta/demo only; current published-site cap is 1 GB, soft bandwidth limit is 100 GB/month, deployments time out after 10 minutes. | Local Vite preview for all development. |
| Visual regression and interaction checks | **Codex in-app browser testing** | Capture desktop/mobile/keyboard/reduced-motion evidence against named acceptance scenarios. | Manual devices supplied by the team. |

### Why this stack

Penpot is the design-system source of truth because it is open source, supports tokens/components/prototypes and produces open standards. Inkscape and Blender make export ownership straightforward. GitHub stores the decision trail, and the browser validates the thing players actually receive. Every selected tool has a free use path that does not need a subscription to edit or export the project.

## 3. Codex capability use

| Capability available here | Use in the overhaul | Boundary |
| --- | --- | --- |
| GitHub | Track visual work by component/screen, require before/after screenshots in PRs, review the asset register, and publish the approved static preview. | GitHub Pages is a demo/beta host, not a promise of unlimited commercial hosting; observe its current limits and terms. |
| Canva | Use only for disposable mood-board composition or social/share artwork **when its current free-plan export and source terms are rechecked**. Export non-proprietary PNG/SVG and register any third-party element. | It is not the authoritative design source, asset store, or critical export tool; do not rely on Pro-only assets/templates. |
| ImageGen | Generate card-table mood, abstract texture studies, and original decorative concept variants that are then art-directed, cleaned, and registered. | No automatic import to `public`; no copyrighted characters, logos, brand trade dress, or “in the style of living artist” prompts. A human approves every result. |
| In-app browser testing | Test functional PWA UI at target breakpoints; inspect focus, touch targets, colour contrast, performance and motion settings; attach screenshots/video to the PR. | It tests the rendered build, not licence ownership or aesthetic judgement. |
| Figma (recommended plugin, **not installed**) | Do **not** install or invoke it for v1.1. The documented Starter plan can be considered only in a later, separately approved evaluation. | It is excluded from the critical path. Its free Starter limits include one team/project and three Design/Sites files, 30-day history and no Dev Mode/team libraries; see [Starter overview](https://help.figma.com/hc/en-us/articles/13838684089751-Starter-plan-overview) and [pricing FAQ](https://www.figma.com/pricing-faq/). |

## 4. Art-production workflow

1. **Brief a surface, not an isolated asset.** Define player action, platform, visual hierarchy, contrast/motion constraints, token references, and acceptance screenshot(s).
2. **Make the system first.** In Penpot, establish the v1.1 palette, type scale, spacing, elevation, radii, component states, icon stroke/size rules, and motion curves. Prototype a complete turn loop before detailed decoration.
3. **Author/import into a quarantine area.** New assets enter `art/_incoming/` with a register row and licence evidence. Nothing from `_incoming` is referenced by the app.
4. **Create production source.** Normalize the approved visual in `art/source/`; keep linked vectors and 3D/audio source files. Prefer original shapes, gradients, grain, masks, shadows, and small looped motion over stock imagery.
5. **Export deterministically.** Run the conventions in §8, review at 1x and 2x, then place approved runtime derivatives under `public/assets/`.
6. **Integrate from tokens/components.** Use a small composable scene layer (table, card, effects, HUD) rather than individual screen-specific visual rules.
7. **Validate and release.** Browser-test the scenarios in §9, check the register, then link the PR/release revision.

## 5. Asset provenance and register

Maintain `docs/v1.1/ASSET_REGISTER.csv` when implementation begins. It is a release gate, not optional paperwork. One row per imported or generated source, plus a row for a substantial derivative. Do not replace a row when an upstream file changes—supersede it and preserve the earlier evidence.

```csv
asset_id,display_name,kind,usage,source_path,derived_paths,origin_type,source_url,creator,licence,licence_url,downloaded_or_created_utc,upstream_version_or_commit,modifications,ai_tool_and_model,ai_prompt_or_brief_hash,third_party_inputs,rights_reviewed_by,rights_reviewed_utc,approval_pr_or_issue,content_hash_sha256,status,notes
ui-icon-sort-asc-001,Sort ascending,svg,settings action,art/source/icons/sort-asc.svg,public/assets/icons/sort-asc.svg,third-party,https://github.com/lucide-icons/lucide,Lucide Icons and Contributors,ISC plus Feather/MIT notice where applicable,https://github.com/lucide-icons/lucide/blob/main/LICENSE,2026-07-29T00:00:00Z,vX.Y.Z,stroke normalized to 1.75,,,,,reviewer-name,2026-07-29T00:00:00Z,#123,sha256:...,approved,notice copied to THIRD_PARTY_NOTICES.md
```

Minimum review questions:

- Is the source actually from the stated publisher, and is the exact asset/version identified?
- Is the licence compatible with current and possible commercial distribution? Are attribution/notice, font-name, share-alike, or trademark conditions met?
- Does an AI output include a recognizable person, logo, character, brand trade dress, copied composition, unlicensed input, or a misleading claim of ownership? If yes, reject or obtain legal clearance.
- Are all source files and required notice texts available in the repository/release archive?

### Licence policy

- **Preferred:** first-party work, CC0, ISC/MIT/Apache-2.0 code/SVG, and individual open font licences whose required text is retained.
- **CC0:** it is a public-domain dedication, not a licence. It permits broad reuse, but does not solve trademark, privacy, personality, patent, or provenance risk. Keep source credit as a professional courtesy and verify the uploader’s authority. See [Creative Commons’ CC0 explanation](https://creativecommons.org/public-domain/) and [legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en).
- **Fonts:** record the licence contained with the exact downloaded family. Do not assume every “free font” is embeddable. [Google Fonts’ FAQ](https://developers.google.com/fonts/faq) says catalog fonts are open source and may be used commercially, subject to their licences; [SIL’s FAQ](https://software.sil.org/fonts/faq/) describes OFL use and bundling.
- **Never admit without written approval:** “free for personal use,” editorial-only, unknown/absent licence, ripped game assets, scraped image-search results, trademarked logos, or licences with conditions the project cannot meet.

This guide is operational guidance, not legal advice. Escalate uncertain rights, performer likeness, children, brands, or jurisdiction-specific questions to the project owner/legal adviser before use.

## 6. AI generation guardrails

ImageGen is a creative accelerator, not a licence shortcut or final art department.

- Prompt for original art direction: materials, lighting, camera, colour, geometry and game context—not a named studio, franchise, living artist, product, or recognizable character.
- Use no third-party reference image unless its register row documents permission/licence and its use is compatible with the generation service and project release.
- Keep the prompt/brief hash, generation date/tool/model (when available), original output hash, crop/paint-over/vectorization steps, reviewer and final derivative links in the register.
- Treat generated raster as a draft: remove accidental text/logos, inspect at full resolution, rebuild UI glyphs as original vectors, and ensure game-critical information never depends on decorative AI art.
- Do not represent generated work as hand-illustrated, exclusive, trademark-cleared, or copyrightable beyond what has actually been established.
- A deterministic fallback must exist: CSS/SVG table materials, gradients, procedural grain, and original card UI ship if generation is unavailable or rejected.

## 7. Repository pipeline and naming

```text
art/
  _incoming/                  # quarantined imports; never referenced at runtime
  source/
    ui/                       # Penpot exports / authored SVG source
    icons/                    # one named icon source per file
    textures/                 # master PNG/TIFF or procedural source
    3d/                       # .blend and only cleared texture inputs
    audio/                    # edit/master WAV and project files
  exports/                    # reproducible reviewed outputs, not application imports
public/assets/
  ui/ icons/ cards/ textures/ audio/  # optimized runtime derivatives only
docs/v1.1/
  ASSET_REGISTER.csv
  THIRD_PARTY_NOTICES.md
  ZERO_BUDGET_TOOLCHAIN.md
```

Use lowercase kebab-case and semantic names: `table-felt-grain-dark-2048.webp`, `card-back-midnight-lattice-v03.webp`, `icon-sort-ascending.svg`, `sfx-card-place-01.ogg`. Never use `final`, `final2`, dates as the only version marker, or unnamed downloads. Revisions live in source metadata/Git and the register; only add `-vNN` when parallel art directions must coexist.

## 8. Export and optimization conventions

| Asset | Source | Runtime export | Rules |
| --- | --- | --- | --- |
| UI/icon | SVG | sanitized SVG, inline or file | ViewBox required; remove editor metadata, hidden layers, unused defs and embedded rasters; use `currentColor` where appropriate; test at 1x/2x/3x. |
| Cards / hero art | lossless master | WebP primary; PNG fallback only if transparency/quality demands it | Export dimensions based on largest displayed CSS size × 2; do not upscale in CSS; preserve a master outside `public`. |
| Texture | seamless master/procedural recipe | small tiled WebP/AVIF where supported | Prefer 128–512 px tile or CSS gradient/noise; avoid full-screen photographic bitmaps; validate seams and visual noise behind text. |
| 3D accent | `.blend` + source inputs | pre-rendered WebP sequence/still | No runtime 3D engine required; bake lighting; offer a static/reduced-motion fallback. |
| Type | original family files | subset `.woff2` | Pin family/version/licence; include only used scripts/weights/axes; `font-display: swap`; provide system fallbacks. |
| Sound | 48 kHz WAV master | Ogg/Opus or browser-supported compressed derivative | Mono for UI SFX; loudness-normalize consistently; respect user volume/mute; no autoplay-dependent game feedback. |

Budget targets are gates, not aspirations: an initial gameplay route should aim for **≤1.5 MB compressed visual/audio payload**, no single decorative asset above **250 KB** without a written exception, and no nonessential animation that harms first interaction. Recheck real build output with browser network tools; optimize the biggest delivered bytes first.

## 9. Visual quality go/no-go matrix

| Gate | Go when | No-go / required response |
| --- | --- | --- |
| Art system | Tokens and component states cover table, card, HUD, modal, loading, empty/error, and settings states. | A screen invents colour/type/spacing or uses an unapproved icon style: return to system work. |
| Gameplay clarity | Current turn, legal/disabled actions, selected cards, score, and primary action are obvious without colour alone. | Any state is ambiguous in a 10-second cold look: redesign hierarchy and add text/shape cues. |
| Accessibility | Keyboard focus is visible; contrast and zoom checks pass; targets are practical; reduced-motion uses a calm equivalent. | Focus is hidden, content clips at zoom, or motion communicates essential state: block merge. |
| Performance | Target route meets payload budget and stays responsive on mobile-size viewport; idle animations are bounded. | Asset weight, decode, or animation causes visible jank: compress, simplify, or remove before approval. |
| Rights | Every runtime visual/audio/font has an approved register row and required notice. | Unknown source, unclear terms, unrecorded generated output, or missing required notice: quarantine/remove. |
| PWA resilience | Offline/cached launch shows an intentional visual fallback; no critical gameplay art is a remote hotlink. | Remote CDN asset is essential or a missing asset produces broken UI: package a local fallback. |
| Cross-browser evidence | In-app browser captures cover desktop, 320 px mobile, keyboard path, and reduced motion for the changed flow. | Evidence is absent or reveals regression: fix and recapture before merge. |

## 10. Explicit exclusions from the critical path

- Paid Figma seats, Dev Mode, AI-credit add-ons, paid templates, or Figma-specific export workflows. Figma Starter is a constrained free option, but it is neither installed nor required; assess its current [pricing](https://www.figma.com/pricing/) and Starter limits only if a later decision proposes it.
- Canva Pro assets, paid stock libraries, marketplace bundles, subscription fonts, commissioned/marketplace plugins, and “free trial” tools that can lock source files or exports.
- Paid image/video/audio generation, credit-based APIs, and tools whose free quotas, commercial rights, training terms, or output rights are unclear. They may be explored outside delivery only after a separate written cost/licence decision.
- Hosted game backends, CDN/image transformation services, analytics, or asset APIs required to make the visual layer load. They introduce operating cost, privacy, or availability risk and are outside this graphics plan.
- Scraped social images, screenshots of other games, fan art, trademarked logos, and lookalike/ripped packs regardless of whether a download costs money.

## 11. Adoption checklist

Before accepting a tool or asset source, answer “yes” to every item:

- It has a documented zero-cost path for the required production function today.
- The team can keep editable output and required evidence without a paid account.
- Its current terms/licence have been checked, recorded, and are compatible with intended distribution.
- It has a local/open fallback if the service changes price, becomes unavailable, or revokes a quota.
- It does not add a runtime network dependency.
- A named owner will maintain its source, notices, and upgrade/recheck record.

If any answer is “no” or unknown, keep it out of v1.1’s critical path.

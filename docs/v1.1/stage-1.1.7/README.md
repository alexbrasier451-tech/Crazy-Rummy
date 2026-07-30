# Stage 1.1.7 — Automated visual and release evidence

Stage 1.1.7 adds a deterministic Chromium capture harness for the v1.1
presentation. It is an **automated evidence generator**, not an approved visual
baseline, physical-device result, accessibility sign-off, or creative
acceptance decision.

## Run

Use the repository's bundled Node runtime and provide a fresh output directory:

```powershell
& $nodeExe tests/browser/v11-visual-matrix.mjs --out C:\tmp\crazy-rummy-v11-evidence
```

The harness:

1. builds the application with a fixed PWA revision;
2. serves the production output locally;
3. captures all nine routes at 320 × 568, 390 × 844, and 768 × 900;
4. captures selected gameplay under reduced motion and forced colours;
5. captures the compact decision sheet;
6. uses the existing deterministic three-seat fixture to capture a
   player-scoped pending command and its accepted revision;
7. writes PNG files plus `v11-visual-matrix-manifest.json`.

The caller owns the output directory. The harness deletes only its exact
expected filenames from that directory. It refuses repository/filesystem roots,
the approved Stage 1.1.1 export directory, and paths named as baselines.

## Automated assertions

Every applicable capture asserts:

- expected route and route-signature markup;
- no horizontal page overflow;
- visible primary actions and interactive cards are at least 44 × 44 CSS px;
- runtime requests remain local to the test server;
- the legacy raster splash is not requested;
- rendered text excludes fixture secrets, transport credentials, SDP/ICE
  material, and shuffle provenance;
- reduced-motion cards have no transform and effectively zero transition time;
- forced-colour cards retain a visible 2 px boundary;
- pending authority remains visibly pending at revision 1;
- accepted authority is captured only after revision 2 is received.

The online evidence fixture renders three authenticated clients internally.
Before export, the harness hides the other two client roots and exposes only
seat B's player-scoped view. The manifest records this distinction and does not
mislabel the fixture page as a production-build route capture.

## Baseline policy

The generated PNGs are unapproved candidates. They are not compared with or
copied into approved baselines. An intentional baseline update still requires
before/after images, rationale, reviewer, linked work item, and explicit
design/product approval under `QA_ACCEPTANCE.md`.


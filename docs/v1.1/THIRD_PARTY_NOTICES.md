# Crazy Rummy v1.1 third-party visual notices

The v1.1 production visual set currently contains no third-party fonts, raster
art, icon-library imports, audio, or generated runtime imagery.

The registered production SVG assets are first-party Crazy Rummy project work.
The legacy illustrated splash is preserved only in `art/_incoming/` with
`quarantined` status and is not eligible for the runtime or PWA cache.

If a third-party or generated source is adopted later, its required notice and
the corresponding `docs/v1.1/ASSET_REGISTER.csv` row must land before the
production asset can pass `pnpm validate:v11-assets`.

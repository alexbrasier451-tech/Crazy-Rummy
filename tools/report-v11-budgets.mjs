import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const V11_BUDGETS = Object.freeze({
  criticalFirstPaintBrotli: 450 * 1024,
  initialShellBrotli: 1024 * 1024,
  routeArtBrotli: 500 * 1024,
  fontsBrotli: 100 * 1024,
  singleDecorativeAssetBytes: 250 * 1024
});

const FONT_PATTERN = /\.(?:woff2?|ttf|otf)$/i;
const ART_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

async function walk(directory, relative = "") {
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walk(directory, next));
    else if (entry.isFile()) files.push(next.replaceAll(path.sep, "/"));
  }
  return files;
}

function brotliBytes(bytes) {
  return brotliCompressSync(bytes, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 11
    }
  }).length;
}

function sum(entries, field) {
  return entries.reduce((total, entry) => total + entry[field], 0);
}

export function classifyV11Budget(entries) {
  const critical = entries.filter(({ path: filename }) =>
    filename === "index.html"
      || filename === "manifest.webmanifest"
      || /^assets\/index-.*\.(?:css|js)$/.test(filename)
  );
  const fonts = entries.filter(({ path: filename }) => FONT_PATTERN.test(filename));
  const art = entries.filter(({ path: filename }) => ART_PATTERN.test(filename));
  const decorative = art.filter(({ path: filename }) => !filename.startsWith("icons/"));
  const largestDecorative = decorative.reduce(
    (largest, entry) => !largest || entry.bytes > largest.bytes ? entry : largest,
    null
  );
  const result = {
    criticalFirstPaint: {
      bytes: sum(critical, "bytes"),
      brotliBytes: sum(critical, "brotliBytes"),
      limit: V11_BUDGETS.criticalFirstPaintBrotli
    },
    initialShell: {
      bytes: sum(entries, "bytes"),
      brotliBytes: sum(entries, "brotliBytes"),
      limit: V11_BUDGETS.initialShellBrotli
    },
    fonts: {
      bytes: sum(fonts, "bytes"),
      brotliBytes: sum(fonts, "brotliBytes"),
      limit: V11_BUDGETS.fontsBrotli
    },
    routeArt: {
      bytes: sum(decorative, "bytes"),
      brotliBytes: sum(decorative, "brotliBytes"),
      limit: V11_BUDGETS.routeArtBrotli
    },
    largestDecorative: largestDecorative
      ? { ...largestDecorative, limit: V11_BUDGETS.singleDecorativeAssetBytes }
      : null,
    files: entries.length
  };
  result.passed = result.criticalFirstPaint.brotliBytes <= result.criticalFirstPaint.limit
    && result.initialShell.brotliBytes <= result.initialShell.limit
    && result.fonts.brotliBytes <= result.fonts.limit
    && result.routeArt.brotliBytes <= result.routeArt.limit
    && (!result.largestDecorative
      || result.largestDecorative.bytes <= result.largestDecorative.limit);
  return Object.freeze(result);
}

export async function reportV11Budgets({
  rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  distDirectory = "dist"
} = {}) {
  const resolvedDist = path.resolve(rootDirectory, distDirectory);
  if (!(await stat(resolvedDist)).isDirectory()) throw new Error("Production dist directory is missing.");
  const entries = [];
  for (const relativePath of await walk(resolvedDist)) {
    if (/^(?:precache-manifest\.|sw(?:\.|$))/.test(path.basename(relativePath))) continue;
    const bytes = await readFile(path.join(resolvedDist, relativePath));
    entries.push(Object.freeze({
      path: relativePath,
      bytes: bytes.length,
      brotliBytes: brotliBytes(bytes)
    }));
  }
  entries.sort((first, second) => first.path.localeCompare(second.path));
  return classifyV11Budget(entries);
}

const invokedAsScript = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedAsScript) {
  reportV11Budgets()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (!report.passed) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

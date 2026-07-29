import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"]
]);

function normalizeMountPath(value = "/") {
  const withLeadingSlash = String(value || "/").startsWith("/")
    ? String(value || "/")
    : `/${value}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

function isWithinRoot(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function resolveRequestFile(root, request, mountPath) {
  const requestUrl = new URL(request.url, "http://test.invalid");
  const pathname = decodeURIComponent(requestUrl.pathname);
  if (
    mountPath !== "/"
    && pathname !== mountPath.slice(0, -1)
    && !pathname.startsWith(mountPath)
  ) return null;
  const mountedPath = mountPath === "/"
    ? pathname
    : pathname.slice(mountPath.length);
  const relativePath = mountedPath
    .replace(/^\/+/, "");
  let candidate = path.resolve(root, relativePath || "index.html");

  if (!isWithinRoot(root, candidate)) return null;

  try {
    const metadata = await stat(candidate);
    if (metadata.isDirectory()) candidate = path.join(candidate, "index.html");
    await stat(candidate);
    return candidate;
  } catch {
    const acceptsHtml = request.headers.accept?.includes("text/html");
    return acceptsHtml ? path.join(root, "index.html") : null;
  }
}

function sendFile(request, response, filename, serviceWorkerScope = "/") {
  const extension = path.extname(filename).toLowerCase();
  response.statusCode = 200;
  response.setHeader(
    "Content-Type",
    CONTENT_TYPES.get(extension) ?? "application/octet-stream"
  );
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (/^sw(?:\.[a-f0-9]+)?\.js$/.test(path.basename(filename))
    || path.basename(filename).startsWith("precache-manifest.")) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Service-Worker-Allowed", serviceWorkerScope);
  } else if (filename.includes(`${path.sep}assets${path.sep}`)
    || filename.includes(`${path.sep}art${path.sep}`)
    || filename.includes(`${path.sep}icons${path.sep}`)) {
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    response.setHeader("Cache-Control", "no-cache");
  }

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filename)
    .on("error", () => {
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    })
    .pipe(response);
}

export async function startTestServer({
  root = path.resolve("dist"),
  host = "127.0.0.1",
  port = 0,
  mountPath = "/"
} = {}) {
  let absoluteRoot = path.resolve(root);
  const normalizedMountPath = normalizeMountPath(mountPath);
  await stat(path.join(absoluteRoot, "index.html"));

  const server = createServer(async (request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.statusCode = 405;
      response.setHeader("Allow", "GET, HEAD");
      response.end("Method not allowed");
      return;
    }

    const filename = await resolveRequestFile(
      absoluteRoot,
      request,
      normalizedMountPath
    );
    if (!filename) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }

    sendFile(request, response, filename, normalizedMountPath);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  return {
    server,
    origin: `http://${host}:${address.port}`,
    mountPath: normalizedMountPath,
    setRoot: async (nextRoot) => {
      const nextAbsoluteRoot = path.resolve(nextRoot);
      await stat(path.join(nextAbsoluteRoot, "index.html"));
      absoluteRoot = nextAbsoluteRoot;
    },
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("dist");
  const running = await startTestServer({ root });
  console.log(running.origin);
}

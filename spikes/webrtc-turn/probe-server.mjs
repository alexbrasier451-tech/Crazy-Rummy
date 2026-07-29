import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const staticFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/probe.js", "probe.js"],
  ["/metered.html", "metered.html"],
  ["/metered-probe.js", "metered-probe.js"],
  ["/pages/", "github-pages/index.html"],
  ["/pages/index.html", "github-pages/index.html"],
  ["/pages/launcher.js", "github-pages/launcher.js"],
  ["/pages/probe.html", "github-pages/probe.html"],
  ["/pages/probe.js", "github-pages/probe.js"],
  ["/pages/config.js", "github-pages/config.js"],
]);

export async function startProbeServer({
  host = "127.0.0.1",
  port = 0,
  iceServers = defaultIceServers(),
  iceTransportPolicy = process.env.ICE_TRANSPORT_POLICY === "relay" ? "relay" : "all",
} = {}) {
  validateIceConfiguration(iceServers, iceTransportPolicy);

  const queues = new Map();
  let nextSequence = 1;

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      setSecurityHeaders(response);

      if (request.method === "GET" && staticFiles.has(url.pathname)) {
        const filename = staticFiles.get(url.pathname);
        const content = await readFile(resolve(root, filename));
        response.writeHead(200, { "content-type": contentType(filename) });
        response.end(content);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/ice") {
        sendJson(response, 200, {
          iceServers,
          iceTransportPolicy,
          configuredTurn: iceServers.some((serverConfig) =>
            listUrls(serverConfig.urls).some((value) => /^turns?:/i.test(value)),
          ),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/signal") {
        const room = requireToken(url.searchParams.get("room"), "room");
        const peer = requirePeer(url.searchParams.get("peer"));
        const after = Number(url.searchParams.get("after") || 0);
        const queue = queues.get(queueKey(room, peer)) || [];
        sendJson(
          response,
          200,
          queue.filter((message) => message.sequence > after),
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/signal") {
        const body = await readJson(request, 64 * 1024);
        const room = requireToken(body.room, "room");
        const from = requirePeer(body.from);
        const to = requirePeer(body.to);
        const type = requireSignalType(body.type);
        const key = queueKey(room, to);
        const queue = queues.get(key) || [];
        const message = {
          sequence: nextSequence++,
          room,
          from,
          to,
          type,
          payload: body.payload,
        };
        queue.push(message);
        queues.set(key, queue.slice(-256));
        sendJson(response, 202, { sequence: message.sequence });
        return;
      }

      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      sendJson(response, error.statusCode || 400, { error: error.message });
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, resolveListen);
  });

  const address = server.address();
  return {
    origin: `http://${host}:${address.port}`,
    async close() {
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    },
  };
}

function defaultIceServers() {
  if (process.env.ICE_SERVERS_JSON) {
    const parsed = JSON.parse(process.env.ICE_SERVERS_JSON);
    if (!Array.isArray(parsed)) {
      throw new Error("ICE_SERVERS_JSON must contain an array.");
    }
    return parsed;
  }
  return [{ urls: ["stun:stun.cloudflare.com:3478"] }];
}

function validateIceConfiguration(iceServers, policy) {
  if (!["all", "relay"].includes(policy)) {
    throw new Error("ICE transport policy must be all or relay.");
  }
  if (!Array.isArray(iceServers) || !iceServers.length) {
    throw new Error("At least one ICE server is required.");
  }
  const turnServers = iceServers.filter((item) =>
    listUrls(item.urls).some((value) => /^turns?:/i.test(value)),
  );
  if (policy === "relay" && !turnServers.length) {
    throw new Error("Relay mode requires a TURN URL.");
  }
  for (const turnServer of turnServers) {
    if (!turnServer.username || !turnServer.credential) {
      throw new Error("Every TURN server requires username and credential.");
    }
  }
}

function listUrls(urls) {
  return Array.isArray(urls) ? urls : [urls];
}

function queueKey(room, peer) {
  return `${room}:${peer}`;
}

function requireToken(value, label) {
  if (!/^[a-zA-Z0-9_-]{6,80}$/.test(String(value || ""))) {
    const error = new Error(`Invalid ${label}.`);
    error.statusCode = 422;
    throw error;
  }
  return value;
}

function requirePeer(value) {
  if (!["host", "guest"].includes(value)) {
    const error = new Error("Invalid peer.");
    error.statusCode = 422;
    throw error;
  }
  return value;
}

function requireSignalType(value) {
  if (!["offer", "answer", "candidate"].includes(value)) {
    const error = new Error("Invalid signal type.");
    error.statusCode = 422;
    throw error;
  }
  return value;
}

async function readJson(request, maximumBytes) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > maximumBytes) {
      const error = new Error("Request body too large.");
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    const error = new Error("Invalid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function contentType(filename) {
  return extname(filename) === ".js"
    ? "text/javascript; charset=utf-8"
    : "text/html; charset=utf-8";
}

function setSecurityHeaders(response) {
  response.setHeader("cache-control", "no-store");
  response.setHeader(
    "content-security-policy",
    "default-src 'self'; connect-src 'self' https://rms.metered.ca wss://rms.metered.ca; script-src 'self' https://unpkg.com; style-src 'unsafe-inline'",
  );
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const portArgument = process.argv.find((value) => value.startsWith("--port="));
  const server = await startProbeServer({
    host: process.env.PROBE_HOST || "127.0.0.1",
    port: portArgument ? Number(portArgument.split("=")[1]) : 4173,
  });
  process.stdout.write(`Probe listening at ${server.origin}\n`);
}

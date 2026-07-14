const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_BODY_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 120_000;
const EXPORT_TIMEOUT_MS = 30 * 60_000;

function createMcpBridge({ app, ipcMain, getWindow }) {
  let server = null;
  let token = "";
  let connectionFile = "";
  let nextRequestId = 1;
  const pending = new Map();

  const handleRendererResponse = (_event, response) => {
    if (!response || typeof response.id !== "string") return;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    clearTimeout(request.timer);
    if (response.ok) request.resolve(response.result);
    else request.reject(new Error(String(response.error || "Kurogi Motion rejected the MCP request.")));
  };

  ipcMain.on("mcp-response", handleRendererResponse);

  async function start() {
    if (server) return readConnectionInfo();
    token = crypto.randomBytes(32).toString("hex");
    connectionFile = path.join(app.getPath("userData"), "mcp-bridge.json");
    server = http.createServer((request, response) => {
      void handleRequest(request, response);
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Unable to bind the MCP bridge.");
    const info = {
      version: 1,
      host: "127.0.0.1",
      port: address.port,
      token,
      pid: process.pid,
      updatedAt: new Date().toISOString(),
    };
    await fs.promises.mkdir(path.dirname(connectionFile), { recursive: true });
    await fs.promises.writeFile(connectionFile, JSON.stringify(info, null, 2), { encoding: "utf8", mode: 0o600 });
    try { await fs.promises.chmod(connectionFile, 0o600); } catch {}
    return info;
  }

  async function stop() {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Kurogi Motion is shutting down."));
    }
    pending.clear();
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
      server = null;
    }
    if (connectionFile) {
      try { await fs.promises.unlink(connectionFile); } catch {}
    }
  }

  function readConnectionInfo() {
    const address = server?.address();
    if (!address || typeof address === "string") return null;
    return { version: 1, host: "127.0.0.1", port: address.port, token, pid: process.pid };
  }

  async function handleRequest(request, response) {
    setSecurityHeaders(response);
    if (request.method !== "POST" || request.url !== "/rpc") {
      sendJson(response, 404, { ok: false, error: "Not found" });
      return;
    }
    const authorization = request.headers.authorization;
    if (authorization !== `Bearer ${token}`) {
      sendJson(response, 401, { ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const payload = await readJsonBody(request);
      if (!payload || typeof payload.method !== "string") throw new Error("Invalid MCP bridge request.");
      if (payload.method === "bridge.status") {
        const window = getWindow();
        sendJson(response, 200, {
          ok: true,
          result: {
            appRunning: true,
            windowReady: Boolean(window && !window.isDestroyed() && !window.webContents.isDestroyed()),
            pid: process.pid,
          },
        });
        return;
      }
      const result = await forwardToRenderer(payload.method, payload.params ?? {});
      sendJson(response, 200, { ok: true, result });
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  function forwardToRenderer(method, params) {
    const window = getWindow();
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
      return Promise.reject(new Error("Open Kurogi Motion before calling project tools."));
    }
    const id = `mcp-${process.pid}-${nextRequestId++}`;
    return new Promise((resolve, reject) => {
      const timeout = method === "project.export" ? EXPORT_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(method === "project.export"
          ? "Kurogi Motion did not finish the export within 30 minutes."
          : "Kurogi Motion did not answer the MCP request in time."));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      window.webContents.send("mcp-request", { id, method, params });
    });
  }

  return { start, stop, readConnectionInfo };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("MCP request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("MCP request body is not valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function setSecurityHeaders(response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

module.exports = { createMcpBridge };

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const MAX_TOTAL_ASSET_BYTES = 512 * 1024 * 1024;
const MIME_EXTENSIONS = Object.freeze({
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/ogg": ".ogg",
  "audio/webm": ".webm",
  "font/woff2": ".woff2",
  "font/woff": ".woff",
  "font/ttf": ".ttf",
  "font/otf": ".otf",
  "application/font-woff": ".woff",
});

async function stageProjectAssetsForRender(project, options = {}) {
  const stagedProject = {
    ...project,
    assets: Object.fromEntries(
      Object.entries(project?.assets ?? {}).map(([assetId, asset]) => [assetId, { ...asset }]),
    ),
  };
  const assets = Object.values(stagedProject.assets);
  const inlineAssets = assets.filter((asset) => typeof asset?.sourceUrl === "string" && asset.sourceUrl.startsWith("data:"));
  if (inlineAssets.length === 0) {
    return {
      project: stagedProject,
      stats: { assetCount: assets.length, inlineAssetCount: 0, uniqueAssetCount: 0, duplicateAssetCount: 0, rawBytes: 0 },
      dispose: async () => undefined,
    };
  }

  const temporaryRoot = path.resolve(options.temporaryRoot || os.tmpdir());
  const directory = await fs.promises.mkdtemp(path.join(temporaryRoot, "kurogi-render-assets-"));
  const token = crypto.randomBytes(18).toString("hex");
  const routes = new Map();
  const server = http.createServer((request, response) => serveAssetRequest(request, response, routes));
  server.keepAliveTimeout = 1_000;
  server.headersTimeout = 5_000;
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));

  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(`${temporaryRoot}${path.sep}`) || !path.basename(resolved).startsWith("kurogi-render-assets-")) {
      throw new Error(`Refusing to remove unexpected render asset directory: ${resolved}`);
    }
    await fs.promises.rm(resolved, { recursive: true, force: true });
  };

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Unable to start the temporary render asset server.");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const sourceRoutes = new Map();
    const digestRoutes = new Map();
    let rawBytes = 0;
    let duplicateAssetCount = 0;

    for (const asset of assets) {
      if (typeof asset?.thumbnailUrl === "string" && (asset.thumbnailUrl.startsWith("data:") || asset.thumbnailUrl.startsWith("blob:"))) {
        asset.thumbnailUrl = undefined;
      }
      const source = asset?.sourceUrl;
      if (typeof source !== "string" || !source.startsWith("data:")) continue;

      const cachedRoute = sourceRoutes.get(source);
      if (cachedRoute) {
        asset.sourceUrl = `${baseUrl}${cachedRoute}`;
        duplicateAssetCount += 1;
        continue;
      }

      const decoded = decodeDataUrl(source, asset.mimeType);
      rawBytes += decoded.bytes.length;
      if (rawBytes > MAX_TOTAL_ASSET_BYTES) throw new Error("Render assets exceed the 512 MB staging limit.");
      const digest = crypto.createHash("sha256").update(decoded.bytes).digest("hex");
      let route = digestRoutes.get(digest);
      if (!route) {
        const extension = MIME_EXTENSIONS[decoded.mimeType] || ".bin";
        const fileName = `${digest}${extension}`;
        const filePath = path.join(directory, fileName);
        await fs.promises.writeFile(filePath, decoded.bytes);
        route = `/${token}/${fileName}`;
        routes.set(route, { filePath, mimeType: decoded.mimeType, size: decoded.bytes.length });
        digestRoutes.set(digest, route);
      } else {
        duplicateAssetCount += 1;
      }
      sourceRoutes.set(source, route);
      asset.sourceUrl = `${baseUrl}${route}`;
    }

    const stats = {
      assetCount: assets.length,
      inlineAssetCount: inlineAssets.length,
      uniqueAssetCount: routes.size,
      duplicateAssetCount,
      rawBytes,
      serverPort: address.port,
    };
    sourceRoutes.clear();
    digestRoutes.clear();
    return { project: stagedProject, stats, dispose };
  } catch (error) {
    await dispose().catch(() => undefined);
    throw error;
  }
}

function decodeDataUrl(source, fallbackMimeType) {
  const comma = source.indexOf(",");
  if (comma < 5) throw new Error("A render asset contains an invalid data URL.");
  const metadata = source.slice(5, comma);
  const parts = metadata.split(";");
  const mimeType = normalizeMimeType(parts[0] || fallbackMimeType);
  const payload = source.slice(comma + 1);
  const bytes = parts.some((part) => part.toLowerCase() === "base64")
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  if (bytes.length === 0) throw new Error("A render asset is empty.");
  return { bytes, mimeType };
}

function normalizeMimeType(value) {
  const mimeType = String(value || "application/octet-stream").toLowerCase();
  return Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS, mimeType) ? mimeType : "application/octet-stream";
}

function serveAssetRequest(request, response, routes) {
  if (!request.url || !["GET", "HEAD"].includes(request.method || "")) {
    sendStatus(response, 405, "Method not allowed");
    return;
  }
  let pathname;
  try { pathname = new URL(request.url, "http://127.0.0.1").pathname; }
  catch { sendStatus(response, 400, "Bad request"); return; }
  const asset = routes.get(pathname);
  if (!asset) { sendStatus(response, 404, "Not found"); return; }

  const range = parseByteRange(request.headers.range, asset.size);
  if (range === false) {
    response.writeHead(416, { "Content-Range": `bytes */${asset.size}`, "Cache-Control": "no-store" });
    response.end();
    return;
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? asset.size - 1;
  const headers = {
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "private, max-age=3600, immutable",
    "Content-Length": String(end - start + 1),
    "Content-Type": asset.mimeType,
    "X-Content-Type-Options": "nosniff",
  };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${asset.size}`;
  response.writeHead(range ? 206 : 200, headers);
  if (request.method === "HEAD") { response.end(); return; }
  const stream = fs.createReadStream(asset.filePath, { start, end });
  stream.on("error", () => { if (!response.headersSent) sendStatus(response, 500, "Read failed"); else response.destroy(); });
  stream.pipe(response);
}

function parseByteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(header).trim());
  if (!match) return false;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return false;
  return { start, end: Math.min(end, size - 1) };
}

function sendStatus(response, status, message) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  response.end(message);
}

module.exports = { MAX_TOTAL_ASSET_BYTES, stageProjectAssetsForRender };

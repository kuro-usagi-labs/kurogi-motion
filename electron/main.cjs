const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("node:url");
const { createMcpBridge } = require("./mcpBridge.cjs");

let packagedBundlePromise = null;
let exportInProgress = false;
let activeRenderJobId = null;
const renderJobs = new Map();
let mainWindow = null;
let mcpBridge = null;
const mcpMode = process.argv.includes("--mcp");

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: "#111219",
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#111219", symbolColor: "#d9d9e4" },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  window.on("closed", () => { if (mainWindow === window) mainWindow = null; });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const allowed = app.isPackaged
      ? url.startsWith("file://")
      : url.startsWith("http://127.0.0.1:5173");
    if (!allowed) event.preventDefault();
  });

  if (app.isPackaged) {
    void window.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  } else {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173");
  }
};

if (mcpMode) {
  app.whenReady().then(async () => {
    const entry = path.join(app.getAppPath(), "mcp", "server.mjs");
    const module = await import(pathToFileURL(entry).href);
    await module.startKurogiMcpServer({ bridgeFile: path.join(app.getPath("userData"), "mcp-bridge.json") });
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    app.exit(1);
  });
} else {
  app.whenReady().then(async () => {
    mcpBridge = createMcpBridge({ app, ipcMain, getWindow: () => mainWindow });
    try { await mcpBridge.start(); } catch (error) { console.error("Unable to start MCP bridge", error); }
    createWindow();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on("before-quit", () => { void mcpBridge?.stop(); });
}

ipcMain.handle("mcp-info", async () => ({
  bridgeRunning: Boolean(mcpBridge?.readConnectionInfo()),
  bridgeFile: path.join(app.getPath("userData"), "mcp-bridge.json"),
  command: process.execPath,
  args: [
    path.join(app.getAppPath(), "mcp", "server.mjs"),
    `--bridge-file=${path.join(app.getPath("userData"), "mcp-bridge.json")}`,
  ],
  env: { ELECTRON_RUN_AS_NODE: "1" },
  packaged: app.isPackaged,
}));

ipcMain.handle("export-video", async (event, project, rawOptions = {}) => {
  if (exportInProgress) throw new Error("Another export is already running.");
  const options = normalizeExportOptions(rawOptions);
  validateProject(project);

  const target = await chooseExportTarget(project.name, options.format, options.outputPath, options.automatic);
  if (!target) return { canceled: true };

  exportInProgress = true;
  try {
    return await renderProject(project, options, target, (progress) => sendProgress(event, progress));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendProgress(event, { phase: "failed", progress: 0, message });
    throw error;
  } finally {
    exportInProgress = false;
  }
});

ipcMain.handle("render-preview-frame", async (_event, project, rawOptions = {}) => {
  validateProject(project);
  const scene = project.scenes[project.activeSceneId];
  const time = Math.min(scene.duration, Math.max(0, Number(rawOptions.time) || 0));
  const scale = Math.min(2, Math.max(0.1, Number(rawOptions.scale) || 0.5));
  const serveUrl = await getServeUrl();
  const { selectComposition, renderStill } = await import("@remotion/renderer");
  const inputProps = { project, renderMode: "active-scene", exportFps: scene.fps };
  const composition = await selectComposition({ serveUrl, id: "KurogiMotion", inputProps });
  const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(time * composition.fps)));
  const outputDir = path.join(app.getPath("temp"), "kurogi-motion", "previews");
  await fs.promises.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
  await renderStill({ composition, serveUrl, inputProps, output: outputPath, frame, imageFormat: "png", scale, logLevel: "warn" });
  return { path: outputPath, mimeType: "image/png", time: frame / composition.fps, frame, width: Math.round(composition.width * scale), height: Math.round(composition.height * scale) };
});

ipcMain.handle("start-render-job", async (_event, project, rawOptions = {}) => {
  if (exportInProgress) throw new Error("Another export is already running.");
  validateProject(project);
  const options = normalizeExportOptions({ ...rawOptions, automatic: rawOptions.automatic !== false });
  const target = await chooseExportTarget(project.name, options.format, options.outputPath, options.automatic);
  if (!target) return { canceled: true };
  const { makeCancelSignal } = await import("@remotion/renderer");
  const { cancelSignal, cancel } = makeCancelSignal();
  const job = {
    id: `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectName: project.name,
    status: "queued",
    phase: "queued",
    progress: 0,
    outputPath: target,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cancel,
  };
  renderJobs.set(job.id, job);
  pruneRenderJobs();
  exportInProgress = true;
  activeRenderJobId = job.id;

  void renderProject(project, options, target, (progress) => updateRenderJob(job, progress), cancelSignal)
    .then((result) => updateRenderJob(job, { status: "completed", phase: "completed", progress: 1, outputPath: result.path, completedAt: new Date().toISOString() }))
    .catch((error) => {
      const canceled = job.status === "canceling" || /cancel/i.test(error instanceof Error ? error.message : String(error));
      updateRenderJob(job, { status: canceled ? "canceled" : "failed", phase: canceled ? "canceled" : "failed", error: canceled ? undefined : error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString() });
    })
    .finally(() => {
      exportInProgress = false;
      if (activeRenderJobId === job.id) activeRenderJobId = null;
    });

  return publicRenderJob(job);
});

ipcMain.handle("get-render-job", async (_event, jobId) => {
  const job = renderJobs.get(String(jobId || ""));
  if (!job) throw new Error(`Render job ${jobId} does not exist.`);
  return publicRenderJob(job);
});

ipcMain.handle("cancel-render-job", async (_event, jobId) => {
  const job = renderJobs.get(String(jobId || ""));
  if (!job) throw new Error(`Render job ${jobId} does not exist.`);
  if (["completed", "failed", "canceled"].includes(job.status)) return publicRenderJob(job);
  job.status = "canceling";
  job.phase = "canceling";
  job.updatedAt = new Date().toISOString();
  job.cancel();
  return publicRenderJob(job);
});

ipcMain.handle("show-item-in-folder", async (_event, targetPath) => {
  if (typeof targetPath !== "string" || !targetPath.trim() || !path.isAbsolute(targetPath)) {
    throw new Error("Invalid export destination.");
  }
  if (!fs.existsSync(targetPath)) throw new Error("The exported file no longer exists.");
  const stats = await fs.promises.stat(targetPath);
  if (stats.isDirectory()) {
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
  } else {
    shell.showItemInFolder(targetPath);
  }
  return { opened: true };
});

ipcMain.handle("read-mcp-media-file", async (_event, requestedPath) => {
  if (typeof requestedPath !== "string" || !path.isAbsolute(requestedPath)) throw new Error("MCP media import requires an absolute file path.");
  const stats = await fs.promises.stat(requestedPath);
  if (!stats.isFile()) throw new Error("The MCP media path is not a file.");
  if (stats.size > 250 * 1024 * 1024) throw new Error("MCP media files are limited to 250 MB.");
  const extension = path.extname(requestedPath).toLowerCase();
  const mimeTypes = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".webm": "audio/webm",
  };
  const mimeType = mimeTypes[extension];
  if (!mimeType) throw new Error("Unsupported MCP media file. Use PNG, JPG, WebP, SVG, MP3, WAV, M4A, AAC, OGG, or WebM audio.");
  const bytes = await fs.promises.readFile(requestedPath);
  return { name: path.basename(requestedPath), mimeType, bytes, byteSize: bytes.length };
});

ipcMain.handle("save-kuromotion-file", async (_event, envelope, defaultName) => {
  validateKuroMotionEnvelope(envelope);
  const target = await dialog.showSaveDialog({
    title: "Save Kurogi Motion project",
    defaultPath: String(defaultName || "kurogi-motion.kuromotion"),
    filters: [{ name: "Kurogi Motion project", extensions: ["kuromotion"] }],
  });
  if (target.canceled || !target.filePath) return { canceled: true };
  await fs.promises.writeFile(target.filePath, JSON.stringify(envelope, null, 2), "utf8");
  return { path: target.filePath };
});

ipcMain.handle("open-kuromotion-file", async () => {
  const target = await dialog.showOpenDialog({
    title: "Open Kurogi Motion project",
    properties: ["openFile"],
    filters: [{ name: "Kurogi Motion project", extensions: ["kuromotion"] }],
  });
  if (target.canceled || !target.filePaths[0]) return { canceled: true };
  const filePath = target.filePaths[0];
  const content = await fs.promises.readFile(filePath, "utf8");
  return { path: filePath, content };
});

function validateKuroMotionEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") throw new Error("Invalid .kuromotion document.");
  if (envelope.application !== "Kurogi Motion" || !envelope.project) {
    throw new Error("The file is not a valid Kurogi Motion project.");
  }
}

async function getServeUrl() {
  const build = async () => {
    const { bundle } = await import("@remotion/bundler");
    return bundle({
      entryPoint: path.join(app.getAppPath(), "src", "remotion-entry.tsx"),
      webpackOverride: (config) => config,
    });
  };
  if (!app.isPackaged) return build();
  if (!packagedBundlePromise) packagedBundlePromise = build();
  return packagedBundlePromise;
}

async function chooseExportTarget(projectName, format, requestedPath, automatic = false) {
  if (requestedPath) {
    if (!path.isAbsolute(requestedPath)) throw new Error("Direct export paths must be absolute.");
    if (format === "png-sequence") { await fs.promises.mkdir(requestedPath, { recursive: true }); return requestedPath; }
    const extensions = { mp4: ".mp4", webm: ".webm", mov: ".mov", gif: ".gif" };
    const expected = extensions[format] || ".mp4";
    if (path.extname(requestedPath).toLowerCase() !== expected) throw new Error(`Export path must end with ${expected}.`);
    await fs.promises.mkdir(path.dirname(requestedPath), { recursive: true });
    return requestedPath;
  }
  if (automatic) return createAutomaticExportTarget(projectName, format);
  if (format === "png-sequence") {
    const selection = await dialog.showOpenDialog({
      title: "Choose a folder for the PNG sequence",
      properties: ["openDirectory", "createDirectory"],
    });
    return selection.canceled ? null : selection.filePaths[0];
  }

  const formats = {
    webm: { extension: "webm", label: "WebM video" },
    mp4: { extension: "mp4", label: "MP4 video" },
    mov: { extension: "mov", label: "MOV ProRes 4444 video" },
    gif: { extension: "gif", label: "Animated GIF" },
  };
  const formatConfig = formats[format] || formats.mp4;
  const target = await dialog.showSaveDialog({
    title: "Export Kurogi Motion",
    defaultPath: `${safeFileName(projectName || "kurogi-motion")}.${formatConfig.extension}`,
    filters: [{ name: formatConfig.label, extensions: [formatConfig.extension] }],
  });
  return target.canceled ? null : target.filePath;
}

async function createAutomaticExportTarget(projectName, format) {
  const directory = path.join(app.getPath("videos"), "Kurogi Motion");
  await fs.promises.mkdir(directory, { recursive: true });
  const baseName = safeFileName(projectName || "kurogi-motion");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").replace("T", "-");
  if (format === "png-sequence") {
    let target = path.join(directory, `${baseName}-${stamp}`);
    for (let suffix = 2; fs.existsSync(target); suffix += 1) target = path.join(directory, `${baseName}-${stamp}-${suffix}`);
    return target;
  }
  const extensions = { mp4: ".mp4", webm: ".webm", mov: ".mov", gif: ".gif" };
  const extension = extensions[format] || ".mp4";
  let target = path.join(directory, `${baseName}-${stamp}${extension}`);
  for (let suffix = 2; fs.existsSync(target); suffix += 1) target = path.join(directory, `${baseName}-${stamp}-${suffix}${extension}`);
  return target;
}

async function renderProject(project, options, target, onProgress, cancelSignal) {
  const report = (progress) => onProgress?.(progress);
  report({ phase: "preparing", progress: 0, message: "Preparing the Remotion bundle" });
  const serveUrl = await getServeUrl();
  const { selectComposition, renderFrames, renderMedia } = await import("@remotion/renderer");
  const inputProps = { project, renderMode: options.allScenes ? "all-scenes" : "active-scene", exportFps: options.fps };
  const composition = await selectComposition({ serveUrl, id: "KurogiMotion", inputProps });

  if (options.format === "png-sequence") {
    const outputDir = path.join(target, safeFileName(project.name || "kurogi-motion"));
    await fs.promises.mkdir(outputDir, { recursive: true });
    let frameCount = composition.durationInFrames;
    await renderFrames({
      composition,
      serveUrl,
      inputProps,
      outputDir,
      imageFormat: "png",
      imageSequencePattern: "frame-[frame].[ext]",
      scale: options.scale,
      logLevel: "warn",
      ...(cancelSignal ? { cancelSignal } : {}),
      onStart: ({ frameCount: count }) => {
        frameCount = count;
        report({ phase: "rendering", progress: 0, renderedFrames: 0, frameCount, message: `Rendering 0 / ${frameCount} frames` });
      },
      onFrameUpdate: (renderedFrames) => {
        report({ phase: "rendering", progress: frameCount > 0 ? renderedFrames / frameCount : 0, renderedFrames, frameCount, message: `Rendering ${renderedFrames} / ${frameCount} frames` });
      },
    });
    report({ phase: "completed", progress: 1, renderedFrames: frameCount, frameCount, message: outputDir });
    return { path: outputDir };
  }

  const media = mediaSettings(options);
  let frameCount = composition.durationInFrames;
  await renderMedia({
    composition,
    serveUrl,
    inputProps,
    outputLocation: target,
    codec: media.codec,
    scale: options.scale,
    overwrite: true,
    logLevel: "warn",
    ...(cancelSignal ? { cancelSignal } : {}),
    ...(media.crf === null ? {} : { crf: media.crf }),
    ...(media.imageFormat ? { imageFormat: media.imageFormat } : {}),
    ...(media.pixelFormat ? { pixelFormat: media.pixelFormat } : {}),
    ...(media.proResProfile ? { proResProfile: media.proResProfile } : {}),
    ...(options.format === "gif" ? { numberOfGifLoops: options.gifLoops } : {}),
    onStart: ({ frameCount: count }) => {
      frameCount = count;
      report({ phase: "rendering", progress: 0, renderedFrames: 0, encodedFrames: 0, frameCount, message: `Rendering 0 / ${frameCount} frames` });
    },
    onProgress: ({ progress, renderedFrames, encodedFrames, stitchStage }) => {
      const phase = stitchStage === "encoding" || stitchStage === "muxing" ? "encoding" : "rendering";
      report({
        phase,
        progress,
        renderedFrames,
        encodedFrames,
        frameCount,
        message: phase === "encoding" ? `Encoding ${encodedFrames} / ${frameCount} frames` : `Rendering ${renderedFrames} / ${frameCount} frames`,
      });
    },
  });
  report({ phase: "completed", progress: 1, renderedFrames: frameCount, encodedFrames: frameCount, frameCount, message: target });
  return { path: target };
}

function updateRenderJob(job, update) {
  Object.assign(job, update);
  if (update.phase && !update.status && !["completed", "failed", "canceled", "canceling"].includes(job.status)) job.status = "running";
  job.updatedAt = new Date().toISOString();
}

function publicRenderJob(job) {
  const { cancel: _cancel, ...result } = job;
  return result;
}

function pruneRenderJobs() {
  if (renderJobs.size <= 50) return;
  for (const [id, job] of renderJobs) {
    if (id !== activeRenderJobId && ["completed", "failed", "canceled"].includes(job.status)) renderJobs.delete(id);
    if (renderJobs.size <= 40) break;
  }
}

function mediaSettings(options) {
  const crf = options.quality === "high" ? 18 : options.quality === "low" ? 28 : 23;
  if (options.format === "gif") return { codec: "gif", crf: null };
  if (options.format === "mov") {
    return {
      codec: "prores",
      crf: null,
      imageFormat: "png",
      pixelFormat: "yuva444p10le",
      proResProfile: "4444",
    };
  }
  if (options.format === "webm") {
    return {
      codec: "vp8",
      crf,
      imageFormat: options.transparent ? "png" : undefined,
      pixelFormat: options.transparent ? "yuva420p" : undefined,
    };
  }
  return { codec: "h264", crf };
}

function normalizeExportOptions(raw) {
  const allowedFormats = new Set(["mp4", "webm", "mov", "gif", "png-sequence"]);
  const alphaFormats = new Set(["webm", "mov", "png-sequence"]);
  const allowedFps = new Set([24, 30, 60]);
  const allowedQuality = new Set(["low", "medium", "high"]);
  const format = allowedFormats.has(raw.format) ? raw.format : "mp4";
  return {
    format,
    fps: allowedFps.has(Number(raw.fps)) ? Number(raw.fps) : 30,
    scale: Math.min(2, Math.max(0.1, Number(raw.scale) || 1)),
    quality: allowedQuality.has(raw.quality) ? raw.quality : "high",
    transparent: alphaFormats.has(format) && Boolean(raw.transparent),
    gifLoops: raw.gifLoops === null ? null : Math.max(0, Number(raw.gifLoops) || 0),
    outputPath: typeof raw.outputPath === "string" && raw.outputPath.trim() ? raw.outputPath.trim() : undefined,
    automatic: Boolean(raw.automatic),
    allScenes: Boolean(raw.allScenes),
  };
}

function validateProject(project) {
  if (!project || typeof project !== "object") throw new Error("Invalid project snapshot.");
  if (!project.activeSceneId || !project.scenes?.[project.activeSceneId]) {
    throw new Error("The active scene is missing from the project snapshot.");
  }
  const scene = project.scenes[project.activeSceneId];
  if (![scene.width, scene.height, scene.duration, scene.fps].every(Number.isFinite)) {
    throw new Error("The scene contains invalid dimensions or timing.");
  }
  if (scene.width < 64 || scene.height < 64 || scene.width > 7680 || scene.height > 7680) {
    throw new Error("The export resolution is outside the supported range.");
  }
}

function sendProgress(event, progress) {
  if (!event.sender.isDestroyed()) event.sender.send("export-progress", progress);
}

function safeFileName(value) {
  return String(value)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 120) || "kurogi-motion";
}

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { createMcpBridge } = require("./mcpBridge.cjs");
const { stageProjectAssetsForRender } = require("./renderAssetStage.cjs");

const MCP_INTEGRATION_VERSION = 4;
const MCP_TOOL_COUNT = 62;
let packagedBundlePromise = null;
let exportInProgress = false;
let activeRenderJobId = null;
const renderJobs = new Map();
let mainWindow = null;
let mcpBridge = null;
const mcpMode = process.argv.includes("--mcp");
const ownsGuiInstance = mcpMode || app.requestSingleInstanceLock();

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

if (!ownsGuiInstance) {
  app.quit();
} else if (mcpMode) {
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
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.on("before-quit", () => { void mcpBridge?.stop(); });
}

ipcMain.handle("mcp-info", async () => ({
  mcpVersion: MCP_INTEGRATION_VERSION,
  toolCount: MCP_TOOL_COUNT,
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
  const outputDir = path.join(app.getPath("temp"), "kurogi-motion", "previews");
  await fs.promises.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
  const staged = await stageProjectAssetsForRender(project);
  const diagnostics = createRenderDiagnostics(project, { format: "preview", scale, fps: scene.fps }, outputPath);
  try {
    const serveUrl = await getServeUrl();
    const { selectComposition, renderStill } = await import("@remotion/renderer");
    const inputProps = { project: staged.project, renderMode: "active-scene", exportFps: scene.fps };
    diagnostics.write("assets-staged", { ...staged.stats, inputPropsBytes: Buffer.byteLength(JSON.stringify(inputProps)) });
    return await retryClosedBrowser(async (attempt) => {
      diagnostics.write("preview-attempt", { attempt });
      const browserOptions = renderBrowserOptions(diagnostics);
      const composition = await selectComposition({ serveUrl, id: "KurogiMotion", inputProps, ...browserOptions });
      const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(time * composition.fps)));
      await renderStill({ composition, serveUrl, inputProps, output: outputPath, frame, imageFormat: "png", scale, ...browserOptions });
      diagnostics.write("preview-completed", { attempt, frame });
      return { path: outputPath, mimeType: "image/png", time: frame / composition.fps, frame, width: Math.round(composition.width * scale), height: Math.round(composition.height * scale), diagnosticLogPath: diagnostics.path, assetStats: staged.stats };
    }, diagnostics);
  } catch (error) {
    throw renderFailure(error, diagnostics);
  } finally {
    await staged.dispose();
  }
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
    .then((result) => updateRenderJob(job, { status: "completed", phase: "completed", progress: 1, outputPath: result.path, diagnosticLogPath: result.diagnosticLogPath, assetStats: result.assetStats, completedAt: new Date().toISOString() }))
    .catch((error) => {
      const canceled = job.status === "canceling" || /cancel/i.test(error instanceof Error ? error.message : String(error));
      updateRenderJob(job, { status: canceled ? "canceled" : "failed", phase: canceled ? "canceled" : "failed", error: canceled ? undefined : error instanceof Error ? error.message : String(error), diagnosticLogPath: error?.renderLogPath, completedAt: new Date().toISOString() });
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
  const diagnostics = createRenderDiagnostics(project, options, target);
  report({ phase: "preparing", progress: 0, message: "Staging project assets outside Chromium" });
  const renderProjectSnapshot = applyExportCanvasPolicy(project, options);
  const staged = await stageProjectAssetsForRender(renderProjectSnapshot);
  try {
    const serveUrl = await getServeUrl();
    const renderer = await import("@remotion/renderer");
    const { selectComposition, renderFrames, renderMedia } = renderer;
    const inputProps = { project: staged.project, renderMode: options.allScenes ? "all-scenes" : "active-scene", exportFps: options.fps };
    const inputPropsBytes = Buffer.byteLength(JSON.stringify(inputProps));
    const concurrency = renderConcurrency(staged.project, options);
    const logProgress = createProgressDiagnostics(diagnostics);
    diagnostics.write("assets-staged", { ...staged.stats, inputPropsBytes, concurrency, transparentCanvas: options.transparent });
    report({ phase: "preparing", progress: 0, message: `Prepared ${staged.stats.uniqueAssetCount} unique assets · renderer concurrency ${concurrency}` });

    const result = await retryClosedBrowser(async (attempt) => {
      diagnostics.write("render-attempt", { attempt, freeMemory: os.freemem() });
      const browserOptions = renderBrowserOptions(diagnostics);
      const composition = await selectComposition({ serveUrl, id: "KurogiMotion", inputProps, ...browserOptions });

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
          concurrency,
          ...browserOptions,
          ...(cancelSignal ? { cancelSignal } : {}),
          onStart: ({ frameCount: count }) => {
            frameCount = count;
            report({ phase: "rendering", progress: 0, renderedFrames: 0, frameCount, message: `Rendering 0 / ${frameCount} frames` });
          },
          onFrameUpdate: (renderedFrames) => {
            const progress = frameCount > 0 ? renderedFrames / frameCount : 0;
            report({ phase: "rendering", progress, renderedFrames, frameCount, message: `Rendering ${renderedFrames} / ${frameCount} frames` });
            logProgress({ phase: "rendering", progress, renderedFrames, frameCount });
          },
        });
        report({ phase: "completed", progress: 1, renderedFrames: frameCount, frameCount, message: outputDir });
        return { path: outputDir, frameCount };
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
        concurrency,
        disallowParallelEncoding: concurrency === 1,
        overwrite: true,
        ...browserOptions,
        ...(cancelSignal ? { cancelSignal } : {}),
        ...(media.crf === null ? {} : { crf: media.crf }),
        ...(media.imageFormat ? { imageFormat: media.imageFormat } : {}),
        ...(media.pixelFormat ? { pixelFormat: media.pixelFormat } : {}),
        ...(media.proResProfile ? { proResProfile: media.proResProfile } : {}),
        ...(media.ffmpegOverride ? { ffmpegOverride: media.ffmpegOverride } : {}),
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
          logProgress({ phase, progress, renderedFrames, encodedFrames, frameCount });
        },
      });
      report({ phase: "encoding", progress: 0.995, renderedFrames: frameCount, encodedFrames: frameCount, frameCount, message: options.format === "mov" && options.transparent ? "Verifying ProRes 4444 alpha channel" : "Verifying rendered output" });
      const outputVerification = await verifyRenderedOutput(target, options, renderer.RenderInternals, diagnostics, cancelSignal);
      report({ phase: "completed", progress: 1, renderedFrames: frameCount, encodedFrames: frameCount, frameCount, message: target });
      return { path: target, frameCount, outputVerification };
    }, diagnostics, report);

    diagnostics.write("render-completed", { path: result.path, frameCount: result.frameCount, outputVerification: result.outputVerification });
    return { path: result.path, diagnosticLogPath: diagnostics.path, assetStats: { ...staged.stats, inputPropsBytes, concurrency }, outputVerification: result.outputVerification };
  } catch (error) {
    throw renderFailure(error, diagnostics);
  } finally {
    await staged.dispose();
  }
}

function renderConcurrency(project, options) {
  const scenes = options.allScenes ? Object.values(project.scenes ?? {}) : [project.scenes?.[project.activeSceneId]].filter(Boolean);
  const duration = scenes.reduce((total, scene) => total + Number(scene.duration || 0), 0);
  const largestPixels = scenes.reduce((largest, scene) => Math.max(largest, Number(scene.width || 0) * Number(scene.height || 0) * options.scale * options.scale), 0);
  const assets = Object.values(project.assets ?? {});
  const assetBytes = assets.reduce((total, asset) => total + Math.max(0, Number(asset.byteSize) || 0), 0);
  if (duration >= 120 || assets.length >= 24 || assetBytes >= 64 * 1024 * 1024) return 1;
  if (largestPixels >= 1920 * 1080) return 2;
  return Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
}

function renderBrowserOptions(diagnostics) {
  return {
    logLevel: "warn",
    timeoutInMilliseconds: 120_000,
    onBrowserLog: (entry) => diagnostics.write("browser", { type: entry.type, text: entry.text, stackTrace: entry.stackTrace }),
  };
}

async function retryClosedBrowser(action, diagnostics, report) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try { return await action(attempt); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.write("attempt-failed", { attempt, message, stack: error instanceof Error ? error.stack : undefined, freeMemory: os.freemem() });
      if (attempt === 2 || /cancel/i.test(message) || !isClosedBrowserError(message)) throw error;
      report?.({ phase: "preparing", progress: 0, message: "Chromium closed during initialization; retrying once with a fresh browser" });
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  throw new Error("Renderer retry ended unexpectedly.");
}

function createProgressDiagnostics(diagnostics) {
  let lastPhase = "";
  let lastBucket = -1;
  return (details) => {
    const bucket = Math.floor(Math.max(0, Math.min(1, Number(details.progress) || 0)) * 20);
    if (details.phase === lastPhase && bucket === lastBucket) return;
    lastPhase = details.phase;
    lastBucket = bucket;
    diagnostics.write("render-progress", details);
  };
}

function isClosedBrowserError(message) {
  return /Target closed|Page\.addScriptToEvaluateOnNewDocument|browser (?:was )?closed|session closed/i.test(message);
}

function createRenderDiagnostics(project, options, target) {
  const directory = path.join(app.getPath("userData"), "render-logs");
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, `${safeFileName(project.name || "kurogi-motion")}-${Date.now()}.jsonl`);
  const write = (event, details = {}) => {
    try { fs.appendFileSync(filePath, `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...details })}\n`, "utf8"); }
    catch {}
  };
  write("render-created", {
    target,
    options,
    project: { id: project.id, name: project.name, scenes: Object.keys(project.scenes ?? {}).length, layers: Object.keys(project.layers ?? {}).length, assets: Object.keys(project.assets ?? {}).length },
    memory: { total: os.totalmem(), free: os.freemem() },
  });
  return { path: filePath, write };
}

function renderFailure(error, diagnostics) {
  const message = error instanceof Error ? error.message : String(error);
  diagnostics.write("render-failed", { message, stack: error instanceof Error ? error.stack : undefined, freeMemory: os.freemem() });
  const wrapped = new Error(`${message} Renderer log: ${diagnostics.path}`);
  wrapped.cause = error;
  wrapped.renderLogPath = diagnostics.path;
  return wrapped;
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
      ffmpegOverride: options.transparent ? addProResAlphaBits : undefined,
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

function addProResAlphaBits({ args }) {
  if (!args.includes("prores_ks") || args.includes("-alpha_bits") || args.length === 0) return args;
  return [...args.slice(0, -1), "-alpha_bits", "16", args.at(-1)];
}

function applyExportCanvasPolicy(project, options) {
  if (!options.transparent) return project;
  const sceneIds = options.allScenes ? Object.keys(project.scenes) : [project.activeSceneId];
  const scenes = { ...project.scenes };
  for (const sceneId of sceneIds) {
    const scene = scenes[sceneId];
    if (scene) scenes[sceneId] = { ...scene, background: { type: "transparent" } };
  }
  return { ...project, scenes };
}

async function verifyRenderedOutput(target, options, renderInternals, diagnostics, cancelSignal) {
  const stats = await fs.promises.stat(target).catch(() => null);
  if (!stats?.isFile() || stats.size === 0) throw new Error("The renderer completed without producing a valid output file.");

  const verification = { bytes: stats.size };
  if (options.format === "mov" && options.transparent) {
    let probe;
    try {
      const result = await renderInternals.callFf({
        bin: "ffprobe",
        args: ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,profile,pix_fmt", "-of", "json", target],
        indent: false,
        logLevel: "error",
        binariesDirectory: null,
        cancelSignal,
        options: { maxBuffer: 4 * 1024 * 1024 },
      });
      probe = JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`MOV alpha verification could not inspect the rendered file: ${error instanceof Error ? error.message : String(error)}`);
    }

    const stream = probe?.streams?.[0];
    const codec = String(stream?.codec_name ?? "").toLowerCase();
    const rawProfile = String(stream?.profile ?? "").toLowerCase();
    const profile = rawProfile === "4" ? "4444" : rawProfile === "5" ? "4444-xq" : rawProfile;
    const pixelFormat = String(stream?.pix_fmt ?? "").toLowerCase();
    if (codec !== "prores" || !profile.includes("4444") || !/^yuva444p/.test(pixelFormat)) {
      throw new Error(`MOV alpha verification failed: expected ProRes 4444 with a yuva444p alpha pixel format, received codec=${codec || "unknown"}, profile=${profile || "unknown"}, pixelFormat=${pixelFormat || "unknown"}.`);
    }
    Object.assign(verification, { codec, profile, pixelFormat, alphaChannel: true });
  }

  diagnostics.write("output-verified", verification);
  return verification;
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

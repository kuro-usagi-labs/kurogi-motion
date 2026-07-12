const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

let packagedBundlePromise = null;
let exportInProgress = false;

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

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("export-video", async (event, project, rawOptions = {}) => {
  if (exportInProgress) throw new Error("Another export is already running.");
  const options = normalizeExportOptions(rawOptions);
  validateProject(project);

  const target = await chooseExportTarget(project.name, options.format);
  if (!target) return { canceled: true };

  exportInProgress = true;
  sendProgress(event, {
    phase: "preparing",
    progress: 0,
    message: "Preparing the Remotion bundle",
  });

  try {
    const serveUrl = await getServeUrl();
    const { selectComposition, renderFrames, renderMedia } = await import("@remotion/renderer");
    const inputProps = { project };
    const composition = await selectComposition({
      serveUrl,
      id: "KurogiMotion",
      inputProps,
    });

    if (options.format === "png-sequence") {
      const outputDir = path.join(target, safeFileName(project.name || "kurogi-motion"));
      fs.mkdirSync(outputDir, { recursive: true });
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
        onStart: ({ frameCount: count }) => {
          frameCount = count;
          sendProgress(event, {
            phase: "rendering",
            progress: 0,
            renderedFrames: 0,
            frameCount,
            message: `Rendering 0 / ${frameCount} frames`,
          });
        },
        onFrameUpdate: (renderedFrames) => {
          sendProgress(event, {
            phase: "rendering",
            progress: frameCount > 0 ? renderedFrames / frameCount : 0,
            renderedFrames,
            frameCount,
            message: `Rendering ${renderedFrames} / ${frameCount} frames`,
          });
        },
      });
      sendProgress(event, {
        phase: "completed",
        progress: 1,
        renderedFrames: frameCount,
        frameCount,
        message: outputDir,
      });
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
      ...(media.crf === null ? {} : { crf: media.crf }),
      ...(media.imageFormat ? { imageFormat: media.imageFormat } : {}),
      ...(media.pixelFormat ? { pixelFormat: media.pixelFormat } : {}),
      ...(options.format === "gif" ? { numberOfGifLoops: options.gifLoops } : {}),
      onStart: ({ frameCount: count }) => {
        frameCount = count;
        sendProgress(event, {
          phase: "rendering",
          progress: 0,
          renderedFrames: 0,
          encodedFrames: 0,
          frameCount,
          message: `Rendering 0 / ${frameCount} frames`,
        });
      },
      onProgress: ({ progress, renderedFrames, encodedFrames, stitchStage }) => {
        const phase = stitchStage === "encoding" || stitchStage === "muxing"
          ? "encoding"
          : "rendering";
        sendProgress(event, {
          phase,
          progress,
          renderedFrames,
          encodedFrames,
          frameCount,
          message: phase === "encoding"
            ? `Encoding ${encodedFrames} / ${frameCount} frames`
            : `Rendering ${renderedFrames} / ${frameCount} frames`,
        });
      },
    });

    sendProgress(event, {
      phase: "completed",
      progress: 1,
      renderedFrames: frameCount,
      encodedFrames: frameCount,
      frameCount,
      message: target,
    });
    return { path: target };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendProgress(event, { phase: "failed", progress: 0, message });
    throw error;
  } finally {
    exportInProgress = false;
  }
});

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

async function chooseExportTarget(projectName, format) {
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

function mediaSettings(options) {
  const crf = options.quality === "high" ? 18 : options.quality === "low" ? 28 : 23;
  if (options.format === "gif") return { codec: "gif", crf: null };
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
  const allowedFormats = new Set(["mp4", "webm", "gif", "png-sequence"]);
  const allowedFps = new Set([24, 30, 60]);
  const allowedQuality = new Set(["low", "medium", "high"]);
  return {
    format: allowedFormats.has(raw.format) ? raw.format : "mp4",
    fps: allowedFps.has(Number(raw.fps)) ? Number(raw.fps) : 30,
    scale: Math.min(2, Math.max(0.1, Number(raw.scale) || 1)),
    quality: allowedQuality.has(raw.quality) ? raw.quality : "high",
    transparent: Boolean(raw.transparent),
    gifLoops: raw.gifLoops === null ? null : Math.max(0, Number(raw.gifLoops) || 0),
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

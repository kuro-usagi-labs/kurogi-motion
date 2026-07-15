import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { bundle } from "@remotion/bundler";
import { RenderInternals, renderMedia, selectComposition } from "@remotion/renderer";
import { createServer } from "vite";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const mainPath = path.join(repositoryRoot, "electron", "main.cjs");
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "kurogi-mov-alpha-"));
const outputPath = path.join(temporaryDirectory, "alpha-smoke.mov");
const noAlphaOutputPath = path.join(temporaryDirectory, "no-alpha-smoke.mov");
const bundleDirectory = path.join(temporaryDirectory, "bundle");
let vite;

try {
  const foundation = await loadExportFoundation(mainPath);
  assertExportContracts(foundation);

  vite = await createServer({
    appType: "custom",
    configFile: false,
    envFile: false,
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  const core = await vite.ssrLoadModule("/src/core/project.ts");
  let project = core.createProject({
    name: "MOV alpha smoke",
    format: "custom",
    width: 96,
    height: 64,
    duration: 0.25,
    fps: 24,
    background: "#12b981",
  });
  const scene = core.getActiveScene(project);
  const card = core.createShapeLayer(scene, "rectangle", {
    name: "Opaque center",
    position: { x: 24, y: 16 },
    size: { width: 48, height: 32 },
    fill: "#ff3158",
  });
  card.style.borderRadius = 0;
  const translucentChip = core.createShapeLayer(scene, "rectangle", {
    name: "Half alpha chip",
    position: { x: 8, y: 8 },
    size: { width: 16, height: 16 },
    fill: "#3366ff",
  });
  translucentChip.style.borderRadius = 0;
  translucentChip.opacity = 0.5;
  project = core.addLayers(project, [card, translucentChip]);
  await vite.close();
  vite = null;

  const options = foundation.normalizeExportOptions({ format: "mov", fps: 24, scale: 1, quality: "high", transparent: true });
  const renderProject = foundation.applyExportCanvasPolicy(project, options);
  assert.equal(project.scenes[project.activeSceneId].background.type, "solid", "The editor project must not be mutated for export.");
  assert.equal(renderProject.scenes[renderProject.activeSceneId].background.type, "transparent", "The backend must force the selected export canvas to transparent.");
  const secondSceneId = "mov-alpha-second-scene";
  const multiSceneProject = { ...project, scenes: { ...project.scenes, [secondSceneId]: { ...scene, id: secondSceneId, background: { type: "solid", color: "#112233" } } } };
  const allScenesProject = foundation.applyExportCanvasPolicy(multiSceneProject, { ...options, allScenes: true });
  assert.ok(Object.values(allScenesProject.scenes).every((candidate) => candidate.background.type === "transparent"), "Every scene in an all-scenes alpha export must use a transparent canvas.");
  assert.ok(Object.values(multiSceneProject.scenes).every((candidate) => candidate.background.type === "solid"), "All-scenes export policy must remain immutable.");

  const serveUrl = await bundle({
    entryPoint: path.join(repositoryRoot, "src", "remotion-entry.tsx"),
    outDir: bundleDirectory,
    webpackOverride: (config) => config,
  });
  const inputProps = { project: renderProject, renderMode: "active-scene", exportFps: options.fps };
  const composition = await selectComposition({ serveUrl, id: "KurogiMotion", inputProps, logLevel: "error" });
  const media = foundation.mediaSettings(options);
  await renderMedia({
    composition,
    serveUrl,
    inputProps,
    outputLocation: outputPath,
    codec: media.codec,
    imageFormat: media.imageFormat,
    pixelFormat: media.pixelFormat,
    proResProfile: media.proResProfile,
    ffmpegOverride: media.ffmpegOverride,
    concurrency: 4,
    overwrite: true,
    logLevel: "error",
  });

  const diagnosticEvents = [];
  const verification = await foundation.verifyRenderedOutput(
    outputPath,
    options,
    RenderInternals,
    { write: (event, details) => diagnosticEvents.push({ event, details }) },
  );
  assert.equal(verification.codec, "prores");
  assert.match(verification.profile, /4444/);
  assert.match(verification.pixelFormat, /^yuva444p/);
  assert.equal(verification.alphaChannel, true);
  assert.ok(diagnosticEvents.some(({ event }) => event === "output-verified"), "Successful alpha verification must be written to renderer diagnostics.");

  const rgbaFrame = await extractFirstRgbaFrame(outputPath);
  const frameBytes = composition.width * composition.height * 4;
  assert.ok(rgbaFrame.length >= frameBytes, `Decoded RGBA frame is too small: ${rgbaFrame.length} bytes.`);
  const alphaAt = (x, y) => rgbaFrame[(y * composition.width + x) * 4 + 3];
  const rgbaAt = (x, y) => Array.from(rgbaFrame.subarray((y * composition.width + x) * 4, (y * composition.width + x) * 4 + 4));
  assert.ok(alphaAt(0, 0) <= 2, `Transparent canvas corner is unexpectedly opaque (${alphaAt(0, 0)}).`);
  assert.ok(alphaAt(48, 32) >= 253, `Opaque center layer lost alpha coverage (${alphaAt(48, 32)}).`);
  assert.ok(alphaAt(16, 16) >= 125 && alphaAt(16, 16) <= 130, `Half-transparent layer has incorrect alpha coverage (${alphaAt(16, 16)}).`);
  assert.ok(rgbaAt(16, 16)[2] >= 245, `Half-transparent color was premultiplied or damaged (${rgbaAt(16, 16).join(",")}).`);
  const alphaSamples = new Set();
  for (let offset = 3; offset < frameBytes; offset += 4) alphaSamples.add(rgbaFrame[offset]);
  assert.ok(alphaSamples.size > 1, "Rendered MOV contains an alpha-capable stream but no varying alpha samples.");

  await renderMedia({
    composition,
    serveUrl,
    inputProps,
    outputLocation: noAlphaOutputPath,
    codec: "prores",
    imageFormat: "png",
    pixelFormat: "yuv444p10le",
    proResProfile: "4444",
    concurrency: 4,
    overwrite: true,
    logLevel: "error",
  });
  await assert.rejects(
    foundation.verifyRenderedOutput(noAlphaOutputPath, options, RenderInternals, { write: () => undefined }),
    /MOV alpha verification failed: expected ProRes 4444 with a yuva444p alpha pixel format/,
    "A ProRes file without an alpha pixel format must not be reported as a successful MOV alpha export.",
  );

  const stats = await fs.stat(outputPath);
  console.log(`MOV alpha export audit passed: ${composition.durationInFrames} frames, ${stats.size} bytes, ${verification.profile}/${verification.pixelFormat}, alpha samples=${alphaAt(0, 0)}/${alphaAt(16, 16)}/${alphaAt(48, 32)}.`);
} finally {
  if (vite) await vite.close().catch(() => undefined);
  const resolved = path.resolve(temporaryDirectory);
  const temporaryRoot = path.resolve(os.tmpdir());
  if (!resolved.startsWith(`${temporaryRoot}${path.sep}`) || !path.basename(resolved).startsWith("kurogi-mov-alpha-")) {
    throw new Error(`Refusing to remove unexpected MOV alpha audit directory: ${resolved}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
}

async function loadExportFoundation(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  const localRequire = createRequire(filePath);
  const ipcMain = { handle: () => undefined };
  const electron = {
    app: { requestSingleInstanceLock: () => false, quit: () => undefined },
    BrowserWindow: class {},
    dialog: {},
    ipcMain,
    shell: {},
  };
  const module = { exports: {} };
  const sandbox = {
    Buffer,
    URL,
    __dirname: path.dirname(filePath),
    __filename: filePath,
    clearTimeout,
    console,
    exports: module.exports,
    fetch,
    module,
    process,
    require: (specifier) => specifier === "electron" ? electron : localRequire(specifier),
    setTimeout,
  };
  const testExports = "\nmodule.exports = { addProResAlphaBits, applyExportCanvasPolicy, mediaSettings, normalizeExportOptions, verifyRenderedOutput };";
  vm.runInNewContext(`${source}${testExports}`, sandbox, { filename: filePath });
  return module.exports;
}

function assertExportContracts(foundation) {
  const options = foundation.normalizeExportOptions({ format: "mov", fps: 24, scale: 1, quality: "high", transparent: true });
  assert.equal(options.transparent, true);
  const media = foundation.mediaSettings(options);
  assert.equal(media.codec, "prores");
  assert.equal(media.imageFormat, "png", "Transparent frames must reach FFmpeg as PNG, not JPEG.");
  assert.equal(media.pixelFormat, "yuva444p10le", "MOV alpha must use a 4:4:4 alpha-capable FFmpeg input format.");
  assert.equal(media.proResProfile, "4444");
  assert.equal(typeof media.ffmpegOverride, "function");
  assert.deepEqual(
    Array.from(media.ffmpegOverride({ args: ["-c:v", "prores_ks", "output.mov"] })),
    ["-c:v", "prores_ks", "-alpha_bits", "16", "output.mov"],
    "The ProRes encoder must explicitly preserve a 16-bit alpha plane.",
  );

  assert.equal(foundation.normalizeExportOptions({ format: "mp4", transparent: true }).transparent, false, "MP4 must keep rejecting unsupported alpha.");
  assert.equal(foundation.mediaSettings({ format: "mp4", quality: "high", transparent: false }).codec, "h264");
  assert.equal(foundation.mediaSettings({ format: "webm", quality: "high", transparent: true }).pixelFormat, "yuva420p");
  assert.equal(foundation.mediaSettings({ format: "gif", quality: "high", transparent: false }).codec, "gif");
}

async function extractFirstRgbaFrame(filePath) {
  const result = await RenderInternals.callFf({
    bin: "ffmpeg",
    args: ["-v", "error", "-i", filePath, "-frames:v", "1", "-pix_fmt", "rgba", "-c:v", "rawvideo", "-f", "image2pipe", "pipe:1"],
    indent: false,
    logLevel: "error",
    binariesDirectory: null,
    cancelSignal: undefined,
    options: { encoding: null, maxBuffer: 8 * 1024 * 1024 },
  });
  return Buffer.from(result.stdout);
}

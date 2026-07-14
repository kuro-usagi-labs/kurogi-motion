import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createServer } from "vite";

const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "kurogi-render-smoke-"));
const bundleDirectory = path.join(temporaryDirectory, "bundle");
const outputPath = path.join(temporaryDirectory, "autonomous-smoke.mp4");
let vite;

try {
  vite = await createServer({
    appType: "custom",
    configFile: false,
    envFile: false,
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  const core = await vite.ssrLoadModule("/src/core/project.ts");
  const workspace = await vite.ssrLoadModule("/src/core/sceneWorkspace.ts");
  let project = core.createProject({
    name: "Autonomous render smoke",
    format: "custom",
    width: 320,
    height: 180,
    duration: .5,
    fps: 24,
    background: "#11121a",
  });
  const scene = core.getActiveScene(project);
  const title = core.createTextLayer(scene, {
    name: "Smoke title",
    text: "MCP AUTO",
    position: { x: 20, y: 55 },
    size: { width: 280, height: 70 },
    fontSize: 34,
    color: "#ffffff",
  });
  title.style.align = "center";
  title.animationActions.push(core.createAnimationAction(title.id, "in", "fadeIn", { duration: .3 }));
  project = core.addLayers(project, [title]);
  const createdScene = workspace.createScene(project);
  project = workspace.updateScene(createdScene.project, createdScene.sceneId, { name: "Second scene", width: 320, height: 180, duration: .5, fps: 24, background: { type: "solid", color: "#291d52" } });
  project = workspace.setSceneTransition(project, createdScene.sceneId, { type: "fade", duration: .2 });
  const secondScene = project.scenes[createdScene.sceneId];
  const secondTitle = core.createTextLayer(secondScene, { name: "Second title", text: "SCENE TWO", position: { x: 20, y: 55 }, size: { width: 280, height: 70 }, fontSize: 30, color: "#ffffff" });
  secondTitle.style.align = "center";
  project = core.addLayers(project, [secondTitle]);
  await vite.close();
  vite = null;

  const serveUrl = await bundle({
    entryPoint: path.resolve("src/remotion-entry.tsx"),
    outDir: bundleDirectory,
    webpackOverride: (config) => config,
  });
  const inputProps = { project, renderMode: "all-scenes", exportFps: 24 };
  const composition = await selectComposition({ serveUrl, id: "KurogiMotion", inputProps });
  assert.equal(composition.durationInFrames, 19, "Two 12-frame scenes with a 5-frame overlap should render as 19 frames.");
  await renderMedia({
    composition,
    serveUrl,
    inputProps,
    outputLocation: outputPath,
    codec: "h264",
    crf: 32,
    overwrite: true,
    logLevel: "error",
  });

  const stats = await fs.stat(outputPath);
  assert.ok(stats.isFile());
  assert.ok(stats.size > 1_000, `Rendered MP4 is unexpectedly small: ${stats.size} bytes.`);
  console.log(`Autonomous multi-scene transition render smoke audit passed: ${composition.durationInFrames} frames, ${stats.size} bytes.`);
} finally {
  if (vite) await vite.close().catch(() => undefined);
  const resolved = path.resolve(temporaryDirectory);
  const temporaryRoot = path.resolve(os.tmpdir());
  if (!resolved.startsWith(`${temporaryRoot}${path.sep}`) || !path.basename(resolved).startsWith("kurogi-render-smoke-")) {
    throw new Error(`Refusing to remove unexpected render audit directory: ${resolved}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
}

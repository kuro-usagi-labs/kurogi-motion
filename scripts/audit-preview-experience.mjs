import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { hmr: false, middlewareMode: true, watch: null },
});

try {
  const policy = await server.ssrLoadModule("/src/app/previewPolicy.ts");
  const core = await server.ssrLoadModule("/src/core/project.ts");
  const dialogModule = await server.ssrLoadModule("/src/editor/AnimationPresetDialog.tsx");
  const canvasModule = await server.ssrLoadModule("/src/editor/MultiSceneCanvasStage.tsx");

  assert.equal(policy.projectPreviewDuration(17 * 60), 7, "Long projects must be capped to a seven-second homepage preview.");
  assert.equal(policy.projectPreviewDuration(4.5), 4.5, "Short projects must preserve their real duration.");
  assert.equal(policy.previewDurationInFrames(17 * 60, 30), 210, "The seven-second policy must also cap player frames.");
  assert.equal(policy.previewDurationInFrames(.01, 60), 1, "Tiny projects still need one valid frame.");

  let project = core.createProject({ name: "Preview audit", format: "landscape", duration: 6, fps: 30 });
  const sourceScene = core.getActiveScene(project);
  const source = core.createTextLayer(sourceScene, {
    name: "Oversized headline",
    text: "MOTION",
    position: { x: 0, y: 900 },
    size: { width: 1600, height: 500 },
    fontSize: 240,
  });
  source.animationActions.push(core.createAnimationAction(source.id, "in", "moveIn", { startTime: 0, duration: .6 }));
  source.animationActions.push(core.createAnimationAction(source.id, "out", "fadeOut", { startTime: 5, duration: .5 }));
  project = core.addLayers(project, [source]);

  const designFrame = canvasModule.designSurfaceFrame(project, sourceScene.id);
  assert.ok(designFrame > .6 * sourceScene.fps, "Design mode must seek beyond entrance animations so elements remain visible while styling.");
  assert.ok(designFrame < 5 * sourceScene.fps, "Design mode must stay before exit animations.");

  const preview = dialogModule.buildPresetPreviewProject(project, source, "dropOut");
  const scene = preview.scenes[preview.activeSceneId];
  const layer = preview.layers[scene.layerIds[0]];
  assert.equal(scene.width, 960, "Preset previews must render from a high-resolution 16:9 canvas.");
  assert.equal(scene.height, 540, "Preset previews must render from a high-resolution 16:9 canvas.");
  assert.ok(layer.position.x >= 250 && layer.position.y >= 150, "The preview subject must keep safe movement space on every side.");
  assert.ok(layer.position.x + layer.size.width <= 710, "The preview subject must not touch the right crop edge.");
  assert.ok(layer.position.y + layer.size.height <= 390, "The preview subject must not be clipped at the bottom.");
  assert.ok(layer.style.fontSize < source.style.fontSize, "Text metrics must scale with the preview layer instead of clipping inside a smaller box.");

  const [dashboard, projectPreview, dialog, hook, css] = await Promise.all([
    "../src/app/DashboardV3.tsx",
    "../src/app/ProjectMotionPreview.tsx",
    "../src/editor/AnimationPresetDialog.tsx",
    "../src/ui/useMotionPreview.ts",
    "../src/previewExperience.css",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

  assert.ok(dashboard.includes("<ProjectMotionPreview"), "Recent projects must mount real motion previews.");
  assert.ok(projectPreview.includes("loadProject(summary.id)"), "Project cards must lazily hydrate the real saved project.");
  assert.ok(projectPreview.includes("previewDurationInFrames"), "Project preview playback must use the bounded duration policy.");
  assert.ok(projectPreview.includes("initiallyMuted"), "Dashboard previews must never emit project audio.");
  assert.ok(projectPreview.includes("Preview unavailable"), "Missing projects need an explicit fallback state.");
  assert.ok(hook.includes("IntersectionObserver"), "Motion previews must stop outside the viewport.");
  assert.ok(hook.includes("prefers-reduced-motion: reduce"), "Preview motion must respect reduced-motion preferences.");
  assert.ok(hook.includes("visibilitychange"), "Preview motion must pause while the app window is hidden.");
  assert.ok(dialog.includes("buildPresetPreviewProject"), "Preset cards must use the production-rendered preview project.");
  assert.ok(dialog.includes("shouldPlay"), "Preset cards must use visibility-aware playback.");
  assert.ok(!dialog.includes("autoPlay"), "Preset players must not autoplay outside lifecycle control.");
  assert.match(css, /\.motion-preset-frame\s*\{[\s\S]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(css, /grid-auto-rows:\s*minmax\(232px,auto\)/, "Preset grid rows must scroll at full card height instead of crushing live previews.");
  assert.match(css, /\.motion-preset-card\s*\{[\s\S]*min-height:\s*232px/, "Preset cards must preserve their preview and label regions.");
  assert.match(css, /\.project-motion-preview\s*\{[\s\S]*height:\s*190px/);
  assert.match(css, /text-rendering:\s*geometricPrecision/);

  console.log("Preview experience audit passed: project loops are capped, previews are lazy and silent, and preset subjects render sharply inside a safe 16:9 stage.");
} finally {
  await server.close();
}

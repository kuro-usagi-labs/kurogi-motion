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
  const core = await server.ssrLoadModule("/src/core/project.ts");
  const direct = await server.ssrLoadModule("/src/core/canvasDirectManipulation.ts");
  const design = await server.ssrLoadModule("/src/core/designTools.ts");
  const clipping = await server.ssrLoadModule("/src/renderer/clippingMask.ts");

  let project = core.createProject({
    name: "Canvas direct manipulation audit",
    format: "square",
    width: 1000,
    height: 1000,
  });
  const scene = core.getActiveScene(project);

  const line = core.createShapeLayer(scene, "line", {
    name: "Hairline",
    position: { x: 100, y: 100 },
    size: { width: 320, height: 14 },
  });
  const thinLine = direct.resizeLayerOnCanvas(line, "south", { x: 0, y: -500 });
  assert.equal(thinLine.size.width, 320, "A side handle must only change the requested line axis.");
  assert.equal(thinLine.size.height, 1, "A line must be resizable to a true one-pixel hairline on canvas.");

  const rectangle = core.createShapeLayer(scene, "rectangle", {
    name: "Card",
    position: { x: 120, y: 160 },
    size: { width: 240, height: 120 },
  });
  const tinyRectangle = direct.resizeLayerOnCanvas(rectangle, "south-east", { x: -1000, y: -1000 });
  assert.deepEqual(tinyRectangle.size, { width: 8, height: 8 }, "Non-line layers must keep a usable minimum.");

  const text = core.createTextLayer(scene, {
    name: "Scalable title",
    text: "SCALE ME",
    position: { x: 80, y: 240 },
    size: { width: 400, height: 120 },
    fontSize: 60,
  });
  text.style.letterSpacing = 2;
  text.style.strokeWidth = 2;
  const scaledText = direct.resizeLayerOnCanvas(text, "south-east", { x: -200, y: -60 });
  assert.deepEqual(scaledText.size, { width: 200, height: 60 });
  assert.equal(scaledText.style.fontSize, 30, "Corner scaling must resize text glyphs, not crop their box.");
  assert.equal(scaledText.style.letterSpacing, 1, "Text metrics must scale as one visual object.");
  assert.equal(scaledText.style.strokeWidth, 1, "Text strokes must scale with the glyphs.");
  const widenedText = direct.resizeLayerOnCanvas(text, "east", { x: 75, y: 200 });
  assert.deepEqual(widenedText.size, { width: 475, height: 120 }, "A side handle may edit the text box independently.");
  assert.equal(widenedText.style.fontSize, 60, "Side resizing must not silently alter text size.");

  const base = core.createShapeLayer(scene, "circle", {
    name: "Live clipping source",
    position: { x: 180, y: 180 },
    size: { width: 360, height: 360 },
  });
  const target = core.createTextLayer(scene, {
    name: "Clipped target",
    text: "LIVE",
    position: { x: 100, y: 260 },
    size: { width: 760, height: 180 },
  });
  project = core.addLayers(project, [line, rectangle, text, base, target]);
  project = design.createClippingMask(project, target.id).project;
  const beforeMask = clipping.clippingMaskSceneStyle(project, project.layers[target.id], scene, 0);
  const movedBase = {
    ...project.layers[base.id],
    position: { x: project.layers[base.id].position.x + 140, y: project.layers[base.id].position.y + 25 },
  };
  const liveProject = direct.projectWithCanvasDraft(project, movedBase);
  const duringMask = clipping.clippingMaskSceneStyle(liveProject, liveProject.layers[target.id], scene, 0);
  assert.notEqual(duringMask.maskImage, beforeMask.maskImage, "Moving a clipping source must regenerate dependent masks during the pointer gesture.");
  assert.equal(project.layers[base.id].position.x, 180, "A live canvas draft must not mutate the committed project.");

  assert.equal(
    direct.crispWorkspaceTransform({ x: 12.5, y: -8 }, 175),
    "translate(12.5px, -8px) scale(1.75)",
    "Infinite-canvas zoom must use a repaintable 2D transform.",
  );

  const [compositionSource, stageSource] = await Promise.all([
    readFile(new URL("../src/MotionComposition.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/editor/MultiSceneCanvasStage.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(compositionSource, /clippingMaskSceneStyle\(renderedProject, layer, scene, time\)/, "Clipped layers must render from live draft geometry.");
  assert.match(compositionSource, /aria-label="Resize layer height"/, "Thin-axis canvas resizing needs a discoverable side handle.");
  assert.match(compositionSource, /if \(finalLayer\.type === "text"\) patch\.style = finalLayer\.style/, "The scaled text style must be committed with its bounds.");
  assert.match(stageSource, /data-preview-quality="crisp-vector"/, "Artboards must opt out of filter-rasterized zoom previews.");
  assert.match(stageSource, /backfaceVisibility:\s*"visible"/, "Player surfaces must remain repaintable at the current zoom resolution.");
  assert.doesNotMatch(stageSource, /transform:\s*`translate3d\(/, "The workspace must not pin a low-resolution 3D raster while zooming.");

  console.log("Canvas direct-manipulation audit passed: one-pixel lines, proportional text scaling, live clipping masks, and crisp infinite-canvas transforms are wired.");
} finally {
  await server.close();
}

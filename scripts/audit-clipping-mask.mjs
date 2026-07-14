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
  const projectCore = await server.ssrLoadModule("/src/core/project.ts");
  const design = await server.ssrLoadModule("/src/core/designTools.ts");
  const clipping = await server.ssrLoadModule("/src/renderer/clippingMask.ts");

  let project = projectCore.createProject({ name: "Clipping audit", format: "square", width: 1000, height: 1000 });
  const scene = projectCore.getActiveScene(project);
  const base = projectCore.createShapeLayer(scene, "circle", {
    name: "Mask base",
    position: { x: 180, y: 180 },
    size: { width: 420, height: 420 },
  });
  const target = projectCore.createTextLayer(scene, {
    name: "Clipped content",
    text: "CLIPPED",
    position: { x: 80, y: 260 },
    size: { width: 800, height: 180 },
  });
  project = projectCore.addLayers(project, [base, target]);

  assert.equal(design.canCreateClippingMask(project, target.id), true, "The upper layer should use the layer directly below.");
  const created = design.createClippingMask(project, target.id);
  project = created.project;
  assert.equal(created.sourceLayerId, base.id);
  assert.equal(project.layers[target.id].mask.sourceLayerId, base.id);
  assert.equal(project.layers[target.id].mask.clipping, true);
  assert.equal(Boolean(project.layers[base.id].maskSource), false, "A Photoshop-style clipping base remains visible.");

  const style = clipping.clippingMaskSceneStyle(project, project.layers[target.id], scene, 0);
  assert.ok(String(style.maskImage).includes("data:image/svg+xml"), "The clipping renderer should create a scene-space alpha mask.");
  assert.equal(style.maskSize, "100% 100%");

  project = design.releaseClippingMask(project, target.id);
  assert.equal(project.layers[target.id].mask, undefined);
  assert.equal(design.canCreateClippingMask(project, base.id), false, "The bottom layer cannot create a clipping mask without a base.");

  project = design.createClippingMask(project, target.id).project;
  project = projectCore.removeLayer(project, base.id);
  assert.equal(project.layers[target.id].mask, undefined, "Deleting a clipping source must release dependent layers.");

  const types = await readFile(new URL("../src/types.ts", import.meta.url), "utf8");
  const editor = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");
  const composition = await readFile(new URL("../src/MotionComposition.tsx", import.meta.url), "utf8");
  const stage = await readFile(new URL("../src/editor/MultiSceneCanvasStage.tsx", import.meta.url), "utf8");
  const menu = await readFile(new URL("../src/editor/LayerContextMenu.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/layerContextMenu.css", import.meta.url), "utf8");

  for (const [source, needle, message] of [
    [types, "clipping?: boolean", "Mask definitions do not distinguish clipping masks."],
    [composition, "onLayerContextMenu", "Canvas layers do not emit right-click context requests."],
    [composition, "clippingMaskSceneStyle", "Clipping masks are not mounted in the renderer."],
    [stage, "onLayerContextMenu", "The multi-scene stage does not forward context-menu events."],
    [editor, "LayerContextMenu", "The editor does not mount the layer context menu."],
    [menu, "Create Clipping Mask", "The layer context menu is missing clipping-mask creation."],
    [menu, "Release Clipping Mask", "The context menu cannot release clipping masks."],
    [menu, "Bring Forward", "Expected layer commands are missing from the context menu."],
    [css, "z-index:2147483200", "The context menu is not protected from editor stacking contexts."],
  ]) assert.ok(source.includes(needle), message);

  console.log("Clipping mask audit passed: layer-below alpha clipping, source visibility, cleanup, portal context menu, and layer commands are wired.");
} finally {
  await server.close();
}

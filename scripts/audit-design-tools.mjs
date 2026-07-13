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
  const historyCore = await server.ssrLoadModule("/src/core/historyPatch.ts");

  let project = projectCore.createProject({ name: "Design audit", format: "square", width: 1000, height: 1000 });
  const scene = projectCore.getActiveScene(project);
  const a = projectCore.createShapeLayer(scene, "rectangle", { position: { x: 80, y: 120 }, size: { width: 120, height: 120 } });
  const b = projectCore.createShapeLayer(scene, "circle", { position: { x: 360, y: 300 }, size: { width: 100, height: 100 } });
  const c = projectCore.createShapeLayer(scene, "star", { position: { x: 720, y: 540 }, size: { width: 80, height: 80 } });
  project = projectCore.addLayers(project, [a, b, c]);

  project = design.alignLayers(project, [a.id, b.id, c.id], "top");
  assert.equal(project.layers[a.id].position.y, project.layers[b.id].position.y);
  assert.equal(project.layers[b.id].position.y, project.layers[c.id].position.y);

  project = design.distributeLayers(project, [a.id, b.id, c.id], "horizontal");
  const firstGap = project.layers[b.id].position.x - (project.layers[a.id].position.x + project.layers[a.id].size.width);
  const secondGap = project.layers[c.id].position.x - (project.layers[b.id].position.x + project.layers[b.id].size.width);
  assert.ok(Math.abs(firstGap - secondGap) < 0.001, "Horizontal spacing should be equal.");

  const beforeGroup = project;
  const grouped = design.groupLayers(project, [a.id, b.id]);
  assert.ok(grouped.groupId);
  project = grouped.project;
  assert.equal(project.layers[a.id].parentId, grouped.groupId);
  assert.equal(project.layers[b.id].parentId, grouped.groupId);
  assert.deepEqual(project.layers[grouped.groupId].childIds, [a.id, b.id]);

  const patch = historyCore.createProjectPatch(beforeGroup, project);
  assert.equal(historyCore.applyProjectPatch(project, patch, "before").layers[grouped.groupId], undefined);
  assert.ok(historyCore.applyProjectPatch(beforeGroup, patch, "after").layers[grouped.groupId]);

  const ungrouped = design.ungroupLayer(project, grouped.groupId);
  project = ungrouped.project;
  assert.equal(project.layers[grouped.groupId], undefined);
  assert.equal(project.layers[a.id].parentId, undefined);

  project = design.setGradient(project, [a.id], { type: "linear", startColor: "#ff0000", endColor: "#0000ff", angle: 45 });
  project = design.setBlendMode(project, [a.id], "screen");
  project = design.setBackgroundBlur(project, [a.id], 24);
  assert.equal(project.layers[a.id].style.gradient.type, "linear");
  assert.equal(project.layers[a.id].blendMode, "screen");
  assert.equal(project.layers[a.id].backgroundBlur, 24);

  project = design.applyMask(project, c.id, a.id, "vector");
  assert.equal(project.layers[c.id].mask.sourceLayerId, a.id);
  assert.equal(project.layers[a.id].maskSource, true);
  project = design.clearMask(project, c.id);
  assert.equal(project.layers[c.id].mask, undefined);
  assert.equal(project.layers[a.id].maskSource, false);

  const snap = design.snapLayerPosition(project.layers[c.id], { x: 456, y: 454 }, scene, Object.values(project.layers), 8);
  assert.equal(snap.position.x, 460);
  assert.equal(snap.position.y, 460);
  assert.equal(snap.guides.length, 2);

  const types = await readFile(new URL("../src/types.ts", import.meta.url), "utf8");
  const composition = await readFile(new URL("../src/MotionComposition.tsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");
  const stage = await readFile(new URL("../src/editor/MultiSceneCanvasStage.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../src/editor/DesignToolsPanel.tsx", import.meta.url), "utf8");
  for (const [source, needle, message] of [
    [types, 'type: "image" | "svg" | "font"', "Font assets are missing from the project model."],
    [composition, "snapLayerPosition", "Direct manipulation is not connected to smart snapping."],
    [composition, "alignment-guide", "Alignment guides are not rendered."],
    [composition, "projectFontFaceCss", "Custom fonts are not loaded in preview/export."],
    [composition, "StaticLayerTree", "Grouped children are not rendered as a layer tree."],
    [editor, "DesignToolsPanel", "The design toolbar is not mounted in the editor."],
    [editor, "selectedLayerIds", "Multi-selection is not wired."],
    [stage, "selectedLayerIds", "Multi-selection is not passed through the multi-scene stage."],
    [panel, "Use vector mask", "Vector mask controls are missing."],
    [panel, "Linear gradient", "Gradient controls are missing."],
  ]) assert.ok(source.includes(needle), message);

  console.log("Design tools audit passed: snapping, alignment, distribution, gradients, compositing, masks, fonts, grouping, and history are wired.");
} finally {
  await server.close();
}

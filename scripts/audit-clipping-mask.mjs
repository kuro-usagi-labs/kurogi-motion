import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({ appType: "custom", configFile: false, logLevel: "error", optimizeDeps: { noDiscovery: true }, server: { hmr: false, middlewareMode: true, watch: null } });
try {
  const projectCore = await server.ssrLoadModule("/src/core/project.ts");
  const design = await server.ssrLoadModule("/src/core/designTools.ts");
  const styles = await server.ssrLoadModule("/src/renderer/designStyles.ts");
  const evaluator = await server.ssrLoadModule("/src/core/evaluator.ts");
  let project = projectCore.createProject({ name: "Clipping audit", format: "square", width: 800, height: 800 });
  const scene = projectCore.getActiveScene(project);
  const base = projectCore.createShapeLayer(scene, "circle", { name: "Base circle", position: { x: 160, y: 180 }, size: { width: 320, height: 320 } });
  const target = projectCore.createTextLayer(scene, { name: "Clipped title", text: "MASK", position: { x: 90, y: 210 }, size: { width: 620, height: 220 }, fontSize: 150 });
  project = projectCore.addLayers(project, [base, target]);
  assert.equal(design.getClippingMaskBase(project, target.id)?.id, base.id);
  const clipped = design.applyClippingMask(project, target.id);
  project = clipped.project;
  assert.equal(clipped.sourceLayerId, base.id);
  assert.equal(project.layers[target.id].mask.type, "clipping");
  assert.notEqual(project.layers[base.id].maskSource, true, "Photoshop-style clipping base must stay visible.");
  const visual = evaluator.evaluateLayer(project.layers[target.id], scene, 0);
  const maskStyle = styles.layerCompositingStyle(project, project.layers[target.id], scene, 0, visual);
  assert.match(String(maskStyle.maskImage), /data:image\/svg\+xml/);
  project = design.releaseClippingMask(project, target.id);
  assert.equal(project.layers[target.id].mask, undefined);
  project = design.applyClippingMask(project, target.id).project;
  project = projectCore.removeLayer(project, base.id);
  assert.equal(project.layers[target.id].mask, undefined, "Deleting a clipping base must release dependants.");

  const editor = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");
  const composition = await readFile(new URL("../src/MotionComposition.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../src/types.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/clippingMask.css", import.meta.url), "utf8");
  assert.ok(types.includes('"clipping"'), "Clipping mask type is missing.");
  assert.ok(editor.includes("Create Clipping Mask") && editor.includes("Release Clipping Mask"), "Layer context menu commands are missing.");
  assert.ok(editor.includes("onContextMenu") && composition.includes("onLayerContextMenu"), "Right-click canvas/sidebar wiring is missing.");
  assert.ok(css.includes(".layer-context-menu") && css.includes(".is-clipping-target"), "Clipping mask UX styles are missing.");
  console.log("Clipping mask audit passed: base lookup, visible base, SVG alpha rendering, release, delete cleanup, and right-click UX are wired.");
} finally {
  await server.close();
}

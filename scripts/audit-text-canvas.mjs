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
  const textLayout = await server.ssrLoadModule("/src/core/textLayout.ts");
  const canvasMath = await server.ssrLoadModule("/src/editor/canvasMath.ts");
  const issues = [];

  if (textLayout.normalizeTextVerticalAlign(undefined) !== "middle") issues.push("Missing vertical alignment must migrate to middle");
  if (textLayout.textVerticalJustification("top") !== "flex-start") issues.push("Top text alignment mapping is invalid");
  if (textLayout.textVerticalJustification("middle") !== "center") issues.push("Middle text alignment mapping is invalid");
  if (textLayout.textVerticalJustification("bottom") !== "flex-end") issues.push("Bottom text alignment mapping is invalid");

  const project = projectCore.createProject({ name: "Text audit", format: "square" });
  const scene = projectCore.getActiveScene(project);
  const layer = projectCore.createTextLayer(scene);
  if (layer.style.verticalAlign !== "middle") issues.push("New text layers must start vertically centered");

  const legacyProject = structuredClone(project);
  legacyProject.layers[layer.id] = layer;
  legacyProject.scenes[scene.id].layerIds = [layer.id];
  delete legacyProject.layers[layer.id].style.verticalAlign;
  const migrated = projectCore.normalizeProject(legacyProject);
  if (migrated.layers[layer.id].style.verticalAlign !== "middle") issues.push("Legacy text layers did not migrate to middle alignment");

  const currentZoom = 100;
  const nextZoom = canvasMath.zoomFromWheel(currentZoom, -120);
  if (!(nextZoom > currentZoom)) issues.push("Wheel-up zoom must increase zoom");
  const pan = { x: 37, y: -24 };
  const pointer = { x: 180, y: 95 };
  const nextPan = canvasMath.panForZoomAnchor(pan, pointer, currentZoom, nextZoom);
  const before = { x: (pointer.x - pan.x) / (currentZoom / 100), y: (pointer.y - pan.y) / (currentZoom / 100) };
  const after = { x: (pointer.x - nextPan.x) / (nextZoom / 100), y: (pointer.y - nextPan.y) / (nextZoom / 100) };
  const anchorError = Math.hypot(after.x - before.x, after.y - before.y);
  if (anchorError > 1e-7) issues.push(`Cursor anchor drifted by ${anchorError}`);
  if (canvasMath.zoomFromWheel(400, -1000) !== 400) issues.push("Maximum canvas zoom clamp failed");
  if (canvasMath.zoomFromWheel(20, 1000) !== 20) issues.push("Minimum canvas zoom clamp failed");

  if (issues.length) {
    console.error("Text/canvas foundation audit failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log("Text/canvas foundation audit passed: 2D text alignment, migration, cursor anchoring, and zoom clamps are valid.");
  }
} finally {
  await server.close();
}

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
  const textLayout = await server.ssrLoadModule("/src/core/textLayout.ts");
  const canvasMath = await server.ssrLoadModule("/src/editor/canvasMath.ts");
  const canvasStageSource = await readFile(
    new URL("../src/editor/CanvasStage.tsx", import.meta.url),
    "utf8",
  );
  const issues = [];

  if (textLayout.normalizeTextVerticalAlign(undefined) !== "middle") {
    issues.push("Missing vertical alignment must migrate to middle");
  }
  if (textLayout.textVerticalJustification("top") !== "flex-start") {
    issues.push("Top text alignment mapping is invalid");
  }
  if (textLayout.textVerticalJustification("middle") !== "center") {
    issues.push("Middle text alignment mapping is invalid");
  }
  if (textLayout.textVerticalJustification("bottom") !== "flex-end") {
    issues.push("Bottom text alignment mapping is invalid");
  }

  const project = projectCore.createProject({ name: "Text audit", format: "square" });
  const scene = projectCore.getActiveScene(project);
  const layer = projectCore.createTextLayer(scene);
  if (layer.style.verticalAlign !== "middle") {
    issues.push("New text layers must start vertically centered");
  }

  const legacyProject = structuredClone(project);
  legacyProject.layers[layer.id] = layer;
  legacyProject.scenes[scene.id].layerIds = [layer.id];
  delete legacyProject.layers[layer.id].style.verticalAlign;
  const migrated = projectCore.normalizeProject(legacyProject);
  if (migrated.layers[layer.id].style.verticalAlign !== "middle") {
    issues.push("Legacy text layers did not migrate to middle alignment");
  }

  const zoomCases = [
    { pan: { x: 0, y: 0 }, pointer: { x: 0, y: 0 }, zoom: 100, delta: -120 },
    { pan: { x: 37, y: -24 }, pointer: { x: 180, y: 95 }, zoom: 100, delta: -120 },
    { pan: { x: -143.5, y: 82.25 }, pointer: { x: -260, y: 140 }, zoom: 175, delta: 92 },
    { pan: { x: 210, y: 155 }, pointer: { x: 25, y: -210 }, zoom: 64, delta: -48 },
  ];

  for (const testCase of zoomCases) {
    const nextZoom = canvasMath.zoomFromWheel(testCase.zoom, testCase.delta);
    const anchoredCanvasPoint = canvasMath.canvasPointUnderViewportPoint(
      testCase.pointer,
      testCase.pan,
      testCase.zoom,
    );
    const nextPan = canvasMath.panForZoomAnchor(
      testCase.pan,
      testCase.pointer,
      testCase.zoom,
      nextZoom,
    );
    const pointerAfterZoom = canvasMath.viewportPointForCanvasPoint(
      anchoredCanvasPoint,
      nextPan,
      nextZoom,
    );
    const anchorError = Math.hypot(
      pointerAfterZoom.x - testCase.pointer.x,
      pointerAfterZoom.y - testCase.pointer.y,
    );
    if (anchorError > 1e-7) {
      issues.push(`Cursor anchor drifted by ${anchorError} for zoom ${testCase.zoom} -> ${nextZoom}`);
    }
  }

  let repeatedZoom = 83;
  let repeatedPan = { x: -42, y: 73 };
  const repeatedPointer = { x: 240, y: -115 };
  const initialCanvasPoint = canvasMath.canvasPointUnderViewportPoint(
    repeatedPointer,
    repeatedPan,
    repeatedZoom,
  );
  for (let index = 0; index < 30; index += 1) {
    const delta = index % 3 === 0 ? 36 : -28;
    const nextZoom = canvasMath.zoomFromWheel(repeatedZoom, delta);
    repeatedPan = canvasMath.panForZoomAnchor(
      repeatedPan,
      repeatedPointer,
      repeatedZoom,
      nextZoom,
    );
    repeatedZoom = nextZoom;
  }
  const repeatedPointerAfter = canvasMath.viewportPointForCanvasPoint(
    initialCanvasPoint,
    repeatedPan,
    repeatedZoom,
  );
  const repeatedError = Math.hypot(
    repeatedPointerAfter.x - repeatedPointer.x,
    repeatedPointerAfter.y - repeatedPointer.y,
  );
  if (repeatedError > 1e-6) {
    issues.push(`Repeated wheel events accumulated ${repeatedError}px of cursor drift`);
  }

  if (!(canvasMath.zoomFromWheel(100, -120) > 100)) {
    issues.push("Wheel-up zoom must increase zoom");
  }
  if (canvasMath.zoomFromWheel(400, -1000) !== 400) {
    issues.push("Maximum canvas zoom clamp failed");
  }
  if (canvasMath.zoomFromWheel(20, 1000) !== 20) {
    issues.push("Minimum canvas zoom clamp failed");
  }

  if (canvasStageSource.includes("stable-canvas-wrap")) {
    issues.push("CanvasStage still uses the legacy stable-canvas-wrap class that double-centers the canvas");
  }
  if (!canvasStageSource.includes('data-canvas-pan-shell="true"')) {
    issues.push("CanvasStage is missing the dedicated unscaled pan shell");
  }
  if (!canvasStageSource.includes('data-canvas-scale-shell="true"')) {
    issues.push("CanvasStage is missing the dedicated scale shell");
  }
  if (!canvasStageSource.includes("marginLeft: -baseWidth / 2")) {
    issues.push("Canvas pan shell is not centered with explicit geometry");
  }
  if (!canvasStageSource.includes('viewport.addEventListener("wheel", handleWheel, { passive: false })')) {
    issues.push("Canvas wheel handling must be attached directly to the viewport as non-passive");
  }

  if (issues.length) {
    console.error("Text/canvas foundation audit failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(
      "Text/canvas foundation audit passed: text alignment, legacy migration, dedicated pan/scale shells, non-passive wheel capture, cursor anchoring, repeated zoom stability, and zoom clamps are valid.",
    );
  }
} finally {
  await server.close();
}

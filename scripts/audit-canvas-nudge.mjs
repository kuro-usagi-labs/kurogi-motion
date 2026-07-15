import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "vite";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const editorSource = read("src/app/Editor.tsx");
const helperSource = read("src/core/canvasNudge.ts");
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
  const nudge = await vite.ssrLoadModule("/src/core/canvasNudge.ts");
  const core = await vite.ssrLoadModule("/src/core/project.ts");

  const input = (overrides = {}) => ({
    key: "ArrowRight",
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shortcutBlocked: false,
    editableLayerCount: 1,
    ...overrides,
  });

  const expectedDirections = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  };
  for (const [key, delta] of Object.entries(expectedDirections)) {
    assert.deepEqual(nudge.resolveCanvasArrowAction(input({ key })), { type: "nudge", key, delta }, `${key} must nudge by one pixel.`);
    assert.deepEqual(
      nudge.resolveCanvasArrowAction(input({ key, shiftKey: true })),
      { type: "nudge", key, delta: { x: delta.x * 10, y: delta.y * 10 } },
      `Shift+${key} must nudge by ten pixels.`,
    );
  }

  // Keypad arrows emit the same KeyboardEvent.key values. The policy deliberately
  // depends on key, not code, so ArrowLeft etc. work for both key clusters.
  assert.equal(nudge.isCanvasArrowKey("ArrowLeft"), true);
  assert.equal(nudge.isCanvasArrowKey("Numpad4"), false);

  for (const modifier of ["ctrlKey", "metaKey", "altKey"]) {
    assert.deepEqual(nudge.resolveCanvasArrowAction(input({ [modifier]: true })), { type: "none" }, `${modifier} arrow combinations must remain owned by the operating system or focused control.`);
  }
  assert.deepEqual(nudge.resolveCanvasArrowAction(input({ shortcutBlocked: true })), { type: "none" }, "Editable and interactive controls must retain their arrows.");
  assert.deepEqual(nudge.resolveCanvasArrowAction(input({ key: "a" })), { type: "none" }, "Non-arrow keys must not enter the canvas nudge flow.");

  assert.deepEqual(nudge.resolveCanvasArrowAction(input({ editableLayerCount: 0, key: "ArrowLeft" })), { type: "seek", frames: -1 });
  assert.deepEqual(nudge.resolveCanvasArrowAction(input({ editableLayerCount: 0, key: "ArrowRight" })), { type: "seek", frames: 1 });
  assert.deepEqual(nudge.resolveCanvasArrowAction(input({ editableLayerCount: 0, key: "ArrowUp" })), { type: "none" });
  assert.deepEqual(nudge.resolveCanvasArrowAction(input({ editableLayerCount: 0, key: "ArrowDown" })), { type: "none" });
  assert.deepEqual(nudge.resolveCanvasArrowAction(input({ editableLayerCount: 0, key: "ArrowRight", shiftKey: true })), { type: "seek", frames: 1 }, "Shift must not change frame stepping when there is no editable layer selection.");

  let project = core.createProject({
    name: "Canvas nudge audit",
    format: "custom",
    width: 640,
    height: 360,
    duration: 3,
    fps: 30,
    background: "#10121a",
  });
  const scene = core.getActiveScene(project);
  const first = core.createShapeLayer(scene, "rectangle", { name: "First", position: { x: 12, y: 18 } });
  const second = core.createShapeLayer(scene, "circle", { name: "Second", position: { x: 100, y: 80 } });
  const locked = core.createShapeLayer(scene, "triangle", { name: "Locked", position: { x: 240, y: 90 } });
  locked.locked = true;
  project = core.addLayers(project, [first, second, locked]);
  const original = core.cloneProject(project);

  assert.deepEqual(nudge.getNudgeableLayerIds(project, [first.id, locked.id, second.id, first.id]), [first.id, second.id], "Selection filtering must preserve order, deduplicate, and remove locked layers.");
  const moved = nudge.nudgeCanvasLayers(project, [first.id, locked.id, second.id], { x: 10, y: -10 });
  assert.deepEqual(moved.layers[first.id].position, { x: 22, y: 8 });
  assert.deepEqual(moved.layers[second.id].position, { x: 110, y: 70 });
  assert.deepEqual(moved.layers[locked.id].position, original.layers[locked.id].position, "Locked layers must never move.");
  assert.deepEqual(project.layers[first.id].position, original.layers[first.id].position, "Nudge updates must not mutate the history baseline.");
  assert.notEqual(moved, project, "A valid nudge must return a new project snapshot.");
  assert.equal(nudge.nudgeCanvasLayers(project, [locked.id], { x: 1, y: 0 }), project, "A locked-only selection must be a no-op so arrows can seek frames.");
  assert.equal(nudge.nudgeCanvasLayers(project, [first.id], { x: 0, y: 0 }), project, "A zero delta must be a no-op.");

  const inactive = core.cloneProject(project);
  inactive.layers[first.id].sceneId = "inactive-scene";
  assert.deepEqual(nudge.getNudgeableLayerIds(inactive, [first.id, second.id]), [second.id], "Stale selections from another scene must not move.");

  assert.match(helperSource, /input\.ctrlKey \|\| input\.metaKey \|\| input\.altKey/, "Nudge policy must explicitly preserve Ctrl, Meta, and Alt arrows.");
  assert.match(editorSource, /shortcutBlocked: editable \|\| event\.defaultPrevented \|\| isCanvasArrowControlTarget/, "Editor must preserve editable targets and keyboard-owned controls.");
  assert.match(editorSource, /\[role="separator"\], \[role="slider"\]/, "Panel resizers and the timeline ruler must retain their Arrow key contracts.");
  assert.match(editorSource, /history\.beginGesture\(\);[\s\S]*pressedKeys: new Set<CanvasArrowKey>/, "The first nudge in a key sequence must establish one history gesture.");
  assert.match(editorSource, /history\.preview\(\(current\) => nudgeCanvasLayers/, "Key repeats must preview within the active history gesture.");
  assert.match(editorSource, /gesture\.pressedKeys\.delete\(event\.key\);[\s\S]*finishCanvasNudgeGesture\(\)/, "The history gesture must finish after every held Arrow key is released.");
  assert.match(editorSource, /window\.addEventListener\("blur", onWindowBlur\)/, "Window blur must safely close an interrupted nudge gesture.");
  assert.match(editorSource, /arrowAction\.type === "seek"[\s\S]*seekTo/, "Left and right arrows must preserve frame seeking when no editable selection exists.");
  assert.match(editorSource, /Nudge selected layers by 1 px · seek frames when none are editable/, "Shortcut help must explain the context-sensitive Arrow behavior.");
  assert.match(editorSource, /Shift \+ Arrow", "Nudge selected layers by 10 px/, "Shortcut help must document precision acceleration.");

  console.log("Canvas nudge audit passed: 1/10 px movement, immutable multi-layer updates, locked-layer filtering, modifier/control safety, frame-seek fallback, and grouped undo lifecycle verified.");
} finally {
  if (vite) await vite.close().catch(() => undefined);
}

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
  const workflow = await server.ssrLoadModule("/src/core/animationWorkflow.ts");
  const evaluator = await server.ssrLoadModule("/src/core/evaluator.ts");
  const sceneWorkspace = await server.ssrLoadModule("/src/core/sceneWorkspace.ts");

  let project = projectCore.createProject({ name: "Animation audit", format: "square", width: 1000, height: 1000, duration: 6 });
  assert.deepEqual(project.animationGroups, {});
  assert.deepEqual(project.animationPresets, {});
  const scene = projectCore.getActiveScene(project);
  const a = projectCore.createTextLayer(scene, { name: "Metric", text: "0", position: { x: 100, y: 100 } });
  const b = projectCore.createShapeLayer(scene, "circle", { name: "Orb", position: { x: 300, y: 300 } });
  const c = projectCore.createShapeLayer(scene, "rectangle", { name: "Card", position: { x: 600, y: 500 } });
  const counter = projectCore.createAnimationAction(a.id, "in", "counter", { duration: 1, easing: "custom", easingCurve: { x1: .25, y1: .1, x2: .25, y2: 1 }, parameters: { from: 0, to: 1000, decimals: 0, prefix: "$", suffix: "+" } });
  const path = projectCore.createAnimationAction(b.id, "in", "motionPath", { duration: 2, motionPath: { enabled: true, start: { x: 0, y: 0 }, control1: { x: 80, y: -100 }, control2: { x: 180, y: 100 }, end: { x: 260, y: 0 }, orientToPath: true } });
  const fade = projectCore.createAnimationAction(c.id, "in", "fadeIn", { startTime: .2, duration: .6 });
  a.animationActions.push(counter);
  b.animationActions.push(path);
  c.animationActions.push(fade);
  project = projectCore.addLayers(project, [a, b, c]);

  const counterText = evaluator.evaluateCounterText(project.layers[a.id], .5);
  assert.ok(counterText?.startsWith("$"));
  assert.ok(counterText?.endsWith("+"));
  assert.ok(Number(counterText.replace(/[^0-9]/g, "")) > 0);
  const pathStart = evaluator.evaluateLayer(project.layers[b.id], scene, 0);
  const pathMiddle = evaluator.evaluateLayer(project.layers[b.id], scene, 1);
  const pathEnd = evaluator.evaluateLayer(project.layers[b.id], scene, 2);
  assert.equal(pathStart.x, b.position.x);
  assert.ok(pathMiddle.x > pathStart.x);
  assert.ok(pathEnd.x > pathMiddle.x);
  assert.ok(Number.isFinite(pathMiddle.rotation));
  const eased = evaluator.applyEasing("custom", .5, { x1: .2, y1: .8, x2: .3, y2: 1 });
  assert.ok(eased > .5 && eased < 1.1);

  let result = workflow.createAnimationGroup(project, [{ layerId: a.id, actionId: counter.id }, { layerId: b.id, actionId: path.id }], "Hero sequence");
  project = result.project;
  const groupId = project.layers[a.id].animationActions[0].groupId;
  assert.ok(groupId);
  assert.equal(project.layers[b.id].animationActions[0].groupId, groupId);
  assert.equal(project.animationGroups[groupId].name, "Hero sequence");
  assert.equal(workflow.expandActionSelection(project, [{ layerId: a.id, actionId: counter.id }]).length, 2);

  project = workflow.staggerAnimationActions(project, [{ layerId: a.id, actionId: counter.id }, { layerId: b.id, actionId: path.id }, { layerId: c.id, actionId: fade.id }], .15, "normal");
  assert.ok(project.layers[b.id].animationActions[0].startTime >= project.layers[a.id].animationActions[0].startTime);
  assert.ok(project.layers[c.id].animationActions[0].startTime >= project.layers[b.id].animationActions[0].startTime);

  const clipboard = workflow.copyAnimationActions(project, [{ layerId: a.id, actionId: counter.id }, { layerId: b.id, actionId: path.id }]);
  assert.equal(clipboard.actions.length, 2);
  const newSceneResult = sceneWorkspace.createScene(project);
  project = newSceneResult.project;
  const targetScene = projectCore.getActiveScene(project);
  const targetText = projectCore.createTextLayer(targetScene, { name: "Target", text: "0" });
  project = projectCore.addLayers(project, [targetText]);
  const pasted = workflow.pasteAnimationActions(project, [targetText.id], clipboard, .5);
  project = pasted.project;
  assert.equal(pasted.refs.length, 2);
  assert.equal(project.layers[targetText.id].animationActions.length, 2);

  const saved = workflow.saveCustomAnimationPreset(project, "Metric path", pasted.refs);
  project = saved.project;
  assert.ok(saved.presetId);
  assert.equal(project.animationPresets[saved.presetId].actions.length, 2);
  const secondText = projectCore.createTextLayer(targetScene, { name: "Target 2", text: "0" });
  project = projectCore.addLayers(project, [secondText]);
  const applied = workflow.applyCustomAnimationPreset(project, saved.presetId, [secondText.id], 1);
  project = applied.project;
  assert.equal(applied.refs.length, 2);
  assert.equal(project.layers[secondText.id].animationActions.length, 2);

  const duplicated = workflow.duplicateAnimationActions(project, applied.refs);
  assert.equal(duplicated.refs.length, 2);
  project = workflow.deleteAnimationActions(duplicated.project, duplicated.refs);
  assert.equal(project.layers[secondText.id].animationActions.length, 2);
  project = workflow.ungroupAnimationActions(project, [{ layerId: a.id, actionId: counter.id }]);
  assert.equal(project.layers[a.id].animationActions[0].groupId, undefined);

  const files = await Promise.all([
    "../src/types.ts",
    "../src/app/Editor.tsx",
    "../src/editor/TimelineV3.tsx",
    "../src/editor/InspectorV2.tsx",
    "../src/editor/AnimationPresetDialog.tsx",
    "../src/MotionComposition.tsx",
    "../src/editor/MotionPathOverlay.tsx",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const [types, editor, timeline, inspector, dialog, composition, pathOverlay] = files;
  for (const [source, needle, message] of [
    [types, "AnimationClipboard", "Animation clipboard model is missing."],
    [types, "CubicBezier", "Custom cubic Bezier model is missing."],
    [types, "MotionPathDefinition", "Motion path model is missing."],
    [editor, "selectedActionIds", "Multi-action selection is not wired in the editor."],
    [editor, "pasteAnimationActions", "Cross-layer animation paste is not wired."],
    [timeline, "AnimationWorkflowBar", "Timeline workflow controls are missing."],
    [timeline, "multi-selected", "Timeline multi-select blocks are missing."],
    [inspector, "CubicBezierEditor", "Cubic Bezier editor is not mounted."],
    [inspector, "Orient to path", "Motion path controls are missing."],
    [dialog, "component={MotionComposition}", "Preset previews are not using the production renderer."],
    [dialog, "My presets", "Reusable custom presets are missing."],
    [composition, "evaluateCounterText", "Counter rendering is not connected."],
    [composition, "MotionPathOverlay", "Motion path handles are not mounted."],
    [pathOverlay, "control1", "Bezier path handles are incomplete."],
  ]) assert.ok(source.includes(needle), message);

  console.log("Animation workflow audit passed: multi-select blocks, layer staggering, clipboard, cubic easing, groups, counters, motion paths, accurate previews, and reusable presets are wired.");
} finally {
  await server.close();
}

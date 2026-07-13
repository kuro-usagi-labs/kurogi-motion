import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { hmr: false, middlewareMode: true, watch: null },
});

try {
  const evaluator = await server.ssrLoadModule("/src/core/evaluator.ts");
  const projectCore = await server.ssrLoadModule("/src/core/project.ts");
  const presets = await server.ssrLoadModule("/src/editor/animationPresets.ts");
  const scene = {
    id: "scene-audit",
    name: "Loop audit",
    width: 1080,
    height: 1080,
    duration: 12,
    fps: 60,
    background: { type: "solid", color: "#ffffff" },
    layerIds: [],
  };
  const start = 1;
  const issues = [];
  const loopPresets = presets.ANIMATION_PRESETS.filter((preset) => preset.category === "loop");

  for (const preset of loopPresets) {
    const layer = projectCore.createShapeLayer(scene, "rectangle", {
      name: preset.label,
      position: { x: 320, y: 340 },
      size: { width: 320, height: 220 },
      fill: "#8b5cf6",
    });
    layer.animationActions = [projectCore.createAnimationAction(layer.id, "loop", preset.type, {
      startTime: start,
      duration: preset.recommendedDuration ?? 2,
      easing: preset.recommendedEasing ?? "easeInOut",
      parameters: { intensity: preset.type === "pulse" || preset.type === "breathe" || preset.type === "ripple" || preset.type === "liquid" || preset.type === "wobble" || preset.type === "heartbeat" ? .1 : 20, blendIn: .25 },
      repeat: { count: "infinite", delay: 0 },
    })];

    const before = evaluator.evaluateLayer(layer, scene, start - 1 / 120);
    const atStart = evaluator.evaluateLayer(layer, scene, start);
    const justAfter = evaluator.evaluateLayer(layer, scene, start + 1 / 120);
    const startJump = visualDistance(before, atStart);
    const firstStep = visualDistance(atStart, justAfter);
    if (startJump > 0.001) issues.push(`${preset.type}: start jump ${startJump.toFixed(4)}`);
    if (firstStep > 6) issues.push(`${preset.type}: first-frame movement ${firstStep.toFixed(4)} is too large`);
    console.log(`${preset.type.padEnd(12)} start ${startJump.toFixed(4)} · first step ${firstStep.toFixed(4)}`);
  }

  if (issues.length) {
    console.error("
Loop continuity audit failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(`
Loop continuity audit passed: ${loopPresets.length} presets start from the base pose without a visual jump.`);
  }
} finally {
  await server.close();
}

function visualDistance(left, right) {
  const values = [
    right.x - left.x,
    right.y - left.y,
    angleDelta(right.rotation, left.rotation),
    (right.scaleX - left.scaleX) * 100,
    (right.scaleY - left.scaleY) * 100,
    right.skewX - left.skewX,
    right.skewY - left.skewY,
    right.glow - left.glow,
    (right.brightness - left.brightness) * 100,
  ];
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function angleDelta(left, right) {
  const delta = ((left - right + 180) % 360 + 360) % 360 - 180;
  return delta;
}

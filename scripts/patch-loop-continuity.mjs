import { readFile, writeFile } from "node:fs/promises";

async function replaceInFile(path, search, replacement) {
  const source = await readFile(path, "utf8");
  if (!source.includes(search)) throw new Error(`Expected block not found in ${path}`);
  await writeFile(path, source.replace(search, replacement), "utf8");
}

await replaceInFile(
  "src/core/evaluator.ts",
`  if (action.category === "loop") {
    const progress = loopProgress(action, time);
    if (progress === null) return;
    applyLoop(visual, action, applyEasing(action.easing, progress));
    return;
  }`,
`  if (action.category === "loop") {
    const progress = loopProgress(action, time);
    if (progress === null) return;
    applyLoop(
      visual,
      action,
      applyEasing(action.easing, progress),
      loopEntranceWeight(action, time),
    );
    return;
  }`,
);

await replaceInFile(
  "src/core/evaluator.ts",
`  if (action.category === "loop") {
    const progress = loopProgress(action, time);
    if (progress === null) return;
    applyUnitLoop(visual, action, applyEasing(action.easing, progress));
    return;
  }`,
`  if (action.category === "loop") {
    const progress = loopProgress(action, time);
    if (progress === null) return;
    applyUnitLoop(
      visual,
      action,
      applyEasing(action.easing, progress),
      loopEntranceWeight(action, time),
    );
    return;
  }`,
);

const oldLoopBlock = `function applyLoop(visual: EvaluatedLayerVisual, action: AnimationAction, progress: number) {
  const wave = Math.sin(progress * Math.PI * 2);
  const cosine = Math.cos(progress * Math.PI * 2);

  if (action.type === "pulse") {
    const intensity = numberParameter(action, "intensity", .06);
    visual.scaleX *= 1 + wave * intensity;
    visual.scaleY *= 1 + wave * intensity;
  }
  if (action.type === "float") visual.y += wave * numberParameter(action, "intensity", 18);
  if (action.type === "hover") {
    const intensity = numberParameter(action, "intensity", 12);
    visual.y += wave * intensity;
    visual.rotation += cosine * intensity * .08;
  }
  if (action.type === "shake") {
    const frequency = numberParameter(action, "frequency", 5);
    visual.x += Math.sin(progress * Math.PI * 2 * frequency) * numberParameter(action, "intensity", 10);
  }
  if (action.type === "spin") {
    const direction = stringParameter(action, "direction", "clockwise") === "counterclockwise" ? -1 : 1;
    visual.rotation += progress * 360 * numberParameter(action, "turns", 1) * direction;
  }
  if (action.type === "breathe") {
    const intensity = numberParameter(action, "intensity", .06);
    const breathe = (1 - cosine) / 2;
    visual.scaleX *= 1 + breathe * intensity;
    visual.scaleY *= 1 + breathe * intensity;
  }
  if (action.type === "swing") visual.rotation += wave * numberParameter(action, "intensity", 8);
  if (action.type === "wobble") {
    const intensity = numberParameter(action, "intensity", .08);
    visual.scaleX *= 1 + wave * intensity;
    visual.scaleY *= 1 - wave * intensity * .7;
    visual.rotation += cosine * intensity * 45;
  }
  if (action.type === "heartbeat") {
    const pulse = Math.pow(Math.max(0, Math.sin(progress * Math.PI * 4)), 8);
    visual.scaleX *= 1 + pulse * numberParameter(action, "intensity", .12);
    visual.scaleY *= 1 + pulse * numberParameter(action, "intensity", .12);
  }
  if (action.type === "drift") {
    const intensity = numberParameter(action, "intensity", 16);
    visual.x += wave * intensity;
    visual.y += Math.sin(progress * Math.PI * 2 + Math.PI / 2) * intensity * .65;
  }
  if (action.type === "orbit") {
    const radius = numberParameter(action, "intensity", 22);
    visual.x += cosine * radius;
    visual.y += wave * radius;
  }
  if (action.type === "wave") {
    const intensity = numberParameter(action, "intensity", 10);
    visual.y += wave * intensity;
    visual.rotation += wave * intensity * .45;
  }
  if (action.type === "jiggle") {
    const intensity = numberParameter(action, "intensity", 7);
    visual.x += Math.sin(progress * Math.PI * 14) * intensity;
    visual.rotation += Math.sin(progress * Math.PI * 18) * intensity * .5;
  }
  if (action.type === "glowPulse") {
    const intensity = numberParameter(action, "intensity", 18);
    visual.glow += ((wave + 1) / 2) * intensity;
    visual.brightness *= 1 + ((wave + 1) / 2) * .08;
  }
  if (action.type === "ripple") {
    const intensity = numberParameter(action, "intensity", .05);
    visual.scaleX *= 1 + wave * intensity;
    visual.scaleY *= 1 - wave * intensity;
  }
  if (action.type === "liquid") {
    const intensity = numberParameter(action, "intensity", .08);
    visual.scaleX *= 1 + wave * intensity;
    visual.scaleY *= 1 + cosine * intensity;
    visual.skewX += wave * intensity * 24;
  }
}

function applyUnitLoop(visual: EvaluatedUnitVisual, action: AnimationAction, progress: number) {
  const wave = Math.sin(progress * Math.PI * 2);
  if (action.type === "pulse" || action.type === "heartbeat") visual.scale *= 1 + wave * numberParameter(action, "intensity", .06);
  if (action.type === "float" || action.type === "hover" || action.type === "wave") visual.translateY += wave * numberParameter(action, "intensity", 18);
  if (action.type === "shake" || action.type === "jiggle") {
    const frequency = action.type === "jiggle" ? 8 : numberParameter(action, "frequency", 5);
    visual.translateX += Math.sin(progress * Math.PI * 2 * frequency) * numberParameter(action, "intensity", 10);
  }
  if (action.type === "spin") visual.rotation += progress * 360;
  if (action.type === "breathe" || action.type === "wobble" || action.type === "liquid") visual.scale *= 1 + wave * numberParameter(action, "intensity", .06);
  if (action.type === "swing") visual.rotation += wave * numberParameter(action, "intensity", 8);
  if (action.type === "orbit" || action.type === "drift") {
    const radius = numberParameter(action, "intensity", 16);
    visual.translateX += Math.cos(progress * Math.PI * 2) * radius;
    visual.translateY += wave * radius;
  }
}`;

const newLoopBlock = `function applyLoop(
  visual: EvaluatedLayerVisual,
  action: AnimationAction,
  progress: number,
  weight: number,
) {
  const phase = progress * Math.PI * 2;
  const wave = Math.sin(phase);
  const cosine = Math.cos(phase);
  const smoothPulse = (1 - cosine) / 2;

  if (action.type === "pulse") {
    const intensity = numberParameter(action, "intensity", .06) * weight;
    visual.scaleX *= 1 + wave * intensity;
    visual.scaleY *= 1 + wave * intensity;
  }
  if (action.type === "float") visual.y += wave * numberParameter(action, "intensity", 18) * weight;
  if (action.type === "hover") {
    const intensity = numberParameter(action, "intensity", 12) * weight;
    visual.y += wave * intensity;
    visual.rotation += wave * intensity * .08;
  }
  if (action.type === "shake") {
    const frequency = numberParameter(action, "frequency", 5);
    visual.x += Math.sin(phase * frequency) * numberParameter(action, "intensity", 10) * weight;
  }
  if (action.type === "spin") {
    const direction = stringParameter(action, "direction", "clockwise") === "counterclockwise" ? -1 : 1;
    visual.rotation += progress * 360 * numberParameter(action, "turns", 1) * direction * weight;
  }
  if (action.type === "breathe") {
    const intensity = numberParameter(action, "intensity", .06) * weight;
    visual.scaleX *= 1 + smoothPulse * intensity;
    visual.scaleY *= 1 + smoothPulse * intensity;
  }
  if (action.type === "swing") visual.rotation += wave * numberParameter(action, "intensity", 8) * weight;
  if (action.type === "wobble") {
    const intensity = numberParameter(action, "intensity", .08) * weight;
    visual.scaleX *= 1 + wave * intensity;
    visual.scaleY *= 1 - wave * intensity * .7;
    visual.rotation += wave * intensity * 45;
  }
  if (action.type === "heartbeat") {
    const pulse = Math.pow(Math.max(0, Math.sin(progress * Math.PI * 4)), 8);
    const intensity = numberParameter(action, "intensity", .12) * weight;
    visual.scaleX *= 1 + pulse * intensity;
    visual.scaleY *= 1 + pulse * intensity;
  }
  if (action.type === "drift") {
    const intensity = numberParameter(action, "intensity", 16) * weight;
    visual.x += wave * intensity;
    visual.y += Math.sin(phase * 2) * intensity * .65;
  }
  if (action.type === "orbit") {
    const radius = numberParameter(action, "intensity", 22) * weight;
    visual.x += (cosine - 1) * radius;
    visual.y += wave * radius;
  }
  if (action.type === "wave") {
    const intensity = numberParameter(action, "intensity", 10) * weight;
    visual.y += wave * intensity;
    visual.rotation += wave * intensity * .45;
  }
  if (action.type === "jiggle") {
    const intensity = numberParameter(action, "intensity", 7) * weight;
    visual.x += Math.sin(progress * Math.PI * 14) * intensity;
    visual.rotation += Math.sin(progress * Math.PI * 18) * intensity * .5;
  }
  if (action.type === "glowPulse") {
    const intensity = numberParameter(action, "intensity", 18) * weight;
    visual.glow += smoothPulse * intensity;
    visual.brightness *= 1 + smoothPulse * .08 * weight;
  }
  if (action.type === "ripple") {
    const intensity = numberParameter(action, "intensity", .05) * weight;
    visual.scaleX *= 1 + wave * intensity;
    visual.scaleY *= 1 - wave * intensity;
  }
  if (action.type === "liquid") {
    const intensity = numberParameter(action, "intensity", .08) * weight;
    visual.scaleX *= 1 + wave * intensity;
    visual.scaleY *= 1 - wave * intensity * .72;
    visual.skewX += wave * intensity * 24;
  }
}

function applyUnitLoop(
  visual: EvaluatedUnitVisual,
  action: AnimationAction,
  progress: number,
  weight: number,
) {
  const phase = progress * Math.PI * 2;
  const wave = Math.sin(phase);
  const cosine = Math.cos(phase);
  const smoothPulse = (1 - cosine) / 2;
  const intensity = numberParameter(action, "intensity", .06) * weight;

  if (action.type === "pulse") visual.scale *= 1 + wave * intensity;
  if (action.type === "heartbeat") {
    const pulse = Math.pow(Math.max(0, Math.sin(progress * Math.PI * 4)), 8);
    visual.scale *= 1 + pulse * intensity;
  }
  if (action.type === "float" || action.type === "hover" || action.type === "wave") {
    visual.translateY += wave * numberParameter(action, "intensity", 18) * weight;
  }
  if (action.type === "shake" || action.type === "jiggle") {
    const frequency = action.type === "jiggle" ? 8 : numberParameter(action, "frequency", 5);
    visual.translateX += Math.sin(phase * frequency) * numberParameter(action, "intensity", 10) * weight;
  }
  if (action.type === "spin") visual.rotation += progress * 360 * weight;
  if (action.type === "breathe") visual.scale *= 1 + smoothPulse * intensity;
  if (action.type === "wobble" || action.type === "liquid") visual.scale *= 1 + wave * intensity;
  if (action.type === "swing") visual.rotation += wave * numberParameter(action, "intensity", 8) * weight;
  if (action.type === "orbit") {
    const radius = numberParameter(action, "intensity", 16) * weight;
    visual.translateX += (cosine - 1) * radius;
    visual.translateY += wave * radius;
  }
  if (action.type === "drift") {
    const radius = numberParameter(action, "intensity", 16) * weight;
    visual.translateX += wave * radius;
    visual.translateY += Math.sin(phase * 2) * radius * .65;
  }
}`;

await replaceInFile("src/core/evaluator.ts", oldLoopBlock, newLoopBlock);

await replaceInFile(
  "src/core/evaluator.ts",
`function loopProgress(action: AnimationAction, time: number): number | null {
  const start = action.startTime + action.delay;
  if (time < start || action.duration <= 0) return null;
  const repeatDelay = Math.max(0, action.repeat?.delay ?? 0);
  const cycle = action.duration + repeatDelay;
  const elapsed = time - start;
  const cycleIndex = Math.floor(elapsed / cycle);
  const count = action.repeat?.count ?? "infinite";
  if (count !== "infinite" && cycleIndex >= count) return null;
  const cycleTime = elapsed - cycleIndex * cycle;
  if (cycleTime > action.duration) return null;
  return clamp(cycleTime / action.duration, 0, 1);
}`,
`function loopProgress(action: AnimationAction, time: number): number | null {
  const start = action.startTime + action.delay;
  if (time < start || action.duration <= 0) return null;
  const repeatDelay = Math.max(0, action.repeat?.delay ?? 0);
  const cycle = action.duration + repeatDelay;
  const elapsed = time - start;
  const cycleIndex = Math.floor(elapsed / cycle);
  const count = action.repeat?.count ?? "infinite";
  if (count !== "infinite" && cycleIndex >= count) return null;
  const cycleTime = elapsed - cycleIndex * cycle;
  if (cycleTime > action.duration) return null;
  return clamp(cycleTime / action.duration, 0, 1);
}

function loopEntranceWeight(action: AnimationAction, time: number) {
  const start = action.startTime + action.delay;
  const elapsed = time - start;
  if (elapsed <= 0) return 0;
  const automaticBlend = Math.min(.28, action.duration * .2);
  const blendIn = Math.max(0, numberParameter(action, "blendIn", automaticBlend));
  if (blendIn <= 0) return 1;
  const progress = clamp(elapsed / blendIn, 0, 1);
  return progress * progress * (3 - 2 * progress);
}`,
);

await replaceInFile(
  "src/editor/InspectorV2.tsx",
`          {activeAction.category === "loop" ? (
            <div className="property-grid two">
              <label>Repeat<select value={String(activeAction.repeat?.count ?? "infinite")} onChange={(event) => commit((action) => ({ ...action, repeat: { count: event.currentTarget.value === "infinite" ? "infinite" : Number(event.currentTarget.value), delay: action.repeat?.delay ?? 0 } }))}><option value="infinite">Infinite</option><option value="1">1 time</option><option value="2">2 times</option><option value="3">3 times</option><option value="5">5 times</option></select></label>
              <NumberField label="Repeat gap" value={activeAction.repeat?.delay ?? 0} min={0} max={5} step={.05} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, repeat: { count: action.repeat?.count ?? "infinite", delay: Math.max(0, value) } }))} />
            </div>
          ) : null}`,
`          {activeAction.category === "loop" ? (
            <div className="property-grid two">
              <label>Repeat<select value={String(activeAction.repeat?.count ?? "infinite")} onChange={(event) => commit((action) => ({ ...action, repeat: { count: event.currentTarget.value === "infinite" ? "infinite" : Number(event.currentTarget.value), delay: action.repeat?.delay ?? 0 } }))}><option value="infinite">Infinite</option><option value="1">1 time</option><option value="2">2 times</option><option value="3">3 times</option><option value="5">5 times</option></select></label>
              <NumberField label="Blend in" value={Number(activeAction.parameters.blendIn ?? Math.min(.28, activeAction.duration * .2))} min={0} max={2} step={.05} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, parameters: { ...action.parameters, blendIn: clamp(value, 0, 2) } }))} />
              <NumberField label="Repeat gap" value={activeAction.repeat?.delay ?? 0} min={0} max={5} step={.05} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, repeat: { count: action.repeat?.count ?? "infinite", delay: Math.max(0, value) } }))} />
            </div>
          ) : null}`,
);

const auditScript = `import { createServer } from "vite";

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
    console.error("\nLoop continuity audit failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(`\nLoop continuity audit passed: ${loopPresets.length} presets start from the base pose without a visual jump.`);
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
`;
await writeFile("scripts/audit-loops.mjs", auditScript, "utf8");

await replaceInFile(
  "package.json",
`    "audit:effects": "node scripts/audit-effects.mjs",
    "audit": "npm run audit:templates && npm run audit:effects",`,
`    "audit:effects": "node scripts/audit-effects.mjs",
    "audit:loops": "node scripts/audit-loops.mjs",
    "audit": "npm run audit:templates && npm run audit:effects && npm run audit:loops",`,
);

await replaceInFile(
  ".github/workflows/ci.yml",
`      - name: Typecheck and build
        shell: bash
        run: |
          set -o pipefail
          npm run build 2>&1 | tee build.log`,
`      - name: Audit loop continuity
        shell: bash
        run: |
          set -o pipefail
          npm run audit:loops 2>&1 | tee loop-audit.log

      - name: Typecheck and build
        shell: bash
        run: |
          set -o pipefail
          npm run build 2>&1 | tee build.log`,
);

await replaceInFile(
  ".github/workflows/ci.yml",
`            effect-audit.log
            build.log`,
`            effect-audit.log
            loop-audit.log
            build.log`,
);

console.log("Loop continuity patch applied.");

const fs = require("node:fs");

const path = "src/core/project.ts";
let source = fs.readFileSync(path, "utf8");
const duplicate = `function normalizeEasing(value: AnimationAction["easing"]): AnimationAction["easing"] {
  const supported = new Set(["linear","easeIn","easeOut","easeInOut","backIn","backOut","overshoot","bounce","elastic","custom"]);
  return value && supported.has(value) ? value : "easeOut";
}

function normalizeBezier(value: AnimationAction["easingCurve"]): AnimationAction["easingCurve"] {
  if (!value) return undefined;
  return { x1: clampNumber(value.x1, 0, 1), y1: clampNumber(value.y1, -4, 4), x2: clampNumber(value.x2, 0, 1), y2: clampNumber(value.y2, -4, 4) };
}

function normalizeMotionPath(value: AnimationAction["motionPath"]): AnimationAction["motionPath"] {
  if (!value) return undefined;
  const point = (candidate, fallback) => ({ x: Number.isFinite(candidate?.x) ? candidate.x : fallback.x, y: Number.isFinite(candidate?.y) ? candidate.y : fallback.y });
  return { enabled: value.enabled !== false, start: point(value.start, { x: 0, y: 0 }), control1: point(value.control1, { x: 100, y: -120 }), control2: point(value.control2, { x: 220, y: 120 }), end: point(value.end, { x: 320, y: 0 }), orientToPath: Boolean(value.orientToPath) };
}

`;
if (source.includes(duplicate)) source = source.replace(duplicate, "");
const count = (source.match(/function normalizeEasing\(/g) ?? []).length;
if (count !== 1) throw new Error(`Expected one normalizeEasing helper, found ${count}.`);
fs.writeFileSync(path, source);
console.log("Duplicate animation migration helpers removed.");

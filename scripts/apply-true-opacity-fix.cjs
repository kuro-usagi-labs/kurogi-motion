const fs = require("node:fs");

const path = "src/core/evaluator.ts";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Missing opacity fix anchor: ${label}`);
  source = source.replace(from, to);
}

replaceOnce(
  "  visual.opacity = clamp(visual.opacity, 0, 1);",
  "  visual.opacity = normalizeOpacity(visual.opacity);",
  "layer opacity normalization",
);

replaceOnce(
  "  visual.opacity = clamp(visual.opacity, 0, 1);\n  visual.scale = finite(visual.scale, 1);",
  "  visual.opacity = normalizeOpacity(visual.opacity);\n  visual.scale = finite(visual.scale, 1);",
  "text-unit opacity normalization",
);

replaceOnce(
  "    visual.opacity *= (1 - progress) * flicker;",
  "    visual.opacity *= flicker;",
  "single dissolve fade",
);

replaceOnce(
  "function isFadingType(type: AnimationType) {\n  return ![\"counter\", \"motionPath\", \"pulse\", \"float\", \"shake\", \"spin\", \"breathe\", \"swing\", \"hover\", \"wobble\", \"heartbeat\", \"drift\", \"orbit\", \"wave\", \"jiggle\", \"glowPulse\", \"ripple\", \"liquid\"].includes(type);\n}",
  "function isFadingType(type: AnimationType) {\n  return type === \"fadeIn\" || type === \"fadeOut\" || type === \"dissolveOut\";\n}",
  "explicit fade animation types",
);

replaceOnce(
  "function finite(value: number, fallback: number) {\n  return Number.isFinite(value) ? value : fallback;\n}\n\nfunction clamp(value: number, min: number, max: number) {",
  "function finite(value: number, fallback: number) {\n  return Number.isFinite(value) ? value : fallback;\n}\n\nfunction normalizeOpacity(value: number) {\n  const normalized = clamp(finite(value, 1), 0, 1);\n  if (normalized >= 0.999) return 1;\n  if (normalized <= 0.001) return 0;\n  return normalized;\n}\n\nfunction clamp(value: number, min: number, max: number) {",
  "opacity endpoint snapping",
);

fs.writeFileSync(path, source);
console.log("True 100% opacity fix applied.");

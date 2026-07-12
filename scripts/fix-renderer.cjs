const fs = require("fs");

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Could not find ${label}`);
  return source.replace(before, after);
}

const compositionPath = "src/MotionComposition.tsx";
let composition = fs.readFileSync(compositionPath, "utf8");
composition = replaceRequired(
  composition,
  "      {scene.background.type === \"transparent\" ? <TransparencyGrid /> : null}",
  "      {editable && scene.background.type === \"transparent\" ? <TransparencyGrid /> : null}",
  "transparent preview grid",
);
fs.writeFileSync(compositionPath, composition);

const evaluatorPath = "src/core/evaluator.ts";
let evaluator = fs.readFileSync(evaluatorPath, "utf8");
evaluator = replaceRequired(
  evaluator,
  "  if (direction === \"down\") return { x: 0, y: -distance };\n  return { x: 0, y: distance };",
  "  if (direction === \"down\") return { x: 0, y: distance };\n  return { x: 0, y: -distance };",
  "vertical direction vector",
);
fs.writeFileSync(evaluatorPath, evaluator);

const fs = require("fs");

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Could not find ${label}`);
  }
  return source.replace(before, after);
}

const projectPath = "src/core/project.ts";
let project = fs.readFileSync(projectPath, "utf8");
project = replaceRequired(
  project,
  "  const base = {\n    id: createId(\"layer\"),",
  "  const base: Omit<ImageLayer, \"type\" | \"fit\"> = {\n    id: createId(\"layer\"),",
  "asset layer base declaration",
);
project = replaceRequired(
  project,
  "    assetId: asset.id,\n  } as const;",
  "    assetId: asset.id,\n  };",
  "asset layer const assertion",
);
fs.writeFileSync(projectPath, project);

const timelinePath = "src/editor/Timeline.tsx";
let timeline = fs.readFileSync(timelinePath, "utf8");
const effectStart = timeline.indexOf("  useEffect(() => {\n    if (!gesture) return;", timeline.indexOf("export function Timeline"));
const effectEndMarker = "  }, [frame, gesture, onCommitAction, preview, project, scene.duration, scene.fps]);";
const effectEnd = timeline.indexOf(effectEndMarker, effectStart);
if (effectStart < 0 || effectEnd < 0) {
  throw new Error("Could not find timeline gesture effect");
}
const beforeEffect = timeline.slice(effectStart, effectEnd + effectEndMarker.length);
let afterEffect = beforeEffect.replace(
  "  useEffect(() => {\n    if (!gesture) return;",
  "  useEffect(() => {\n    const activeGesture = gesture;\n    if (!activeGesture) return;",
);
afterEffect = afterEffect.replaceAll("gesture.", "activeGesture.");
timeline = timeline.slice(0, effectStart) + afterEffect + timeline.slice(effectEnd + effectEndMarker.length);
fs.writeFileSync(timelinePath, timeline);

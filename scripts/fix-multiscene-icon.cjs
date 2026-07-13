const fs = require("node:fs");
const path = "src/editor/MultiSceneCanvasStage.tsx";
let source = fs.readFileSync(path, "utf8");
const before = '<Icon name="settings" size={15} />';
const after = '<Icon name="frame" size={15} />';
if (source.includes(before)) {
  source = source.replace(before, after);
  fs.writeFileSync(path, source);
  console.log("Replaced unsupported settings icon.");
} else if (!source.includes(after)) {
  throw new Error("Multi-scene settings icon target was not found.");
} else {
  console.log("Multi-scene settings icon is already valid.");
}

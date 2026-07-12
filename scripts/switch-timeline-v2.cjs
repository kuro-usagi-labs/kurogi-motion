// Switches the editor to the stable SVG timeline once.
const fs = require("fs");
const path = "src/app/Editor.tsx";
let source = fs.readFileSync(path, "utf8");
const before = 'import { Timeline } from "../editor/Timeline";';
const after = 'import { Timeline } from "../editor/TimelineV2";';
if (!source.includes(before)) throw new Error("Timeline import was not found.");
source = source.replace(before, after);
fs.writeFileSync(path, source);

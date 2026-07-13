const fs = require("fs");
const path = "src/editor/TimelineV3.tsx";
const source = fs.readFileSync(path, "utf8");
const from = '    return () => editor?.style.removeProperty("--timeline-height");';
const to = '    return () => { editor?.style.removeProperty("--timeline-height"); };';
if (!source.includes(from)) throw new Error("Timeline effect cleanup target not found");
fs.writeFileSync(path, source.replace(from, to));

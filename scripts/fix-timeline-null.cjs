const fs = require("fs");
const path = "src/editor/Timeline.tsx";
let source = fs.readFileSync(path, "utf8");
const before = "  useEffect(() => {\n    const activeGesture = gesture;\n    if (!activeGesture) return;";
const after = "  useEffect(() => {\n    if (!gesture) return;\n    const activeGesture: ActionGesture = gesture;";
if (!source.includes(before)) throw new Error("Timeline gesture guard was not found.");
source = source.replace(before, after);
fs.writeFileSync(path, source);

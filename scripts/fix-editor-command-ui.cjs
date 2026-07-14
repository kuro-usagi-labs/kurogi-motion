const fs = require("node:fs");

const path = "src/app/Editor.tsx";
let source = fs.readFileSync(path, "utf8");
source = source.replace('staggerSelectedActions(step, "forward");', 'staggerSelectedActions(step, "normal");');
fs.writeFileSync(path, source);
console.log("Applied editor command UI build fixes.");

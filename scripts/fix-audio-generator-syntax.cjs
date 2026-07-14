const fs = require("node:fs");
const path = "scripts/apply-audio-media-mcp-v2.cjs";
let source = fs.readFileSync(path, "utf8");
source = source.replace(
  'window.confirm(`An MCP client wants to import media from:\\\\n${filePath}\\\\n\\\\nAllow this file to be read and added to the project?`)',
  'window.confirm("An MCP client wants to import media from:\\\\n" + filePath + "\\\\n\\\\nAllow this file to be read and added to the project?")',
);
source = source.replace(
  'window.alert(`This file is larger than ${maximum} MB.`)',
  'window.alert("This file is larger than " + maximum + " MB.")',
);
fs.writeFileSync(path, source);
console.log("Audio generator nested template strings escaped.");

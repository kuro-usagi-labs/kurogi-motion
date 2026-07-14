const fs = require("node:fs");

const path = "scripts/apply-animation-workflow-v1.cjs";
let source = fs.readFileSync(path, "utf8");
const before = '  return `${prefix}${value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;';
const after = '  return prefix + value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;';
if (!source.includes(before) && !source.includes(after)) throw new Error("Counter interpolation patch target was not found.");
source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log("Animation workflow patch source repaired.");

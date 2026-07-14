import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const multiscene = await readFile(new URL("../src/multiscene.css", import.meta.url), "utf8");
const recovery = await readFile(new URL("../src/previewRecovery.css", import.meta.url), "utf8");
const stage = await readFile(new URL("../src/editor/MultiSceneCanvasStage.tsx", import.meta.url), "utf8");

assert.ok(main.includes('import "./previewRecovery.css";'), "Preview recovery CSS must be loaded by the application.");
assert.ok(main.indexOf('import "./previewRecovery.css";') > main.indexOf('import "./multiscene.css";'), "Preview recovery overrides must load after the multi-scene stylesheet.");
assert.ok(multiscene.includes(".workspace-pan-shell") && multiscene.includes("width:0;height:0"), "The audit fixture expects the transformed zero-sized workspace shells.");
assert.match(recovery, /\.workspace-pan-shell[\s\S]*width:\s*1px\s*!important/);
assert.match(recovery, /\.workspace-scale-shell[\s\S]*height:\s*1px\s*!important/);
assert.match(recovery, /overflow:\s*visible\s*!important/);
assert.match(recovery, /\.workspace-artboard[\s\S]*visibility:\s*visible\s*!important/);
assert.ok(stage.includes("workspace-pan-shell") && stage.includes("workspace-scale-shell"), "The multi-scene stage must still use the audited workspace shells.");
assert.ok(stage.includes("<Player"), "The artboard must still mount the Remotion Player.");

console.log("Preview recovery audit passed: transformed workspace shells have non-zero compositor bounds and visible overflow.");

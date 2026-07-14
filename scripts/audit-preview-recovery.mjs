import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const recovery = await readFile(new URL("../src/previewRecovery.css", import.meta.url), "utf8");
const stage = await readFile(new URL("../src/editor/MultiSceneCanvasStage.tsx", import.meta.url), "utf8");

assert.ok(main.includes('import "./previewRecovery.css";'), "Preview layout stylesheet must be loaded by the application.");
assert.ok(main.indexOf('import "./previewRecovery.css";') > main.indexOf('import "./multiscene.css";'), "Preview layout rules must load after the base multi-scene stylesheet.");

assert.ok(stage.includes('className="workspace-world"'), "Multi-scene preview must use one explicit world layer.");
assert.ok(stage.includes('data-workspace-world="true"'), "The world layer must expose a stable audit marker.");
assert.ok(!stage.includes('className="workspace-pan-shell"'), "The zero-sized pan shell must not remain in the renderer.");
assert.ok(!stage.includes('className="workspace-scale-shell"'), "The zero-sized scale shell must not remain in the renderer.");
assert.ok(stage.includes("workspaceSize.width") && stage.includes("workspaceSize.height"), "The world layer must receive real bounds from scene dimensions.");
assert.ok(stage.includes("position.x - workspaceOrigin.x") && stage.includes("position.y - workspaceOrigin.y"), "Artboards must be positioned relative to the sized world origin.");
assert.ok(stage.includes("workspaceBounds.left + workspaceBounds.width / 2 - workspaceOrigin.x"), "Fit-all must center the normalized world coordinates.");
assert.ok(stage.includes("<Player"), "Every artboard must still mount the Remotion Player.");

assert.match(recovery, /\.workspace-world\s*\{[\s\S]*position:\s*absolute/);
assert.match(recovery, /\.workspace-world\s*\{[\s\S]*left:\s*50%/);
assert.match(recovery, /\.workspace-world\s*\{[\s\S]*top:\s*50%/);
assert.match(recovery, /transform-origin:\s*0 0/);
assert.match(recovery, /overflow:\s*visible/);
assert.match(recovery, /\.editor-workspace \.multi-scene-toolbar\s*\{[\s\S]*margin-bottom:/);
assert.match(recovery, /\.editor-workspace \.design-tools-panel\s*\{[\s\S]*top:\s*56px/);

console.log("Preview recovery audit passed: multi-scene uses a sized world layer and non-overlapping control rows.");

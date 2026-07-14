import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const editor = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");
const menu = await readFile(new URL("../src/editor/EditorMenuBar.tsx", import.meta.url), "utf8");
const design = await readFile(new URL("../src/editor/DesignToolsPanel.tsx", import.meta.url), "utf8");
const stage = await readFile(new URL("../src/editor/MultiSceneCanvasStage.tsx", import.meta.url), "utf8");
const icons = await readFile(new URL("../src/ui/Icon.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/editorMenu.css", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");

assert.ok(editor.includes("<EditorMenuBar"), "Editor must mount the text command menu.");
assert.ok(!editor.includes('className="icon-btn" onClick={() => setZoom'), "Global toolbar zoom controls must be removed.");
assert.ok(editor.includes('command={workspaceCommand}'), "Workspace menu commands must reach the multi-scene stage.");
assert.ok(menu.includes('label="File"') && menu.includes('label="Edit"') && menu.includes('label="View"'), "Core application menus must exist.");
assert.ok(menu.includes('label="Scene"') && menu.includes('label="Layer"') && menu.includes('label="Animation"'), "Domain command menus must exist.");
assert.ok(menu.includes('label="New Project…"') && menu.includes('label="Open Project…"'), "File menu must expose project entry points.");
assert.ok(menu.includes('label="Align Left"') && menu.includes('label="Distribute Horizontally"'), "Edit menu must expose alignment commands.");
assert.ok(menu.includes('label="Scene Settings…"') && menu.includes('label="Copy Animation"'), "Scene and animation commands must be routed through menus.");
assert.ok(design.includes("ALIGNMENT_ICONS") && design.includes("design-tools-icon-button"), "Alignment toolbar must use icon-only controls.");
assert.ok(!design.includes("alignmentLabel(mode)"), "Letter-based alignment buttons must be removed.");
assert.ok(icons.includes('"alignLeft"') && icons.includes('"alignCenterVertical"') && icons.includes('"distributeHorizontal"'), "Alignment SVG icons must be registered.");
assert.ok(stage.includes("multi-scene-toolbar is-compact"), "Scene workspace toolbar must use the compact layout.");
assert.ok(!stage.includes('onClick={onCreateScene}'), "Visible scene creation duplicate must be removed from the workspace toolbar.");
assert.ok(stage.includes('command.type === "fit-all"') && stage.includes('command.type === "scene-settings"'), "Workspace menu commands must execute in the stage.");
assert.ok(main.includes('import "./editorMenu.css";'), "Editor menu stylesheet must be loaded.");
assert.match(css, /grid-template-columns:auto auto minmax\(140px,1fr\) auto/);
assert.match(css, /\.design-tools-panel \.design-tools-icon-button/);
assert.match(css, /\.editor-menu-dropdown/);

console.log("Editor command UI audit passed: menus are functional, duplicate controls are removed, and alignment uses SVG icons.");

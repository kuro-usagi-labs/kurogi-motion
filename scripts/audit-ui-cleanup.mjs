import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

const editor = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");
const menu = await readFile(new URL("../src/editor/EditorMenuBar.tsx", import.meta.url), "utf8");
const inspector = await readFile(new URL("../src/editor/InspectorV2.tsx", import.meta.url), "utf8");
const stage = await readFile(new URL("../src/editor/MultiSceneCanvasStage.tsx", import.meta.url), "utf8");
const preferences = await readFile(new URL("../src/core/editorUiPreferences.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../src/uiCleanup.css", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");

const removedLegacyComponents = [
  "../src/app/Dashboard.tsx",
  "../src/app/DashboardV2.tsx",
  "../src/editor/Inspector.tsx",
  "../src/editor/Timeline.tsx",
  "../src/editor/TimelineV2.tsx",
];

for (const component of removedLegacyComponents) {
  await assert.rejects(
    access(new URL(component, import.meta.url)),
    (error) => error?.code === "ENOENT",
    `${component} is an unreachable legacy UI implementation and must not return.`,
  );
}

const uiSources = await collectTsxFiles(new URL("../src/", import.meta.url));
for (const sourceUrl of uiSources) {
  const source = await readFile(sourceUrl, "utf8");
  assert.doesNotMatch(source, /\bdataTransfer\b/, `${sourceUrl.pathname} must not use native HTML drag transfer.`);
  assert.doesNotMatch(
    source,
    /\sdraggable(?:\s|>|=\{true\}|=["']true["'])/,
    `${sourceUrl.pathname} must use pointer interactions instead of native HTML dragging.`,
  );
  assert.doesNotMatch(
    source,
    />\s*(?:↺|‹|›|−|\+|×|▶|◀|✓|✔|✕|✖|⋮|→|←|↑|↓|↗)\s*</,
    `${sourceUrl.pathname} contains a raw control glyph; use the shared SVG Icon component.`,
  );
  assert.doesNotMatch(source, /Ã|â(?:€|†|–|)|Â(?:·|\s)|ðŸ/, `${sourceUrl.pathname} contains mojibake text.`);
}

assert.ok(editor.includes("loadEditorUiPreferences"), "Editor must load persistent UI preferences.");
assert.ok(editor.includes("uiPreferences.showDesignToolbar ?"), "Design toolbar must be conditionally rendered.");
assert.ok(editor.includes("designToolbarVisible={uiPreferences.showDesignToolbar}"), "Toolbar visibility must reach the View menu.");
assert.ok(editor.includes("onToggleDesignToolbar={toggleDesignToolbar}"), "View menu must toggle the design toolbar.");
assert.ok(menu.includes("designToolbarVisible: boolean"), "Menu contract must expose design toolbar state.");
assert.ok(menu.includes('label="Design Toolbar"'), "View menu must contain a Design Toolbar check item.");
assert.ok(menu.includes("checked={props.designToolbarVisible}"), "Design Toolbar menu item must show its state.");
assert.ok(preferences.includes('kurogi-editor-ui-v1'), "UI visibility must persist independently from project data.");
assert.ok(!inspector.includes('<div className="section-label">Layer state</div>'), "Visible and Locked must not be duplicated in the Inspector.");
assert.ok(editor.includes('title={layer.visible ? "Hide" : "Show"}'), "Visible control must remain in the Layers sidebar.");
assert.ok(editor.includes('title={layer.locked ? "Unlock" : "Lock"}'), "Locked control must remain in the Layers sidebar.");
assert.ok(!editor.includes('className="sidebar-selection-actions"'), "Duplicate and Delete footer controls must be removed from Layers.");
assert.ok(!stage.includes('title="Scene settings"'), "Scene Settings icon must not duplicate the Scene menu command.");
assert.match(css, /--window-controls-safe-area:\s*150px/);
assert.match(css, /dashboard-v3-topbar[\s\S]*padding-right:/);
assert.ok(main.includes('import "./uiCleanup.css";'), "UI cleanup stylesheet must load last.");

console.log("UI cleanup audit passed: only current UI generations remain, controls use SVG/pointer interactions, preferences persist, and dashboard controls avoid the native titlebar.");

async function collectTsxFiles(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryUrl = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directoryUrl);
    if (entry.isDirectory()) files.push(...await collectTsxFiles(entryUrl));
    else if (entry.name.endsWith(".tsx")) files.push(entryUrl);
  }
  return files;
}

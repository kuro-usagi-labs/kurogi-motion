import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const packageJson = JSON.parse(read("package.json"));
const main = read("src/main.tsx");
const editor = read("src/app/Editor.tsx");
const inspector = read("src/editor/InspectorV2.tsx");
const canvas = read("src/editor/MultiSceneCanvasStage.tsx");
const timeline = read("src/editor/TimelineV3.tsx");
const releaseCss = read("src/studioRelease.css");
const finalCss = read("src/releaseCandidate.css");
const packageLock = JSON.parse(read("package-lock.json"));

assert.equal(packageJson.version, "0.3.0", "Release version must be 0.3.0");
assert.equal(packageLock.version, packageJson.version, "Package and lockfile versions must match");
assert.equal(packageLock.packages[""].version, packageJson.version, "Root lockfile package version must match");
assert.match(main, /import "\.\/releaseCandidate\.css";\s*\n\s*const root/, "Release candidate stylesheet must load last");

for (const token of ["--studio-ink", "--studio-violet", "--studio-teal", "--studio-amber"]) {
  assert.ok(releaseCss.includes(token), `Missing semantic studio token: ${token}`);
}
assert.match(releaseCss, /button:focus-visible/, "Keyboard focus styling is required");
assert.match(releaseCss, /prefers-reduced-motion/, "Reduced-motion behavior is required");
assert.match(releaseCss, /@media \(max-width: 1160px\)/, "Compact desktop layout is required");
assert.match(finalCss, /workspace-mode-design/, "Design mode must have a focused workspace layout");
assert.match(finalCss, /user-select:\s*none/, "Desktop surfaces must suppress accidental text selection");

assert.match(inspector, /\["Design", "Animation"\]/, "Design and animation inspector workflows must be reachable");
assert.match(inspector, /function SceneInspector/, "Canvas state must have a useful inspector");
assert.match(inspector, /role="tablist"/, "Inspector tabs must expose their semantics");
assert.match(editor, /setExportDialogOpen\(true\)/, "Export must use the dedicated release dialog");

assert.match(editor, /aria-multiselectable="true"/, "Layer list must expose multi-selection");
assert.match(editor, /role="option"/, "Layer rows must be keyboard-addressable options");
assert.match(editor, /focusActiveScene=\{inspectorTab === "Design"\}/, "Design mode must focus the active scene");
assert.match(editor, /inspectorTab === "Animation" \? <Timeline/, "Timeline must only be visible in Animation mode");
assert.doesNotMatch(editor, /\sdraggable\s/, "Layer reordering must not use native HTML drag and drop");
assert.match(editor, /onClick=\{showKeyboardShortcuts\}/, "Help rail button must open an in-product surface");
assert.match(editor, /function EditorInfoDialog/, "About and shortcut help must use an in-product dialog");
assert.doesNotMatch(editor, /onShowAbout=\{\(\) => window\.alert/, "About must not use a browser alert");

assert.match(canvas, /className="canvas-view-controls"/, "Canvas navigation must remain close to the canvas");
assert.match(canvas, /aria-controls="scene-settings-popover"/, "Scene settings must expose their controlled surface");
assert.match(timeline, /className="timeline-selection-empty"/, "Timeline controls must use progressive disclosure");
assert.match(timeline, /className="timeline-stagger-tools"/, "Multi-block timing tools must remain available");

console.log("Release-ready audit passed: professional shell, reachable flows, accessibility, and editing ergonomics verified.");

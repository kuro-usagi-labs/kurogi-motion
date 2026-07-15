import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [dashboard, effects, editor, css] = await Promise.all([
  readFile(new URL("../src/app/DashboardV3.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/editor/EffectsPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/releaseCandidate.css", import.meta.url), "utf8"),
]);

const createStart = dashboard.indexOf("function CreateProjectDialog(");
const createEnd = dashboard.indexOf("function DashboardSwitch(");
assert.ok(createStart >= 0 && createEnd > createStart, "Create-project workflow could not be isolated for audit.");
const createFlow = dashboard.slice(createStart, createEnd);

assert.match(dashboard, /dashboard-empty-with-actions/, "The first-run empty state needs contextual actions.");
assert.match(createFlow, /<form[\s\S]*onSubmit=/, "Project creation must support native form submission and Enter.");
assert.match(createFlow, /Flexible timeline/, "Project creation must explain that duration stays editable.");
assert.match(createFlow, /grows automatically/, "The flexible-duration message must explain automatic growth.");
assert.doesNotMatch(createFlow, />Duration<input/, "Fixed duration must not be a required first-run decision.");
assert.match(createFlow, /<details className="create-project-advanced">/, "Technical options must use progressive disclosure.");
assert.match(createFlow, /role="radiogroup"/, "Canvas format choices must expose single-selection semantics.");
assert.match(createFlow, /Close create project dialog/, "The icon-only modal close action needs an accessible name.");
assert.match(createFlow, /event\.key !== "Tab"/, "The modal must keep keyboard focus inside its workflow.");

assert.match(effects, /useState\(false\)/, "The effect catalog must start collapsed.");
assert.match(effects, /aria-expanded=\{libraryOpen\}/, "The effect disclosure control must expose state.");
assert.match(effects, /No effects applied/, "The empty effect stack needs a useful explanation.");
assert.match(effects, /setLibraryOpen\(false\)/, "Applying an effect must return the inspector to the active stack.");
assert.match(effects, /aria-label=\{`Remove \$\{definition\.label\}`\}/, "Effect removal needs an accessible name.");

const manualStart = editor.indexOf("function addText(");
const manualEnd = editor.indexOf("function deleteLayerById(");
assert.ok(manualStart >= 0 && manualEnd > manualStart, "Manual layer creation flow could not be isolated.");
assert.doesNotMatch(editor.slice(manualStart, manualEnd), /animationActions\.push/, "Manual content creation must stay animation-free.");

for (const selector of [".flexible-timeline-note", ".create-project-advanced", ".effects-section-header", ".effect-library-panel"]) {
  assert.ok(css.includes(selector), `Missing release styling for ${selector}.`);
}
assert.match(css, /prefers-reduced-motion[\s\S]*advanced-chevron/, "Advanced disclosure motion must respect reduced-motion preferences.");

console.log("UX workflow audit passed: first-run actions, flexible project timing, progressive technical settings, modal keyboard containment, compact effects, and clean manual layer defaults are wired.");

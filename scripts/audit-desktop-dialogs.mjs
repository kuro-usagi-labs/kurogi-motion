import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx)$/.test(entry) ? [path] : [];
  });
}

const nativeDialogPattern = /\b(?:window\s*\.\s*)?(?:alert|confirm|prompt)\s*\(/g;
const violations = sourceFiles(join(root, "src")).flatMap((path) => {
  const source = readFileSync(path, "utf8");
  const lines = source.split(/\r?\n/);
  return lines.flatMap((line, index) => {
    nativeDialogPattern.lastIndex = 0;
    return nativeDialogPattern.test(line) ? [`${path.slice(root.length + 1)}:${index + 1}`] : [];
  });
});

assert.deepEqual(violations, [], `Browser-native dialogs are forbidden in active renderer source: ${violations.join(", ")}`);

const feedback = read("src/ui/AppFeedback.tsx");
const feedbackCss = read("src/appFeedback.css");
const app = read("src/App.tsx");
const editor = read("src/app/Editor.tsx");
const main = read("src/main.tsx");

assert.match(feedback, /createPortal/, "Feedback surfaces must render above the desktop shell");
assert.match(feedback, /queueRef/, "Async dialog requests must be queued instead of overwriting each other");
assert.match(feedback, /new Promise<boolean>/, "Confirmations must expose an awaitable boolean result");
assert.match(feedback, /new Promise<string \| null>/, "Text requests must expose an awaitable cancelable result");
assert.match(feedback, /request\.options\.validate\?\.\(value\)/, "Text requests must support inline validation");
assert.match(feedback, /role=\{request\.kind === "message" && tone === "error" \? "alertdialog" : "dialog"\}/, "Dialogs must expose accessible semantics");
assert.match(feedback, /aria-modal="true"/, "Dialogs must identify themselves as modal");
assert.match(feedback, /aria-labelledby=\{titleId\}/, "Dialogs must have an accessible title");
assert.match(feedback, /aria-describedby=\{descriptionId\}/, "Dialogs must have an accessible description");
assert.match(feedback, /event\.key === "Escape"/, "Dialogs must provide a keyboard escape route");
assert.match(feedback, /event\.key !== "Tab"/, "Dialogs must contain keyboard focus");
assert.match(feedback, /previousFocusRef/, "Dialogs must restore focus to the invoking control");
assert.match(feedback, /aria-live="polite"/, "Toast notifications must be announced without stealing focus");
assert.match(feedback, /role="alert"/, "Inline validation errors must be announced immediately");

assert.match(app, /feedback\.confirmAction\(/, "Dashboard destructive actions must use an in-app confirmation");
assert.match(app, /feedback\.requestText\(/, "Dashboard template naming must use an in-app text request");
assert.match(app, /validate: \(value\) => value\.trim\(\)/, "Dashboard template names must reject empty input");
assert.match(editor, /feedback\.confirmAction\(/, "Editor scene deletion must use an in-app confirmation");
assert.ok((editor.match(/feedback\.requestText\(/g) ?? []).length >= 3, "Editor naming and timing flows must use validated in-app text requests");
assert.match(editor, /Number\.isFinite\(step\) && step >= 0/, "Stagger input must reject invalid and negative intervals");
assert.match(editor, /feedback\.notify\(/, "Non-blocking editor failures must use accessible in-app notifications");

assert.match(feedbackCss, /:focus-visible/, "Dialog and toast controls need visible keyboard focus");
assert.match(feedbackCss, /prefers-reduced-motion/, "Feedback motion must respect reduced-motion preferences");
assert.match(main, /import "\.\/appFeedback\.css";\s*\nimport "\.\/releaseCandidate\.css";/, "Feedback styling must load before the final release override layer");

console.log("Desktop dialog audit passed: no native browser dialogs, async decisions are queued, text input is validated, and feedback is keyboard-accessible.");

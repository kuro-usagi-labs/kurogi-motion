import { readFile } from "node:fs/promises";

const files = {
  types: await readFile(new URL("../src/types.ts", import.meta.url), "utf8"),
  editor: await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8"),
  inspector: await readFile(new URL("../src/editor/InspectorV2.tsx", import.meta.url), "utf8"),
  dialog: await readFile(new URL("../src/editor/ExportDialog.tsx", import.meta.url), "utf8"),
  main: await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
  preload: await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
  css: await readFile(new URL("../src/finalUx.css", import.meta.url), "utf8"),
};

const issues = [];
const requireText = (source, text, message) => { if (!source.includes(text)) issues.push(message); };

requireText(files.types, '"mov"', "ExportFormat does not expose MOV.");
requireText(files.editor, "setExportDialogOpen(true)", "Toolbar Export does not open the settings dialog.");
if (files.editor.includes('setInspectorTab("Export")')) issues.push("Toolbar Export still redirects to the inspector.");
requireText(files.editor, "Export complete", "Success notification is missing.");
requireText(files.editor, "Export failed", "Failure notification is missing.");
requireText(files.editor, "const effectiveOptions: ExportOptions", "Export options are not normalized before rendering.");
requireText(files.editor, "alphaSupported && exportOptions.transparent", "Unsupported alpha formats can still request transparency.");
requireText(files.dialog, 'id: "mp4"', "MP4 option is missing.");
requireText(files.dialog, 'id: "mov"', "MOV option is missing.");
requireText(files.dialog, 'id: "webm"', "WebM option is missing.");
requireText(files.dialog, 'id: "gif"', "GIF option is missing.");
requireText(files.dialog, 'id: "png-sequence"', "PNG sequence option is missing.");
requireText(files.dialog, "Transparent background", "Alpha control is missing.");
requireText(files.dialog, "export-dialog-progress", "Progress UI is missing.");
requireText(files.dialog, "Show in folder", "Completion action is missing.");
requireText(files.inspector, '["Design", "Animation"]', "Export is still permanently visible as an inspector tab.");
requireText(files.main, 'ipcMain.handle("show-item-in-folder"', "Electron reveal handler is missing.");
requireText(files.main, 'const alphaFormats = new Set(["webm", "mov", "png-sequence"])', "Backend alpha compatibility guard is missing.");
requireText(files.preload, "showItemInFolder", "Preload reveal bridge is missing.");
requireText(files.css, ".export-dialog-backdrop", "Export dialog styles are missing.");
requireText(files.css, ".export-toast", "Export notification styles are missing.");

if (issues.length) {
  console.error("Export experience audit failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log("Export experience audit passed: modal settings, MP4/MOV/WebM/GIF/PNG formats, alpha guards, progress, success/failure notifications, and reveal action are wired.");
}

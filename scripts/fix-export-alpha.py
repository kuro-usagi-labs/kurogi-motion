from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

editor_path = ROOT / "src/app/Editor.tsx"
editor = editor_path.read_text(encoding="utf-8")

editor = editor.replace(
    '    transparent: scene.background.type === "transparent",\n',
    '    transparent: false,\n',
    1,
)

old = '''    const snapshot = cloneProject(project);\n    const snapshotScene = getActiveScene(snapshot);\n    snapshotScene.fps = exportOptions.fps;\n    snapshotScene.background = exportOptions.transparent\n      ? { type: "transparent" }\n      : cloneProject(scene.background);\n    setExportNotice(null);\n    setExporting(true);\n    setExportProgress({ phase: "preparing", progress: 0, message: "Preparing export" });\n    try {\n      const result = await window.kurogi.exportVideo(snapshot, exportOptions);\n'''
new = '''    const alphaSupported = exportOptions.format === "webm" || exportOptions.format === "mov" || exportOptions.format === "png-sequence";\n    const effectiveOptions: ExportOptions = {\n      ...exportOptions,\n      transparent: alphaSupported && exportOptions.transparent,\n    };\n    const snapshot = cloneProject(project);\n    const snapshotScene = getActiveScene(snapshot);\n    snapshotScene.fps = effectiveOptions.fps;\n    snapshotScene.background = effectiveOptions.transparent\n      ? { type: "transparent" }\n      : cloneProject(scene.background.type === "transparent" ? { type: "solid", color: "#000000" } : scene.background);\n    setExportNotice(null);\n    setExporting(true);\n    setExportProgress({ phase: "preparing", progress: 0, message: "Preparing export" });\n    try {\n      const result = await window.kurogi.exportVideo(snapshot, effectiveOptions);\n'''
if old not in editor:
    raise RuntimeError("Export snapshot block not found.")
editor = editor.replace(old, new, 1)
editor_path.write_text(editor, encoding="utf-8")

audit_path = ROOT / "scripts/audit-export.mjs"
audit = audit_path.read_text(encoding="utf-8")
needle = 'requireText(files.editor, "Export failed", "Failure notification is missing.");\n'
insert = needle + 'requireText(files.editor, "const effectiveOptions: ExportOptions", "Export options are not normalized before rendering.");\nrequireText(files.editor, "alphaSupported && exportOptions.transparent", "Unsupported alpha formats can still request transparency.");\n'
if needle not in audit:
    raise RuntimeError("Export audit insertion point not found.")
audit_path.write_text(audit.replace(needle, insert, 1), encoding="utf-8")

print("Export alpha options normalized.")

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace(path: str, old: str, new: str) -> None:
    content = read(path)
    if old not in content:
        raise RuntimeError(f"Expected block not found in {path}: {old[:180]!r}")
    write(path, content.replace(old, new, 1))


# Public export contract: MOV was already supported by Electron but not by the typed UI.
replace(
    "src/types.ts",
    'export type ExportFormat = "webm" | "mp4" | "gif" | "png-sequence";',
    'export type ExportFormat = "webm" | "mp4" | "mov" | "gif" | "png-sequence";',
)

# Desktop reveal action used by the completion toast.
replace(
    "src/vite-env.d.ts",
    '    openKuroMotionFile: () => Promise<{ canceled?: boolean; path?: string; content?: string }>;\n',
    '    openKuroMotionFile: () => Promise<{ canceled?: boolean; path?: string; content?: string }>;\n    showItemInFolder: (targetPath: string) => Promise<{ opened: boolean }>;\n',
)
replace(
    "electron/preload.cjs",
    '  openKuroMotionFile: () => ipcRenderer.invoke("open-kuromotion-file"),\n',
    '  openKuroMotionFile: () => ipcRenderer.invoke("open-kuromotion-file"),\n  showItemInFolder: (targetPath) => ipcRenderer.invoke("show-item-in-folder", targetPath),\n',
)
replace(
    "electron/main.cjs",
    'ipcMain.handle("save-kuromotion-file", async (_event, envelope, defaultName) => {\n',
    '''ipcMain.handle("show-item-in-folder", async (_event, targetPath) => {\n  if (typeof targetPath !== "string" || !targetPath.trim() || !path.isAbsolute(targetPath)) {\n    throw new Error("Invalid export destination.");\n  }\n  if (!fs.existsSync(targetPath)) throw new Error("The exported file no longer exists.");\n  const stats = await fs.promises.stat(targetPath);\n  if (stats.isDirectory()) {\n    const error = await shell.openPath(targetPath);\n    if (error) throw new Error(error);\n  } else {\n    shell.showItemInFolder(targetPath);\n  }\n  return { opened: true };\n});\n\nipcMain.handle("save-kuromotion-file", async (_event, envelope, defaultName) => {\n''',
)
replace(
    "electron/main.cjs",
    '''function normalizeExportOptions(raw) {\n  const allowedFormats = new Set(["mp4", "webm", "mov", "gif", "png-sequence"]);\n  const allowedFps = new Set([24, 30, 60]);\n  const allowedQuality = new Set(["low", "medium", "high"]);\n  return {\n    format: allowedFormats.has(raw.format) ? raw.format : "mp4",\n    fps: allowedFps.has(Number(raw.fps)) ? Number(raw.fps) : 30,\n    scale: Math.min(2, Math.max(0.1, Number(raw.scale) || 1)),\n    quality: allowedQuality.has(raw.quality) ? raw.quality : "high",\n    transparent: Boolean(raw.transparent),\n    gifLoops: raw.gifLoops === null ? null : Math.max(0, Number(raw.gifLoops) || 0),\n  };\n}\n''',
    '''function normalizeExportOptions(raw) {\n  const allowedFormats = new Set(["mp4", "webm", "mov", "gif", "png-sequence"]);\n  const alphaFormats = new Set(["webm", "mov", "png-sequence"]);\n  const allowedFps = new Set([24, 30, 60]);\n  const allowedQuality = new Set(["low", "medium", "high"]);\n  const format = allowedFormats.has(raw.format) ? raw.format : "mp4";\n  return {\n    format,\n    fps: allowedFps.has(Number(raw.fps)) ? Number(raw.fps) : 30,\n    scale: Math.min(2, Math.max(0.1, Number(raw.scale) || 1)),\n    quality: allowedQuality.has(raw.quality) ? raw.quality : "high",\n    transparent: alphaFormats.has(format) && Boolean(raw.transparent),\n    gifLoops: raw.gifLoops === null ? null : Math.max(0, Number(raw.gifLoops) || 0),\n  };\n}\n''',
)

write(
    "src/editor/ExportDialog.tsx",
    '''import React, { useEffect, useMemo, useRef } from "react";\nimport { getActiveScene } from "../core/project";\nimport type { ExportFormat, ExportOptions, ExportProgress, KurogiProject } from "../types";\nimport { Icon } from "../ui/Icon";\n\nexport type ExportNotice = {\n  tone: "success" | "error";\n  title: string;\n  message: string;\n  detail?: string;\n  path?: string;\n};\n\ntype ExportDialogProps = {\n  open: boolean;\n  project: KurogiProject;\n  options: ExportOptions;\n  exporting: boolean;\n  progress: ExportProgress | null;\n  onChange: (options: ExportOptions) => void;\n  onClose: () => void;\n  onExport: () => void;\n};\n\ntype FormatDefinition = {\n  id: ExportFormat;\n  label: string;\n  extension: string;\n  description: string;\n  alpha: boolean;\n  recommended?: boolean;\n};\n\nconst FORMAT_DEFINITIONS: readonly FormatDefinition[] = [\n  { id: "mp4", label: "MP4", extension: "H.264", description: "Small, compatible file for web and social media.", alpha: false, recommended: true },\n  { id: "mov", label: "MOV", extension: "ProRes 4444", description: "High-quality master for editing and compositing.", alpha: true },\n  { id: "webm", label: "WebM", extension: "VP8", description: "Web-friendly video with optional transparency.", alpha: true },\n  { id: "gif", label: "GIF", extension: "Animated", description: "Compact looping preview without transparency.", alpha: false },\n  { id: "png-sequence", label: "PNG", extension: "Sequence", description: "Lossless frame sequence with full alpha support.", alpha: true },\n] as const;\n\nexport function ExportDialog({ open, project, options, exporting, progress, onChange, onClose, onExport }: ExportDialogProps) {\n  const dialogRef = useRef<HTMLDivElement>(null);\n  const scene = getActiveScene(project);\n  const format = FORMAT_DEFINITIONS.find((item) => item.id === options.format) ?? FORMAT_DEFINITIONS[0];\n  const outputWidth = Math.round(scene.width * options.scale);\n  const outputHeight = Math.round(scene.height * options.scale);\n  const frameCount = Math.max(1, Math.round(scene.duration * options.fps));\n  const progressLabel = progress ? progress.phase.charAt(0).toUpperCase() + progress.phase.slice(1) : "";\n\n  const summary = useMemo(() => ({\n    dimensions: `${outputWidth} × ${outputHeight}`,\n    duration: `${scene.duration.toFixed(2)} sec`,\n    frames: `${frameCount.toLocaleString()} frames`,\n  }), [frameCount, outputHeight, outputWidth, scene.duration]);\n\n  useEffect(() => {\n    if (!open) return;\n    const handleKeyDown = (event: KeyboardEvent) => {\n      if (event.key === "Escape" && !exporting) onClose();\n    };\n    window.addEventListener("keydown", handleKeyDown);\n    const timer = window.setTimeout(() => dialogRef.current?.focus(), 0);\n    return () => {\n      window.clearTimeout(timer);\n      window.removeEventListener("keydown", handleKeyDown);\n    };\n  }, [exporting, onClose, open]);\n\n  if (!open) return null;\n\n  function chooseFormat(nextFormat: ExportFormat) {\n    const definition = FORMAT_DEFINITIONS.find((item) => item.id === nextFormat) ?? FORMAT_DEFINITIONS[0];\n    onChange({\n      ...options,\n      format: nextFormat,\n      transparent: definition.alpha ? options.transparent : false,\n    });\n  }\n\n  return (\n    <div className="export-dialog-backdrop" role="presentation" onMouseDown={(event) => {\n      if (event.target === event.currentTarget && !exporting) onClose();\n    }}>\n      <div ref={dialogRef} className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title" tabIndex={-1}>\n        <header className="export-dialog-header">\n          <div className="export-dialog-title">\n            <span className="export-dialog-icon"><Icon name="export" size={18} /></span>\n            <div><small>Export project</small><strong id="export-dialog-title">{project.name}</strong></div>\n          </div>\n          <button type="button" className="export-dialog-close" disabled={exporting} onClick={onClose} aria-label="Close export settings"><Icon name="close" size={17} /></button>\n        </header>\n\n        <div className="export-dialog-content">\n          <section className="export-dialog-section">\n            <div className="export-section-heading"><span>File format</span><small>Choose where this motion will be used</small></div>\n            <div className="export-format-grid">\n              {FORMAT_DEFINITIONS.map((item) => (\n                <button\n                  type="button"\n                  key={item.id}\n                  className={`export-format-card ${options.format === item.id ? "is-selected" : ""}`}\n                  onClick={() => chooseFormat(item.id)}\n                  disabled={exporting}\n                >\n                  <span className="export-format-radio" aria-hidden="true" />\n                  <span className="export-format-copy"><b>{item.label}</b><em>{item.extension}</em><small>{item.description}</small></span>\n                  <span className="export-format-badges">{item.recommended ? <i>Recommended</i> : null}{item.alpha ? <i>Alpha</i> : null}</span>\n                </button>\n              ))}\n            </div>\n          </section>\n\n          <section className="export-dialog-section export-settings-section">\n            <div className="export-section-heading"><span>Output settings</span><small>{format.label} · {format.extension}</small></div>\n            <div className="export-setting-grid">\n              <label>Resolution<select value={options.scale} disabled={exporting} onChange={(event) => onChange({ ...options, scale: Number(event.currentTarget.value) })}><option value={.5}>50%</option><option value={.6666667}>67%</option><option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label>\n              <label>Frame rate<select value={options.fps} disabled={exporting} onChange={(event) => onChange({ ...options, fps: Number(event.currentTarget.value) as ExportOptions["fps"] })}><option value={24}>24 FPS</option><option value={30}>30 FPS</option><option value={60}>60 FPS</option></select></label>\n              <label>Quality<select value={options.quality} disabled={exporting} onChange={(event) => onChange({ ...options, quality: event.currentTarget.value as ExportOptions["quality"] })}><option value="low">Draft</option><option value="medium">Standard</option><option value="high">High</option></select></label>\n              {options.format === "gif" ? <label>GIF loops<select value={options.gifLoops === null ? "forever" : String(options.gifLoops)} disabled={exporting} onChange={(event) => onChange({ ...options, gifLoops: event.currentTarget.value === "forever" ? null : Number(event.currentTarget.value) })}><option value="forever">Forever</option><option value="1">1 loop</option><option value="2">2 loops</option><option value="3">3 loops</option><option value="5">5 loops</option></select></label> : null}\n            </div>\n\n            <label className={`export-alpha-row ${!format.alpha ? "is-disabled" : ""}`}>\n              <span><b>Transparent background</b><small>{format.alpha ? "Export the scene without a solid canvas background." : `${format.label} does not support transparency in this exporter.`}</small></span>\n              <span className={`export-alpha-switch ${options.transparent && format.alpha ? "is-on" : ""}`}><input type="checkbox" checked={options.transparent && format.alpha} disabled={!format.alpha || exporting} onChange={(event) => onChange({ ...options, transparent: event.currentTarget.checked })} /><i /></span>\n            </label>\n          </section>\n\n          <section className="export-summary">\n            <div><small>Output size</small><strong>{summary.dimensions}</strong></div>\n            <div><small>Duration</small><strong>{summary.duration}</strong></div>\n            <div><small>Frames</small><strong>{summary.frames}</strong></div>\n            <div><small>Container</small><strong>{format.label}</strong></div>\n          </section>\n\n          {progress ? (\n            <section className={`export-dialog-progress progress-${progress.phase}`}>\n              <div><span><b>{progressLabel}</b><small>{progress.message || "Working…"}</small></span><strong>{Math.round(progress.progress * 100)}%</strong></div>\n              <progress max={1} value={Math.max(0, Math.min(1, progress.progress))} />\n            </section>\n          ) : null}\n        </div>\n\n        <footer className="export-dialog-footer">\n          <span>{format.alpha && options.transparent ? "Alpha channel enabled" : "Solid background output"}</span>\n          <div><button type="button" className="export-cancel-button" disabled={exporting} onClick={onClose}>Cancel</button><button type="button" className="export-start-button" disabled={exporting} onClick={onExport}>{exporting ? <><span className="export-spinner" />Rendering…</> : <>Export {format.label}<Icon name="export" size={15} /></>}</button></div>\n        </footer>\n      </div>\n    </div>\n  );\n}\n\nexport function ExportToast({ notice, onClose, onReveal }: { notice: ExportNotice | null; onClose: () => void; onReveal: (path: string) => void }) {\n  if (!notice) return null;\n  return (\n    <div className={`export-toast is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>\n      <span className="export-toast-symbol" aria-hidden="true">\n        {notice.tone === "success" ? (\n          <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>\n        ) : (\n          <svg viewBox="0 0 24 24"><path d="M12 8v5" /><path d="M12 17h.01" /><path d="M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0Z" /></svg>\n        )}\n      </span>\n      <span className="export-toast-copy"><b>{notice.title}</b><small>{notice.message}</small>{notice.detail ? <em title={notice.detail}>{notice.detail}</em> : null}</span>\n      <span className="export-toast-actions">{notice.path ? <button type="button" onClick={() => onReveal(notice.path!)}>Show in folder</button> : null}<button type="button" className="export-toast-close" onClick={onClose} aria-label="Dismiss notification"><Icon name="close" size={14} /></button></span>\n    </div>\n  );\n}\n''',
)

# Toolbar export opens a dedicated modal; export status uses non-blocking notifications.
replace(
    "src/app/Editor.tsx",
    'import { Timeline } from "../editor/TimelineV3";\n',
    'import { Timeline } from "../editor/TimelineV3";\nimport { ExportDialog, ExportToast, type ExportNotice } from "../editor/ExportDialog";\n',
)
replace(
    "src/app/Editor.tsx",
    '  const [exporting, setExporting] = useState(false);\n  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);\n',
    '  const [exporting, setExporting] = useState(false);\n  const [exportDialogOpen, setExportDialogOpen] = useState(false);\n  const [exportNotice, setExportNotice] = useState<ExportNotice | null>(null);\n  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);\n',
)
replace(
    "src/app/Editor.tsx",
    '''  useEffect(() => {\n    const unsubscribe = window.kurogi?.onExportProgress?.((progress) => setExportProgress(progress));\n    return () => unsubscribe?.();\n  }, []);\n''',
    '''  useEffect(() => {\n    const unsubscribe = window.kurogi?.onExportProgress?.((progress) => setExportProgress(progress));\n    return () => unsubscribe?.();\n  }, []);\n\n  useEffect(() => {\n    if (!exportNotice) return;\n    const timer = window.setTimeout(() => setExportNotice(null), exportNotice.tone === "success" ? 6500 : 9000);\n    return () => window.clearTimeout(timer);\n  }, [exportNotice]);\n''',
)
replace(
    "src/app/Editor.tsx",
    '''  async function exportVideo() {\n    if (!window.kurogi) {\n      window.alert("Open the Electron app to export video files.");\n      return;\n    }\n    const snapshot = cloneProject(project);\n    const snapshotScene = getActiveScene(snapshot);\n    snapshotScene.fps = exportOptions.fps;\n    if (exportOptions.transparent) snapshotScene.background = { type: "transparent" };\n    setExporting(true);\n    setExportProgress({ phase: "preparing", progress: 0, message: "Preparing export" });\n    try {\n      const result = await window.kurogi.exportVideo(snapshot, exportOptions);\n      if (!result.canceled && result.path) {\n        setExportProgress({ phase: "completed", progress: 1, message: result.path });\n      } else {\n        setExportProgress(null);\n      }\n    } catch (error) {\n      setExportProgress({\n        phase: "failed",\n        progress: 0,\n        message: error instanceof Error ? error.message : "Export failed",\n      });\n    } finally {\n      setExporting(false);\n    }\n  }\n''',
    '''  async function exportVideo() {\n    if (!window.kurogi) {\n      setExportNotice({\n        tone: "error",\n        title: "Desktop export unavailable",\n        message: "Open Kurogi Motion in Electron to render files.",\n      });\n      return;\n    }\n    const snapshot = cloneProject(project);\n    const snapshotScene = getActiveScene(snapshot);\n    snapshotScene.fps = exportOptions.fps;\n    snapshotScene.background = exportOptions.transparent\n      ? { type: "transparent" }\n      : cloneProject(scene.background);\n    setExportNotice(null);\n    setExporting(true);\n    setExportProgress({ phase: "preparing", progress: 0, message: "Preparing export" });\n    try {\n      const result = await window.kurogi.exportVideo(snapshot, exportOptions);\n      if (!result.canceled && result.path) {\n        setExportProgress({ phase: "completed", progress: 1, message: result.path });\n        setExportNotice({\n          tone: "success",\n          title: "Export complete",\n          message: `${exportOptions.format.toUpperCase()} saved successfully.`,\n          detail: result.path,\n          path: result.path,\n        });\n        setExportDialogOpen(false);\n      } else {\n        setExportProgress(null);\n      }\n    } catch (error) {\n      const message = error instanceof Error ? error.message : "Export failed";\n      setExportProgress({ phase: "failed", progress: 0, message });\n      setExportNotice({ tone: "error", title: "Export failed", message });\n    } finally {\n      setExporting(false);\n    }\n  }\n\n  async function revealExport(targetPath: string) {\n    try {\n      await window.kurogi?.showItemInFolder(targetPath);\n    } catch (error) {\n      setExportNotice({\n        tone: "error",\n        title: "Could not open export folder",\n        message: error instanceof Error ? error.message : "The destination is no longer available.",\n      });\n    }\n  }\n''',
)
replace(
    "src/app/Editor.tsx",
    '          <button type="button" className="export" onClick={() => setInspectorTab("Export")}>Export <Icon name="export" size={15} /></button>\n',
    '          <button type="button" className="export" onClick={() => { setExportProgress(null); setExportDialogOpen(true); }}>Export <Icon name="export" size={15} /></button>\n',
)
replace(
    "src/app/Editor.tsx",
    '    <main className="app editor-app">\n',
    '''    <main className="app editor-app">\n      <ExportDialog\n        open={exportDialogOpen}\n        project={project}\n        options={exportOptions}\n        exporting={exporting}\n        progress={exportProgress}\n        onChange={setExportOptions}\n        onClose={() => { if (!exporting) { setExportDialogOpen(false); setExportProgress(null); } }}\n        onExport={() => void exportVideo()}\n      />\n      <ExportToast notice={exportNotice} onClose={() => setExportNotice(null)} onReveal={(targetPath) => void revealExport(targetPath)} />\n''',
)

# Keep export settings out of the always-visible inspector. They now appear only on toolbar Export.
replace(
    "src/editor/InspectorV2.tsx",
    '{(["Design", "Animation", "Export"] as const).map((candidate) => (',
    '{(["Design", "Animation"] as const).map((candidate) => (',
)

# MacOS-like export dialog and notification styling.
css = read("src/finalUx.css")
css += r'''

/* Export settings dialog and completion notifications */
.export-dialog-backdrop { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 28px; background: rgba(6,7,11,.58); backdrop-filter: blur(12px) saturate(.9); -webkit-backdrop-filter: blur(12px) saturate(.9); animation: export-backdrop-in .16s ease-out both; }
.export-dialog { width: min(840px, calc(100vw - 56px)); max-height: min(820px, calc(100dvh - 56px)); overflow: hidden; color: #f4f1f8; border: 1px solid rgba(255,255,255,.12); border-radius: 18px; outline: none; background: #1b1c24; box-shadow: 0 30px 90px rgba(0,0,0,.52), 0 1px 0 rgba(255,255,255,.08) inset; animation: export-dialog-in .2s cubic-bezier(.2,.8,.2,1) both; }
.export-dialog-header { display: flex; align-items: center; justify-content: space-between; min-height: 74px; padding: 16px 18px 15px 20px; border-bottom: 1px solid rgba(255,255,255,.075); background: #20212a; }
.export-dialog-title { display: flex; align-items: center; min-width: 0; gap: 12px; }
.export-dialog-icon { display: grid; width: 38px; height: 38px; place-items: center; flex: none; color: #d8cbff; border: 1px solid rgba(169,139,255,.3); border-radius: 11px; background: rgba(124,92,255,.16); }
.export-dialog-title div { display: grid; min-width: 0; gap: 2px; }
.export-dialog-title small { color: #817d8d; font-size: 10px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase; }
.export-dialog-title strong { overflow: hidden; color: #f6f3fb; font-size: 16px; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.export-dialog-close { display: grid; width: 34px; height: 34px; place-items: center; color: #9a96a5; border: 0; border-radius: 9px; background: transparent; }
.export-dialog-close:hover:not(:disabled) { color: #fff; background: rgba(255,255,255,.075); }
.export-dialog-content { max-height: calc(min(820px, 100dvh - 56px) - 146px); overflow: auto; padding: 21px; overscroll-behavior: contain; }
.export-dialog-section + .export-dialog-section { margin-top: 22px; }
.export-section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 18px; margin-bottom: 11px; }
.export-section-heading span { color: #e7e2ed; font-size: 12px; font-weight: 750; }
.export-section-heading small { color: #777382; font-size: 10px; }
.export-format-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
.export-format-card { position: relative; display: grid; grid-template-columns: 17px minmax(0,1fr) auto; min-height: 92px; align-items: start; gap: 10px; padding: 13px; color: #bbb6c3; border: 1px solid #34353f; border-radius: 12px; background: #22232c; text-align: left; transition: border-color .14s ease, background .14s ease, transform .14s ease; }
.export-format-card:hover:not(:disabled) { border-color: #575164; background: #272832; transform: translateY(-1px); }
.export-format-card.is-selected { border-color: #8d70dc; background: #292636; box-shadow: 0 0 0 1px rgba(141,112,220,.16) inset; }
.export-format-radio { width: 14px; height: 14px; margin-top: 2px; border: 1.5px solid #65616e; border-radius: 50%; box-shadow: 0 0 0 3px transparent inset; }
.export-format-card.is-selected .export-format-radio { border-color: #a98cff; background: #a98cff; box-shadow: 0 0 0 3px #292636 inset; }
.export-format-copy { display: grid; min-width: 0; grid-template-columns: auto 1fr; column-gap: 7px; row-gap: 5px; }
.export-format-copy b { color: #f1edf6; font-size: 13px; }
.export-format-copy em { align-self: center; color: #918b9c; font-size: 9px; font-style: normal; }
.export-format-copy small { grid-column: 1 / -1; color: #898491; font-size: 10px; line-height: 1.45; }
.export-format-badges { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.export-format-badges i { padding: 3px 5px; color: #bfb0ec; border: 1px solid rgba(169,139,255,.22); border-radius: 5px; background: rgba(124,92,255,.1); font-size: 7px; font-style: normal; font-weight: 760; letter-spacing: .25px; text-transform: uppercase; }
.export-settings-section { padding-top: 19px; border-top: 1px solid rgba(255,255,255,.065); }
.export-setting-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 9px; }
.export-setting-grid label { display: grid; gap: 6px; color: #817d89; font-size: 9px; font-weight: 700; }
.export-setting-grid select { width: 100%; height: 36px; padding: 0 10px; color: #e8e3ed; border: 1px solid #373842; border-radius: 9px; outline: none; background: #24252e; font-size: 10px; }
.export-setting-grid select:focus { border-color: #846bd0; box-shadow: 0 0 0 2px rgba(124,92,255,.13); }
.export-alpha-row { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 64px; margin-top: 10px; padding: 11px 13px; border: 1px solid #34353f; border-radius: 11px; background: #22232b; }
.export-alpha-row > span:first-child { display: grid; gap: 3px; }
.export-alpha-row b { color: #ddd8e4; font-size: 10px; }
.export-alpha-row small { color: #7f7a87; font-size: 9px; line-height: 1.4; }
.export-alpha-row.is-disabled { opacity: .54; }
.export-alpha-switch { position: relative; display: block; width: 36px; height: 21px; flex: none; border-radius: 999px; background: #40414b; transition: background .15s ease; }
.export-alpha-switch.is-on { background: #7c5cff; }
.export-alpha-switch input { position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.export-alpha-switch i { position: absolute; top: 3px; left: 3px; width: 15px; height: 15px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.28); transition: transform .15s ease; }
.export-alpha-switch.is-on i { transform: translateX(15px); }
.export-summary { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 1px; overflow: hidden; margin-top: 18px; border: 1px solid #34353f; border-radius: 11px; background: #34353f; }
.export-summary div { display: grid; gap: 4px; min-width: 0; padding: 11px 12px; background: #21222a; }
.export-summary small { color: #777381; font-size: 8px; text-transform: uppercase; }
.export-summary strong { overflow: hidden; color: #dcd7e3; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.export-dialog-progress { margin-top: 14px; padding: 12px 13px; border: 1px solid rgba(124,92,255,.24); border-radius: 11px; background: rgba(124,92,255,.08); }
.export-dialog-progress > div { display: flex; align-items: center; justify-content: space-between; gap: 15px; }
.export-dialog-progress > div > span { display: grid; min-width: 0; gap: 2px; }
.export-dialog-progress b { color: #ddd4f5; font-size: 10px; }
.export-dialog-progress small { overflow: hidden; max-width: 560px; color: #8e879b; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.export-dialog-progress > div > strong { color: #c9b8fb; font: 10px "DM Mono", monospace; }
.export-dialog-progress progress { display: block; width: 100%; height: 5px; margin-top: 9px; overflow: hidden; border: 0; border-radius: 999px; background: #34323d; }
.export-dialog-progress progress::-webkit-progress-bar { background: #34323d; }
.export-dialog-progress progress::-webkit-progress-value { border-radius: 999px; background: linear-gradient(90deg,#7c5cff,#b094ff); }
.export-dialog-progress.progress-failed { border-color: rgba(244,101,112,.28); background: rgba(244,101,112,.08); }
.export-dialog-footer { display: flex; align-items: center; justify-content: space-between; min-height: 72px; gap: 18px; padding: 14px 18px; border-top: 1px solid rgba(255,255,255,.075); background: #20212a; }
.export-dialog-footer > span { color: #777382; font-size: 9px; }
.export-dialog-footer > div { display: flex; gap: 8px; }
.export-cancel-button,.export-start-button { min-height: 38px; padding: 0 15px; border-radius: 9px; font-size: 10px; font-weight: 760; }
.export-cancel-button { color: #aaa5b2; border: 1px solid #3a3b45; background: #262730; }
.export-cancel-button:hover:not(:disabled) { color: #fff; background: #2d2e38; }
.export-start-button { display: inline-flex; align-items: center; justify-content: center; min-width: 126px; gap: 8px; color: #fff; border: 1px solid #8d73dd; background: #7659c7; box-shadow: 0 7px 20px rgba(83,57,156,.26); }
.export-start-button:hover:not(:disabled) { background: #8063d1; }
.export-start-button:disabled,.export-cancel-button:disabled,.export-dialog-close:disabled { opacity: .5; cursor: not-allowed; }
.export-spinner { width: 13px; height: 13px; border: 2px solid rgba(255,255,255,.28); border-top-color: #fff; border-radius: 50%; animation: export-spin .75s linear infinite; }
.export-toast { position: fixed; top: 72px; right: 18px; z-index: 3100; display: grid; grid-template-columns: 36px minmax(0,1fr) auto; width: min(430px, calc(100vw - 36px)); align-items: center; gap: 11px; padding: 11px 11px 11px 12px; color: #ece8f1; border: 1px solid rgba(255,255,255,.12); border-radius: 13px; background: #25262f; box-shadow: 0 18px 48px rgba(0,0,0,.42); animation: export-toast-in .24s cubic-bezier(.2,.8,.2,1) both; }
.export-toast.is-success { border-color: rgba(86,205,155,.3); }
.export-toast.is-error { border-color: rgba(244,101,112,.34); }
.export-toast-symbol { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 10px; }
.export-toast.is-success .export-toast-symbol { color: #80e2b8; background: rgba(62,188,134,.13); }
.export-toast.is-error .export-toast-symbol { color: #ff9099; background: rgba(244,101,112,.13); }
.export-toast-symbol svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.export-toast-copy { display: grid; min-width: 0; gap: 2px; }
.export-toast-copy b { color: #f1edf5; font-size: 11px; }
.export-toast-copy small { color: #a19ba9; font-size: 9px; line-height: 1.4; }
.export-toast-copy em { overflow: hidden; max-width: 250px; color: #75717d; font-size: 8px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
.export-toast-actions { display: flex; align-items: center; gap: 5px; }
.export-toast-actions > button:first-child:not(.export-toast-close) { min-height: 30px; padding: 0 9px; color: #cbbcf2; border: 1px solid rgba(169,139,255,.25); border-radius: 8px; background: rgba(124,92,255,.1); font-size: 8px; font-weight: 750; }
.export-toast-close { display: grid; width: 29px; height: 29px; place-items: center; color: #817d89; border: 0; border-radius: 8px; background: transparent; }
.export-toast-close:hover { color: #fff; background: rgba(255,255,255,.07); }
@keyframes export-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes export-dialog-in { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes export-toast-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
@keyframes export-spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) { .export-dialog-backdrop { padding: 12px; } .export-dialog { width: calc(100vw - 24px); max-height: calc(100dvh - 24px); } .export-dialog-content { max-height: calc(100dvh - 170px); padding: 15px; } .export-format-grid { grid-template-columns: 1fr; } .export-setting-grid { grid-template-columns: 1fr 1fr; } .export-summary { grid-template-columns: 1fr 1fr; } .export-dialog-footer > span { display: none; } .export-dialog-footer { justify-content: flex-end; } }
'''
write("src/finalUx.css", css)

write(
    "scripts/audit-export.mjs",
    '''import { readFile } from "node:fs/promises";\n\nconst files = {\n  types: await readFile(new URL("../src/types.ts", import.meta.url), "utf8"),\n  editor: await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8"),\n  inspector: await readFile(new URL("../src/editor/InspectorV2.tsx", import.meta.url), "utf8"),\n  dialog: await readFile(new URL("../src/editor/ExportDialog.tsx", import.meta.url), "utf8"),\n  main: await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),\n  preload: await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),\n  css: await readFile(new URL("../src/finalUx.css", import.meta.url), "utf8"),\n};\n\nconst issues = [];\nconst requireText = (source, text, message) => { if (!source.includes(text)) issues.push(message); };\n\nrequireText(files.types, '"mov"', "ExportFormat does not expose MOV.");\nrequireText(files.editor, "setExportDialogOpen(true)", "Toolbar Export does not open the settings dialog.");\nif (files.editor.includes('setInspectorTab("Export")')) issues.push("Toolbar Export still redirects to the inspector.");\nrequireText(files.editor, "Export complete", "Success notification is missing.");\nrequireText(files.editor, "Export failed", "Failure notification is missing.");\nrequireText(files.dialog, 'id: "mp4"', "MP4 option is missing.");\nrequireText(files.dialog, 'id: "mov"', "MOV option is missing.");\nrequireText(files.dialog, 'id: "webm"', "WebM option is missing.");\nrequireText(files.dialog, 'id: "gif"', "GIF option is missing.");\nrequireText(files.dialog, 'id: "png-sequence"', "PNG sequence option is missing.");\nrequireText(files.dialog, "Transparent background", "Alpha control is missing.");\nrequireText(files.dialog, "export-dialog-progress", "Progress UI is missing.");\nrequireText(files.dialog, "Show in folder", "Completion action is missing.");\nrequireText(files.inspector, '["Design", "Animation"]', "Export is still permanently visible as an inspector tab.");\nrequireText(files.main, 'ipcMain.handle("show-item-in-folder"', "Electron reveal handler is missing.");\nrequireText(files.main, 'const alphaFormats = new Set(["webm", "mov", "png-sequence"])', "Backend alpha compatibility guard is missing.");\nrequireText(files.preload, "showItemInFolder", "Preload reveal bridge is missing.");\nrequireText(files.css, ".export-dialog-backdrop", "Export dialog styles are missing.");\nrequireText(files.css, ".export-toast", "Export notification styles are missing.");\n\nif (issues.length) {\n  console.error("Export experience audit failed:");\n  for (const issue of issues) console.error(`- ${issue}`);\n  process.exitCode = 1;\n} else {\n  console.log("Export experience audit passed: modal settings, MP4/MOV/WebM/GIF/PNG formats, alpha guards, progress, success/failure notifications, and reveal action are wired.");\n}\n''',
)

replace(
    "package.json",
    '    "audit:shapes": "node scripts/audit-shapes.mjs",\n    "audit": "npm run audit:templates && npm run audit:effects && npm run audit:loops && npm run audit:text-canvas && npm run audit:shapes",\n',
    '    "audit:shapes": "node scripts/audit-shapes.mjs",\n    "audit:export": "node scripts/audit-export.mjs",\n    "audit": "npm run audit:templates && npm run audit:effects && npm run audit:loops && npm run audit:text-canvas && npm run audit:shapes && npm run audit:export",\n',
)

replace(
    ".github/workflows/ci.yml",
    '''      - name: Audit effect renderer\n        shell: bash\n''',
    '''      - name: Audit export experience\n        shell: bash\n        run: |\n          set -o pipefail\n          npm run audit:export 2>&1 | tee export-audit.log\n\n      - name: Audit effect renderer\n        shell: bash\n''',
)
replace(
    ".github/workflows/ci.yml",
    '            template-audit.log\n            effect-audit.log\n',
    '            template-audit.log\n            export-audit.log\n            effect-audit.log\n',
)

print("Export experience patch applied.")

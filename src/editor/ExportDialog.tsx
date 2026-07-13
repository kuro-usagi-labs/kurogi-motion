import React, { useEffect, useMemo, useRef } from "react";
import { getActiveScene } from "../core/project";
import type { ExportFormat, ExportOptions, ExportProgress, KurogiProject } from "../types";
import { Icon } from "../ui/Icon";

export type ExportNotice = {
  tone: "success" | "error";
  title: string;
  message: string;
  detail?: string;
  path?: string;
};

type ExportDialogProps = {
  open: boolean;
  project: KurogiProject;
  options: ExportOptions;
  exporting: boolean;
  progress: ExportProgress | null;
  onChange: (options: ExportOptions) => void;
  onClose: () => void;
  onExport: () => void;
};

type FormatDefinition = {
  id: ExportFormat;
  label: string;
  extension: string;
  description: string;
  alpha: boolean;
  recommended?: boolean;
};

const FORMAT_DEFINITIONS: readonly FormatDefinition[] = [
  { id: "mp4", label: "MP4", extension: "H.264", description: "Small, compatible file for web and social media.", alpha: false, recommended: true },
  { id: "mov", label: "MOV", extension: "ProRes 4444", description: "High-quality master for editing and compositing.", alpha: true },
  { id: "webm", label: "WebM", extension: "VP8", description: "Web-friendly video with optional transparency.", alpha: true },
  { id: "gif", label: "GIF", extension: "Animated", description: "Compact looping preview without transparency.", alpha: false },
  { id: "png-sequence", label: "PNG", extension: "Sequence", description: "Lossless frame sequence with full alpha support.", alpha: true },
] as const;

export function ExportDialog({ open, project, options, exporting, progress, onChange, onClose, onExport }: ExportDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const scene = getActiveScene(project);
  const format = FORMAT_DEFINITIONS.find((item) => item.id === options.format) ?? FORMAT_DEFINITIONS[0];
  const outputWidth = Math.round(scene.width * options.scale);
  const outputHeight = Math.round(scene.height * options.scale);
  const frameCount = Math.max(1, Math.round(scene.duration * options.fps));
  const progressLabel = progress ? progress.phase.charAt(0).toUpperCase() + progress.phase.slice(1) : "";

  const summary = useMemo(() => ({
    dimensions: `${outputWidth} × ${outputHeight}`,
    duration: `${scene.duration.toFixed(2)} sec`,
    frames: `${frameCount.toLocaleString()} frames`,
  }), [frameCount, outputHeight, outputWidth, scene.duration]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !exporting) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    const timer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [exporting, onClose, open]);

  if (!open) return null;

  function chooseFormat(nextFormat: ExportFormat) {
    const definition = FORMAT_DEFINITIONS.find((item) => item.id === nextFormat) ?? FORMAT_DEFINITIONS[0];
    onChange({
      ...options,
      format: nextFormat,
      transparent: definition.alpha ? options.transparent : false,
    });
  }

  return (
    <div className="export-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !exporting) onClose();
    }}>
      <div ref={dialogRef} className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title" tabIndex={-1}>
        <header className="export-dialog-header">
          <div className="export-dialog-title">
            <span className="export-dialog-icon"><Icon name="export" size={18} /></span>
            <div><small>Export project</small><strong id="export-dialog-title">{project.name}</strong></div>
          </div>
          <button type="button" className="export-dialog-close" disabled={exporting} onClick={onClose} aria-label="Close export settings"><Icon name="close" size={17} /></button>
        </header>

        <div className="export-dialog-content">
          <section className="export-dialog-section">
            <div className="export-section-heading"><span>File format</span><small>Choose where this motion will be used</small></div>
            <div className="export-format-grid">
              {FORMAT_DEFINITIONS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`export-format-card ${options.format === item.id ? "is-selected" : ""}`}
                  onClick={() => chooseFormat(item.id)}
                  disabled={exporting}
                >
                  <span className="export-format-radio" aria-hidden="true" />
                  <span className="export-format-copy"><b>{item.label}</b><em>{item.extension}</em><small>{item.description}</small></span>
                  <span className="export-format-badges">{item.recommended ? <i>Recommended</i> : null}{item.alpha ? <i>Alpha</i> : null}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="export-dialog-section export-settings-section">
            <div className="export-section-heading"><span>Output settings</span><small>{format.label} · {format.extension}</small></div>
            <div className="export-setting-grid">
              <label>Resolution<select value={options.scale} disabled={exporting} onChange={(event) => onChange({ ...options, scale: Number(event.currentTarget.value) })}><option value={.5}>50%</option><option value={.6666667}>67%</option><option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label>
              <label>Frame rate<select value={options.fps} disabled={exporting} onChange={(event) => onChange({ ...options, fps: Number(event.currentTarget.value) as ExportOptions["fps"] })}><option value={24}>24 FPS</option><option value={30}>30 FPS</option><option value={60}>60 FPS</option></select></label>
              <label>Quality<select value={options.quality} disabled={exporting} onChange={(event) => onChange({ ...options, quality: event.currentTarget.value as ExportOptions["quality"] })}><option value="low">Draft</option><option value="medium">Standard</option><option value="high">High</option></select></label>
              {options.format === "gif" ? <label>GIF loops<select value={options.gifLoops === null ? "forever" : String(options.gifLoops)} disabled={exporting} onChange={(event) => onChange({ ...options, gifLoops: event.currentTarget.value === "forever" ? null : Number(event.currentTarget.value) })}><option value="forever">Forever</option><option value="1">1 loop</option><option value="2">2 loops</option><option value="3">3 loops</option><option value="5">5 loops</option></select></label> : null}
            </div>

            <label className={`export-alpha-row ${!format.alpha ? "is-disabled" : ""}`}>
              <span><b>Transparent background</b><small>{format.alpha ? "Export the scene without a solid canvas background." : `${format.label} does not support transparency in this exporter.`}</small></span>
              <span className={`export-alpha-switch ${options.transparent && format.alpha ? "is-on" : ""}`}><input type="checkbox" checked={options.transparent && format.alpha} disabled={!format.alpha || exporting} onChange={(event) => onChange({ ...options, transparent: event.currentTarget.checked })} /><i /></span>
            </label>
          </section>

          <section className="export-summary">
            <div><small>Output size</small><strong>{summary.dimensions}</strong></div>
            <div><small>Duration</small><strong>{summary.duration}</strong></div>
            <div><small>Frames</small><strong>{summary.frames}</strong></div>
            <div><small>Container</small><strong>{format.label}</strong></div>
          </section>

          {progress ? (
            <section className={`export-dialog-progress progress-${progress.phase}`}>
              <div><span><b>{progressLabel}</b><small>{progress.message || "Working…"}</small></span><strong>{Math.round(progress.progress * 100)}%</strong></div>
              <progress max={1} value={Math.max(0, Math.min(1, progress.progress))} />
            </section>
          ) : null}
        </div>

        <footer className="export-dialog-footer">
          <span>{format.alpha && options.transparent ? "Alpha channel enabled" : "Solid background output"}</span>
          <div><button type="button" className="export-cancel-button" disabled={exporting} onClick={onClose}>Cancel</button><button type="button" className="export-start-button" disabled={exporting} onClick={onExport}>{exporting ? <><span className="export-spinner" />Rendering…</> : <>Export {format.label}<Icon name="export" size={15} /></>}</button></div>
        </footer>
      </div>
    </div>
  );
}

export function ExportToast({ notice, onClose, onReveal }: { notice: ExportNotice | null; onClose: () => void; onReveal: (path: string) => void }) {
  if (!notice) return null;
  return (
    <div className={`export-toast is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      <span className="export-toast-symbol" aria-hidden="true">
        {notice.tone === "success" ? (
          <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
        ) : (
          <svg viewBox="0 0 24 24"><path d="M12 8v5" /><path d="M12 17h.01" /><path d="M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0Z" /></svg>
        )}
      </span>
      <span className="export-toast-copy"><b>{notice.title}</b><small>{notice.message}</small>{notice.detail ? <em title={notice.detail}>{notice.detail}</em> : null}</span>
      <span className="export-toast-actions">{notice.path ? <button type="button" onClick={() => onReveal(notice.path!)}>Show in folder</button> : null}<button type="button" className="export-toast-close" onClick={onClose} aria-label="Dismiss notification"><Icon name="close" size={14} /></button></span>
    </div>
  );
}

import React, { useMemo, useState } from "react";
import type { CreateProjectOptions, ProjectFormat } from "../core/project";
import type { ProjectSummary } from "../core/persistence";

interface DashboardProps {
  projects: ProjectSummary[];
  loading: boolean;
  onOpen: (projectId: string) => void;
  onDelete: (projectId: string) => void;
  onCreate: (options: CreateProjectOptions, templateId?: string) => void;
}

const FORMATS: Array<{
  id: ProjectFormat;
  label: string;
  size: string;
  ratio: string;
}> = [
  { id: "square", label: "Square", size: "1080 × 1080", ratio: "1 / 1" },
  { id: "vertical", label: "Vertical", size: "1080 × 1920", ratio: "9 / 16" },
  { id: "landscape", label: "Landscape", size: "1920 × 1080", ratio: "16 / 9" },
  { id: "portrait", label: "Portrait", size: "1080 × 1350", ratio: "4 / 5" },
  { id: "custom", label: "Custom", size: "Your dimensions", ratio: "1 / 1" },
];

const TEMPLATES = [
  { id: "product", name: "Product promotion", format: "square" as const, gradient: "linear-gradient(135deg,#f8f4ff,#9f7aea)", copy: "NEW DROP" },
  { id: "quote", name: "Animated quote", format: "portrait" as const, gradient: "linear-gradient(135deg,#fff1e8,#f8a27f)", copy: "SAY IT" },
  { id: "logo", name: "Logo reveal", format: "landscape" as const, gradient: "linear-gradient(135deg,#171821,#6d42e5)", copy: "K" },
  { id: "announcement", name: "Social announcement", format: "vertical" as const, gradient: "linear-gradient(135deg,#dffbf2,#62d4ad)", copy: "HELLO" },
];

export function Dashboard({ projects, loading, onOpen, onDelete, onCreate }: DashboardProps) {
  const [name, setName] = useState("Untitled motion");
  const [format, setFormat] = useState<ProjectFormat>("square");
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [background, setBackground] = useState("#ffffff");
  const [transparent, setTransparent] = useState(false);
  const selectedFormat = useMemo(() => FORMATS.find((item) => item.id === format)!, [format]);

  function createProject() {
    onCreate({
      name: name.trim() || "Untitled motion",
      format,
      width: format === "custom" ? width : undefined,
      height: format === "custom" ? height : undefined,
      duration,
      fps,
      background,
      transparent,
    });
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <div className="brand dashboard-brand">
          <span className="brand-mark">K</span>
          <span>kurogi<span className="muted">motion</span></span>
        </div>
        <span className="dashboard-product-label">DESIGN IT. MOVE IT. EXPORT IT.</span>
      </header>

      <div className="dashboard-content">
        <section className="dashboard-hero">
          <div>
            <span className="eyebrow">MOTION WITHOUT COMPLEXITY</span>
            <h1>What will you make move?</h1>
            <p>Build a design, choose an action, set the timing, and export from the same Remotion composition.</p>
          </div>
          <div className="dashboard-metric">
            <strong>&lt; 3 min</strong>
            <span>Target time to first motion</span>
          </div>
        </section>

        <section className="new-project-card">
          <div className="new-project-header">
            <div><span className="eyebrow">NEW PROJECT</span><h2>Start from a clean scene</h2></div>
            <span className="format-summary">{selectedFormat.size}</span>
          </div>
          <div className="new-project-grid">
            <div className="new-project-main">
              <label className="dashboard-field">
                Project name
                <input value={name} onChange={(event) => setName(event.currentTarget.value)} />
              </label>
              <div className="dashboard-field">
                <span>Format</span>
                <div className="format-grid">
                  {FORMATS.map((item) => (
                    <button type="button" key={item.id} className={format === item.id ? "active" : ""} onClick={() => setFormat(item.id)}>
                      <i style={{ aspectRatio: item.ratio }} />
                      <span><strong>{item.label}</strong><small>{item.size}</small></span>
                    </button>
                  ))}
                </div>
              </div>
              {format === "custom" ? (
                <div className="dashboard-two">
                  <label className="dashboard-field">Width<input type="number" min={64} max={7680} value={width} onChange={(event) => setWidth(Number(event.currentTarget.value))} /></label>
                  <label className="dashboard-field">Height<input type="number" min={64} max={7680} value={height} onChange={(event) => setHeight(Number(event.currentTarget.value))} /></label>
                </div>
              ) : null}
            </div>
            <div className="new-project-settings">
              <div className="dashboard-two">
                <label className="dashboard-field">Duration<input type="number" min={0.1} max={3600} step={0.1} value={duration} onChange={(event) => setDuration(Number(event.currentTarget.value))} /><span className="field-suffix">seconds</span></label>
                <label className="dashboard-field">Frame rate<select value={fps} onChange={(event) => setFps(Number(event.currentTarget.value) as 24 | 30 | 60)}><option value={24}>24 FPS</option><option value={30}>30 FPS</option><option value={60}>60 FPS</option></select></label>
              </div>
              <label className="dashboard-field">Background<div className="background-control"><input type="color" value={background} disabled={transparent} onChange={(event) => setBackground(event.currentTarget.value)} /><input value={background} disabled={transparent} onChange={(event) => setBackground(event.currentTarget.value)} /></div></label>
              <label className="dashboard-toggle"><span><strong>Transparent scene</strong><small>Best for WebM and PNG sequence</small></span><input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.currentTarget.checked)} /></label>
              <button type="button" className="create-project-button" onClick={createProject}>Create project <span>→</span></button>
            </div>
          </div>
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-heading"><div><span className="eyebrow">START FASTER</span><h2>Motion templates</h2></div><span>Editable layers and actions</span></div>
          <div className="dashboard-template-grid">
            {TEMPLATES.map((template) => (
              <button
                type="button"
                key={template.id}
                onClick={() => onCreate({ name: template.name, format: template.format, duration: 5, fps: 30, background: "#ffffff" }, template.id)}
              >
                <div className="template-preview" style={{ background: template.gradient }}><strong>{template.copy}</strong><i /></div>
                <span><strong>{template.name}</strong><small>{FORMATS.find((item) => item.id === template.format)?.size} · 5 sec</small></span>
              </button>
            ))}
          </div>
        </section>

        <section className="dashboard-section recent-section">
          <div className="dashboard-section-heading"><div><span className="eyebrow">YOUR WORK</span><h2>Recent projects</h2></div><span>{projects.length} project{projects.length === 1 ? "" : "s"}</span></div>
          {loading ? <div className="dashboard-empty">Loading projects…</div> : projects.length ? (
            <div className="recent-project-grid">
              {projects.map((project) => (
                <article key={project.id} className="recent-project-card">
                  <button type="button" className="recent-project-open" onClick={() => onOpen(project.id)}>
                    <div className="recent-project-cover" style={{ background: project.background === "transparent" ? checkerBackground() : project.background }}><span>{project.width} × {project.height}</span></div>
                    <span><strong>{project.name}</strong><small>{project.duration.toFixed(1)} sec · Updated {formatDate(project.updatedAt)}</small></span>
                  </button>
                  <button type="button" className="recent-project-delete" title="Delete project" onClick={() => onDelete(project.id)}>×</button>
                </article>
              ))}
            </div>
          ) : <div className="dashboard-empty"><strong>No saved projects yet</strong><span>Create your first project above. It will autosave locally.</span></div>}
        </section>
      </div>
    </main>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function checkerBackground() {
  return "linear-gradient(45deg,#eceaf0 25%,transparent 25%),linear-gradient(-45deg,#eceaf0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eceaf0 75%),linear-gradient(-45deg,transparent 75%,#eceaf0 75%),#fff";
}

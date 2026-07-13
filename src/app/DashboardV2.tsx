import React, { useMemo, useState } from "react";
import type { CreateProjectOptions, ProjectFormat } from "../core/project";
import type { ProjectSummary } from "../core/persistence";
import { MOTION_TEMPLATES, type TemplateCategory } from "../core/templateCatalog";
import { Icon } from "../ui/Icon";

interface DashboardProps {
  projects: ProjectSummary[];
  loading: boolean;
  onOpen: (projectId: string) => void;
  onDelete: (projectId: string) => void;
  onCreate: (options: CreateProjectOptions, templateId?: string) => void;
}

type DashboardTab = "projects" | "templates";

const FORMATS: Array<{ id: ProjectFormat; label: string; size: string; ratio: string }> = [
  { id: "square", label: "Square", size: "1080 × 1080", ratio: "1 / 1" },
  { id: "vertical", label: "Vertical", size: "1080 × 1920", ratio: "9 / 16" },
  { id: "landscape", label: "Landscape", size: "1920 × 1080", ratio: "16 / 9" },
  { id: "portrait", label: "Portrait", size: "1080 × 1350", ratio: "4 / 5" },
  { id: "custom", label: "Custom", size: "Your dimensions", ratio: "1 / 1" },
];

const CATEGORIES: Array<"All" | TemplateCategory> = ["All", "Social", "Marketing", "Brand", "UI", "Typography"];

export function DashboardV2({ projects, loading, onOpen, onDelete, onCreate }: DashboardProps) {
  const [tab, setTab] = useState<DashboardTab>("projects");
  const [name, setName] = useState("Untitled motion");
  const [format, setFormat] = useState<ProjectFormat>("square");
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [background, setBackground] = useState("#ffffff");
  const [transparent, setTransparent] = useState(false);
  const [category, setCategory] = useState<"All" | TemplateCategory>("All");
  const [query, setQuery] = useState("");
  const selectedFormat = FORMATS.find((item) => item.id === format)!;
  const visibleTemplates = useMemo(() => MOTION_TEMPLATES.filter((template) =>
    (category === "All" || template.category === category) &&
    `${template.name} ${template.description} ${template.category}`.toLowerCase().includes(query.toLowerCase()),
  ), [category, query]);

  function createBlankProject() {
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

  function createFromTemplate(templateId: string) {
    const template = MOTION_TEMPLATES.find((candidate) => candidate.id === templateId);
    if (!template) return;
    onCreate({ name: template.name, format: template.format, duration: template.duration, fps: 30, background: template.palette[0] }, template.id);
  }

  return (
    <main className="dashboard-shell dashboard-v2">
      <header className="dashboard-topbar">
        <div className="brand dashboard-brand"><span className="brand-mark">K</span><span>kurogi<span className="muted">motion</span></span></div>
        <nav className="dashboard-tabs" aria-label="Dashboard sections">
          <button type="button" className={tab === "projects" ? "active" : ""} onClick={() => setTab("projects")}>Projects</button>
          <button type="button" className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>Templates <span>{MOTION_TEMPLATES.length}</span></button>
        </nav>
        <span className="dashboard-product-label">DESIGN IT. MOVE IT. EXPORT IT.</span>
      </header>

      <div className="dashboard-content">
        {tab === "projects" ? (
          <>
            <section className="dashboard-hero compact-dashboard-hero">
              <div><span className="eyebrow">MOTION WITHOUT COMPLEXITY</span><h1>Make every design move.</h1><p>Start clean, choose a template, or reopen your latest motion project.</p></div>
              <button type="button" className="hero-template-button" onClick={() => setTab("templates")}><Icon name="sparkles" />Browse templates</button>
            </section>

            <section className="new-project-card">
              <div className="new-project-header"><div><span className="eyebrow">NEW PROJECT</span><h2>Start from a clean scene</h2></div><span className="format-summary">{selectedFormat.size}</span></div>
              <div className="new-project-grid">
                <div className="new-project-main">
                  <label className="dashboard-field">Project name<input value={name} onChange={(event) => setName(event.currentTarget.value)} /></label>
                  <div className="dashboard-field"><span>Format</span><div className="format-grid">
                    {FORMATS.map((item) => <button type="button" key={item.id} className={format === item.id ? "active" : ""} onClick={() => setFormat(item.id)}><i style={{ aspectRatio: item.ratio }} /><span><strong>{item.label}</strong><small>{item.size}</small></span></button>)}
                  </div></div>
                  {format === "custom" ? <div className="dashboard-two"><label className="dashboard-field">Width<input type="number" min={64} max={7680} value={width} onChange={(event) => setWidth(Number(event.currentTarget.value))} /></label><label className="dashboard-field">Height<input type="number" min={64} max={7680} value={height} onChange={(event) => setHeight(Number(event.currentTarget.value))} /></label></div> : null}
                </div>
                <div className="new-project-settings">
                  <div className="dashboard-two"><label className="dashboard-field">Duration<input type="number" min={.1} max={3600} step={.1} value={duration} onChange={(event) => setDuration(Number(event.currentTarget.value))} /><span className="field-suffix">seconds</span></label><label className="dashboard-field">Frame rate<select value={fps} onChange={(event) => setFps(Number(event.currentTarget.value) as 24 | 30 | 60)}><option value={24}>24 FPS</option><option value={30}>30 FPS</option><option value={60}>60 FPS</option></select></label></div>
                  <label className="dashboard-field">Background<div className="background-control"><input type="color" value={background} disabled={transparent} onChange={(event) => setBackground(event.currentTarget.value)} /><input value={background} disabled={transparent} onChange={(event) => setBackground(event.currentTarget.value)} /></div></label>
                  <label className="dashboard-toggle"><span><strong>Transparent scene</strong><small>Best for WebM and PNG sequence</small></span><input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.currentTarget.checked)} /></label>
                  <button type="button" className="create-project-button" onClick={createBlankProject}>Create project <Icon name="arrow" size={17} /></button>
                </div>
              </div>
            </section>

            <section className="dashboard-section recent-section">
              <div className="dashboard-section-heading"><div><span className="eyebrow">YOUR WORK</span><h2>Recent projects</h2></div><span>{projects.length} project{projects.length === 1 ? "" : "s"}</span></div>
              {loading ? <div className="dashboard-empty">Loading projects…</div> : projects.length ? <div className="recent-project-grid">{projects.map((project) => <article key={project.id} className="recent-project-card"><button type="button" className="recent-project-open" onClick={() => onOpen(project.id)}><div className="recent-project-cover" style={{ background: project.background === "transparent" ? checkerBackground() : project.background }}><span>{project.width} × {project.height}</span></div><span><strong>{project.name}</strong><small>{project.duration.toFixed(1)} sec · Updated {formatDate(project.updatedAt)}</small></span></button><button type="button" className="recent-project-delete svg-button" title="Delete project" onClick={() => onDelete(project.id)}><Icon name="trash" size={14} /></button></article>)}</div> : <div className="dashboard-empty"><strong>No saved projects yet</strong><span>Create a project or start from a motion template.</span></div>}
            </section>
          </>
        ) : (
          <section className="template-library-page">
            <div className="template-library-hero"><div><span className="eyebrow">TEMPLATE LIBRARY</span><h1>Start with motion that already feels polished.</h1><p>Every template contains editable layers, timing blocks, and action-based animation.</p></div><button type="button" className="secondary-dashboard-button" onClick={() => setTab("projects")}>Create blank project</button></div>
            <div className="template-library-controls"><div className="template-category-tabs">{CATEGORIES.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><label className="template-search"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search chatbox, comment, logo…" /></label></div>
            <div className="template-library-grid">{visibleTemplates.map((template) => <button type="button" className="library-template-card" key={template.id} onClick={() => createFromTemplate(template.id)}><TemplatePreview template={template} /><span className="library-template-copy"><span><small>{template.category}</small><strong>{template.name}</strong><p>{template.description}</p></span><span className="template-use-action">Use template <Icon name="arrow" size={15} /></span></span></button>)}</div>
            {!visibleTemplates.length ? <div className="dashboard-empty">No templates match this search.</div> : null}
          </section>
        )}
      </div>
    </main>
  );
}

function TemplatePreview({ template }: { template: (typeof MOTION_TEMPLATES)[number] }) {
  return <div className={`catalog-preview preview-kind-${template.preview}`} style={{ background: template.palette[0], color: template.palette[2] }}>
    <span className="catalog-orb" style={{ background: template.palette[1] }} />
    <div className="catalog-preview-content">
      {template.preview === "chat" ? <><i className="chat-bubble one">Hey! The draft is ready.</i><i className="chat-bubble two" style={{ background: template.palette[1] }}>Let’s make it move.</i></> : null}
      {template.preview === "comment" ? <div className="comment-preview"><b>@creativefriend</b><span>This looks premium ✨</span><small>♥ 1,284</small></div> : null}
      {template.preview === "notification" ? <div className="notification-preview"><i style={{ background: template.palette[1] }} /><span><b>Kurogi Motion</b><small>Your export is ready.</small></span></div> : null}
      {template.preview === "product" ? <><b className="big-preview-copy">NEW<br />DROP.</b><i className="product-preview-card" style={{ background: template.palette[1] }} /></> : null}
      {template.preview === "quote" ? <b className="big-preview-copy">MAKE<br />IDEAS<br />MOVE.</b> : null}
      {template.preview === "logo" ? <><i className="logo-preview-mark" style={{ background: template.palette[1] }}>K</i><b>KUROGI MOTION</b></> : null}
      {template.preview === "announcement" ? <><b className="big-preview-copy">HELLO<br />WORLD.</b><i className="announcement-pill" style={{ background: template.palette[1] }} /></> : null}
      {template.preview === "lower-third" ? <div className="lower-third-preview" style={{ background: template.palette[1] }}><b>GILANG CREATIVE</b><small>MOTION DESIGNER</small></div> : null}
      {template.preview === "phone" ? <><b>YOUR WORKFLOW<br />JUST GOT FASTER.</b><i className="phone-preview" style={{ background: template.palette[2] }} /></> : null}
      {template.preview === "countdown" ? <><small>LAUNCHING IN</small><b className="countdown-preview">03</b></> : null}
      {template.preview === "testimonial" ? <div className="testimonial-preview"><i style={{ background: template.palette[1] }} /><b>“Three polished ads before lunch.”</b></div> : null}
      {template.preview === "stat" ? <><small>CAMPAIGN LIFT</small><b className="stat-preview">+42%</b></> : null}
    </div>
    <span className="template-duration">{template.duration}s</span>
  </div>;
}

function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "recently" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date); }
function checkerBackground() { return "linear-gradient(45deg,#eceaf0 25%,transparent 25%),linear-gradient(-45deg,#eceaf0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eceaf0 75%),linear-gradient(-45deg,transparent 75%,#eceaf0 75%),#fff"; }

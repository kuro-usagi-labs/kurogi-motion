import React, { useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { MotionComposition } from "../MotionComposition";
import type { CreateProjectOptions, ProjectFormat } from "../core/project";
import { getActiveScene } from "../core/project";
import type { DraftRecord, ProjectSummary, UserTemplateRecord } from "../core/persistence";
import { createCatalogTemplateProject, MOTION_TEMPLATES, type MotionTemplateDefinition, type TemplateCategory } from "../core/templateCatalog";
import { Icon } from "../ui/Icon";

interface DashboardProps {
  projects: ProjectSummary[];
  templates: UserTemplateRecord[];
  draft: DraftRecord | null;
  loading: boolean;
  onOpen: (projectId: string) => void;
  onOpenDraft: () => void;
  onDelete: (projectId: string) => void;
  onCreate: (options: CreateProjectOptions, templateId?: string) => void;
  onUseTemplate: (templateId: string) => void;
  onDeleteTemplate: (templateId: string) => void;
  onSaveProjectAsTemplate: (projectId: string) => void;
  onExportProjectFile: (projectId: string) => void;
  onImportProjectFile: (file: File) => void;
}

type DashboardTab = "projects" | "templates";
type CategoryFilter = "All" | TemplateCategory | "Custom";

const FORMATS: Array<{ id: ProjectFormat; label: string; size: string; ratio: string }> = [
  { id: "square", label: "Square", size: "1080 × 1080", ratio: "1 / 1" },
  { id: "vertical", label: "Vertical", size: "1080 × 1920", ratio: "9 / 16" },
  { id: "landscape", label: "Landscape", size: "1920 × 1080", ratio: "16 / 9" },
  { id: "portrait", label: "Portrait", size: "1080 × 1350", ratio: "4 / 5" },
  { id: "custom", label: "Custom", size: "Your dimensions", ratio: "1 / 1" },
];

const CATEGORIES: CategoryFilter[] = ["All", "Social", "Marketing", "Brand", "UI", "Typography", "Custom"];

export function DashboardV3({ projects, templates, draft, loading, onOpen, onOpenDraft, onDelete, onCreate, onUseTemplate, onDeleteTemplate, onSaveProjectAsTemplate, onExportProjectFile, onImportProjectFile }: DashboardProps) {
  const [tab, setTab] = useState<DashboardTab>("projects");
  const [createOpen, setCreateOpen] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [query, setQuery] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const catalogTemplates = useMemo(() => MOTION_TEMPLATES.filter((template) =>
    (category === "All" || template.category === category) &&
    `${template.name} ${template.description} ${template.category}`.toLowerCase().includes(query.toLowerCase()),
  ), [category, query]);
  const customTemplates = useMemo(() => templates.filter((template) =>
    (category === "All" || category === "Custom") &&
    `${template.name} custom template`.toLowerCase().includes(query.toLowerCase()),
  ), [category, query, templates]);

  return (
    <main className="dashboard-shell dashboard-v3">
      <input
        ref={importRef}
        hidden
        type="file"
        accept=".kuromotion,application/vnd.kurogi.motion+json,application/json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onImportProjectFile(file);
          event.currentTarget.value = "";
        }}
      />
      <header className="dashboard-topbar dashboard-v3-topbar">
        <div className="brand dashboard-brand"><span className="brand-mark">K</span><span>kurogi<span className="muted">motion</span></span></div>
        <nav className="dashboard-tabs" aria-label="Dashboard sections">
          <button type="button" className={tab === "projects" ? "active" : ""} onClick={() => setTab("projects")}>Projects</button>
          <button type="button" className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>Templates</button>
        </nav>
        <div className="dashboard-top-actions">
          <button type="button" className="dashboard-quiet-action" onClick={() => importRef.current?.click()}><Icon name="upload" size={16} />Import</button>
          <button type="button" className="dashboard-primary-action" onClick={() => setCreateOpen(true)}><Icon name="plus" size={16} />Create project</button>
        </div>
      </header>

      <div className="dashboard-content dashboard-v3-content">
        {tab === "projects" ? (
          <ProjectsView
            projects={projects}
            draft={draft}
            loading={loading}
            onOpen={onOpen}
            onOpenDraft={onOpenDraft}
            onDelete={onDelete}
            onCreate={() => setCreateOpen(true)}
            onBrowseTemplates={() => setTab("templates")}
            onSaveAsTemplate={onSaveProjectAsTemplate}
            onExportFile={onExportProjectFile}
          />
        ) : (
          <section className="template-library-page template-library-v3">
            <div className="template-library-hero">
              <div><span className="eyebrow">TEMPLATE LIBRARY</span><h1>Start polished. Keep everything editable.</h1><p>These previews use the same Remotion composition that opens in the editor.</p></div>
              <button type="button" className="secondary-dashboard-button" onClick={() => setCreateOpen(true)}><Icon name="plus" size={15} />Blank project</button>
            </div>
            <div className="template-library-controls sticky-template-controls">
              <div className="template-category-tabs">{CATEGORIES.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
              <label className="template-search"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search templates" /></label>
            </div>
            <div className="template-library-grid live-template-grid">
              {catalogTemplates.map((template) => <CatalogTemplateCard key={template.id} template={template} onUse={() => onCreate({ name: template.name, format: template.format, duration: template.duration, fps: 30, background: template.palette[0] }, template.id)} />)}
              {customTemplates.map((template) => <UserTemplateCard key={template.id} template={template} onUse={() => onUseTemplate(template.id)} onDelete={() => onDeleteTemplate(template.id)} />)}
            </div>
            {!catalogTemplates.length && !customTemplates.length ? <div className="dashboard-empty">No templates match this search.</div> : null}
          </section>
        )}
      </div>

      {createOpen ? <CreateProjectDialog onClose={() => setCreateOpen(false)} onCreate={(options) => { setCreateOpen(false); onCreate(options); }} /> : null}
    </main>
  );
}

function ProjectsView({ projects, draft, loading, onOpen, onOpenDraft, onDelete, onCreate, onBrowseTemplates, onSaveAsTemplate, onExportFile }: {
  projects: ProjectSummary[];
  draft: DraftRecord | null;
  loading: boolean;
  onOpen: (id: string) => void;
  onOpenDraft: () => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onBrowseTemplates: () => void;
  onSaveAsTemplate: (id: string) => void;
  onExportFile: (id: string) => void;
}) {
  return <>
    <section className="dashboard-hero compact-dashboard-hero dashboard-v3-hero">
      <div><span className="eyebrow">MOTION WITHOUT COMPLEXITY</span><h1>Make every design move.</h1><p>Create a clean scene, reopen recent work, or start from a production-ready template.</p></div>
      <div className="dashboard-hero-actions"><button type="button" className="dashboard-primary-action large" onClick={onCreate}><Icon name="plus" size={17} />Create project</button><button type="button" className="dashboard-quiet-action large" onClick={onBrowseTemplates}><Icon name="sparkles" size={17} />Browse templates</button></div>
    </section>

    {draft ? <button type="button" className="recovery-project-card" onClick={onOpenDraft}><span className="recovery-pulse" /><span><small>UNSAVED RECOVERY</small><strong>{draft.name}</strong><em>Recovered {relativeTime(draft.updatedAt)}</em></span><Icon name="arrow" size={17} /></button> : null}

    <section className="dashboard-section recent-section">
      <div className="dashboard-section-heading"><div><span className="eyebrow">YOUR WORK</span><h2>Recent projects</h2></div><span>Saved locally</span></div>
      {loading ? <div className="dashboard-empty">Loading projects…</div> : projects.length ? <div className="recent-project-grid project-grid-v3">{projects.map((project, index) => <ProjectCard key={project.id} project={project} latest={index === 0} onOpen={() => onOpen(project.id)} onDelete={() => onDelete(project.id)} onSaveAsTemplate={() => onSaveAsTemplate(project.id)} onExportFile={() => onExportFile(project.id)} />)}</div> : <div className="dashboard-empty"><strong>No saved projects yet</strong><span>Create a blank project or begin from a template.</span></div>}
    </section>
  </>;
}

function ProjectCard({ project, latest, onOpen, onDelete, onSaveAsTemplate, onExportFile }: { project: ProjectSummary; latest: boolean; onOpen: () => void; onDelete: () => void; onSaveAsTemplate: () => void; onExportFile: () => void }) {
  return <article className={`recent-project-card project-card-v3 ${latest ? "latest" : ""}`}>
    <button type="button" className="recent-project-open" onClick={onOpen}>
      <div className="recent-project-cover" style={{ background: project.background === "transparent" ? checkerBackground() : project.background }}><span>{project.width} × {project.height}</span>{latest ? <b>Latest</b> : null}</div>
      <span><strong>{project.name}</strong><small>Saved {relativeTime(project.updatedAt)} · {project.duration.toFixed(1)} sec</small></span>
    </button>
    <div className="project-card-actions">
      <button type="button" title="Save as template" onClick={onSaveAsTemplate}><Icon name="templates" size={14} /></button>
      <button type="button" title="Export .kuromotion" onClick={onExportFile}><Icon name="share" size={14} /></button>
      <button type="button" className="danger-text" title="Delete project" onClick={onDelete}><Icon name="trash" size={14} /></button>
    </div>
  </article>;
}

function CatalogTemplateCard({ template, onUse }: { template: MotionTemplateDefinition; onUse: () => void }) {
  const project = useMemo(() => createCatalogTemplateProject({ name: template.name, format: template.format, duration: template.duration, fps: 30, background: template.palette[0] }, template.id), [template]);
  return <TemplateCardShell name={template.name} category={template.category} description={template.description} duration={template.duration} project={project} onUse={onUse} />;
}

function UserTemplateCard({ template, onUse, onDelete }: { template: UserTemplateRecord; onUse: () => void; onDelete: () => void }) {
  const scene = getActiveScene(template.project);
  return <TemplateCardShell name={template.name} category="Custom" description="Your reusable Kurogi Motion project template." duration={scene.duration} project={template.project} onUse={onUse} onDelete={onDelete} />;
}

function TemplateCardShell({ name, category, description, duration, project, onUse, onDelete }: { name: string; category: string; description: string; duration: number; project: UserTemplateRecord["project"]; onUse: () => void; onDelete?: () => void }) {
  const scene = getActiveScene(project);
  return <article className="library-template-card live-template-card">
    <button type="button" className="live-template-preview-button" onClick={onUse}>
      <div className="live-template-player">
        <Player
          component={MotionComposition}
          inputProps={{ project, editable: false, showSelection: false, showSafeArea: false }}
          durationInFrames={Math.max(1, Math.round(scene.duration * scene.fps))}
          compositionWidth={scene.width}
          compositionHeight={scene.height}
          fps={scene.fps}
          autoPlay
          loop
          controls={false}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      <span className="template-duration">{duration}s</span>
    </button>
    <div className="library-template-copy"><span><small>{category}</small><strong>{name}</strong><p>{description}</p></span><button type="button" className="template-use-action" onClick={onUse}>Use template <Icon name="arrow" size={15} /></button></div>
    {onDelete ? <button type="button" className="custom-template-delete" title="Delete custom template" onClick={onDelete}><Icon name="trash" size={14} /></button> : null}
  </article>;
}

function CreateProjectDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (options: CreateProjectOptions) => void }) {
  const [name, setName] = useState("Untitled motion");
  const [format, setFormat] = useState<ProjectFormat>("square");
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [background, setBackground] = useState("#ffffff");
  const [transparent, setTransparent] = useState(false);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onClose]);

  const submit = () => onCreate({ name: name.trim() || "Untitled motion", format, width: format === "custom" ? width : undefined, height: format === "custom" ? height : undefined, duration, fps, background, transparent });

  return <div className="create-project-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="create-project-dialog" role="dialog" aria-modal="true" aria-label="Create project">
      <header><div><span className="eyebrow">NEW PROJECT</span><h2>Create a motion canvas</h2></div><button type="button" className="svg-button" onClick={onClose}><Icon name="close" /></button></header>
      <div className="create-dialog-body">
        <label className="dashboard-field">Project name<input autoFocus value={name} onChange={(event) => setName(event.currentTarget.value)} /></label>
        <div className="dashboard-field"><span>Canvas size</span><div className="format-grid modal-format-grid">{FORMATS.map((item) => <button type="button" key={item.id} className={format === item.id ? "active" : ""} onClick={() => setFormat(item.id)}><i style={{ aspectRatio: item.ratio }} /><span><strong>{item.label}</strong><small>{item.size}</small></span></button>)}</div></div>
        {format === "custom" ? <div className="dashboard-two"><label className="dashboard-field">Width<input type="number" min={64} max={7680} value={width} onChange={(event) => setWidth(Number(event.currentTarget.value))} /></label><label className="dashboard-field">Height<input type="number" min={64} max={7680} value={height} onChange={(event) => setHeight(Number(event.currentTarget.value))} /></label></div> : null}
        <div className="dashboard-two"><label className="dashboard-field">Duration<input type="number" min={.1} max={3600} step={.1} value={duration} onChange={(event) => setDuration(Number(event.currentTarget.value))} /></label><label className="dashboard-field">Frame rate<select value={fps} onChange={(event) => setFps(Number(event.currentTarget.value) as 24 | 30 | 60)}><option value={24}>24 FPS</option><option value={30}>30 FPS</option><option value={60}>60 FPS</option></select></label></div>
        <label className="dashboard-field">Background<div className="background-control"><input type="color" value={background} disabled={transparent} onChange={(event) => setBackground(event.currentTarget.value)} /><input value={background} disabled={transparent} onChange={(event) => setBackground(event.currentTarget.value)} /></div></label>
        <label className="dashboard-toggle"><span><strong>Transparent canvas</strong><small>Required for alpha WebM, PNG sequence, and MOV ProRes 4444.</small></span><input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.currentTarget.checked)} /></label>
      </div>
      <footer><button type="button" className="dialog-secondary" onClick={onClose}>Cancel</button><button type="button" className="dashboard-primary-action" onClick={submit}>Create project <Icon name="arrow" size={15} /></button></footer>
    </section>
  </div>;
}

function relativeTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "recently";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function checkerBackground() { return "linear-gradient(45deg,#eceaf0 25%,transparent 25%),linear-gradient(-45deg,#eceaf0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eceaf0 75%),linear-gradient(-45deg,transparent 75%,#eceaf0 75%),#fff"; }

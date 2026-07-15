import { useEffect, useMemo, useRef, useState } from "react";
import type { CreateProjectOptions, ProjectFormat } from "../core/project";
import { getActiveScene } from "../core/project";
import type { DraftRecord, ProjectSummary, UserTemplateRecord } from "../core/persistence";
import { createCatalogTemplateProject, MOTION_TEMPLATES, type MotionTemplateDefinition, type TemplateCategory } from "../core/templateCatalog";
import { Icon } from "../ui/Icon";
import { ProjectMotionPreview } from "./ProjectMotionPreview";
import { TemplateCard } from "./TemplateCard";

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
type CategoryFilter = "Featured" | "All" | TemplateCategory | "Custom";

const FORMATS: Array<{ id: ProjectFormat; label: string; size: string; ratio: string }> = [
  { id: "square", label: "Square", size: "1080 × 1080", ratio: "1 / 1" },
  { id: "vertical", label: "Vertical", size: "1080 × 1920", ratio: "9 / 16" },
  { id: "landscape", label: "Landscape", size: "1920 × 1080", ratio: "16 / 9" },
  { id: "portrait", label: "Portrait", size: "1080 × 1350", ratio: "4 / 5" },
  { id: "custom", label: "Custom", size: "Your dimensions", ratio: "1 / 1" },
];

const CATEGORIES: CategoryFilter[] = ["Featured", "All", "Social", "Marketing", "Brand", "UI", "Typography", "Custom"];

export function DashboardV3({ projects, templates, draft, loading, onOpen, onOpenDraft, onDelete, onCreate, onUseTemplate, onDeleteTemplate, onSaveProjectAsTemplate, onExportProjectFile, onImportProjectFile }: DashboardProps) {
  const [tab, setTab] = useState<DashboardTab>("projects");
  const [createOpen, setCreateOpen] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>("Featured");
  const [query, setQuery] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const catalogTemplates = useMemo(() => MOTION_TEMPLATES.filter((template) =>
    (category === "All" || (category === "Featured" && template.featured) || template.category === category) &&
    `${template.name} ${template.description} ${template.category}`.toLowerCase().includes(query.toLowerCase()),
  ).sort((left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured))), [category, query]);
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
              <div><span className="eyebrow">CURATED MOTION SYSTEMS</span><h1>Start from something worth finishing.</h1><p>Campaign-ready compositions with live animation, editable layers, and production-safe assets.</p></div>
              <div className="template-library-stats"><span><strong>{MOTION_TEMPLATES.length}</strong><small>templates</small></span><span><strong>5</strong><small>categories</small></span><span><strong>Live</strong><small>previews</small></span></div>
              <button type="button" className="secondary-dashboard-button" onClick={() => setCreateOpen(true)}><Icon name="plus" size={15} />Blank project</button>
            </div>
            <div className="template-library-controls sticky-template-controls">
              <div className="template-category-tabs">{CATEGORIES.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}<small>{templateCategoryCount(item, templates.length)}</small></button>)}</div>
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
    <button type="button" className="recent-project-open" aria-label={`Open project ${project.name}`} onClick={onOpen}>
      <div className="recent-project-cover"><ProjectMotionPreview project={project} /></div>
      <span className="project-card-copy">
        <span className="project-card-title-line">
          <strong>{project.name}</strong>
          <span className="project-card-title-meta">{latest ? <small className="project-card-latest">Latest</small> : null}<Icon name="arrow" size={14} /></span>
        </span>
        <small className="project-card-updated">Saved {relativeTime(project.updatedAt)}</small>
        <span className="project-card-facts"><small>{Math.round(project.width)} × {Math.round(project.height)}</small><i aria-hidden="true" /><small>{formatProjectDuration(project.duration)}</small></span>
      </span>
    </button>
    <div className="project-card-actions" role="group" aria-label={`Actions for ${project.name}`}>
      <button type="button" aria-label="Save as template" title="Save as template" onClick={onSaveAsTemplate}><Icon name="templates" size={14} /></button>
      <button type="button" aria-label="Export project file" title="Export .kuromotion" onClick={onExportFile}><Icon name="share" size={14} /></button>
      <button type="button" className="danger-text" aria-label="Delete project" title="Delete project" onClick={onDelete}><Icon name="trash" size={14} /></button>
    </div>
  </article>;
}

function CatalogTemplateCard({ template, onUse }: { template: MotionTemplateDefinition; onUse: () => void }) {
  const project = useMemo(() => createCatalogTemplateProject({ name: template.name, format: template.format, duration: template.duration, fps: 30, background: template.palette[0] }, template.id), [template]);
  return <TemplateCard name={template.name} category={template.category} description={template.description} duration={template.duration} project={project} onUse={onUse} featured={template.featured} palette={template.palette} />;
}

function UserTemplateCard({ template, onUse, onDelete }: { template: UserTemplateRecord; onUse: () => void; onDelete: () => void }) {
  const scene = getActiveScene(template.project);
  return <TemplateCard name={template.name} category="Custom" description="Your reusable Kurogi Motion project template." duration={scene.duration} project={template.project} onUse={onUse} onDelete={onDelete} />;
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
        <label className="dashboard-toggle"><span><strong>Transparent canvas</strong><small>Required for alpha WebM, PNG sequence, and MOV ProRes 4444.</small></span><DashboardSwitch checked={transparent} onChange={setTransparent} /></label>
      </div>
      <footer><button type="button" className="dialog-secondary" onClick={onClose}>Cancel</button><button type="button" className="dashboard-primary-action" onClick={submit}>Create project <Icon name="arrow" size={15} /></button></footer>
    </section>
  </div>;
}

function DashboardSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) { return <span className={`switch-control ${checked ? "is-on" : ""}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} /><i aria-hidden="true" /></span>; }

function formatProjectDuration(value: number) {
  const duration = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (duration < 60) return `${duration.toFixed(Number.isInteger(duration) ? 0 : 1)} sec`;
  const totalSeconds = Math.round(duration);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}:${String(seconds).padStart(2, "0")}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

function templateCategoryCount(category: CategoryFilter, customCount: number) {
  if (category === "Custom") return customCount;
  if (category === "All") return MOTION_TEMPLATES.length + customCount;
  if (category === "Featured") return MOTION_TEMPLATES.filter((template) => template.featured).length;
  return MOTION_TEMPLATES.filter((template) => template.category === category).length;
}

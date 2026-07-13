import React, { useEffect, useState } from "react";
import { DashboardV3 } from "./app/DashboardV3";
import { Editor } from "./app/Editor";
import { StartupSplash } from "./app/StartupSplash";
import type { CreateProjectOptions } from "./core/project";
import {
  clearDraft,
  deleteProject,
  deleteUserTemplate,
  importLegacyLocalStorageProject,
  listProjectSummaries,
  listUserTemplates,
  loadLatestDraft,
  loadProject,
  migrateProjectAssets,
  prepareProjectForExport,
  saveProject,
  saveUserTemplate,
  type DraftRecord,
  type ProjectSummary,
  type UserTemplateRecord,
} from "./core/persistence";
import { exportKuroMotionFile, instantiateProject, readKuroMotionFile } from "./core/projectFiles";
import { createCatalogTemplateProject } from "./core/templateCatalog";
import type { KurogiProject } from "./types";

export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [templates, setTemplates] = useState<UserTemplateRecord[]>([]);
  const [draft, setDraft] = useState<DraftRecord | null>(null);
  const [currentProject, setCurrentProject] = useState<KurogiProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootReady, setBootReady] = useState(false);

  useEffect(() => {
    void initialize();
  }, []);

  async function initialize() {
    const minimumSplash = new Promise((resolve) => window.setTimeout(resolve, 950));
    setLoading(true);
    try {
      await importLegacyLocalStorageProject();
      await Promise.all([refreshLibrary(), minimumSplash]);
    } finally {
      setLoading(false);
      setBootReady(true);
    }
  }

  async function refreshLibrary() {
    const [nextProjects, nextTemplates, nextDraft] = await Promise.all([
      listProjectSummaries(),
      listUserTemplates(),
      loadLatestDraft(),
    ]);
    setProjects(nextProjects);
    setTemplates(nextTemplates);
    setDraft(nextDraft);
  }

  async function openProject(projectId: string) {
    const project = await loadProject(projectId);
    if (!project) {
      window.alert("This project could not be opened.");
      await refreshLibrary();
      return;
    }
    setCurrentProject(project);
  }

  async function openDraft() {
    const latest = await loadLatestDraft();
    if (!latest) {
      setDraft(null);
      return;
    }
    setCurrentProject(latest.project);
  }

  async function createNewProject(options: CreateProjectOptions, templateId?: string) {
    const project = createCatalogTemplateProject(options, templateId);
    await saveProject(project);
    setDraft(null);
    setCurrentProject(project);
  }

  async function useCustomTemplate(templateId: string) {
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) return;
    const project = instantiateProject(template.project, template.name);
    await saveProject(project);
    setCurrentProject(project);
  }

  async function removeProject(projectId: string) {
    const project = projects.find((candidate) => candidate.id === projectId);
    const confirmed = window.confirm(`Delete “${project?.name ?? "this project"}”? This cannot be undone.`);
    if (!confirmed) return;
    await deleteProject(projectId);
    await refreshLibrary();
  }

  async function saveProjectAsTemplate(projectId: string) {
    const project = await loadProject(projectId);
    if (!project) return;
    const proposed = `${project.name} template`;
    const name = window.prompt("Template name", proposed)?.trim();
    if (!name) return;
    await saveUserTemplate(project, name);
    await refreshLibrary();
  }

  async function exportProjectFile(projectId: string) {
    const project = await loadProject(projectId);
    if (!project) return;
    await exportKuroMotionFile(await prepareProjectForExport(project), "project");
  }

  async function importProjectFile(file: File) {
    try {
      const imported = await readKuroMotionFile(file);
      if (imported.kind === "template") {
        const templateName = imported.project.name || file.name.replace(/\.kuromotion$/i, "");
        await saveUserTemplate(await migrateProjectAssets(imported.project), templateName);
        await refreshLibrary();
        return;
      }
      const project = await migrateProjectAssets(instantiateProject(imported.project, imported.project.name));
      await saveProject(project);
      setCurrentProject(project);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The .kuromotion file could not be imported.");
    }
  }

  async function removeTemplate(templateId: string) {
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!window.confirm(`Delete template “${template?.name ?? "this template"}”?`)) return;
    await deleteUserTemplate(templateId);
    await refreshLibrary();
  }

  if (!bootReady) return <StartupSplash />;

  if (currentProject) {
    return (
      <Editor
        key={currentProject.id}
        initialProject={currentProject}
        onExit={(project) => {
          setCurrentProject(null);
          void saveProject(project)
            .then(() => clearDraft(project.id))
            .finally(refreshLibrary);
        }}
      />
    );
  }

  return (
    <DashboardV3
      projects={projects}
      templates={templates}
      draft={draft}
      loading={loading}
      onOpen={(projectId) => void openProject(projectId)}
      onOpenDraft={() => void openDraft()}
      onDelete={(projectId) => void removeProject(projectId)}
      onCreate={(options, templateId) => void createNewProject(options, templateId)}
      onUseTemplate={(templateId) => void useCustomTemplate(templateId)}
      onDeleteTemplate={(templateId) => void removeTemplate(templateId)}
      onSaveProjectAsTemplate={(projectId) => void saveProjectAsTemplate(projectId)}
      onExportProjectFile={(projectId) => void exportProjectFile(projectId)}
      onImportProjectFile={(file) => void importProjectFile(file)}
    />
  );
}

import React, { useEffect, useState } from "react";
import { DashboardV2 } from "./app/DashboardV2";
import { Editor } from "./app/Editor";
import type { CreateProjectOptions } from "./core/project";
import {
  deleteProject,
  importLegacyLocalStorageProject,
  listProjectSummaries,
  loadProject,
  saveProject,
  type ProjectSummary,
} from "./core/persistence";
import { createCatalogTemplateProject } from "./core/templateCatalog";
import type { KurogiProject } from "./types";

export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [currentProject, setCurrentProject] = useState<KurogiProject | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void initialize();
  }, []);

  async function initialize() {
    setLoading(true);
    try {
      await importLegacyLocalStorageProject();
      await refreshProjects();
    } finally {
      setLoading(false);
    }
  }

  async function refreshProjects() {
    setProjects(await listProjectSummaries());
  }

  async function openProject(projectId: string) {
    const project = await loadProject(projectId);
    if (!project) {
      window.alert("This project could not be opened.");
      await refreshProjects();
      return;
    }
    setCurrentProject(project);
  }

  async function createNewProject(options: CreateProjectOptions, templateId?: string) {
    const project = createCatalogTemplateProject(options, templateId);
    await saveProject(project);
    setCurrentProject(project);
  }

  async function removeProject(projectId: string) {
    const project = projects.find((candidate) => candidate.id === projectId);
    const confirmed = window.confirm(`Delete “${project?.name ?? "this project"}”? This cannot be undone.`);
    if (!confirmed) return;
    await deleteProject(projectId);
    await refreshProjects();
  }

  if (currentProject) {
    return (
      <Editor
        key={currentProject.id}
        initialProject={currentProject}
        onExit={(project) => {
          setCurrentProject(null);
          void saveProject(project).finally(refreshProjects);
        }}
      />
    );
  }

  return (
    <DashboardV2
      projects={projects}
      loading={loading}
      onOpen={(projectId) => void openProject(projectId)}
      onDelete={(projectId) => void removeProject(projectId)}
      onCreate={(options, templateId) => void createNewProject(options, templateId)}
    />
  );
}

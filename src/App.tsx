import React, { useEffect, useRef, useState } from "react";
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
import { persistProjectBeforeExit } from "./core/saveBeforeExit";
import { ensureSceneWorkspace } from "./core/sceneWorkspace";
import { createCatalogTemplateProject } from "./core/templateCatalog";
import type { KurogiProject } from "./types";
import type { McpBridgeRequest } from "./core/mcpCommands";
import { useAppFeedback } from "./ui/AppFeedback";

export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [templates, setTemplates] = useState<UserTemplateRecord[]>([]);
  const [draft, setDraft] = useState<DraftRecord | null>(null);
  const [currentProject, setCurrentProject] = useState<KurogiProject | null>(null);
  const activeProjectRef = useRef<KurogiProject | null>(null);
  const mcpEditorReadyWaitersRef = useRef(new Map<string, { resolve: () => void; reject: (error: Error) => void; timeout: number }>());
  const [loading, setLoading] = useState(true);
  const [bootReady, setBootReady] = useState(false);
  const feedback = useAppFeedback();

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    const unsubscribe = window.kurogi?.onMcpRequest?.((request) => { void handleDashboardMcpRequest(request); });
    return () => unsubscribe?.();
  }, []);

  async function handleDashboardMcpRequest(request: McpBridgeRequest) {
    const respond = window.kurogi?.respondMcpRequest;
    if (!respond) return;
    try {
      if (request.method === "render.get_job") {
        if (!window.kurogi) throw new Error("Desktop rendering is unavailable.");
        const jobId = String(request.params?.jobId ?? "").trim();
        if (!jobId) throw new Error("jobId is required.");
        respond({ id: request.id, ok: true, result: await window.kurogi.getRenderJob(jobId) });
        return;
      }
      if (request.method === "render.cancel_job") {
        if (!window.kurogi) throw new Error("Desktop rendering is unavailable.");
        const jobId = String(request.params?.jobId ?? "").trim();
        if (!jobId) throw new Error("jobId is required.");
        respond({ id: request.id, ok: true, result: await window.kurogi.cancelRenderJob(jobId) });
        return;
      }
      if (request.method === "library.list_projects") {
        respond({ id: request.id, ok: true, result: { projects: await listProjectSummaries() } });
        return;
      }
      if (request.method === "library.create_project") {
        await persistActiveProjectForMcp();
        const params = request.params ?? {};
        const formats: CreateProjectOptions["format"][] = ["square", "vertical", "landscape", "portrait", "custom"];
        const requestedFormat = String(params.format ?? "square") as CreateProjectOptions["format"];
        const options: CreateProjectOptions = {
          name: String(params.name ?? "AI video"),
          format: formats.includes(requestedFormat) ? requestedFormat : "square",
          width: finiteNumber(params.width),
          height: finiteNumber(params.height),
          duration: finiteNumber(params.duration) ?? 5,
          fps: finiteNumber(params.fps) ?? 30,
          background: typeof params.background === "string" ? params.background : "#ffffff",
          transparent: Boolean(params.transparent),
        };
        const templateId = typeof params.templateId === "string" ? params.templateId : undefined;
        const project = ensureSceneWorkspace(createCatalogTemplateProject(options, templateId));
        await saveProject(project);
        setDraft(null);
        activeProjectRef.current = project;
        const editorReady = waitForMcpEditorReady(project.id);
        setCurrentProject(project);
        await editorReady;
        respond({ id: request.id, ok: true, result: { created: true, projectId: project.id, activeSceneId: project.activeSceneId, name: project.name, templateId } });
        return;
      }
      if (request.method === "library.open_project") {
        const projectId = String(request.params?.projectId ?? "").trim();
        if (!projectId) throw new Error("projectId is required.");
        await persistActiveProjectForMcp();
        const loaded = await loadProject(projectId);
        if (!loaded) throw new Error(`Project ${projectId} does not exist.`);
        const project = ensureSceneWorkspace(loaded);
        activeProjectRef.current = project;
        const editorReady = waitForMcpEditorReady(project.id);
        setCurrentProject(project);
        await editorReady;
        respond({ id: request.id, ok: true, result: { opened: true, projectId: project.id, activeSceneId: project.activeSceneId, name: project.name } });
        return;
      }
      if (activeProjectRef.current) return;
      throw new Error("Open a Kurogi Motion project before using project MCP tools.");
    } catch (error) {
      respond({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function persistActiveProjectForMcp() {
    const active = activeProjectRef.current;
    if (!active) return;
    await saveProject(active);
    await clearDraft(active.id);
  }

  function waitForMcpEditorReady(projectId: string): Promise<void> {
    const previous = mcpEditorReadyWaitersRef.current.get(projectId);
    if (previous) {
      window.clearTimeout(previous.timeout);
      previous.reject(new Error(`A newer MCP request replaced the Editor readiness wait for project ${projectId}.`));
    }
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        mcpEditorReadyWaitersRef.current.delete(projectId);
        reject(new Error(`Kurogi Editor did not become ready for MCP project ${projectId} within 10 seconds.`));
      }, 10_000);
      mcpEditorReadyWaitersRef.current.set(projectId, { resolve, reject, timeout });
    });
  }

  function markMcpEditorReady(projectId: string) {
    const waiter = mcpEditorReadyWaitersRef.current.get(projectId);
    if (!waiter) return;
    window.clearTimeout(waiter.timeout);
    mcpEditorReadyWaitersRef.current.delete(projectId);
    waiter.resolve();
  }

  async function initialize() {
    const minimumSplash = new Promise((resolve) => window.setTimeout(resolve, 950));
    setLoading(true);
    try {
      await importLegacyLocalStorageProject();
      await Promise.all([refreshLibrary(), minimumSplash]);
    } catch (error) {
      console.error("Unable to initialize the project library", error);
      await minimumSplash;
      await feedback.showMessage({
        tone: "error",
        title: "Project library unavailable",
        message: "Kurogi Motion could not open the local project library.",
        detail: "Reload the app and close any other Kurogi Motion windows if the problem continues.",
        acknowledgeLabel: "Understood",
      });
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
    try {
      const project = await loadProject(projectId);
      if (!project) {
        await feedback.showMessage({
          tone: "error",
          title: "Project could not be opened",
          message: "Its saved document is missing or invalid.",
          detail: "The project library will now refresh so you can choose another project.",
        });
        await refreshLibrary();
        return;
      }
      const workspaceProject = ensureSceneWorkspace(project);
      if (workspaceProject !== project) await saveProject(workspaceProject);
      activeProjectRef.current = workspaceProject;
      setCurrentProject(workspaceProject);
    } catch (error) {
      console.error(`Unable to open project ${projectId}`, error);
      await feedback.showMessage({
        tone: "error",
        title: "Project could not be opened",
        message: error instanceof Error ? error.message : "This project could not be opened.",
        detail: "Refresh the library and try opening it again.",
      });
      await refreshLibrary();
    }
  }

  async function openDraft() {
    try {
      const latest = await loadLatestDraft();
      if (!latest) {
        setDraft(null);
        return;
      }
      const workspaceProject = ensureSceneWorkspace(latest.project);
      if (workspaceProject !== latest.project) await saveProject(workspaceProject);
      activeProjectRef.current = workspaceProject;
      setCurrentProject(workspaceProject);
    } catch (error) {
      console.error("Unable to open recovery draft", error);
      await feedback.showMessage({
        tone: "error",
        title: "Recovery draft unavailable",
        message: "The recovery draft could not be opened.",
        detail: "The project library will refresh without changing your saved projects.",
      });
      await refreshLibrary();
    }
  }

  async function createNewProject(options: CreateProjectOptions, templateId?: string) {
    const project = ensureSceneWorkspace(createCatalogTemplateProject(options, templateId));
    await saveProject(project);
    setDraft(null);
    activeProjectRef.current = project;
    setCurrentProject(project);
  }

  async function useCustomTemplate(templateId: string) {
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) return;
    const project = ensureSceneWorkspace(instantiateProject(template.project, template.name));
    await saveProject(project);
    activeProjectRef.current = project;
    setCurrentProject(project);
  }

  async function removeProject(projectId: string) {
    const project = projects.find((candidate) => candidate.id === projectId);
    const confirmed = await feedback.confirmAction({
      tone: "danger",
      title: `Delete “${project?.name ?? "this project"}”?`,
      message: "This removes the project and its locally stored media permanently.",
      detail: "This action cannot be undone.",
      confirmLabel: "Delete project",
    });
    if (!confirmed) return;
    await deleteProject(projectId);
    await refreshLibrary();
  }

  async function saveProjectAsTemplate(projectId: string) {
    const project = await loadProject(projectId);
    if (!project) return;
    const proposed = `${project.name} template`;
    const requestedName = await feedback.requestText({
      title: "Save project as template",
      message: "Choose a clear name so this reusable starting point is easy to find.",
      label: "Template name",
      initialValue: proposed,
      confirmLabel: "Save template",
      validate: (value) => value.trim() ? null : "Enter a template name.",
    });
    if (requestedName === null) return;
    await saveUserTemplate(project, requestedName.trim());
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
        await saveUserTemplate(ensureSceneWorkspace(await migrateProjectAssets(imported.project)), templateName);
        await refreshLibrary();
        return;
      }
      const project = ensureSceneWorkspace(await migrateProjectAssets(instantiateProject(imported.project, imported.project.name)));
      await saveProject(project);
      activeProjectRef.current = project;
      setCurrentProject(project);
    } catch (error) {
      await feedback.showMessage({
        tone: "error",
        title: "Project import failed",
        message: error instanceof Error ? error.message : "The .kuromotion file could not be imported.",
        detail: "Check that the file is a valid Kurogi Motion project and try again.",
      });
    }
  }

  async function removeTemplate(templateId: string) {
    const template = templates.find((candidate) => candidate.id === templateId);
    const confirmed = await feedback.confirmAction({
      tone: "danger",
      title: `Delete template “${template?.name ?? "this template"}”?`,
      message: "This removes the reusable template from your local library.",
      detail: "Projects that were created from it will not be affected.",
      confirmLabel: "Delete template",
    });
    if (!confirmed) return;
    await deleteUserTemplate(templateId);
    await refreshLibrary();
  }

  async function exitEditor(project: KurogiProject) {
    try {
      await persistProjectBeforeExit(project, saveProject, clearDraft);
      activeProjectRef.current = null;
      setCurrentProject(null);
      await refreshLibrary();
    } catch (error) {
      console.error("Unable to save the project before leaving the editor", error);
      await feedback.showMessage({
        tone: "error",
        title: "Project was not saved",
        message: "The editor will stay open to protect your work.",
        detail: "Check available storage, then try leaving the editor again.",
      });
    }
  }

  if (!bootReady) return <><StartupSplash />{feedback.host}</>;

  if (currentProject) {
    return (
      <>
      <Editor
        key={currentProject.id}
        initialProject={currentProject}
        onProjectSnapshot={(project) => { activeProjectRef.current = project; }}
        onMcpReady={() => markMcpEditorReady(currentProject.id)}
        onExit={(project) => {
          void exitEditor(project);
        }}
      />
      {feedback.host}
      </>
    );
  }

  return (
    <>
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
    {feedback.host}
    </>
  );
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

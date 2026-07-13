import { useEffect } from "react";
import { saveProject } from "./database";
import { useDocumentStore } from "../stores/documentStore";

export const useAutosave = (delayMs = 1200): void => {
  const project = useDocumentStore((state) => state.project);
  const revision = useDocumentStore((state) => state.revision);
  const saveStatus = useDocumentStore((state) => state.saveStatus);
  const setSaveStatus = useDocumentStore((state) => state.setSaveStatus);

  useEffect(() => {
    if (revision === 0 || !project.settings.autoSave || saveStatus !== "dirty") return;
    const timer = window.setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await saveProject(project);
        setSaveStatus("saved");
      } catch (error) {
        console.error("Failed to save Kurogi Motion project", error);
        setSaveStatus("error");
      }
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, project, revision, saveStatus, setSaveStatus]);
};

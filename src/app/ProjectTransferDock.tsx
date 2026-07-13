import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { commandManager } from "../core/history/CommandManager";
import { playbackController } from "../engine/playbackController";
import {
  buildProjectFileName,
  parseProjectFile,
  ProjectFileError,
  serializeProjectFile,
} from "../io/projectFile";
import { saveProject } from "../persistence/database";
import { useDocumentStore } from "../stores/documentStore";
import { useEditorStore } from "../stores/editorStore";
import "./project-transfer.css";

const MAX_PROJECT_FILE_BYTES = 10 * 1024 * 1024;

type TransferNotice = {
  kind: "success" | "error" | "info";
  message: string;
};

const downloadTextFile = (contents: string, fileName: string): void => {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export function ProjectTransferDock(): JSX.Element {
  const project = useDocumentStore((state) => state.project);
  const replaceProject = useDocumentStore((state) => state.replaceProject);
  const setSaveStatus = useDocumentStore((state) => state.setSaveStatus);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<TransferNotice | null>(null);

  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const timeout = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const exportProject = (): void => {
    try {
      const contents = serializeProjectFile(project);
      downloadTextFile(contents, buildProjectFileName(project.name));
      const assetCount = Object.keys(project.assets).length;
      setNotice({
        kind: assetCount > 0 ? "info" : "success",
        message:
          assetCount > 0
            ? `Project exported. ${assetCount} linked asset blob${assetCount === 1 ? " is" : "s are"} not embedded yet.`
            : "Project backup exported.",
      });
    } catch (error) {
      console.error("Unable to export project", error);
      setNotice({ kind: "error", message: "Project export failed validation." });
    }
  };

  const importProject = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_PROJECT_FILE_BYTES) {
      setNotice({ kind: "error", message: "Project file is larger than 10 MB." });
      return;
    }

    setBusy(true);
    setNotice({ kind: "info", message: "Validating project backup…" });
    try {
      const parsed = parseProjectFile(await file.text());
      const imported = { ...parsed, updatedAt: new Date().toISOString() };

      await saveProject(imported);
      playbackController.stop();
      commandManager.clear();
      replaceProject(imported);
      setSaveStatus("saved");

      const scene = imported.scenes[imported.activeSceneId];
      selectLayer(scene?.rootLayerIds[0] ?? null);

      const assetCount = Object.keys(imported.assets).length;
      setNotice({
        kind: assetCount > 0 ? "info" : "success",
        message:
          assetCount > 0
            ? `Imported ${imported.name}. ${assetCount} asset reference${assetCount === 1 ? " needs" : "s need"} relinking.`
            : `Imported ${imported.name}.`,
      });
    } catch (error) {
      console.error("Unable to import project", error);
      setNotice({
        kind: "error",
        message:
          error instanceof ProjectFileError
            ? error.message
            : "Unable to import this project file.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="project-transfer-dock" aria-label="Project backup tools">
      <input
        ref={fileInputRef}
        className="project-transfer-input"
        type="file"
        accept=".json,.kurogi.json,application/json"
        onChange={(event) => void importProject(event)}
      />
      <button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()}>
        <span>⇩</span>
        Import
      </button>
      <button type="button" disabled={busy} onClick={exportProject}>
        <span>⇧</span>
        Backup
      </button>
      {notice && (
        <div
          className={`project-transfer-notice ${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      )}
    </section>
  );
}

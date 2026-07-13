from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace(path: str, old: str, new: str) -> None:
    content = read(path)
    if old not in content:
        raise RuntimeError(f"Expected block not found in {path}: {old[:140]!r}")
    write(path, content.replace(old, new, 1))

# Real draft recovery must compare against the last persisted revision, not the editor's initial revision forever.
replace(
    "src/app/Editor.tsx",
    '  const playerRef = useRef<PlayerRef>(null);\n  const assetInputRef = useRef<HTMLInputElement>(null);\n',
    '  const playerRef = useRef<PlayerRef>(null);\n  const assetInputRef = useRef<HTMLInputElement>(null);\n  const persistedRevisionRef = useRef(initialProject.updatedAt);\n',
)
replace(
    "src/app/Editor.tsx",
    '''  useEffect(() => {\n    if (!project.settings.autoSave || project.updatedAt === initialProject.updatedAt) return;\n    setSaveStatus("Saving draft…");\n    const timer = window.setTimeout(async () => {\n      try {\n        await saveDraft(history.projectRef.current);\n        setSaveStatus("Draft saved");\n      } catch {\n        setSaveStatus("Save failed");\n      }\n    }, 1800);\n    return () => window.clearTimeout(timer);\n  }, [history.projectRef, initialProject.updatedAt, project, project.settings.autoSave]);\n\n  useEffect(() => {\n    const flushRecovery = () => {\n      const current = history.projectRef.current;\n      if (document.visibilityState === "hidden" && current.updatedAt !== initialProject.updatedAt) void saveDraft(current);\n    };\n    document.addEventListener("visibilitychange", flushRecovery);\n    return () => document.removeEventListener("visibilitychange", flushRecovery);\n  }, [history.projectRef, initialProject.updatedAt]);\n''',
    '''  useEffect(() => {\n    if (!project.settings.autoSave || project.updatedAt === persistedRevisionRef.current) return;\n    setSaveStatus("Saving draft…");\n    const revision = project.updatedAt;\n    const timer = window.setTimeout(async () => {\n      try {\n        await saveDraft(history.projectRef.current);\n        if (history.projectRef.current.updatedAt === revision) setSaveStatus("Draft saved");\n      } catch {\n        setSaveStatus("Save failed");\n      }\n    }, 1800);\n    return () => window.clearTimeout(timer);\n  }, [history.projectRef, project, project.settings.autoSave]);\n\n  useEffect(() => {\n    const flushRecovery = () => {\n      const current = history.projectRef.current;\n      if (current.updatedAt !== persistedRevisionRef.current) void saveDraft(current);\n    };\n    const handleVisibility = () => { if (document.visibilityState === "hidden") flushRecovery(); };\n    document.addEventListener("visibilitychange", handleVisibility);\n    window.addEventListener("pagehide", flushRecovery);\n    return () => {\n      document.removeEventListener("visibilitychange", handleVisibility);\n      window.removeEventListener("pagehide", flushRecovery);\n    };\n  }, [history.projectRef]);\n''',
)
replace(
    "src/app/Editor.tsx",
    '''      await saveProject(current);\n      await clearDraft(current.id);\n      setSaveStatus("Saved");\n      return true;\n''',
    '''      await saveProject(current);\n      await clearDraft(current.id);\n      persistedRevisionRef.current = current.updatedAt;\n      setSaveStatus("Saved");\n      return true;\n''',
)
replace(
    "src/app/Editor.tsx",
    '''  async function leaveEditor() {\n    await saveNow();\n    onExit(history.projectRef.current);\n  }\n''',
    '''  async function leaveEditor() {\n    const saved = await saveNow();\n    if (saved) onExit(history.projectRef.current);\n  }\n''',
)

# Portable .kuromotion files must embed Blob-backed assets, and imported files must be detached into Blob storage again.
replace(
    "src/App.tsx",
    '''  importLegacyLocalStorageProject,\n  listProjectSummaries,\n''',
    '''  importLegacyLocalStorageProject,\n  migrateProjectAssets,\n  prepareProjectForExport,\n  listProjectSummaries,\n''',
)
replace(
    "src/App.tsx",
    '''  async function exportProjectFile(projectId: string) {\n    const project = await loadProject(projectId);\n    if (!project) return;\n    await exportKuroMotionFile(project, "project");\n  }\n''',
    '''  async function exportProjectFile(projectId: string) {\n    const project = await loadProject(projectId);\n    if (!project) return;\n    const portable = await prepareProjectForExport(project);\n    await exportKuroMotionFile(portable, "project");\n  }\n''',
)
replace(
    "src/App.tsx",
    '''      if (imported.kind === "template") {\n        const templateName = imported.project.name || file.name.replace(/\\.kuromotion$/i, "");\n        await saveUserTemplate(imported.project, templateName);\n        await refreshLibrary();\n        return;\n      }\n      const project = instantiateProject(imported.project, imported.project.name);\n      await saveProject(project);\n      setCurrentProject(project);\n''',
    '''      if (imported.kind === "template") {\n        const templateName = imported.project.name || file.name.replace(/\\.kuromotion$/i, "");\n        const templateProject = await migrateProjectAssets(imported.project);\n        await saveUserTemplate(templateProject, templateName);\n        await refreshLibrary();\n        return;\n      }\n      const instantiated = instantiateProject(imported.project, imported.project.name);\n      const project = await migrateProjectAssets(instantiated);\n      await saveProject(project);\n      setCurrentProject(project);\n''',
)

# Strengthen the foundation audit around real recovery and portable project files.
replace(
    "scripts/audit-foundation-v2.mjs",
    'const editor = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");\nconst history',
    'const editor = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");\nconst app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");\nconst history',
)
replace(
    "scripts/audit-foundation-v2.mjs",
    '''if (!editor.includes("saveDraft(history.projectRef.current)")) issues.push("Editor changes are not written to the recovery draft.");\nif (!editor.includes("storeAssetBlob(project.id")) issues.push("Imported assets still bypass Blob storage.");\nif (!history.includes("createProjectPatch")) issues.push("History still uses full project snapshots.");\n''',
    '''if (!editor.includes("saveDraft(history.projectRef.current)")) issues.push("Editor changes are not written to the recovery draft.");\nif (!editor.includes("persistedRevisionRef")) issues.push("Draft recovery has no persisted revision baseline.");\nif (!editor.includes('window.addEventListener("pagehide", flushRecovery)')) issues.push("Draft recovery is not flushed when the editor page is hidden or closed.");\nif (!editor.includes("storeAssetBlob(project.id")) issues.push("Imported assets still bypass Blob storage.");\nif (!app.includes("prepareProjectForExport(project)")) issues.push(".kuromotion export does not hydrate Blob-backed assets.");\nif (!app.includes("migrateProjectAssets(instantiated)")) issues.push("Imported .kuromotion assets are not detached back into Blob storage.");\nif (!history.includes("createProjectPatch")) issues.push("History still uses full project snapshots.");\nif (history.includes("KurogiProject[]>([]")) issues.push("History still stores full-project snapshot stacks.");\n''',
)
replace(
    "scripts/audit-foundation-v2.mjs",
    'console.log("Foundation V2 audit passed: Blob-backed assets, patch history, portable export hydration, and real draft recovery are wired.");',
    'console.log("Foundation V2 audit passed: Blob-backed assets, portable .kuromotion files, patch history, persisted revision tracking, and page-hide draft recovery are wired.");',
)

print("Foundation V2 completion patch applied.")

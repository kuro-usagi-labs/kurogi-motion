const fs = require("node:fs");

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, content) { fs.writeFileSync(path, content); }
function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`Could not find ${label}`);
  return source.replace(from, to);
}

{
  const path = "electron/main.cjs";
  let source = read(path);
  source = replaceOnce(
    source,
    'const fs = require("fs");',
    'const fs = require("fs");\nconst { pathToFileURL } = require("node:url");\nconst { createMcpBridge } = require("./mcpBridge.cjs");',
    "Electron MCP imports",
  );
  source = replaceOnce(
    source,
    'let packagedBundlePromise = null;\nlet exportInProgress = false;',
    'let packagedBundlePromise = null;\nlet exportInProgress = false;\nlet mainWindow = null;\nlet mcpBridge = null;\nconst mcpMode = process.argv.includes("--mcp");',
    "Electron MCP state",
  );
  source = replaceOnce(
    source,
    '  });\n\n  window.webContents.setWindowOpenHandler',
    '  });\n  mainWindow = window;\n  window.on("closed", () => { if (mainWindow === window) mainWindow = null; });\n\n  window.webContents.setWindowOpenHandler',
    "main window tracking",
  );
  source = replaceOnce(
    source,
    'app.whenReady().then(createWindow);\napp.on("window-all-closed", () => {\n  if (process.platform !== "darwin") app.quit();\n});\napp.on("activate", () => {\n  if (BrowserWindow.getAllWindows().length === 0) createWindow();\n});',
    'if (mcpMode) {\n  app.whenReady().then(async () => {\n    const entry = path.join(app.getAppPath(), "mcp", "server.mjs");\n    const module = await import(pathToFileURL(entry).href);\n    await module.startKurogiMcpServer({ bridgeFile: path.join(app.getPath("userData"), "mcp-bridge.json") });\n  }).catch((error) => {\n    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);\n    app.exit(1);\n  });\n} else {\n  app.whenReady().then(async () => {\n    mcpBridge = createMcpBridge({ app, ipcMain, getWindow: () => mainWindow });\n    try { await mcpBridge.start(); } catch (error) { console.error("Unable to start MCP bridge", error); }\n    createWindow();\n  });\n  app.on("window-all-closed", () => {\n    if (process.platform !== "darwin") app.quit();\n  });\n  app.on("activate", () => {\n    if (BrowserWindow.getAllWindows().length === 0) createWindow();\n  });\n  app.on("before-quit", () => { void mcpBridge?.stop(); });\n}',
    "Electron MCP mode lifecycle",
  );
  source = replaceOnce(
    source,
    'ipcMain.handle("export-video", async (event, project, rawOptions = {}) => {',
    'ipcMain.handle("mcp-info", async () => ({\n  bridgeRunning: Boolean(mcpBridge?.readConnectionInfo()),\n  bridgeFile: path.join(app.getPath("userData"), "mcp-bridge.json"),\n  command: process.execPath,\n  args: app.isPackaged ? ["--mcp"] : [app.getAppPath(), "--mcp"],\n  packaged: app.isPackaged,\n}));\n\nipcMain.handle("export-video", async (event, project, rawOptions = {}) => {',
    "MCP info handler",
  );
  write(path, source);
}

{
  const path = "electron/preload.cjs";
  let source = read(path);
  source = replaceOnce(
    source,
    '  showItemInFolder: (targetPath) => ipcRenderer.invoke("show-item-in-folder", targetPath),',
    '  showItemInFolder: (targetPath) => ipcRenderer.invoke("show-item-in-folder", targetPath),\n  getMcpInfo: () => ipcRenderer.invoke("mcp-info"),\n  onMcpRequest: (listener) => {\n    const handler = (_event, request) => listener(request);\n    ipcRenderer.on("mcp-request", handler);\n    return () => ipcRenderer.removeListener("mcp-request", handler);\n  },\n  respondMcpRequest: (response) => ipcRenderer.send("mcp-response", response),',
    "preload MCP bridge API",
  );
  write(path, source);
}

{
  const path = "src/vite-env.d.ts";
  let source = read(path);
  source = replaceOnce(
    source,
    '    showItemInFolder: (targetPath: string) => Promise<{ opened: boolean }>;\n    onExportProgress:',
    '    showItemInFolder: (targetPath: string) => Promise<{ opened: boolean }>;\n    getMcpInfo: () => Promise<{ bridgeRunning: boolean; bridgeFile: string; command: string; args: string[]; packaged: boolean }>;\n    onMcpRequest: (listener: (request: import("./core/mcpCommands").McpBridgeRequest) => void) => () => void;\n    respondMcpRequest: (response: import("./core/mcpCommands").McpBridgeResponse) => void;\n    onExportProgress:',
    "renderer MCP types",
  );
  write(path, source);
}

{
  const path = "src/App.tsx";
  let source = read(path);
  source = replaceOnce(
    source,
    'import type { KurogiProject } from "./types";',
    'import type { KurogiProject } from "./types";\nimport type { McpBridgeRequest } from "./core/mcpCommands";',
    "App MCP type import",
  );
  source = replaceOnce(
    source,
    '  useEffect(() => {\n    void initialize();\n  }, []);\n\n  async function initialize()',
    '  useEffect(() => {\n    void initialize();\n  }, []);\n\n  useEffect(() => {\n    if (currentProject) return;\n    const unsubscribe = window.kurogi?.onMcpRequest?.((request) => { void handleDashboardMcpRequest(request); });\n    return () => unsubscribe?.();\n  }, [currentProject]);\n\n  async function handleDashboardMcpRequest(request: McpBridgeRequest) {\n    const respond = window.kurogi?.respondMcpRequest;\n    if (!respond) return;\n    try {\n      if (request.method === "library.list_projects") {\n        respond({ id: request.id, ok: true, result: { projects: await listProjectSummaries() } });\n        return;\n      }\n      throw new Error("Open a Kurogi Motion project before using project MCP tools.");\n    } catch (error) {\n      respond({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });\n    }\n  }\n\n  async function initialize()',
    "dashboard MCP request handler",
  );
  write(path, source);
}

{
  const path = "src/editor/EditorMenuBar.tsx";
  let source = read(path);
  source = replaceOnce(
    source,
    '  onShowShortcuts: () => void;\n  onShowAbout: () => void;',
    '  onShowShortcuts: () => void;\n  onShowMcpIntegration: () => void;\n  onShowAbout: () => void;',
    "menu MCP callback prop",
  );
  source = replaceOnce(
    source,
    '      <Menu label="Help" open={openMenu === "Help"} onToggle={() => setOpenMenu(openMenu === "Help" ? null : "Help")}>\n        <MenuItem label="Keyboard Shortcuts" onSelect={() => run(props.onShowShortcuts)} />\n        <MenuItem label="About Kurogi Motion" onSelect={() => run(props.onShowAbout)} />',
    '      <Menu label="Help" open={openMenu === "Help"} onToggle={() => setOpenMenu(openMenu === "Help" ? null : "Help")}>\n        <MenuItem label="Keyboard Shortcuts" onSelect={() => run(props.onShowShortcuts)} />\n        <MenuItem label="MCP Integration…" onSelect={() => run(props.onShowMcpIntegration)} />\n        <MenuSeparator />\n        <MenuItem label="About Kurogi Motion" onSelect={() => run(props.onShowAbout)} />',
    "Help MCP menu item",
  );
  write(path, source);
}

{
  const path = "src/app/Editor.tsx";
  let source = read(path);
  source = replaceOnce(
    source,
    'import { clearDraft, prepareProjectForExport, saveDraft, saveProject, storeAssetBlob } from "../core/persistence";',
    'import { clearDraft, listProjectSummaries, prepareProjectForExport, saveDraft, saveProject, storeAssetBlob } from "../core/persistence";',
    "Editor persistence MCP import",
  );
  source = replaceOnce(
    source,
    'import { EditorMenuBar } from "../editor/EditorMenuBar";',
    'import { EditorMenuBar } from "../editor/EditorMenuBar";\nimport { McpIntegrationDialog } from "../editor/McpIntegrationDialog";\nimport { describeMcpMutation, executeMcpProjectCommand, isMcpMutationMethod, type McpBridgeRequest } from "../core/mcpCommands";',
    "Editor MCP imports",
  );
  source = replaceOnce(
    source,
    '  const [exportDialogOpen, setExportDialogOpen] = useState(false);',
    '  const [exportDialogOpen, setExportDialogOpen] = useState(false);\n  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);',
    "MCP dialog state",
  );
  source = replaceOnce(
    source,
    '  useEffect(() => {\n    saveEditorUiPreferences(uiPreferences);\n  }, [uiPreferences]);\n\n  function setOnlyAction',
    '  useEffect(() => {\n    saveEditorUiPreferences(uiPreferences);\n  }, [uiPreferences]);\n\n  useEffect(() => {\n    const unsubscribe = window.kurogi?.onMcpRequest?.((request) => { void handleMcpRequest(request); });\n    return () => unsubscribe?.();\n  });\n\n  async function handleMcpRequest(request: McpBridgeRequest) {\n    const respond = window.kurogi?.respondMcpRequest;\n    if (!respond) return;\n    try {\n      if (request.method === "library.list_projects") {\n        respond({ id: request.id, ok: true, result: { projects: await listProjectSummaries() } });\n        return;\n      }\n      if (request.method === "project.save") {\n        const current = history.projectRef.current;\n        await saveProject(current);\n        await clearDraft(current.id);\n        setSaveStatus("Saved");\n        respond({ id: request.id, ok: true, result: { saved: true, projectId: current.id, updatedAt: current.updatedAt } });\n        return;\n      }\n      if (request.method === "project.export") {\n        if (!window.kurogi) throw new Error("Desktop export is unavailable.");\n        const params = request.params ?? {};\n        const format = ["mp4", "webm", "mov", "gif", "png-sequence"].includes(String(params.format)) ? String(params.format) as ExportOptions["format"] : "mp4";\n        const requestedFps = Number(params.fps);\n        const options: ExportOptions = {\n          format,\n          fps: ([24, 30, 60].includes(requestedFps) ? requestedFps : scene.fps) as 24 | 30 | 60,\n          scale: Math.min(2, Math.max(.1, Number(params.scale) || 1)),\n          quality: (["low", "medium", "high"].includes(String(params.quality)) ? String(params.quality) : "high") as ExportOptions["quality"],\n          transparent: Boolean(params.transparent),\n          gifLoops: null,\n        };\n        const snapshot = await prepareProjectForExport(cloneProject(history.projectRef.current));\n        const result = await window.kurogi.exportVideo(snapshot, options);\n        respond({ id: request.id, ok: true, result: result.canceled ? { canceled: true } : { exported: true, path: result.path } });\n        return;\n      }\n      const params = request.params ?? {};\n      if (isMcpMutationMethod(request.method)) {\n        const allowed = window.confirm(`An MCP client wants to ${describeMcpMutation(request.method, params)}.\\n\\nAllow this project change?`);\n        if (!allowed) throw new Error("The user denied the MCP project change.");\n      }\n      const outcome = executeMcpProjectCommand(history.projectRef.current, request.method, params);\n      if (outcome.changed) {\n        history.commit(() => outcome.project);\n        window.queueMicrotask(() => {\n          if (outcome.selectedLayerId) selectOnly(outcome.selectedLayerId);\n          else if (outcome.activeSceneId) selectOnly(outcome.project.scenes[outcome.activeSceneId]?.layerIds.at(-1) ?? "");\n          setOnlyAction("");\n        });\n      }\n      respond({ id: request.id, ok: true, result: outcome.result });\n    } catch (error) {\n      respond({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });\n    }\n  }\n\n  function setOnlyAction',
    "Editor MCP request handling",
  );
  source = replaceOnce(
    source,
    '    <main className="app editor-app">\n      <ExportDialog',
    '    <main className="app editor-app">\n      <McpIntegrationDialog open={mcpDialogOpen} onClose={() => setMcpDialogOpen(false)} />\n      <ExportDialog',
    "MCP integration dialog render",
  );
  source = replaceOnce(
    source,
    '          onShowShortcuts={showKeyboardShortcuts}\n          onShowAbout=',
    '          onShowShortcuts={showKeyboardShortcuts}\n          onShowMcpIntegration={() => setMcpDialogOpen(true)}\n          onShowAbout=',
    "MCP menu callback wiring",
  );
  write(path, source);
}

{
  const path = "src/main.tsx";
  let source = read(path);
  source = replaceOnce(source, 'import "./editorMenu.css";', 'import "./editorMenu.css";\nimport "./mcp.css";', "MCP CSS import");
  write(path, source);
}

{
  const path = "package.json";
  const value = JSON.parse(read(path));
  value.scripts.mcp = "electron . --mcp";
  value.scripts["audit:mcp"] = "node scripts/audit-mcp.mjs";
  if (!value.scripts.audit.includes("audit:mcp")) value.scripts.audit += " && npm run audit:mcp";
  if (!value.build.files.includes("mcp/**/*")) value.build.files.push("mcp/**/*");
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

{
  const path = ".github/workflows/ci.yml";
  let source = read(path);
  source = replaceOnce(
    source,
    '      - name: Audit effect renderer\n',
    '      - name: Audit MCP integration\n        shell: bash\n        run: |\n          set -o pipefail\n          npm run audit:mcp 2>&1 | tee mcp-audit.log\n\n      - name: Audit effect renderer\n',
    "MCP CI step",
  );
  source = replaceOnce(
    source,
    '            editor-command-ui-audit.log\n',
    '            editor-command-ui-audit.log\n            mcp-audit.log\n',
    "MCP diagnostic log",
  );
  write(path, source);
}

console.log("Applied Kurogi Motion MCP integration.");

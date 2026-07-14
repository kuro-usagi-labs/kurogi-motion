const fs = require("node:fs");

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, value) { fs.writeFileSync(path, value); }
function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`Could not find ${label}`);
  return source.replace(from, to);
}

// Editor wiring
{
  const path = "src/app/Editor.tsx";
  let source = read(path);
  source = replaceOnce(
    source,
    'import { MultiSceneCanvasStage } from "../editor/MultiSceneCanvasStage";\nimport { DesignToolsPanel } from "../editor/DesignToolsPanel";',
    'import { MultiSceneCanvasStage, type WorkspaceCommand } from "../editor/MultiSceneCanvasStage";\nimport { DesignToolsPanel } from "../editor/DesignToolsPanel";\nimport { EditorMenuBar } from "../editor/EditorMenuBar";',
    "editor menu imports",
  );
  source = replaceOnce(
    source,
    '  const [showSafeArea, setShowSafeArea] = useState(false);\n',
    '  const [showSafeArea, setShowSafeArea] = useState(false);\n  const [workspaceCommand, setWorkspaceCommand] = useState<WorkspaceCommand | null>(null);\n',
    "workspace command state",
  );

  source = replaceOnce(
    source,
    '      if (modifier && event.key.toLowerCase() === "s") {\n        event.preventDefault();\n        void saveNow();\n      }',
    '      if (!editable && modifier && event.key.toLowerCase() === "n") { event.preventDefault(); void leaveEditor(); }\n      if (!editable && modifier && event.key.toLowerCase() === "o") { event.preventDefault(); void leaveEditor(); }\n      if (!editable && modifier && event.key.toLowerCase() === "e") { event.preventDefault(); setExportProgress(null); setExportDialogOpen(true); }\n      if (!editable && modifier && event.key.toLowerCase() === "a") { event.preventDefault(); selectAllLayers(); }\n      if (!editable && event.key === "Escape") { deselectAllLayers(); }\n      if (modifier && event.key.toLowerCase() === "s") {\n        event.preventDefault();\n        void saveNow();\n      }',
    "editor menu keyboard shortcuts",
  );

  const helperAnchor = '  function togglePlay() {\n';
  const helpers = `  function issueWorkspaceCommand(type: WorkspaceCommand["type"]) {\n    setWorkspaceCommand((current) => ({ type, nonce: (current?.nonce ?? 0) + 1 }));\n  }\n\n  function selectAllLayers() {\n    setSelectedLayerIds([...scene.layerIds]);\n    setPrimaryLayerId(scene.layerIds.at(-1) ?? "");\n    setOnlyAction("");\n  }\n\n  function deselectAllLayers() {\n    selectOnly("");\n    setOnlyAction("");\n  }\n\n  function bringSelectedForward() {\n    if (selectedLayerId) commitProject((current) => reorderLayer(current, selectedLayerId, "up"));\n  }\n\n  function sendSelectedBackward() {\n    if (selectedLayerId) commitProject((current) => reorderLayer(current, selectedLayerId, "down"));\n  }\n\n  function toggleSelectedVisibility() {\n    if (!selectedLayerIds.length) return;\n    commitProject((current) => selectedLayerIds.reduce((next, id) => updateLayer(next, id, (layer) => ({ ...layer, visible: !layer.visible })), current));\n  }\n\n  function toggleSelectedLock() {\n    if (!selectedLayerIds.length) return;\n    commitProject((current) => selectedLayerIds.reduce((next, id) => updateLayer(next, id, (layer) => ({ ...layer, locked: !layer.locked })), current));\n  }\n\n  function openAnimationCategory(category: AnimationCategory) {\n    setInspectorTab("Animation");\n    const action = selectedLayer?.animationActions.find((candidate) => candidate.category === category);\n    setOnlyAction(action?.id ?? "");\n  }\n\n  function staggerFromMenu() {\n    if (!selectedActionIds.length) return;\n    const value = window.prompt("Stagger interval in seconds", "0.08");\n    if (value === null) return;\n    const step = Number(value);\n    if (!Number.isFinite(step) || step < 0) { window.alert("Enter a valid stagger interval."); return; }\n    staggerSelectedActions(step, "forward");\n  }\n\n  function showKeyboardShortcuts() {\n    window.alert("Space: Play/Pause\\nCtrl+S: Save\\nCtrl+Z: Undo\\nCtrl+Shift+Z: Redo\\nCtrl+D: Duplicate\\nCtrl+G: Group\\nCtrl+Shift+G: Ungroup\\nDelete: Remove selection");\n  }\n\n`;
  if (!source.includes("function issueWorkspaceCommand")) {
    if (!source.includes(helperAnchor)) throw new Error("Could not find editor helper anchor");
    source = source.replace(helperAnchor, helpers + helperAnchor);
  }

  const headerPattern = /      <header className="toolbar editor-toolbar">[\s\S]*?      <\/header>/;
  const newHeader = `      <header className="toolbar editor-toolbar editor-command-toolbar">\n        <button type="button" className="toolbar-brand-button" onClick={() => void leaveEditor()} title="Back to projects">\n          <div className="brand"><span className="brand-mark">K</span><span>kurogi<span className="muted">motion</span></span></div>\n        </button>\n        <EditorMenuBar\n          canUndo={history.canUndo}\n          canRedo={history.canRedo}\n          canDuplicate={Boolean(selectedLayerId)}\n          canDelete={Boolean(selectedLayerId || selectedActionIds.length)}\n          canGroup={selectedLayerIds.length >= 2}\n          canDistribute={selectedLayerIds.length >= 3}\n          canUngroup={selectedLayer?.type === "group"}\n          canDeleteScene={Object.keys(project.scenes).length > 1}\n          canCopyAnimation={selectedActionIds.length > 0}\n          canPasteAnimation={Boolean(animationClipboard && selectedLayerIds.length)}\n          canGroupAnimation={selectedActionIds.length >= 2}\n          safeAreaEnabled={showSafeArea}\n          snapEnabled={project.settings.snapEnabled}\n          onNewProject={() => void leaveEditor()}\n          onOpenProject={() => void leaveEditor()}\n          onSave={() => void saveNow()}\n          onImportAsset={() => assetInputRef.current?.click()}\n          onCopyProject={() => void copyProjectSnapshot()}\n          onExport={() => { setExportProgress(null); setExportDialogOpen(true); }}\n          onUndo={history.undo}\n          onRedo={history.redo}\n          onDuplicate={() => selectedActionIds.length ? duplicateActions(selectedActionIds) : duplicateSelectedLayer()}\n          onDelete={() => selectedActionIds.length ? deleteActions(selectedActionIds) : deleteSelectedLayer()}\n          onSelectAll={selectAllLayers}\n          onDeselectAll={deselectAllLayers}\n          onAlign={alignSelection}\n          onDistribute={distributeSelection}\n          onZoomIn={() => setZoom((value) => Math.min(250, value + 10))}\n          onZoomOut={() => setZoom((value) => Math.max(5, value - 10))}\n          onResetZoom={() => setZoom(100)}\n          onFitAll={() => issueWorkspaceCommand("fit-all")}\n          onFocusScene={() => issueWorkspaceCommand("focus-scene")}\n          onToggleSafeArea={() => setShowSafeArea((value) => !value)}\n          onToggleSnap={toggleSmartSnap}\n          onCreateScene={addWorkspaceScene}\n          onDuplicateScene={() => duplicateActiveWorkspaceScene(scene.id)}\n          onDeleteScene={() => deleteWorkspaceScene(scene.id)}\n          onSceneSettings={() => issueWorkspaceCommand("scene-settings")}\n          onBringForward={bringSelectedForward}\n          onSendBackward={sendSelectedBackward}\n          onGroup={groupSelected}\n          onUngroup={ungroupSelected}\n          onToggleVisibility={toggleSelectedVisibility}\n          onToggleLock={toggleSelectedLock}\n          onOpenAnimationCategory={openAnimationCategory}\n          onCopyAnimation={() => copySelectedActions()}\n          onPasteAnimation={pasteSelectedActions}\n          onStaggerAnimation={staggerFromMenu}\n          onGroupAnimation={groupSelectedActions}\n          onUngroupAnimation={ungroupSelectedActions}\n          onSaveAnimationPreset={saveSelectedAnimationPreset}\n          onShowShortcuts={showKeyboardShortcuts}\n          onShowAbout={() => window.alert("Kurogi Motion\\nLocal-first motion design editor powered by Remotion.")}\n        />\n        <div className="project-name">\n          <strong>{project.name}</strong>\n          <span className={\`save-dot status-\${saveStatus.toLowerCase().replace(/\\W/g, "-")}\`}>● {saveStatus}</span>\n        </div>\n        <div className="toolbar-actions">\n          <button type="button" className="preview" onClick={togglePlay}>{playing ? <><Icon name="pause" size={15} />Pause</> : <><Icon name="play" size={15} />Preview</>}</button>\n          <button type="button" className="export" onClick={() => { setExportProgress(null); setExportDialogOpen(true); }}>Export <Icon name="export" size={15} /></button>\n        </div>\n      </header>`;
  if (!source.includes("<EditorMenuBar")) {
    if (!headerPattern.test(source)) throw new Error("Could not find editor header");
    source = source.replace(headerPattern, newHeader);
  }

  source = replaceOnce(
    source,
    '          showSafeArea={showSafeArea}\n',
    '          showSafeArea={showSafeArea}\n          command={workspaceCommand}\n',
    "workspace command prop",
  );
  source = source.replace('          onCreateScene={addWorkspaceScene}\n          onDuplicateScene={duplicateActiveWorkspaceScene}\n          onDeleteScene={deleteWorkspaceScene}\n', '');
  write(path, source);
}

// Multi-scene compact toolbar and command bridge
{
  const path = "src/editor/MultiSceneCanvasStage.tsx";
  let source = read(path);
  source = replaceOnce(
    source,
    'interface MultiSceneCanvasStageProps {\n',
    'export interface WorkspaceCommand {\n  type: "fit-all" | "focus-scene" | "scene-settings";\n  nonce: number;\n}\n\ninterface MultiSceneCanvasStageProps {\n',
    "workspace command type",
  );
  source = replaceOnce(source, '  showSafeArea: boolean;\n', '  showSafeArea: boolean;\n  command?: WorkspaceCommand | null;\n', "workspace command property");
  source = source.replace('  onCreateScene: () => void;\n  onDuplicateScene: (sceneId: string) => void;\n  onDeleteScene: (sceneId: string) => void;\n', '');
  source = replaceOnce(source, '  showSafeArea,\n', '  showSafeArea,\n  command,\n', "workspace command destructuring");
  source = source.replace('  onCreateScene,\n  onDuplicateScene,\n  onDeleteScene,\n', '');

  const effectAnchor = '  const stableSelect = useCallback((id: string, additive = false) => callbacksRef.current.onSelect(id, additive), []);\n';
  const commandEffect = `  useEffect(() => {\n    if (!command) return;\n    const frame = window.requestAnimationFrame(() => {\n      if (command.type === "fit-all") fitAllScenes();\n      if (command.type === "focus-scene") focusScene(activeScene.id);\n      if (command.type === "scene-settings") setSettingsOpen(true);\n    });\n    return () => window.cancelAnimationFrame(frame);\n  }, [command?.nonce]);\n\n`;
  if (!source.includes('command.type === "fit-all"')) {
    if (!source.includes(effectAnchor)) throw new Error("Could not find multiscene command effect anchor");
    source = source.replace(effectAnchor, commandEffect + effectAnchor);
  }

  const toolbarPattern = /      <div className="multi-scene-toolbar">[\s\S]*?      <\/div>\n\n      \{settingsOpen/;
  const compactToolbar = `      <div className="multi-scene-toolbar is-compact">\n        <div className="scene-toolbar-primary">\n          <input\n            className="scene-name-input"\n            value={settingsDraft.name}\n            aria-label="Scene name"\n            onChange={(event) => setSettingsDraft((current) => ({ ...current, name: event.target.value }))}\n            onBlur={() => onRenameScene(activeScene.id, settingsDraft.name)}\n            onKeyDown={(event) => {\n              if (event.key === "Enter") event.currentTarget.blur();\n            }}\n          />\n          <button type="button" className={settingsOpen ? "active" : ""} onClick={() => setSettingsOpen((value) => !value)} title="Scene settings"><Icon name="frame" size={15} /></button>\n        </div>\n\n        <div className="scene-toolbar-secondary">\n          {selectedLayerId && scenes.length > 1 ? (\n            <div className="copy-scene-control">\n              <span>Copy selected to</span>\n              <select value={copyTarget} onChange={(event) => setCopyTarget(event.target.value)}>\n                {scenes.filter((scene) => scene.id !== activeScene.id).map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}\n              </select>\n              <button type="button" disabled={!copyTarget} onClick={() => copyTarget && onCopyLayerToScene(selectedLayerId, copyTarget)}><Icon name="copy" size={14} />Copy</button>\n            </div>\n          ) : null}\n          <button type="button" onClick={fitAllScenes} title="Fit all scenes"><Icon name="frame" size={15} />Fit all</button>\n          <button type="button" onClick={() => focusScene(activeScene.id)} title="Focus active scene">Focus</button>\n          <button type="button" onClick={() => setView(clamp(viewZoom - 10, 5, 250), panRef.current)} title="Zoom out"><Icon name="minus" size={14} /></button>\n          <span className="workspace-zoom-label">{Math.round(viewZoom)}%</span>\n          <button type="button" onClick={() => setView(clamp(viewZoom + 10, 5, 250), panRef.current)} title="Zoom in"><Icon name="plus" size={14} /></button>\n        </div>\n      </div>\n\n      {settingsOpen`;
  if (!source.includes('multi-scene-toolbar is-compact')) {
    if (!toolbarPattern.test(source)) throw new Error("Could not find multiscene toolbar");
    source = source.replace(toolbarPattern, compactToolbar);
  }
  write(path, source);
}

// Icon-only alignment controls
{
  const path = "src/editor/DesignToolsPanel.tsx";
  let source = read(path);
  source = replaceOnce(
    source,
    'import type { BlendMode, GradientFill, KurogiProject, Layer } from "../types";\n',
    'import type { BlendMode, GradientFill, KurogiProject, Layer } from "../types";\nimport { Icon, type IconName } from "../ui/Icon";\n',
    "design tool icon import",
  );
  source = replaceOnce(
    source,
    'const SYSTEM_FONTS = ["Inter", "Arial", "Georgia", "Times New Roman", "Courier New", "Verdana"];\n',
    'const SYSTEM_FONTS = ["Inter", "Arial", "Georgia", "Times New Roman", "Courier New", "Verdana"];\nconst ALIGNMENT_ICONS: Record<AlignMode, IconName> = { left: "alignLeft", center: "alignCenterHorizontal", right: "alignRight", top: "alignTop", middle: "alignCenterVertical", bottom: "alignBottom" };\n',
    "alignment icon map",
  );
  const oldAlignment = `      <div className="design-tools-section" aria-label="Alignment tools">\n        <span className="design-tools-label">Align</span>\n        {(["left", "center", "right", "top", "middle", "bottom"] as AlignMode[]).map((mode) => (\n          <button type="button" key={mode} disabled={!selectedLayers.length} onClick={() => onAlign(mode)} title={\`Align \${mode}\`}>{alignmentLabel(mode)}</button>\n        ))}\n        <button type="button" disabled={selectedLayers.length < 3} onClick={() => onDistribute("horizontal")} title="Distribute horizontal spacing">Dist H</button>\n        <button type="button" disabled={selectedLayers.length < 3} onClick={() => onDistribute("vertical")} title="Distribute vertical spacing">Dist V</button>\n      </div>`;
  const newAlignment = `      <div className="design-tools-section design-tools-align-section" aria-label="Alignment tools">\n        {(["left", "center", "right", "top", "middle", "bottom"] as AlignMode[]).map((mode) => (\n          <button type="button" className="design-tools-icon-button" key={mode} disabled={!selectedLayers.length} onClick={() => onAlign(mode)} title={alignmentTitle(mode)} aria-label={alignmentTitle(mode)}><Icon name={ALIGNMENT_ICONS[mode]} size={15} /></button>\n        ))}\n        <span className="design-tools-mini-divider" />\n        <button type="button" className="design-tools-icon-button" disabled={selectedLayers.length < 3} onClick={() => onDistribute("horizontal")} title="Distribute horizontal spacing" aria-label="Distribute horizontal spacing"><Icon name="distributeHorizontal" size={15} /></button>\n        <button type="button" className="design-tools-icon-button" disabled={selectedLayers.length < 3} onClick={() => onDistribute("vertical")} title="Distribute vertical spacing" aria-label="Distribute vertical spacing"><Icon name="distributeVertical" size={15} /></button>\n      </div>`;
  source = replaceOnce(source, oldAlignment, newAlignment, "icon alignment controls");
  source = source.replace(/\nfunction alignmentLabel\([\s\S]*?\n}\n?$/, '\nfunction alignmentTitle(mode: AlignMode) {\n  if (mode === "center") return "Align horizontal center";\n  if (mode === "middle") return "Align vertical center";\n  return `Align ${mode}`;\n}\n');
  write(path, source);
}

// Alignment SVG icon registry
{
  const path = "src/ui/Icon.tsx";
  let source = read(path);
  source = replaceOnce(
    source,
    '  | "polygon" | "arrow" | "restart" | "previous" | "next" | "grip";\n',
    '  | "polygon" | "arrow" | "alignLeft" | "alignCenterHorizontal" | "alignRight"\n  | "alignTop" | "alignCenterVertical" | "alignBottom" | "distributeHorizontal" | "distributeVertical"\n  | "restart" | "previous" | "next" | "grip";\n',
    "alignment icon names",
  );
  source = replaceOnce(
    source,
    '  arrow: <><path d="M4 12h15"/><path d="m14 7 5 5-5 5"/></>,\n  restart:',
    '  arrow: <><path d="M4 12h15"/><path d="m14 7 5 5-5 5"/></>,\n  alignLeft: <><path d="M4 4v16"/><path d="M4 7h12"/><path d="M4 12h16"/><path d="M4 17h9"/></>,\n  alignCenterHorizontal: <><path d="M12 4v16"/><path d="M6 7h12"/><path d="M4 12h16"/><path d="M7.5 17h9"/></>,\n  alignRight: <><path d="M20 4v16"/><path d="M8 7h12"/><path d="M4 12h16"/><path d="M11 17h9"/></>,\n  alignTop: <><path d="M4 4h16"/><path d="M7 4v12"/><path d="M12 4v16"/><path d="M17 4v9"/></>,\n  alignCenterVertical: <><path d="M4 12h16"/><path d="M7 6v12"/><path d="M12 4v16"/><path d="M17 7.5v9"/></>,\n  alignBottom: <><path d="M4 20h16"/><path d="M7 8v12"/><path d="M12 4v16"/><path d="M17 11v9"/></>,\n  distributeHorizontal: <><path d="M4 4v16M20 4v16"/><rect x="7" y="7" width="3" height="10" rx="1"/><rect x="14" y="7" width="3" height="10" rx="1"/></>,\n  distributeVertical: <><path d="M4 4h16M4 20h16"/><rect x="7" y="7" width="10" height="3" rx="1"/><rect x="7" y="14" width="10" height="3" rx="1"/></>,\n  restart:',
    "alignment icon paths",
  );
  write(path, source);
}

// Menu stylesheet import
{
  const path = "src/main.tsx";
  let source = read(path);
  source = replaceOnce(source, 'import "./previewRecovery.css";\n', 'import "./previewRecovery.css";\nimport "./editorMenu.css";\n', "editor menu stylesheet import");
  write(path, source);
}

// Add canDistribute to the newly created menu component.
{
  const path = "src/editor/EditorMenuBar.tsx";
  let source = read(path);
  source = replaceOnce(source, '  canGroup: boolean;\n  canUngroup: boolean;\n', '  canGroup: boolean;\n  canDistribute: boolean;\n  canUngroup: boolean;\n', "menu distribute capability");
  source = source.replace('disabled={!props.canGroup} onSelect={() => run(() => props.onDistribute("horizontal"))}', 'disabled={!props.canDistribute} onSelect={() => run(() => props.onDistribute("horizontal"))}');
  source = source.replace('disabled={!props.canGroup} onSelect={() => run(() => props.onDistribute("vertical"))}', 'disabled={!props.canDistribute} onSelect={() => run(() => props.onDistribute("vertical"))}');
  write(path, source);
}

console.log("Applied editor command menu UI refactor.");

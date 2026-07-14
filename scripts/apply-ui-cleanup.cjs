const fs = require("node:fs");

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, content) { fs.writeFileSync(path, content); }
function replaceOnce(source, from, to, label) {
  if (to && source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`Could not find ${label}`);
  return source.replace(from, to);
}
function removeOnce(source, target, label) {
  if (!source.includes(target)) return source;
  return source.replace(target, "");
}

{
  const path = "src/app/Editor.tsx";
  let source = read(path);
  source = replaceOnce(
    source,
    'import { EditorMenuBar } from "../editor/EditorMenuBar";',
    'import { EditorMenuBar } from "../editor/EditorMenuBar";\nimport { loadEditorUiPreferences, saveEditorUiPreferences, type EditorUiPreferences } from "../core/editorUiPreferences";',
    "editor UI preferences import",
  );
  source = replaceOnce(
    source,
    '  const [showSafeArea, setShowSafeArea] = useState(false);\n  const [workspaceCommand, setWorkspaceCommand] = useState<WorkspaceCommand | null>(null);',
    '  const [showSafeArea, setShowSafeArea] = useState(false);\n  const [uiPreferences, setUiPreferences] = useState<EditorUiPreferences>(() => loadEditorUiPreferences());\n  const [workspaceCommand, setWorkspaceCommand] = useState<WorkspaceCommand | null>(null);',
    "editor UI preference state",
  );
  source = replaceOnce(
    source,
    '  }, [exportNotice]);\n\n  function setOnlyAction(actionId: string)',
    '  }, [exportNotice]);\n\n  useEffect(() => {\n    saveEditorUiPreferences(uiPreferences);\n  }, [uiPreferences]);\n\n  function setOnlyAction(actionId: string)',
    "editor UI preference persistence",
  );
  source = replaceOnce(
    source,
    '  function toggleSmartSnap() {\n    commitProject((current) => touchProject({ ...cloneProject(current), settings: { ...current.settings, snapEnabled: !current.settings.snapEnabled } }));\n  }\n  async function importFont(file: File)',
    '  function toggleSmartSnap() {\n    commitProject((current) => touchProject({ ...cloneProject(current), settings: { ...current.settings, snapEnabled: !current.settings.snapEnabled } }));\n  }\n  function toggleDesignToolbar() {\n    setUiPreferences((current) => ({ ...current, showDesignToolbar: !current.showDesignToolbar }));\n  }\n  async function importFont(file: File)',
    "design toolbar toggle",
  );
  source = replaceOnce(
    source,
    '          snapEnabled={project.settings.snapEnabled}\n          onNewProject=',
    '          snapEnabled={project.settings.snapEnabled}\n          designToolbarVisible={uiPreferences.showDesignToolbar}\n          onNewProject=',
    "design toolbar menu state",
  );
  source = replaceOnce(
    source,
    '          onToggleSnap={toggleSmartSnap}\n          onCreateScene=',
    '          onToggleSnap={toggleSmartSnap}\n          onToggleDesignToolbar={toggleDesignToolbar}\n          onCreateScene=',
    "design toolbar menu callback",
  );
  source = removeOnce(
    source,
    '              {selectedLayer ? (\n                <div className="sidebar-selection-actions">\n                  <button type="button" onClick={duplicateSelectedLayer}>Duplicate</button>\n                  <button type="button" className="danger-text" onClick={deleteSelectedLayer}>Delete</button>\n                </div>\n              ) : null}\n',
    "duplicate layer sidebar footer",
  );
  const designPanel = `        <DesignToolsPanel\n          project={project}\n          selectedLayers={selectedLayers}\n          onAlign={alignSelection}\n          onDistribute={distributeSelection}\n          onGroup={groupSelected}\n          onUngroup={ungroupSelected}\n          onGradient={applySelectionGradient}\n          onBlendMode={(mode) => commitProject((current) => setBlendMode(current, selectedLayerIds, mode))}\n          onBackgroundBlur={(radius) => commitProject((current) => setBackgroundBlur(current, selectedLayerIds, radius))}\n          onApplyMask={applySelectionMask}\n          onClearMask={clearSelectionMask}\n          onFontFamily={(family) => commitProject((current) => setFontFamily(current, selectedLayerIds, family))}\n          onImportFont={(file) => void importFont(file)}\n          onToggleSnap={toggleSmartSnap}\n        />`;
  const conditionalDesignPanel = `        {uiPreferences.showDesignToolbar ? (\n          <DesignToolsPanel\n            project={project}\n            selectedLayers={selectedLayers}\n            onAlign={alignSelection}\n            onDistribute={distributeSelection}\n            onGroup={groupSelected}\n            onUngroup={ungroupSelected}\n            onGradient={applySelectionGradient}\n            onBlendMode={(mode) => commitProject((current) => setBlendMode(current, selectedLayerIds, mode))}\n            onBackgroundBlur={(radius) => commitProject((current) => setBackgroundBlur(current, selectedLayerIds, radius))}\n            onApplyMask={applySelectionMask}\n            onClearMask={clearSelectionMask}\n            onFontFamily={(family) => commitProject((current) => setFontFamily(current, selectedLayerIds, family))}\n            onImportFont={(file) => void importFont(file)}\n            onToggleSnap={toggleSmartSnap}\n          />\n        ) : null}`;
  source = replaceOnce(source, designPanel, conditionalDesignPanel, "conditional design toolbar");
  write(path, source);
}

{
  const path = "src/editor/EditorMenuBar.tsx";
  let source = read(path);
  source = replaceOnce(
    source,
    '  snapEnabled: boolean;\n  onNewProject:',
    '  snapEnabled: boolean;\n  designToolbarVisible: boolean;\n  onNewProject:',
    "menu design toolbar state prop",
  );
  source = replaceOnce(
    source,
    '  onToggleSnap: () => void;\n  onCreateScene:',
    '  onToggleSnap: () => void;\n  onToggleDesignToolbar: () => void;\n  onCreateScene:',
    "menu design toolbar callback prop",
  );
  source = replaceOnce(
    source,
    '        <MenuItem label="Smart Snap" checked={props.snapEnabled} onSelect={() => run(props.onToggleSnap)} />\n      </Menu>',
    '        <MenuItem label="Smart Snap" checked={props.snapEnabled} onSelect={() => run(props.onToggleSnap)} />\n        <MenuSeparator />\n        <MenuSection label="Panels" />\n        <MenuItem label="Design Toolbar" checked={props.designToolbarVisible} onSelect={() => run(props.onToggleDesignToolbar)} />\n      </Menu>',
    "View menu design toolbar item",
  );
  write(path, source);
}

{
  const path = "src/editor/InspectorV2.tsx";
  let source = read(path);
  source = removeOnce(
    source,
    '      <section className="property-section compact-property-section">\n        <div className="section-label">Layer state</div>\n        <label className="toggle-row"><span>Visible</span><ToggleSwitch checked={layer.visible} onChange={(checked) => commit((current) => ({ ...current, visible: checked }))} /></label>\n        <label className="toggle-row"><span>Locked</span><ToggleSwitch checked={layer.locked} onChange={(checked) => commit((current) => ({ ...current, locked: checked }))} /></label>\n      </section>\n\n',
    "duplicated Inspector layer state",
  );
  write(path, source);
}

{
  const path = "src/editor/MultiSceneCanvasStage.tsx";
  let source = read(path);
  source = removeOnce(
    source,
    '          <button type="button" className={settingsOpen ? "active" : ""} onClick={() => setSettingsOpen((value) => !value)} title="Scene settings"><Icon name="frame" size={15} /></button>\n',
    "duplicated scene settings button",
  );
  write(path, source);
}

{
  const path = "src/main.tsx";
  let source = read(path);
  source = replaceOnce(
    source,
    'import "./editorMenu.css";',
    'import "./editorMenu.css";\nimport "./uiCleanup.css";',
    "UI cleanup stylesheet import",
  );
  write(path, source);
}

console.log("Applied UI visibility and duplicate-control cleanup.");

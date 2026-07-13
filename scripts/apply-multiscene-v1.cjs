const fs = require("node:fs");

function patch(path, replacements) {
  let source = fs.readFileSync(path, "utf8");
  for (const [before, after] of replacements) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) throw new Error(`Could not find patch target in ${path}: ${before.slice(0, 120)}`);
    source = source.replace(before, after);
  }
  fs.writeFileSync(path, source);
}

patch("src/app/Editor.tsx", [
  [
    'import { CanvasStage } from "../editor/CanvasStage";',
    'import { MultiSceneCanvasStage } from "../editor/MultiSceneCanvasStage";',
  ],
  [
    'import { clearDraft, prepareProjectForExport, saveDraft, saveProject, storeAssetBlob } from "../core/persistence";',
    'import { clearDraft, prepareProjectForExport, saveDraft, saveProject, storeAssetBlob } from "../core/persistence";\nimport {\n  copyLayersToScene,\n  createScene as createWorkspaceScene,\n  duplicateScene as duplicateWorkspaceScene,\n  ensureSceneWorkspace,\n  moveScene as moveWorkspaceScene,\n  removeScene as removeWorkspaceScene,\n  renameScene as renameWorkspaceScene,\n  setActiveScene,\n  updateScene as updateWorkspaceScene,\n  type SceneUpdatePatch,\n  type SceneWorkspacePosition,\n} from "../core/sceneWorkspace";',
  ],
  [
    '  const history = useProjectHistory(initialProject);',
    '  const preparedInitialProject = useMemo(() => ensureSceneWorkspace(initialProject), [initialProject]);\n  const history = useProjectHistory(preparedInitialProject);',
  ],
  [
    '  }, [project.layers, selectedActionId]);\n\n  useEffect(() => {\n    const player = playerRef.current;',
    '  }, [project.layers, selectedActionId]);\n\n  useEffect(() => {\n    const active = project.scenes[project.activeSceneId];\n    const selected = selectedLayerId ? project.layers[selectedLayerId] : null;\n    if (!active) return;\n    if (!selected || selected.sceneId !== active.id) {\n      setSelectedLayerId(active.layerIds.at(-1) ?? "");\n      setSelectedActionId("");\n    }\n    setPlaying(false);\n  }, [project.activeSceneId]);\n\n  useEffect(() => {\n    const player = playerRef.current;',
  ],
  [
    '  function commitText(layerId: string, text: string) {\n    commitLayer(layerId, (layer) => layer.type === "text" ? { ...layer, text } : layer);\n  }\n\n  function togglePlay() {',
    '  function commitText(layerId: string, text: string) {\n    commitLayer(layerId, (layer) => layer.type === "text" ? { ...layer, text } : layer);\n  }\n\n  function activateWorkspaceScene(sceneId: string) {\n    commitProject((current) => {\n      const next = setActiveScene(current, sceneId);\n      const active = next.scenes[sceneId];\n      window.queueMicrotask(() => {\n        playerRef.current?.pause();\n        setPlaying(false);\n        setSelectedLayerId(active?.layerIds.at(-1) ?? "");\n        setSelectedActionId("");\n      });\n      return next;\n    });\n  }\n\n  function addWorkspaceScene() {\n    commitProject((current) => {\n      const result = createWorkspaceScene(current);\n      window.queueMicrotask(() => {\n        playerRef.current?.pause();\n        setPlaying(false);\n        setSelectedLayerId("");\n        setSelectedActionId("");\n      });\n      return result.project;\n    });\n  }\n\n  function duplicateActiveWorkspaceScene(sceneId: string) {\n    commitProject((current) => {\n      const result = duplicateWorkspaceScene(current, sceneId);\n      window.queueMicrotask(() => {\n        playerRef.current?.pause();\n        setPlaying(false);\n        setSelectedLayerId(result.layerIds.at(-1) ?? "");\n        setSelectedActionId("");\n      });\n      return result.project;\n    });\n  }\n\n  function deleteWorkspaceScene(sceneId: string) {\n    const target = project.scenes[sceneId];\n    if (!target || Object.keys(project.scenes).length <= 1) return;\n    if (!window.confirm(`Delete scene “${target.name}” and all of its layers?`)) return;\n    commitProject((current) => {\n      const result = removeWorkspaceScene(current, sceneId);\n      window.queueMicrotask(() => {\n        playerRef.current?.pause();\n        setPlaying(false);\n        setSelectedLayerId(result.layerIds.at(-1) ?? "");\n        setSelectedActionId("");\n      });\n      return result.project;\n    });\n  }\n\n  function renameWorkspaceSceneById(sceneId: string, name: string) {\n    commitProject((current) => renameWorkspaceScene(current, sceneId, name));\n  }\n\n  function updateWorkspaceSceneById(sceneId: string, patch: SceneUpdatePatch) {\n    commitProject((current) => updateWorkspaceScene(current, sceneId, patch));\n  }\n\n  function moveWorkspaceSceneById(sceneId: string, position: SceneWorkspacePosition) {\n    commitProject((current) => moveWorkspaceScene(current, sceneId, position));\n  }\n\n  function copyLayerIntoWorkspaceScene(layerId: string, sceneId: string) {\n    commitProject((current) => {\n      const result = copyLayersToScene(current, [layerId], sceneId);\n      window.queueMicrotask(() => {\n        playerRef.current?.pause();\n        setPlaying(false);\n        setSelectedLayerId(result.layerIds.at(-1) ?? "");\n        setSelectedActionId("");\n        setSidebarTab("layers");\n      });\n      return result.project;\n    });\n  }\n\n  function togglePlay() {',
  ],
  [
    '        <CanvasStage\n          project={project}\n          playerRef={playerRef}\n          selectedLayerId={selectedLayerId}\n          zoom={zoom}\n          playing={playing}\n          showSafeArea={showSafeArea}\n          onSelect={selectLayer}\n          onTransformCommit={commitTransform}\n          onTextCommit={commitText}\n          onZoomChange={setZoom}\n          onDuplicateLayer={duplicateLayerById}\n          onDeleteLayer={deleteLayerById}\n        />',
    '        <MultiSceneCanvasStage\n          project={project}\n          playerRef={playerRef}\n          selectedLayerId={selectedLayerId}\n          zoom={zoom}\n          playing={playing}\n          showSafeArea={showSafeArea}\n          onSelect={selectLayer}\n          onTransformCommit={commitTransform}\n          onTextCommit={commitText}\n          onZoomChange={setZoom}\n          onDuplicateLayer={duplicateLayerById}\n          onDeleteLayer={deleteLayerById}\n          onActivateScene={activateWorkspaceScene}\n          onCreateScene={addWorkspaceScene}\n          onDuplicateScene={duplicateActiveWorkspaceScene}\n          onDeleteScene={deleteWorkspaceScene}\n          onRenameScene={renameWorkspaceSceneById}\n          onUpdateScene={updateWorkspaceSceneById}\n          onMoveScene={moveWorkspaceSceneById}\n          onCopyLayerToScene={copyLayerIntoWorkspaceScene}\n        />',
  ],
]);

patch("src/App.tsx", [
  [
    'import { persistProjectBeforeExit } from "./core/saveBeforeExit";',
    'import { persistProjectBeforeExit } from "./core/saveBeforeExit";\nimport { ensureSceneWorkspace } from "./core/sceneWorkspace";',
  ],
  [
    '      setCurrentProject(project);',
    '      const workspaceProject = ensureSceneWorkspace(project);\n      if (workspaceProject !== project) await saveProject(workspaceProject);\n      setCurrentProject(workspaceProject);',
  ],
  [
    '      setCurrentProject(latest.project);',
    '      const workspaceProject = ensureSceneWorkspace(latest.project);\n      if (workspaceProject !== latest.project) await saveProject(workspaceProject);\n      setCurrentProject(workspaceProject);',
  ],
  [
    '    const project = createCatalogTemplateProject(options, templateId);\n    await saveProject(project);',
    '    const project = ensureSceneWorkspace(createCatalogTemplateProject(options, templateId));\n    await saveProject(project);',
  ],
  [
    '    const project = instantiateProject(template.project, template.name);\n    await saveProject(project);',
    '    const project = ensureSceneWorkspace(instantiateProject(template.project, template.name));\n    await saveProject(project);',
  ],
  [
    '        await saveUserTemplate(await migrateProjectAssets(imported.project), templateName);',
    '        await saveUserTemplate(ensureSceneWorkspace(await migrateProjectAssets(imported.project)), templateName);',
  ],
  [
    '      const project = await migrateProjectAssets(instantiateProject(imported.project, imported.project.name));',
    '      const project = ensureSceneWorkspace(await migrateProjectAssets(instantiateProject(imported.project, imported.project.name)));',
  ],
]);

patch("src/main.tsx", [
  [
    'import "./motionLibrary.css";',
    'import "./motionLibrary.css";\nimport "./multiscene.css";',
  ],
]);

patch("package.json", [
  [
    '    "audit:recovery": "node scripts/audit-recovery.mjs",\n    "audit": "npm run audit:templates && npm run audit:effects && npm run audit:loops && npm run audit:text-canvas && npm run audit:shapes && npm run audit:export && npm run audit:foundation-v2 && npm run audit:recovery",',
    '    "audit:recovery": "node scripts/audit-recovery.mjs",\n    "audit:multiscene": "node scripts/audit-multiscene.mjs",\n    "audit": "npm run audit:templates && npm run audit:effects && npm run audit:loops && npm run audit:text-canvas && npm run audit:shapes && npm run audit:export && npm run audit:foundation-v2 && npm run audit:recovery && npm run audit:multiscene",',
  ],
]);

patch(".github/workflows/ci.yml", [
  [
    '      - name: Audit effect renderer\n        shell: bash',
    '      - name: Audit infinite canvas and multi-scene workspace\n        shell: bash\n        run: |\n          set -o pipefail\n          npm run audit:multiscene 2>&1 | tee multiscene-audit.log\n\n      - name: Audit effect renderer\n        shell: bash',
  ],
  [
    '            recovery-audit.log\n            effect-audit.log',
    '            recovery-audit.log\n            multiscene-audit.log\n            effect-audit.log',
  ],
]);

patch("src/editor/MultiSceneCanvasStage.tsx", [
  ['<Icon name="settings" size={15} />', '<Icon name="frame" size={15} />'],
  [
    '      const final = draftPositions[sceneGesture.sceneId] ?? sceneGesture.origin;',
    '      const scale = clamp(zoomRef.current / 100, 0.05, 2.5);\n      const final = {\n        x: sceneGesture.origin.x + (event.clientX - sceneGesture.startX) / scale,\n        y: sceneGesture.origin.y + (event.clientY - sceneGesture.startY) / scale,\n      };',
  ],
]);

console.log("Applied Infinite Canvas + Multi-Scene Workspace V1 integration.");

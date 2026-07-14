const fs = require("node:fs");

function patch(path, replacements) {
  let source = fs.readFileSync(path, "utf8");
  for (const [from, to, label] of replacements) {
    if (to && source.includes(to)) continue;
    if (!source.includes(from)) throw new Error(`Missing clipping-mask anchor in ${path}: ${label}`);
    source = source.replace(from, to);
  }
  fs.writeFileSync(path, source);
}

patch("src/types.ts", [[
  'export interface MaskDefinition {\n  type: "vector" | "alpha";\n  sourceLayerId: string;\n  inverted?: boolean;\n}',
  'export interface MaskDefinition {\n  type: "vector" | "alpha";\n  sourceLayerId: string;\n  inverted?: boolean;\n  clipping?: boolean;\n}',
  "clipping mask model flag",
]]);

patch("src/core/designTools.ts", [[
  'export function clearMask(project: KurogiProject, targetLayerId: string): KurogiProject {\n  const target = project.layers[targetLayerId];\n  if (!target?.mask) return project;\n  const next = cloneProject(project);\n  const sourceId = next.layers[targetLayerId].mask?.sourceLayerId;\n  next.layers[targetLayerId].mask = undefined;\n  if (sourceId) releaseMaskSource(next, sourceId, targetLayerId);\n  return touchProject(next);\n}\n',
  'export function clearMask(project: KurogiProject, targetLayerId: string): KurogiProject {\n  const target = project.layers[targetLayerId];\n  if (!target?.mask) return project;\n  const next = cloneProject(project);\n  const sourceId = next.layers[targetLayerId].mask?.sourceLayerId;\n  next.layers[targetLayerId].mask = undefined;\n  if (sourceId) releaseMaskSource(next, sourceId, targetLayerId);\n  return touchProject(next);\n}\n\nexport function canCreateClippingMask(project: KurogiProject, targetLayerId: string): boolean {\n  const target = project.layers[targetLayerId];\n  const scene = target ? project.scenes[target.sceneId] : undefined;\n  if (!target || !scene || target.parentId) return false;\n  const index = scene.layerIds.indexOf(target.id);\n  if (index <= 0) return false;\n  const source = project.layers[scene.layerIds[index - 1]];\n  return Boolean(source && !source.parentId && source.id !== target.id);\n}\n\nexport function createClippingMask(\n  project: KurogiProject,\n  targetLayerId: string,\n): { project: KurogiProject; sourceLayerId: string | null } {\n  if (!canCreateClippingMask(project, targetLayerId)) return { project, sourceLayerId: null };\n  const target = project.layers[targetLayerId];\n  const scene = project.scenes[target.sceneId];\n  const sourceLayerId = scene.layerIds[scene.layerIds.indexOf(targetLayerId) - 1];\n  const next = cloneProject(project);\n  const previous = next.layers[targetLayerId].mask;\n  if (previous?.sourceLayerId && !previous.clipping) releaseMaskSource(next, previous.sourceLayerId, targetLayerId);\n  next.layers[targetLayerId].mask = { type: "alpha", sourceLayerId, inverted: false, clipping: true };\n  return { project: touchProject(next), sourceLayerId };\n}\n\nexport function releaseClippingMask(project: KurogiProject, targetLayerId: string): KurogiProject {\n  if (!project.layers[targetLayerId]?.mask?.clipping) return project;\n  return clearMask(project, targetLayerId);\n}\n',
  "clipping mask commands",
]]);

patch("src/core/project.ts", [
  [
    '  for (const candidate of Object.values(next.layers)) {\n    if (candidate.parentId === layerId) candidate.parentId = undefined;\n    if (candidate.type === "group") candidate.childIds = candidate.childIds.filter((id) => id !== layerId);\n  }\n  return touchProject(next);',
    '  for (const candidate of Object.values(next.layers)) {\n    if (candidate.parentId === layerId) candidate.parentId = undefined;\n    if (candidate.type === "group") candidate.childIds = candidate.childIds.filter((id) => id !== layerId);\n    if (candidate.mask?.sourceLayerId === layerId) candidate.mask = undefined;\n  }\n  for (const candidate of Object.values(next.layers)) candidate.maskSource = false;\n  for (const candidate of Object.values(next.layers)) {\n    const sourceId = candidate.mask?.sourceLayerId;\n    if (sourceId && !candidate.mask?.clipping && next.layers[sourceId]) next.layers[sourceId].maskSource = true;\n  }\n  return touchProject(next);',
    "release masks when deleting source layers",
  ],
  [
    '    layer.maskSource = Boolean(layer.maskSource);\n    if (layer.mask && !next.layers[layer.mask.sourceLayerId]) layer.mask = undefined;',
    '    layer.maskSource = false;\n    if (layer.mask && !next.layers[layer.mask.sourceLayerId]) layer.mask = undefined;\n    if (layer.mask) layer.mask.clipping = Boolean(layer.mask.clipping);',
    "sanitize clipping mask metadata",
  ],
  [
    '    if (layer.type === "shape") {\n      layer.shape = normalizeShapeType(layer.shape);\n    }\n  }\n  for (const [clipId, clip] of Object.entries(next.audioClips)) {',
    '    if (layer.type === "shape") {\n      layer.shape = normalizeShapeType(layer.shape);\n    }\n  }\n  for (const target of Object.values(next.layers)) {\n    const sourceId = target.mask?.sourceLayerId;\n    if (sourceId && !target.mask?.clipping && next.layers[sourceId]) next.layers[sourceId].maskSource = true;\n  }\n  for (const [clipId, clip] of Object.entries(next.audioClips)) {',
    "rebuild manual mask source flags",
  ],
]);

patch("src/renderer/designStyles.ts", [[
  '  if (!layer.mask) return {};',
  '  if (!layer.mask || layer.mask.clipping) return {};',
  "keep clipping masks out of local manual mask styling",
]]);

patch("src/MotionComposition.tsx", [
  [
    'import { gradientToCss, layerCompositingStyle, projectFontFaceCss, textPaintStyle } from "./renderer/designStyles";',
    'import { gradientToCss, layerCompositingStyle, projectFontFaceCss, textPaintStyle } from "./renderer/designStyles";\nimport { clippingMaskSceneStyle } from "./renderer/clippingMask";',
    "clipping renderer import",
  ],
  [
    '  onActionCommit?: (layerId: string, actionId: string, motionPath: MotionPathDefinition) => void;\n  editable?: boolean;',
    '  onActionCommit?: (layerId: string, actionId: string, motionPath: MotionPathDefinition) => void;\n  onLayerContextMenu?: (layerId: string, clientX: number, clientY: number) => void;\n  editable?: boolean;',
    "context menu callback prop",
  ],
  [
    '  onTextCommit,\n  onActionCommit,\n  editable = false,',
    '  onTextCommit,\n  onActionCommit,\n  onLayerContextMenu,\n  editable = false,',
    "context menu callback destructuring",
  ],
  [
    '  ) {\n    if (!editable || layer.locked || textEdit) return;\n    const point = projectPoint(event);',
    '  ) {\n    if (event.button !== 0) return;\n    if (!editable || layer.locked || textEdit) return;\n    const point = projectPoint(event);',
    "right click must not start drag gesture",
  ],
  [
    '          transformStyle: "preserve-3d",\n          ...layerCompositingStyle(project, layer),\n        };\n        const animatedFilter = [',
    '          transformStyle: "preserve-3d",\n          pointerEvents: layer.mask?.clipping ? "auto" : undefined,\n          ...layerCompositingStyle(project, layer),\n        };\n        const clippingStyle = clippingMaskSceneStyle(project, layer, scene, time);\n        const animatedFilter = [',
    "scene clipping style",
  ],
  [
    '        return (\n          <div\n            key={layer.id}\n            style={wrapperStyle}',
    '        return (\n          <ClippedLayerFrame key={layer.id} maskStyle={clippingStyle}>\n          <div\n            style={wrapperStyle}',
    "wrap clipped layers in scene mask",
  ],
  [
    '            onDoubleClick={\n              layer.type === "text"',
    '            onContextMenu={editable ? (event) => {\n              event.preventDefault();\n              event.stopPropagation();\n              onSelect?.(layer.id, false);\n              onLayerContextMenu?.(layer.id, event.clientX, event.clientY);\n            } : undefined}\n            onDoubleClick={\n              layer.type === "text"',
    "layer context menu event",
  ],
  [
    '          </div>\n        );\n      })}',
    '          </div>\n          </ClippedLayerFrame>\n        );\n      })}',
    "close clipping frame",
  ],
  [
    '};\n\nfunction AudioTracks({ project }: { project: KurogiProject }) {',
    '};\n\nfunction ClippedLayerFrame({ maskStyle, children }: { maskStyle?: React.CSSProperties; children: React.ReactNode }) {\n  if (!maskStyle) return <>{children}</>;\n  return <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", ...maskStyle }}>{children}</div>;\n}\n\nfunction AudioTracks({ project }: { project: KurogiProject }) {',
    "clipped layer frame component",
  ],
]);

patch("src/editor/MultiSceneCanvasStage.tsx", [
  [
    '  onActionCommit: (layerId: string, actionId: string, motionPath: MotionPathDefinition) => void;\n  onZoomChange?: (zoom: number) => void;\n  onReplaceAsset?: (layerId: string, file: File) => void;\n  onDuplicateLayer?: (layerId: string) => void;\n  onDeleteLayer?: (layerId: string) => void;',
    '  onActionCommit: (layerId: string, actionId: string, motionPath: MotionPathDefinition) => void;\n  onLayerContextMenu: (layerId: string, clientX: number, clientY: number) => void;\n  onZoomChange?: (zoom: number) => void;',
    "stage context menu prop",
  ],
  [
    '  onTextCommit,\n  onActionCommit,\n  onZoomChange,\n  onReplaceAsset,\n  onDuplicateLayer,\n  onDeleteLayer,',
    '  onTextCommit,\n  onActionCommit,\n  onLayerContextMenu,\n  onZoomChange,',
    "stage prop destructuring",
  ],
  [
    '  const selectedLayer = selectedLayerId ? project.layers[selectedLayerId] ?? null : null;\n  const stageRef = useRef<HTMLElement>(null);\n  const viewportRef = useRef<HTMLDivElement>(null);\n  const replaceInputRef = useRef<HTMLInputElement>(null);',
    '  const stageRef = useRef<HTMLElement>(null);\n  const viewportRef = useRef<HTMLDivElement>(null);',
    "remove obsolete asset menu refs",
  ],
  [
    '  const callbacksRef = useRef({ onSelect, onTransformCommit, onTextCommit, onActionCommit });',
    '  const callbacksRef = useRef({ onSelect, onTransformCommit, onTextCommit, onActionCommit, onLayerContextMenu });',
    "stage callback ref",
  ],
  [
    '  callbacksRef.current = { onSelect, onTransformCommit, onTextCommit, onActionCommit };',
    '  callbacksRef.current = { onSelect, onTransformCommit, onTextCommit, onActionCommit, onLayerContextMenu };',
    "update stage callback ref",
  ],
  [
    '  const [settingsOpen, setSettingsOpen] = useState(false);\n  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);',
    '  const [settingsOpen, setSettingsOpen] = useState(false);',
    "remove obsolete stage menu state",
  ],
  [
    '      event.preventDefault();\n      setContextMenu(null);\n      if (event.ctrlKey || event.metaKey) {',
    '      event.preventDefault();\n      if (event.ctrlKey || event.metaKey) {',
    "wheel no longer manages context menu",
  ],
  [
    '  const stableActionCommit = useCallback(\n    (layerId: string, actionId: string, motionPath: MotionPathDefinition) => callbacksRef.current.onActionCommit(layerId, actionId, motionPath),\n    [],\n  );\n',
    '  const stableActionCommit = useCallback(\n    (layerId: string, actionId: string, motionPath: MotionPathDefinition) => callbacksRef.current.onActionCommit(layerId, actionId, motionPath),\n    [],\n  );\n  const stableLayerContextMenu = useCallback(\n    (layerId: string, clientX: number, clientY: number) => callbacksRef.current.onLayerContextMenu(layerId, clientX, clientY),\n    [],\n  );\n',
    "stable layer context callback",
  ],
  [
    '      onActionCommit: stableActionCommit,\n      editable: true,',
    '      onActionCommit: stableActionCommit,\n      onLayerContextMenu: stableLayerContextMenu,\n      editable: true,',
    "pass context callback into composition",
  ],
  [
    '    [project, selectedActionId, selectedLayerId, selectedLayerIds, showSafeArea, stableActionCommit, stableSelect, stableTextCommit, stableTransformCommit],',
    '    [project, selectedActionId, selectedLayerId, selectedLayerIds, showSafeArea, stableActionCommit, stableLayerContextMenu, stableSelect, stableTextCommit, stableTransformCommit],',
    "context callback memo dependency",
  ],
  [
    '  const viewScale = clamp(viewZoom / 100, 0.05, 2.5);\n  const imageLayer = selectedLayer?.type === "image" ? selectedLayer : null;',
    '  const viewScale = clamp(viewZoom / 100, 0.05, 2.5);',
    "remove obsolete selected image menu state",
  ],
  [
    '    setPanning(true);\n    setContextMenu(null);',
    '    setPanning(true);',
    "pan no longer manages context menu",
  ],
  [
    '  function openContextMenu(event: React.MouseEvent<HTMLElement>) {\n    if (!selectedLayer || (selectedLayer.type !== "image" && selectedLayer.type !== "svg")) return;\n    event.preventDefault();\n    const rect = stageRef.current?.getBoundingClientRect();\n    if (!rect) return;\n    setContextMenu({\n      x: Math.max(8, Math.min(rect.width - 220, event.clientX - rect.left)),\n      y: Math.max(56, Math.min(rect.height - 250, event.clientY - rect.top)),\n    });\n  }\n\n',
    '',
    "remove old asset-only context menu opener",
  ],
  [
    '      onPointerCancel={finishPointer}\n      onContextMenu={openContextMenu}\n      onAuxClick={(event) => event.preventDefault()}\n      onMouseDown={() => contextMenu && setContextMenu(null)}',
    '      onPointerCancel={finishPointer}\n      onContextMenu={(event) => event.preventDefault()}\n      onAuxClick={(event) => event.preventDefault()}',
    "stage native context suppression",
  ],
  [
    '      <input\n        ref={replaceInputRef}\n        hidden\n        type="file"\n        accept="image/png,image/jpeg,image/webp,image/svg+xml"\n        onChange={(event) => {\n          const file = event.currentTarget.files?.[0];\n          if (file && selectedLayerId) onReplaceAsset?.(selectedLayerId, file);\n          event.currentTarget.value = "";\n          setContextMenu(null);\n        }}\n      />\n\n',
    '',
    "remove dead replace asset input",
  ],
  [
    '      {contextMenu ? (\n        <div className="asset-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={(event) => event.stopPropagation()}>\n          <strong>{selectedLayer?.name}</strong>\n          <button type="button" onClick={() => replaceInputRef.current?.click()}><Icon name="upload" size={15} />Replace asset</button>\n          {imageLayer ? (\n            <>\n              <button type="button" onClick={() => { onTransformCommit(imageLayer.id, { fit: "cover" } as Partial<Layer>); setContextMenu(null); }}><Icon name="frame" size={15} />Crop to fill</button>\n              <button type="button" onClick={() => { onTransformCommit(imageLayer.id, { fit: "contain" } as Partial<Layer>); setContextMenu(null); }}><Icon name="assets" size={15} />Fit inside</button>\n              <button type="button" onClick={() => { onTransformCommit(imageLayer.id, { fit: "fill" } as Partial<Layer>); setContextMenu(null); }}><Icon name="shapes" size={15} />Stretch to frame</button>\n            </>\n          ) : null}\n          <span />\n          <button type="button" onClick={() => { onDuplicateLayer?.(selectedLayerId); setContextMenu(null); }}><Icon name="copy" size={15} />Duplicate</button>\n          <button type="button" className="danger-text" onClick={() => { onDeleteLayer?.(selectedLayerId); setContextMenu(null); }}><Icon name="trash" size={15} />Delete</button>\n        </div>\n      ) : null}\n',
    '',
    "remove old asset-only context menu markup",
  ],
]);

patch("src/app/Editor.tsx", [
  [
    '  alignLayers,\n  applyMask,\n  clearMask,',
    '  alignLayers,\n  applyMask,\n  canCreateClippingMask,\n  clearMask,\n  createClippingMask,',
    "clipping command imports",
  ],
  [
    '  distributeLayers,\n  groupLayers,',
    '  distributeLayers,\n  groupLayers,\n  releaseClippingMask,',
    "release clipping command import",
  ],
  [
    'import { McpIntegrationDialog } from "../editor/McpIntegrationDialog";',
    'import { McpIntegrationDialog } from "../editor/McpIntegrationDialog";\nimport { LayerContextMenu, type LayerContextMenuState } from "../editor/LayerContextMenu";',
    "layer context menu import",
  ],
  [
    '  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);',
    '  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);\n  const [layerContextMenu, setLayerContextMenu] = useState<LayerContextMenuState | null>(null);',
    "layer context menu state",
  ],
  [
    '  const selectedLayers = useMemo(() => selectedLayerIds.map((id) => project.layers[id]).filter((layer): layer is Layer => Boolean(layer)), [project.layers, selectedLayerIds]);',
    '  const selectedLayers = useMemo(() => selectedLayerIds.map((id) => project.layers[id]).filter((layer): layer is Layer => Boolean(layer)), [project.layers, selectedLayerIds]);\n  const clippingSourceIds = useMemo(() => new Set(Object.values(project.layers).filter((layer) => layer.mask?.clipping).map((layer) => layer.mask!.sourceLayerId)), [project.layers]);',
    "clipping source indicators",
  ],
  [
    '  function clearSelectionMask() { if (selectedLayerId) commitProject((current) => clearMask(current, selectedLayerId)); }\n  function toggleSmartSnap() {',
    '  function clearSelectionMask() { if (selectedLayerId) commitProject((current) => clearMask(current, selectedLayerId)); }\n  function createLayerClippingMask(layerId: string) {\n    if (!canCreateClippingMask(project, layerId)) return;\n    commitProject((current) => createClippingMask(current, layerId).project);\n    selectOnly(layerId);\n  }\n  function releaseLayerClippingMask(layerId: string) {\n    commitProject((current) => releaseClippingMask(current, layerId));\n    selectOnly(layerId);\n  }\n  function openLayerContextMenu(layerId: string, clientX: number, clientY: number) {\n    selectOnly(layerId);\n    setLayerContextMenu({ layerId, x: clientX, y: clientY });\n  }\n  function toggleSmartSnap() {',
    "editor clipping mask actions",
  ],
  [
    '  function bringSelectedForward() {\n    if (selectedLayerId) commitProject((current) => reorderLayer(current, selectedLayerId, "up"));\n  }\n\n  function sendSelectedBackward() {\n    if (selectedLayerId) commitProject((current) => reorderLayer(current, selectedLayerId, "down"));\n  }',
    '  function bringLayerForwardById(layerId: string) { if (layerId) commitProject((current) => reorderLayer(current, layerId, "up")); }\n  function sendLayerBackwardById(layerId: string) { if (layerId) commitProject((current) => reorderLayer(current, layerId, "down")); }\n  function bringSelectedForward() { bringLayerForwardById(selectedLayerId); }\n  function sendSelectedBackward() { sendLayerBackwardById(selectedLayerId); }',
    "context-aware layer ordering",
  ],
  [
    '  function toggleSelectedVisibility() {\n    if (!selectedLayerIds.length) return;',
    '  function toggleLayerVisibilityById(layerId: string) { if (layerId) commitLayer(layerId, (layer) => ({ ...layer, visible: !layer.visible })); }\n  function toggleLayerLockById(layerId: string) { if (layerId) commitLayer(layerId, (layer) => ({ ...layer, locked: !layer.locked })); }\n\n  function toggleSelectedVisibility() {\n    if (!selectedLayerIds.length) return;',
    "context-aware visibility and lock",
  ],
  [
    '      <McpIntegrationDialog open={mcpDialogOpen} onClose={() => setMcpDialogOpen(false)} />',
    '      <McpIntegrationDialog open={mcpDialogOpen} onClose={() => setMcpDialogOpen(false)} />\n      <LayerContextMenu\n        project={project}\n        state={layerContextMenu}\n        onClose={() => setLayerContextMenu(null)}\n        onCreateClippingMask={createLayerClippingMask}\n        onReleaseClippingMask={releaseLayerClippingMask}\n        onDuplicate={duplicateLayerById}\n        onDelete={deleteLayerById}\n        onBringForward={bringLayerForwardById}\n        onSendBackward={sendLayerBackwardById}\n        onToggleVisibility={toggleLayerVisibilityById}\n        onToggleLock={toggleLayerLockById}\n        onSetImageFit={(layerId, fit) => commitLayer(layerId, (layer) => layer.type === "image" ? { ...layer, fit } : layer)}\n      />',
    "mount portal context menu",
  ],
  [
    '                    className={`layer-row ${selectedLayerIds.includes(layer.id) ? "selected" : ""} ${layer.maskSource ? "is-mask-source" : ""} ${draggedLayerId === layer.id ? "is-dragging" : ""} ${dragOverLayerId === layer.id ? "drag-over" : ""}`}\n                    onClick={(event) => selectLayer(layer.id, event.shiftKey)}',
    '                    className={`layer-row ${selectedLayerIds.includes(layer.id) ? "selected" : ""} ${layer.maskSource ? "is-mask-source" : ""} ${layer.mask?.clipping ? "is-clipped" : ""} ${clippingSourceIds.has(layer.id) ? "is-clipping-source" : ""} ${draggedLayerId === layer.id ? "is-dragging" : ""} ${dragOverLayerId === layer.id ? "drag-over" : ""}`}\n                    onClick={(event) => selectLayer(layer.id, event.shiftKey)}\n                    onContextMenu={(event) => { event.preventDefault(); openLayerContextMenu(layer.id, event.clientX, event.clientY); }}',
    "sidebar context menu and indicators",
  ],
  [
    '          onActionCommit={commitMotionPath}\n          onZoomChange={setZoom}\n          onDuplicateLayer={duplicateLayerById}\n          onDeleteLayer={deleteLayerById}',
    '          onActionCommit={commitMotionPath}\n          onLayerContextMenu={openLayerContextMenu}\n          onZoomChange={setZoom}',
    "canvas context menu wiring",
  ],
]);

patch("src/main.tsx", [[
  'import "./uiCleanup.css";',
  'import "./uiCleanup.css";\nimport "./layerContextMenu.css";',
  "context menu stylesheet import",
]]);

patch("package.json", [
  [
    '    "audit:design-tools": "node scripts/audit-design-tools.mjs",',
    '    "audit:design-tools": "node scripts/audit-design-tools.mjs",\n    "audit:clipping-mask": "node scripts/audit-clipping-mask.mjs",',
    "clipping mask audit script",
  ],
  [
    'npm run audit:multiscene && npm run audit:design-tools && npm run audit:animation-workflow',
    'npm run audit:multiscene && npm run audit:design-tools && npm run audit:clipping-mask && npm run audit:animation-workflow',
    "clipping mask in aggregate audit",
  ],
]);

patch(".github/workflows/ci.yml", [
  [
    '      - name: Audit animation workflow\n        shell: bash',
    '      - name: Audit clipping masks and layer context menu\n        shell: bash\n        run: |\n          set -o pipefail\n          npm run audit:clipping-mask 2>&1 | tee clipping-mask-audit.log\n\n      - name: Audit animation workflow\n        shell: bash',
    "CI clipping mask audit step",
  ],
  [
    '            design-tools-audit.log\n            animation-workflow-audit.log',
    '            design-tools-audit.log\n            clipping-mask-audit.log\n            animation-workflow-audit.log',
    "CI clipping mask diagnostics",
  ],
]);

console.log("Clipping mask and layer context menu feature applied.");

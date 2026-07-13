const fs = require("node:fs");

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, value) { fs.writeFileSync(path, value); }
function replace(path, before, after) {
  let source = read(path);
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing patch target in ${path}: ${before.slice(0, 100)}`);
  source = source.replace(before, after);
  write(path, source);
}
function replaceAll(path, before, after) {
  let source = read(path);
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing patch target in ${path}: ${before.slice(0, 100)}`);
  source = source.split(before).join(after);
  write(path, source);
}

replace("src/core/project.ts",
  'export function createAssetLayer(scene: Scene, asset: ProjectAsset): ImageLayer | SvgLayer {\n  const size = fitInside(scene, asset.width ?? 600, asset.height ?? 400, 0.55);',
  'export function createAssetLayer(scene: Scene, asset: ProjectAsset): ImageLayer | SvgLayer {\n  if (asset.type === "font") throw new Error("Font assets cannot be placed as visual layers.");\n  const size = fitInside(scene, asset.width ?? 600, asset.height ?? 400, 0.55);');
replaceAll("src/core/project.ts",
  '    anchor: { x: 0.5, y: 0.5 },\n    animationActions: [],',
  '    anchor: { x: 0.5, y: 0.5 },\n    blendMode: "normal",\n    backgroundBlur: 0,\n    animationActions: [],');
replace("src/core/project.ts",
  '    layer.size.height = Math.max(1, layer.size.height);\n    layer.animationActions = (layer.animationActions ?? []).map((action) => ({',
  '    layer.size.height = Math.max(1, layer.size.height);\n    layer.blendMode = normalizeBlendMode(layer.blendMode);\n    layer.backgroundBlur = clampNumber(layer.backgroundBlur ?? 0, 0, 80);\n    layer.maskSource = Boolean(layer.maskSource);\n    if (layer.mask && !next.layers[layer.mask.sourceLayerId]) layer.mask = undefined;\n    layer.animationActions = (layer.animationActions ?? []).map((action) => ({');
replace("src/core/project.ts",
  'function normalizeFps(value: number): number {',
  'function normalizeBlendMode(value: Layer["blendMode"]): NonNullable<Layer["blendMode"]> {\n  const supported = new Set(["normal","multiply","screen","overlay","darken","lighten","color-dodge","color-burn","hard-light","soft-light","difference","exclusion","hue","saturation","color","luminosity"]);\n  return value && supported.has(value) ? value : "normal";\n}\n\nfunction normalizeFps(value: number): number {');

replace("src/MotionComposition.tsx",
  'import { textVerticalJustification } from "./core/textLayout";',
  'import { textVerticalJustification } from "./core/textLayout";\nimport { snapLayerPosition, type AlignmentGuide } from "./core/designTools";');
replace("src/MotionComposition.tsx",
  'import { LayerEffects } from "./renderer/LayerEffects";',
  'import { LayerEffects } from "./renderer/LayerEffects";\nimport { StaticLayerTree } from "./renderer/StaticLayerTree";\nimport { gradientToCss, layerCompositingStyle, projectFontFaceCss, textPaintStyle } from "./renderer/designStyles";');
replace("src/MotionComposition.tsx",
  '  selectedId?: string;\n  onSelect?: (id: string) => void;',
  '  selectedId?: string;\n  selectedIds?: string[];\n  onSelect?: (id: string, additive?: boolean) => void;');
replace("src/MotionComposition.tsx",
  '  selectedId,\n  onSelect,',
  '  selectedId,\n  selectedIds,\n  onSelect,');
replace("src/MotionComposition.tsx",
  '  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);',
  '  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);\n  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);');
replaceAll("src/MotionComposition.tsx", 'onSelect?.(layer.id);', 'onSelect?.(layer.id, event.shiftKey);');
replace("src/MotionComposition.tsx",
  '    if (gesture.mode === "move") {\n      next.position = {\n        x: clamp(point.x - (gesture.offset?.x ?? 0), -next.size.width, scene.width),\n        y: clamp(point.y - (gesture.offset?.y ?? 0), -next.size.height, scene.height),\n      };\n    } else if (gesture.mode === "resize") {',
  '    if (gesture.mode === "move") {\n      const candidate = {\n        x: clamp(point.x - (gesture.offset?.x ?? 0), -next.size.width, scene.width),\n        y: clamp(point.y - (gesture.offset?.y ?? 0), -next.size.height, scene.height),\n      };\n      if (project.settings.snapEnabled && !event.altKey) {\n        const snapped = snapLayerPosition(next, candidate, scene, layers);\n        next.position = snapped.position;\n        setAlignmentGuides(snapped.guides);\n      } else {\n        next.position = candidate;\n        setAlignmentGuides([]);\n      }\n    } else if (gesture.mode === "resize") {\n      setAlignmentGuides([]);');
replace("src/MotionComposition.tsx",
  '    gestureRef.current = null;\n    const finalLayer = draftLayerRef.current;',
  '    gestureRef.current = null;\n    setAlignmentGuides([]);\n    const finalLayer = draftLayerRef.current;');
replace("src/MotionComposition.tsx",
  '        if (event.target === event.currentTarget) onSelect?.("");',
  '        if (event.target === event.currentTarget) onSelect?.("", false);');
replace("src/MotionComposition.tsx",
  '      {editable && scene.background.type === "transparent" ? <TransparencyGrid /> : null}',
  '      <style>{projectFontFaceCss(project)}</style>\n      {editable && scene.background.type === "transparent" ? <TransparencyGrid /> : null}');
replace("src/MotionComposition.tsx",
  '        if (!layer.visible || layer.type === "group") return null;',
  '        if (!layer.visible || layer.maskSource || layer.parentId) return null;');
replace("src/MotionComposition.tsx",
  '        const selected = editable && showSelection && selectedId === layer.id;',
  '        const selected = editable && showSelection && (selectedIds?.includes(layer.id) ?? selectedId === layer.id);');
replace("src/MotionComposition.tsx",
  '          transformStyle: "preserve-3d",\n        };',
  '          transformStyle: "preserve-3d",\n          ...layerCompositingStyle(project, layer),\n        };');
replace("src/MotionComposition.tsx",
  '                {layer.type === "text" ? (',
  '                {layer.type === "group" ? (\n                  layer.childIds.map((childId) => {\n                    const child = project.layers[childId];\n                    return child ? <StaticLayerTree key={childId} project={project} layer={child} scene={scene} time={time} parentSize={layer.size} /> : null;\n                  })\n                ) : layer.type === "text" ? (');
replace("src/MotionComposition.tsx",
  '            {selected && !isEditing && !layer.locked ? (',
  '            {selected && selectedId === layer.id && !isEditing && !layer.locked ? (');
replace("src/MotionComposition.tsx",
  '      })}\n    </div>',
  '      })}\n      {alignmentGuides.map((guide, index) => (\n        <div key={`${guide.axis}-${guide.position}-${index}`} className={`alignment-guide alignment-guide-${guide.axis}`} style={guide.axis === "x" ? { left: `${(guide.position / scene.width) * 100}%` } : { top: `${(guide.position / scene.height) * 100}%` }} />\n      ))}\n    </div>');
replace("src/MotionComposition.tsx",
  '    color: layer.style.color,\n    WebkitTextFillColor: layer.style.color,\n    boxSizing: "border-box",',
  '    ...textPaintStyle(layer),\n    boxSizing: "border-box",');
replace("src/MotionComposition.tsx",
  '        background: layer.style.fill,',
  '        background: gradientToCss(layer.style.gradient) ?? layer.style.fill,');
replace("src/MotionComposition.tsx",
  '      <div style={{ position: "absolute", inset: 0, background: layer.style.fill, ...maskStyle }} />',
  '      <div style={{ position: "absolute", inset: 0, background: gradientToCss(layer.style.gradient) ?? layer.style.fill, ...maskStyle }} />');

replace("src/editor/MultiSceneCanvasStage.tsx",
  '  selectedLayerId: string;\n  zoom: number;',
  '  selectedLayerId: string;\n  selectedLayerIds: string[];\n  zoom: number;');
replace("src/editor/MultiSceneCanvasStage.tsx",
  '  onSelect: (id: string) => void;',
  '  onSelect: (id: string, additive?: boolean) => void;');
replace("src/editor/MultiSceneCanvasStage.tsx",
  '  selectedLayerId,\n  zoom,',
  '  selectedLayerId,\n  selectedLayerIds,\n  zoom,');
replace("src/editor/MultiSceneCanvasStage.tsx",
  '  const stableSelect = useCallback((id: string) => callbacksRef.current.onSelect(id), []);',
  '  const stableSelect = useCallback((id: string, additive = false) => callbacksRef.current.onSelect(id, additive), []);');
replace("src/editor/MultiSceneCanvasStage.tsx",
  '      selectedId: selectedLayerId,\n      onSelect: stableSelect,',
  '      selectedId: selectedLayerId,\n      selectedIds: selectedLayerIds,\n      onSelect: stableSelect,');
replace("src/editor/MultiSceneCanvasStage.tsx",
  '    [project, selectedLayerId, showSafeArea, stableSelect, stableTextCommit, stableTransformCommit],',
  '    [project, selectedLayerId, selectedLayerIds, showSafeArea, stableSelect, stableTextCommit, stableTransformCommit],');

replace("src/app/Editor.tsx",
  'import { useProjectHistory } from "../core/useProjectHistory";',
  'import {\n  alignLayers,\n  applyMask,\n  clearMask,\n  distributeLayers,\n  groupLayers,\n  setBackgroundBlur,\n  setBlendMode,\n  setFontFamily,\n  setGradient,\n  ungroupLayer,\n  type AlignMode,\n  type DistributeMode,\n} from "../core/designTools";\nimport { useProjectHistory } from "../core/useProjectHistory";');
replace("src/app/Editor.tsx",
  'import { MultiSceneCanvasStage } from "../editor/MultiSceneCanvasStage";',
  'import { MultiSceneCanvasStage } from "../editor/MultiSceneCanvasStage";\nimport { DesignToolsPanel } from "../editor/DesignToolsPanel";');
replace("src/app/Editor.tsx",
  '  KurogiProject,\n  Layer,',
  '  GradientFill,\n  KurogiProject,\n  Layer,');
replace("src/app/Editor.tsx",
  '  const [selectedLayerId, setSelectedLayerId] = useState(scene.layerIds.at(-1) ?? "");',
  '  const [selectedLayerId, setPrimaryLayerId] = useState(scene.layerIds.at(-1) ?? "");\n  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>(() => selectedLayerId ? [selectedLayerId] : []);');
replace("src/app/Editor.tsx",
  '  const selectedLayer = selectedLayerId ? project.layers[selectedLayerId] ?? null : null;',
  '  const selectedLayer = selectedLayerId ? project.layers[selectedLayerId] ?? null : null;\n  const selectedLayers = useMemo(() => selectedLayerIds.map((id) => project.layers[id]).filter((layer): layer is Layer => Boolean(layer)), [project.layers, selectedLayerIds]);');
replace("src/app/Editor.tsx",
  '  function selectLayer(layerId: string) {\n    setSelectedLayerId(layerId);\n    if (!layerId || project.layers[layerId]?.animationActions.every((action) => action.id !== selectedActionId)) {\n      setSelectedActionId("");\n    }\n  }',
  '  function selectOnly(layerId: string) {\n    setPrimaryLayerId(layerId);\n    setSelectedLayerIds(layerId ? [layerId] : []);\n  }\n\n  function selectLayer(layerId: string, additive = false) {\n    if (!layerId) {\n      selectOnly("");\n      setSelectedActionId("");\n      return;\n    }\n    if (additive) {\n      setSelectedLayerIds((current) => {\n        const next = current.includes(layerId) ? current.filter((id) => id !== layerId) : [...current, layerId];\n        setPrimaryLayerId(next.at(-1) ?? "");\n        return next;\n      });\n    } else selectOnly(layerId);\n    if (project.layers[layerId]?.animationActions.every((action) => action.id !== selectedActionId)) setSelectedActionId("");\n  }');
let editor = read("src/app/Editor.tsx");
editor = editor.split("setSelectedLayerId(").join("selectOnly(");
write("src/app/Editor.tsx", editor);
replace("src/app/Editor.tsx",
  '      if (!editable && (event.key === "Delete" || event.key === "Backspace")) {',
  '      if (!editable && modifier && event.key.toLowerCase() === "g") {\n        event.preventDefault();\n        if (event.shiftKey) ungroupSelected();\n        else groupSelected();\n      }\n      if (!editable && (event.key === "Delete" || event.key === "Backspace")) {');
replace("src/app/Editor.tsx",
  '  function deleteSelectedLayer() {\n    deleteLayerById(selectedLayerId);\n  }',
  '  function deleteSelectedLayer() {\n    if (selectedLayerIds.length <= 1) { deleteLayerById(selectedLayerId); return; }\n    const ids = [...selectedLayerIds];\n    commitProject((current) => ids.reduce((next, id) => removeLayer(next, id), current));\n    selectOnly("");\n    setSelectedActionId("");\n  }');
replace("src/app/Editor.tsx",
  '  function togglePlay() {',
  '  function alignSelection(mode: AlignMode) { commitProject((current) => alignLayers(current, selectedLayerIds, mode)); }\n  function distributeSelection(mode: DistributeMode) { commitProject((current) => distributeLayers(current, selectedLayerIds, mode)); }\n  function groupSelected() {\n    commitProject((current) => {\n      const result = groupLayers(current, selectedLayerIds);\n      if (result.groupId) window.queueMicrotask(() => selectOnly(result.groupId ?? ""));\n      return result.project;\n    });\n  }\n  function ungroupSelected() {\n    if (selectedLayer?.type !== "group") return;\n    commitProject((current) => {\n      const result = ungroupLayer(current, selectedLayer.id);\n      window.queueMicrotask(() => {\n        setSelectedLayerIds(result.layerIds);\n        setPrimaryLayerId(result.layerIds.at(-1) ?? "");\n      });\n      return result.project;\n    });\n  }\n  function applySelectionGradient(gradient?: GradientFill) { commitProject((current) => setGradient(current, selectedLayerIds, gradient)); }\n  function applySelectionMask(type: "vector" | "alpha") {\n    if (selectedLayerIds.length !== 2) return;\n    const sourceId = selectedLayerIds[0];\n    const targetId = selectedLayerIds[1];\n    commitProject((current) => applyMask(current, targetId, sourceId, type));\n    window.queueMicrotask(() => selectOnly(targetId));\n  }\n  function clearSelectionMask() { if (selectedLayerId) commitProject((current) => clearMask(current, selectedLayerId)); }\n  function toggleSmartSnap() {\n    commitProject((current) => touchProject({ ...cloneProject(current), settings: { ...current.settings, snapEnabled: !current.settings.snapEnabled } }));\n  }\n  async function importFont(file: File) {\n    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";\n    if (!["woff", "woff2", "ttf", "otf"].includes(extension) || file.size > 12 * 1024 * 1024) {\n      window.alert("Use a WOFF, WOFF2, TTF, or OTF font up to 12 MB.");\n      return;\n    }\n    try {\n      const assetId = createId("asset");\n      const stored = await storeAssetBlob(project.id, assetId, file);\n      const family = file.name.replace(/\\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Custom font";\n      const asset: ProjectAsset = { id: assetId, projectId: project.id, name: family, type: "font", mimeType: file.type || `font/${extension}`, sourceUrl: stored.sourceUrl, storage: "blob", blobId: stored.blobId, byteSize: stored.byteSize, fontFamily: family, fontWeight: 400, fontStyle: "normal" };\n      commitProject((current) => { const next = cloneProject(current); next.assets[assetId] = asset; return touchProject(next); });\n      if (selectedLayers.some((layer) => layer.type === "text")) commitProject((current) => setFontFamily(current, selectedLayerIds, family));\n    } catch { window.alert("The font could not be imported."); }\n  }\n\n  function togglePlay() {');
replace("src/app/Editor.tsx",
  '    const asset = project.assets[assetId];\n    if (!asset) return;',
  '    const asset = project.assets[assetId];\n    if (!asset || asset.type === "font") return;');
replace("src/app/Editor.tsx",
  '                    className={`layer-row ${selectedLayerId === layer.id ? "selected" : ""} ${draggedLayerId === layer.id ? "is-dragging" : ""} ${dragOverLayerId === layer.id ? "drag-over" : ""}`}\n                    onClick={() => selectLayer(layer.id)}',
  '                    className={`layer-row ${selectedLayerIds.includes(layer.id) ? "selected" : ""} ${layer.maskSource ? "is-mask-source" : ""} ${draggedLayerId === layer.id ? "is-dragging" : ""} ${dragOverLayerId === layer.id ? "drag-over" : ""}`}\n                    onClick={(event) => selectLayer(layer.id, event.shiftKey)}');
replace("src/app/Editor.tsx",
  '                {Object.values(project.assets).map((asset) => (\n                  <button type="button" key={asset.id} onClick={() => addExistingAsset(asset.id)}><img src={asset.thumbnailUrl ?? asset.sourceUrl} alt="" /><span>{asset.name}</span></button>\n                ))}',
  '                {Object.values(project.assets).map((asset) => asset.type === "font" ? (\n                  <button type="button" className="font-asset-card" key={asset.id} onClick={() => selectedLayers.some((layer) => layer.type === "text") && commitProject((current) => setFontFamily(current, selectedLayerIds, asset.fontFamily ?? asset.name))}><strong>Aa</strong><span>{asset.fontFamily ?? asset.name}</span></button>\n                ) : (\n                  <button type="button" key={asset.id} onClick={() => addExistingAsset(asset.id)}><img src={asset.thumbnailUrl ?? asset.sourceUrl} alt="" /><span>{asset.name}</span></button>\n                ))}');
replace("src/app/Editor.tsx",
  '        <MultiSceneCanvasStage\n          project={project}',
  '        <DesignToolsPanel\n          project={project}\n          selectedLayers={selectedLayers}\n          onAlign={alignSelection}\n          onDistribute={distributeSelection}\n          onGroup={groupSelected}\n          onUngroup={ungroupSelected}\n          onGradient={applySelectionGradient}\n          onBlendMode={(mode) => commitProject((current) => setBlendMode(current, selectedLayerIds, mode))}\n          onBackgroundBlur={(radius) => commitProject((current) => setBackgroundBlur(current, selectedLayerIds, radius))}\n          onApplyMask={applySelectionMask}\n          onClearMask={clearSelectionMask}\n          onFontFamily={(family) => commitProject((current) => setFontFamily(current, selectedLayerIds, family))}\n          onImportFont={(file) => void importFont(file)}\n          onToggleSnap={toggleSmartSnap}\n        />\n\n        <MultiSceneCanvasStage\n          project={project}');
replace("src/app/Editor.tsx",
  '          selectedLayerId={selectedLayerId}\n          zoom={zoom}',
  '          selectedLayerId={selectedLayerId}\n          selectedLayerIds={selectedLayerIds}\n          zoom={zoom}');

replace("src/main.tsx",
  'import "./multiscene.css";',
  'import "./multiscene.css";\nimport "./designTools.css";');
replace("package.json",
  '    "audit:multiscene": "node scripts/audit-multiscene.mjs",\n    "audit": "npm run audit:templates && npm run audit:effects && npm run audit:loops && npm run audit:text-canvas && npm run audit:shapes && npm run audit:export && npm run audit:foundation-v2 && npm run audit:recovery && npm run audit:multiscene",',
  '    "audit:multiscene": "node scripts/audit-multiscene.mjs",\n    "audit:design-tools": "node scripts/audit-design-tools.mjs",\n    "audit": "npm run audit:templates && npm run audit:effects && npm run audit:loops && npm run audit:text-canvas && npm run audit:shapes && npm run audit:export && npm run audit:foundation-v2 && npm run audit:recovery && npm run audit:multiscene && npm run audit:design-tools",');
replace(".github/workflows/ci.yml",
  '      - name: Audit effect renderer\n        shell: bash',
  '      - name: Audit design tools\n        shell: bash\n        run: |\n          set -o pipefail\n          npm run audit:design-tools 2>&1 | tee design-tools-audit.log\n\n      - name: Audit effect renderer\n        shell: bash');
replace(".github/workflows/ci.yml",
  '            multiscene-audit.log\n            effect-audit.log',
  '            multiscene-audit.log\n            design-tools-audit.log\n            effect-audit.log');

console.log("Applied Design Tools V1 integration.");

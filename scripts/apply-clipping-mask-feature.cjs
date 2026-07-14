const fs = require("node:fs");

function patch(path, replacements) {
  let source = fs.readFileSync(path, "utf8");
  for (const [from, to, label] of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) throw new Error(`Missing clipping-mask anchor in ${path}: ${label}`);
    source = source.replace(from, to);
  }
  fs.writeFileSync(path, source);
}

patch("src/types.ts", [[
  '  type: "vector" | "alpha";',
  '  type: "vector" | "alpha" | "clipping";',
  "clipping mask model",
]]);

patch("src/core/designTools.ts", [
  [
`export interface SnapResult {
  position: Point;
  guides: AlignmentGuide[];
}

export function getSelectionBounds`,
`export interface SnapResult {
  position: Point;
  guides: AlignmentGuide[];
}

export function getClippingMaskBase(project: KurogiProject, targetLayerId: string): Layer | null {
  const target = project.layers[targetLayerId];
  if (!target || target.parentId || target.maskSource || target.type === "group") return null;
  const scene = project.scenes[target.sceneId];
  if (!scene) return null;
  const targetIndex = scene.layerIds.indexOf(targetLayerId);
  if (targetIndex <= 0) return null;
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const candidate = project.layers[scene.layerIds[index]];
    if (!candidate || candidate.parentId || candidate.maskSource || candidate.type === "group") continue;
    return candidate;
  }
  return null;
}

export function applyClippingMask(
  project: KurogiProject,
  targetLayerId: string,
): { project: KurogiProject; sourceLayerId: string | null } {
  const target = project.layers[targetLayerId];
  const source = getClippingMaskBase(project, targetLayerId);
  if (!target || !source) return { project, sourceLayerId: null };
  if (target.mask?.type === "clipping" && target.mask.sourceLayerId === source.id) {
    return { project, sourceLayerId: source.id };
  }
  const next = cloneProject(project);
  const previous = next.layers[targetLayerId].mask;
  if (previous && previous.type !== "clipping") releaseMaskSource(next, previous.sourceLayerId, targetLayerId);
  next.layers[targetLayerId].mask = { type: "clipping", sourceLayerId: source.id, inverted: false };
  return { project: touchProject(next), sourceLayerId: source.id };
}

export function releaseClippingMask(project: KurogiProject, targetLayerId: string): KurogiProject {
  const target = project.layers[targetLayerId];
  if (target?.mask?.type !== "clipping") return project;
  const next = cloneProject(project);
  next.layers[targetLayerId].mask = undefined;
  return touchProject(next);
}

export function getSelectionBounds`,
    "clipping mask commands",
  ],
  [
    '  type: MaskDefinition["type"],',
    '  type: Exclude<MaskDefinition["type"], "clipping">,',
    "keep legacy mask API explicit",
  ],
  [
`export function clearMask(project: KurogiProject, targetLayerId: string): KurogiProject {
  const target = project.layers[targetLayerId];
  if (!target?.mask) return project;
  const next = cloneProject(project);
  const sourceId = next.layers[targetLayerId].mask?.sourceLayerId;
  next.layers[targetLayerId].mask = undefined;
  if (sourceId) releaseMaskSource(next, sourceId, targetLayerId);
  return touchProject(next);
}`,
`export function clearMask(project: KurogiProject, targetLayerId: string): KurogiProject {
  const target = project.layers[targetLayerId];
  if (!target?.mask) return project;
  const next = cloneProject(project);
  const mask = next.layers[targetLayerId].mask;
  next.layers[targetLayerId].mask = undefined;
  if (mask && mask.type !== "clipping") releaseMaskSource(next, mask.sourceLayerId, targetLayerId);
  return touchProject(next);
}`,
    "release clipping independently",
  ],
  [
    '  const stillUsed = Object.values(project.layers).some((layer) => layer.id !== ignoredTargetId && layer.mask?.sourceLayerId === sourceId);',
    '  const stillUsed = Object.values(project.layers).some((layer) => layer.id !== ignoredTargetId && layer.mask?.type !== "clipping" && layer.mask?.sourceLayerId === sourceId);',
    "clipping bases remain visible",
  ],
]);

patch("src/core/project.ts", [
  [
`  for (const candidate of Object.values(next.layers)) {
    if (candidate.parentId === layerId) candidate.parentId = undefined;
    if (candidate.type === "group") candidate.childIds = candidate.childIds.filter((id) => id !== layerId);
  }
  return touchProject(next);`,
`  for (const candidate of Object.values(next.layers)) {
    if (candidate.parentId === layerId) candidate.parentId = undefined;
    if (candidate.type === "group") candidate.childIds = candidate.childIds.filter((id) => id !== layerId);
    if (candidate.mask?.sourceLayerId === layerId) candidate.mask = undefined;
  }
  const activeMaskSources = new Set(Object.values(next.layers)
    .filter((candidate) => candidate.mask && candidate.mask.type !== "clipping")
    .map((candidate) => candidate.mask!.sourceLayerId));
  for (const candidate of Object.values(next.layers)) candidate.maskSource = activeMaskSources.has(candidate.id);
  return touchProject(next);`,
    "mask cleanup on delete",
  ],
  [
`    if (layer.mask && !next.layers[layer.mask.sourceLayerId]) layer.mask = undefined;
    layer.animationActions`,
`    if (layer.mask && !next.layers[layer.mask.sourceLayerId]) layer.mask = undefined;
    if (layer.mask && !["vector", "alpha", "clipping"].includes(layer.mask.type)) layer.mask = undefined;
    layer.animationActions`,
    "mask type sanitization",
  ],
  [
`  for (const [clipId, clip] of Object.entries(next.audioClips)) {`,
`  const activeMaskSources = new Set(Object.values(next.layers)
    .filter((candidate) => candidate.mask && candidate.mask.type !== "clipping")
    .map((candidate) => candidate.mask!.sourceLayerId));
  for (const layer of Object.values(next.layers)) layer.maskSource = activeMaskSources.has(layer.id);
  for (const [clipId, clip] of Object.entries(next.audioClips)) {`,
    "mask-source normalization",
  ],
]);

patch("src/renderer/designStyles.ts", [
  [
`import type { CSSProperties } from "react";
import { getShapeDefinition`,
`import type { CSSProperties } from "react";
import type { EvaluatedLayerVisual } from "../core/evaluator";
import { getShapeDefinition`,
    "evaluated mask type import",
  ],
  [
`import type { GradientFill, KurogiProject, Layer, ShapeType } from "../types";`,
`import type { GradientFill, KurogiProject, Layer, Scene, ShapeType } from "../types";
import { clippingMaskStyle } from "./clippingMask";`,
    "clipping renderer import",
  ],
  [
`export function layerCompositingStyle(project: KurogiProject, layer: Layer): CSSProperties {
  const blur = Math.max(0, layer.backgroundBlur ?? 0);`,
`export function layerCompositingStyle(
  project: KurogiProject,
  layer: Layer,
  scene?: Scene,
  time = 0,
  evaluatedLayer?: EvaluatedLayerVisual,
): CSSProperties {
  const blur = Math.max(0, layer.backgroundBlur ?? 0);`,
    "compositing signature",
  ],
  [
`    ...maskStyle(project, layer),`,
`    ...maskStyle(project, layer, scene, time, evaluatedLayer),`,
    "animated mask args",
  ],
  [
`function maskStyle(project: KurogiProject, layer: Layer): CSSProperties {
  if (!layer.mask) return {};
  const source = project.layers[layer.mask.sourceLayerId];
  if (!source) return {};
  let image = "";`,
`function maskStyle(
  project: KurogiProject,
  layer: Layer,
  scene?: Scene,
  time = 0,
  evaluatedLayer?: EvaluatedLayerVisual,
): CSSProperties {
  if (!layer.mask) return {};
  const source = project.layers[layer.mask.sourceLayerId];
  if (!source) return {};
  if (layer.mask.type === "clipping") return clippingMaskStyle(project, layer, source, scene, time, evaluatedLayer);
  let image = "";`,
    "clipping mask rendering branch",
  ],
]);

patch("src/MotionComposition.tsx", [
  [
`  onActionCommit?: (layerId: string, actionId: string, motionPath: MotionPathDefinition) => void;
  editable?: boolean;`,
`  onActionCommit?: (layerId: string, actionId: string, motionPath: MotionPathDefinition) => void;
  onLayerContextMenu?: (layerId: string, point: { x: number; y: number }) => void;
  editable?: boolean;`,
    "canvas context callback prop",
  ],
  [
`  onTextCommit,
  onActionCommit,
  editable = false,`,
`  onTextCommit,
  onActionCommit,
  onLayerContextMenu,
  editable = false,`,
    "context callback destructure",
  ],
  [
`  ) {
    if (!editable || layer.locked || textEdit) return;`,
`  ) {
    if (event.button !== 0 || !editable || layer.locked || textEdit) return;`,
    "ignore right click transform",
  ],
  [
`          ...layerCompositingStyle(project, layer),`,
`          ...layerCompositingStyle(project, layer, scene, time, visual),`,
    "scene-aware clipping render",
  ],
  [
`            onDoubleClick={
              layer.type === "text"`,
`            onContextMenu={editable ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect?.(layer.id, false);
              onLayerContextMenu?.(layer.id, { x: event.clientX, y: event.clientY });
            } : undefined}
            onDoubleClick={
              layer.type === "text"`,
    "right click layer callback",
  ],
]);

patch("src/renderer/StaticLayerTree.tsx", [[
  `    ...layerCompositingStyle(project, layer),`,
  `    ...layerCompositingStyle(project, layer, scene, time, visual),`,
  "static tree clipping render",
]]);

patch("src/editor/MultiSceneCanvasStage.tsx", [
  [
`  onActionCommit: (layerId: string, actionId: string, motionPath: MotionPathDefinition) => void;
  onZoomChange?:`,
`  onActionCommit: (layerId: string, actionId: string, motionPath: MotionPathDefinition) => void;
  onLayerContextMenu?: (layerId: string, point: { x: number; y: number }) => void;
  onZoomChange?:`,
    "stage context callback prop",
  ],
  [
`  onTextCommit,
  onActionCommit,
  onZoomChange,`,
`  onTextCommit,
  onActionCommit,
  onLayerContextMenu,
  onZoomChange,`,
    "stage context callback destructure",
  ],
  [
`  const callbacksRef = useRef({ onSelect, onTransformCommit, onTextCommit, onActionCommit });`,
`  const callbacksRef = useRef({ onSelect, onTransformCommit, onTextCommit, onActionCommit, onLayerContextMenu });`,
    "stage callback ref init",
  ],
  [
`  callbacksRef.current = { onSelect, onTransformCommit, onTextCommit, onActionCommit };`,
`  callbacksRef.current = { onSelect, onTransformCommit, onTextCommit, onActionCommit, onLayerContextMenu };`,
    "stage callback ref update",
  ],
  [
`  const stableActionCommit = useCallback(
    (layerId: string, actionId: string, motionPath: MotionPathDefinition) => callbacksRef.current.onActionCommit(layerId, actionId, motionPath),
    [],
  );

  const activePlayerInputProps`,
`  const stableActionCommit = useCallback(
    (layerId: string, actionId: string, motionPath: MotionPathDefinition) => callbacksRef.current.onActionCommit(layerId, actionId, motionPath),
    [],
  );
  const stableLayerContextMenu = useCallback(
    (layerId: string, point: { x: number; y: number }) => callbacksRef.current.onLayerContextMenu?.(layerId, point),
    [],
  );

  const activePlayerInputProps`,
    "stable layer context callback",
  ],
  [
`       onActionCommit: stableActionCommit,
       editable: true,`,
`       onActionCommit: stableActionCommit,
       onLayerContextMenu: stableLayerContextMenu,
       editable: true,`,
    "context callback input prop",
  ],
  [
`    [project, selectedActionId, selectedLayerId, selectedLayerIds, showSafeArea, stableActionCommit, stableSelect, stableTextCommit, stableTransformCommit],`,
`    [project, selectedActionId, selectedLayerId, selectedLayerIds, showSafeArea, stableActionCommit, stableLayerContextMenu, stableSelect, stableTextCommit, stableTransformCommit],`,
    "context callback dependency",
  ],
  [
`  function openContextMenu(event: React.MouseEvent<HTMLElement>) {
    if (!selectedLayer`,
`  function openContextMenu(event: React.MouseEvent<HTMLElement>) {
    if (event.defaultPrevented) return;
    if (!selectedLayer`,
    "avoid duplicate context menu",
  ],
]);

patch("src/app/Editor.tsx", [
  [
`import React, { useEffect, useMemo, useRef, useState } from "react";`,
`import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";`,
    "portal import",
  ],
  [
`  alignLayers,
  applyMask,
  clearMask,`,
`  alignLayers,
  applyClippingMask,
  applyMask,
  clearMask,
  getClippingMaskBase,`,
    "clipping command imports",
  ],
  [
`  groupLayers,
  setBackgroundBlur,`,
`  groupLayers,
  releaseClippingMask,
  setBackgroundBlur,`,
    "release clipping import",
  ],
  [
`type SidebarTab = "layers" | "assets" | "text" | "shapes" | "templates";

const SIDEBAR_TABS`,
`type SidebarTab = "layers" | "assets" | "text" | "shapes" | "templates";
type LayerContextMenuState = { layerId: string; x: number; y: number };

const SIDEBAR_TABS`,
    "context menu state type",
  ],
  [
`  const [dragOverLayerId, setDragOverLayerId] = useState("");
  const [saveStatus`,
`  const [dragOverLayerId, setDragOverLayerId] = useState("");
  const [layerContextMenu, setLayerContextMenu] = useState<LayerContextMenuState | null>(null);
  const [saveStatus`,
    "context menu state",
  ],
  [
`  const selectedLayer = selectedLayerId ? project.layers[selectedLayerId] ?? null : null;
  const selectedLayers = useMemo`,
`  const selectedLayer = selectedLayerId ? project.layers[selectedLayerId] ?? null : null;
  const contextLayer = layerContextMenu ? project.layers[layerContextMenu.layerId] ?? null : null;
  const clippingBaseLayer = contextLayer && contextLayer.mask?.type !== "clipping"
    ? getClippingMaskBase(project, contextLayer.id)
    : null;
  const selectedLayers = useMemo`,
    "context layer derivation",
  ],
  [
`  useEffect(() => {
    saveEditorUiPreferences(uiPreferences);
  }, [uiPreferences]);

  useEffect(() => {
    const unsubscribe = window.kurogi?.onMcpRequest?`,
`  useEffect(() => {
    saveEditorUiPreferences(uiPreferences);
  }, [uiPreferences]);

  useEffect(() => {
    if (!layerContextMenu) return;
    const close = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.(".layer-context-menu")) return;
      setLayerContextMenu(null);
    };
    const closeOnKey = (event: KeyboardEvent) => { if (event.key === "Escape") setLayerContextMenu(null); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnKey);
    window.addEventListener("blur", () => setLayerContextMenu(null), { once: true });
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnKey);
    };
  }, [layerContextMenu]);

  useEffect(() => {
    const unsubscribe = window.kurogi?.onMcpRequest?`,
    "context menu dismissal",
  ],
  [
`  function selectLayer(layerId: string, additive = false) {
    if (!layerId) {`,
`  function openLayerContextMenu(layerId: string, point: { x: number; y: number }) {
    if (!project.layers[layerId]) return;
    selectLayer(layerId);
    const width = 258;
    const height = 330;
    setLayerContextMenu({
      layerId,
      x: clamp(point.x, 8, Math.max(8, window.innerWidth - width - 8)),
      y: clamp(point.y, 8, Math.max(8, window.innerHeight - height - 8)),
    });
  }

  function selectLayer(layerId: string, additive = false) {
    if (!layerId) {`,
    "open layer context menu",
  ],
  [
`  function clearSelectionMask() { if (selectedLayerId) commitProject((current) => clearMask(current, selectedLayerId)); }
  function toggleSmartSnap()`,
`  function clearSelectionMask() { if (selectedLayerId) commitProject((current) => clearMask(current, selectedLayerId)); }
  function createContextClippingMask(layerId: string) {
    commitProject((current) => applyClippingMask(current, layerId).project);
    selectOnly(layerId);
    setLayerContextMenu(null);
  }
  function releaseContextClippingMask(layerId: string) {
    commitProject((current) => releaseClippingMask(current, layerId));
    selectOnly(layerId);
    setLayerContextMenu(null);
  }
  function toggleSmartSnap()`,
    "context clipping actions",
  ],
  [
`                    className={\`layer-row \${selectedLayerIds.includes(layer.id) ? "selected" : ""} \${layer.maskSource ? "is-mask-source" : ""} \${draggedLayerId === layer.id ? "is-dragging" : ""} \${dragOverLayerId === layer.id ? "drag-over" : ""}\`}
                    onClick={(event) => selectLayer(layer.id, event.shiftKey)}`, 
`                    className={\`layer-row \${selectedLayerIds.includes(layer.id) ? "selected" : ""} \${layer.maskSource ? "is-mask-source" : ""} \${layer.mask?.type === "clipping" ? "is-clipping-target" : ""} \${draggedLayerId === layer.id ? "is-dragging" : ""} \${dragOverLayerId === layer.id ? "drag-over" : ""}\`}
                    onClick={(event) => selectLayer(layer.id, event.shiftKey)}
                    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); openLayerContextMenu(layer.id, { x: event.clientX, y: event.clientY }); }}`, 
    "sidebar right click and clipping class",
  ],
  [
`                    <span className={\`layer-thumb \${layer.type}\`}><Icon name={layer.type === "text" ? "text" : layer.type === "shape" ? "shapes" : "assets"} size={13} /></span>
                    <input`,
`                    <span className={\`layer-thumb \${layer.type}\`}><Icon name={layer.type === "text" ? "text" : layer.type === "shape" ? "shapes" : "assets"} size={13} /></span>
                    {layer.mask?.type === "clipping" ? <span className="clipping-mask-chip" title={\`Clipped to \${project.layers[layer.mask.sourceLayerId]?.name ?? "base layer"}\`}><Icon name="mask" size={11} /></span> : null}
                    <input`,
    "sidebar clipping indicator",
  ],
  [
`          onActionCommit={commitMotionPath}
          onZoomChange={setZoom}`, 
`          onActionCommit={commitMotionPath}
          onLayerContextMenu={openLayerContextMenu}
          onZoomChange={setZoom}`, 
    "canvas right click wiring",
  ],
  [
`        canPaste={Boolean(animationClipboard)}
      />
    </main>`,
`        canPaste={Boolean(animationClipboard)}
      />
      {layerContextMenu && contextLayer ? createPortal(
        <div
          className="layer-context-menu"
          role="menu"
          style={{ left: layerContextMenu.x, top: layerContextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="layer-context-menu-header">
            <span><Icon name={contextLayer.mask?.type === "clipping" ? "mask" : contextLayer.type === "text" ? "text" : contextLayer.type === "shape" ? "shapes" : "assets"} size={15} /></span>
            <div><strong>{contextLayer.name}</strong><small>{contextLayer.type} layer</small></div>
          </div>
          {contextLayer.mask?.type === "clipping" ? (
            <button type="button" className="is-active-command" onClick={() => releaseContextClippingMask(contextLayer.id)}><Icon name="mask" size={15} />Release Clipping Mask<small>{project.layers[contextLayer.mask.sourceLayerId]?.name}</small></button>
          ) : (
            <button type="button" disabled={!clippingBaseLayer} title={clippingBaseLayer ? \`Clip to \${clippingBaseLayer.name}\` : "Place this layer above another visual layer first"} onClick={() => createContextClippingMask(contextLayer.id)}><Icon name="mask" size={15} />Create Clipping Mask<small>{clippingBaseLayer?.name ?? "No base below"}</small></button>
          )}
          <span className="layer-context-menu-separator" />
          <button type="button" onClick={() => { commitProject((current) => reorderLayer(current, contextLayer.id, "up")); setLayerContextMenu(null); }}><Icon name="chevronUp" size={15} />Bring Forward</button>
          <button type="button" onClick={() => { commitProject((current) => reorderLayer(current, contextLayer.id, "down")); setLayerContextMenu(null); }}><Icon name="chevronDown" size={15} />Send Backward</button>
          <button type="button" onClick={() => { duplicateLayerById(contextLayer.id); setLayerContextMenu(null); }}><Icon name="copy" size={15} />Duplicate</button>
          <button type="button" onClick={() => { commitLayer(contextLayer.id, (layer) => ({ ...layer, visible: !layer.visible })); setLayerContextMenu(null); }}><Icon name={contextLayer.visible ? "eyeOff" : "eye"} size={15} />{contextLayer.visible ? "Hide Layer" : "Show Layer"}</button>
          <button type="button" onClick={() => { commitLayer(contextLayer.id, (layer) => ({ ...layer, locked: !layer.locked })); setLayerContextMenu(null); }}><Icon name={contextLayer.locked ? "unlock" : "lock"} size={15} />{contextLayer.locked ? "Unlock Layer" : "Lock Layer"}</button>
          <span className="layer-context-menu-separator" />
          <button type="button" className="danger-text" onClick={() => { deleteLayerById(contextLayer.id); setLayerContextMenu(null); }}><Icon name="trash" size={15} />Delete Layer</button>
        </div>,
        document.body,
      ) : null}
    </main>`,
    "context menu portal",
  ],
]);

patch("src/main.tsx", [[
  `import "./designTools.css";`,
  `import "./designTools.css";\nimport "./clippingMask.css";`,
  "clipping mask styles import",
]]);

patch("package.json", [
  [
`    "audit:ui-cleanup": "node scripts/audit-ui-cleanup.mjs",
    "audit":`,
`    "audit:ui-cleanup": "node scripts/audit-ui-cleanup.mjs",
    "audit:clipping-mask": "node scripts/audit-clipping-mask.mjs",
    "audit":`,
    "clipping audit script",
  ],
  [
`npm run audit:ui-cleanup && npm run audit:mcp`,
`npm run audit:ui-cleanup && npm run audit:clipping-mask && npm run audit:mcp`,
    "clipping audit chain",
  ],
]);

fs.writeFileSync("scripts/audit-clipping-mask.mjs", `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({ appType: "custom", configFile: false, logLevel: "error", optimizeDeps: { noDiscovery: true }, server: { hmr: false, middlewareMode: true, watch: null } });
try {
  const projectCore = await server.ssrLoadModule("/src/core/project.ts");
  const design = await server.ssrLoadModule("/src/core/designTools.ts");
  const styles = await server.ssrLoadModule("/src/renderer/designStyles.ts");
  const evaluator = await server.ssrLoadModule("/src/core/evaluator.ts");
  let project = projectCore.createProject({ name: "Clipping audit", format: "square", width: 800, height: 800 });
  const scene = projectCore.getActiveScene(project);
  const base = projectCore.createShapeLayer(scene, "circle", { name: "Base circle", position: { x: 160, y: 180 }, size: { width: 320, height: 320 } });
  const target = projectCore.createTextLayer(scene, { name: "Clipped title", text: "MASK", position: { x: 90, y: 210 }, size: { width: 620, height: 220 }, fontSize: 150 });
  project = projectCore.addLayers(project, [base, target]);
  assert.equal(design.getClippingMaskBase(project, target.id)?.id, base.id);
  const clipped = design.applyClippingMask(project, target.id);
  project = clipped.project;
  assert.equal(clipped.sourceLayerId, base.id);
  assert.equal(project.layers[target.id].mask.type, "clipping");
  assert.notEqual(project.layers[base.id].maskSource, true, "Photoshop-style clipping base must stay visible.");
  const visual = evaluator.evaluateLayer(project.layers[target.id], scene, 0);
  const maskStyle = styles.layerCompositingStyle(project, project.layers[target.id], scene, 0, visual);
  assert.match(String(maskStyle.maskImage), /data:image\\/svg\\+xml/);
  project = design.releaseClippingMask(project, target.id);
  assert.equal(project.layers[target.id].mask, undefined);
  project = design.applyClippingMask(project, target.id).project;
  project = projectCore.removeLayer(project, base.id);
  assert.equal(project.layers[target.id].mask, undefined, "Deleting a clipping base must release dependants.");

  const editor = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");
  const composition = await readFile(new URL("../src/MotionComposition.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../src/types.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/clippingMask.css", import.meta.url), "utf8");
  assert.ok(types.includes('"clipping"'), "Clipping mask type is missing.");
  assert.ok(editor.includes("Create Clipping Mask") && editor.includes("Release Clipping Mask"), "Layer context menu commands are missing.");
  assert.ok(editor.includes("onContextMenu") && composition.includes("onLayerContextMenu"), "Right-click canvas/sidebar wiring is missing.");
  assert.ok(css.includes(".layer-context-menu") && css.includes(".is-clipping-target"), "Clipping mask UX styles are missing.");
  console.log("Clipping mask audit passed: base lookup, visible base, SVG alpha rendering, release, delete cleanup, and right-click UX are wired.");
} finally {
  await server.close();
}
`);

console.log("Clipping mask feature applied.");

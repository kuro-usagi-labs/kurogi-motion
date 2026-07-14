import type {
  BlendMode,
  GradientFill,
  GroupLayer,
  KurogiProject,
  Layer,
  MaskDefinition,
  Point,
  Scene,
} from "../types";
import { cloneProject, createId, touchProject } from "./project";

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributeMode = "horizontal" | "vertical";

export interface SelectionBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface AlignmentGuide {
  axis: "x" | "y";
  position: number;
  kind: "scene" | "layer";
  targetLayerId?: string;
}

export interface SnapResult {
  position: Point;
  guides: AlignmentGuide[];
}

export function getSelectionBounds(layers: Layer[]): SelectionBounds | null {
  if (layers.length === 0) return null;
  const boxes = layers.map(layerBounds);
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

export function alignLayers(
  project: KurogiProject,
  layerIds: string[],
  mode: AlignMode,
): KurogiProject {
  const layers = selectableLayers(project, layerIds);
  if (layers.length === 0) return project;
  const scene = project.scenes[layers[0].sceneId];
  if (!scene) return project;
  const selection = getSelectionBounds(layers);
  if (!selection) return project;
  const reference = layers.length === 1
    ? { left: 0, top: 0, right: scene.width, bottom: scene.height, centerX: scene.width / 2, centerY: scene.height / 2 }
    : selection;
  const next = cloneProject(project);
  for (const layer of layers) {
    const box = layerBounds(layer);
    const candidate = next.layers[layer.id];
    if (!candidate) continue;
    if (mode === "left") candidate.position.x += reference.left - box.left;
    if (mode === "center") candidate.position.x += reference.centerX - (box.left + box.right) / 2;
    if (mode === "right") candidate.position.x += reference.right - box.right;
    if (mode === "top") candidate.position.y += reference.top - box.top;
    if (mode === "middle") candidate.position.y += reference.centerY - (box.top + box.bottom) / 2;
    if (mode === "bottom") candidate.position.y += reference.bottom - box.bottom;
  }
  return touchProject(next);
}

export function distributeLayers(
  project: KurogiProject,
  layerIds: string[],
  mode: DistributeMode,
): KurogiProject {
  const layers = selectableLayers(project, layerIds);
  if (layers.length < 3) return project;
  const sorted = [...layers].sort((left, right) => mode === "horizontal"
    ? layerBounds(left).left - layerBounds(right).left
    : layerBounds(left).top - layerBounds(right).top);
  const first = layerBounds(sorted[0]);
  const last = layerBounds(sorted.at(-1)!);
  const totalSize = sorted.reduce((sum, layer) => sum + (mode === "horizontal" ? layerBounds(layer).width : layerBounds(layer).height), 0);
  const span = mode === "horizontal" ? last.right - first.left : last.bottom - first.top;
  const gap = (span - totalSize) / (sorted.length - 1);
  const next = cloneProject(project);
  let cursor = mode === "horizontal" ? first.left : first.top;
  for (const layer of sorted) {
    const box = layerBounds(layer);
    const candidate = next.layers[layer.id];
    if (!candidate) continue;
    if (mode === "horizontal") {
      candidate.position.x += cursor - box.left;
      cursor += box.width + gap;
    } else {
      candidate.position.y += cursor - box.top;
      cursor += box.height + gap;
    }
  }
  return touchProject(next);
}

export function groupLayers(
  project: KurogiProject,
  layerIds: string[],
): { project: KurogiProject; groupId: string | null } {
  const layers = selectableLayers(project, layerIds).filter((layer) => !layer.parentId);
  if (layers.length < 2) return { project, groupId: null };
  const sceneId = layers[0].sceneId;
  if (layers.some((layer) => layer.sceneId !== sceneId)) return { project, groupId: null };
  const bounds = getSelectionBounds(layers);
  const scene = project.scenes[sceneId];
  if (!bounds || !scene) return { project, groupId: null };
  const groupId = createId("group");
  const group: GroupLayer = {
    id: groupId,
    sceneId,
    name: "Group",
    type: "group",
    visible: true,
    locked: false,
    position: { x: bounds.left, y: bounds.top },
    size: { width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) },
    rotation: 0,
    opacity: 1,
    scale: { x: 1, y: 1 },
    anchor: { x: 0.5, y: 0.5 },
    startTime: Math.min(...layers.map((layer) => layer.startTime ?? 0)),
    duration: Math.max(...layers.map((layer) => (layer.startTime ?? 0) + (layer.duration ?? scene.duration))) - Math.min(...layers.map((layer) => layer.startTime ?? 0)),
    blendMode: "normal",
    backgroundBlur: 0,
    animationActions: [],
    childIds: layers.map((layer) => layer.id),
  };
  const next = cloneProject(project);
  next.layers[groupId] = group;
  for (const layer of layers) {
    const child = next.layers[layer.id];
    child.parentId = groupId;
    child.position = {
      x: child.position.x - bounds.left,
      y: child.position.y - bounds.top,
    };
  }
  const indices = layers.map((layer) => scene.layerIds.indexOf(layer.id)).filter((index) => index >= 0);
  const insertAt = indices.length ? Math.max(...indices) + 1 : scene.layerIds.length;
  next.scenes[sceneId].layerIds.splice(insertAt, 0, groupId);
  return { project: touchProject(next), groupId };
}

export function ungroupLayer(
  project: KurogiProject,
  groupId: string,
): { project: KurogiProject; layerIds: string[] } {
  const source = project.layers[groupId];
  if (!source || source.type !== "group") return { project, layerIds: [] };
  const next = cloneProject(project);
  const group = next.layers[groupId] as GroupLayer;
  const childIds = group.childIds.filter((id) => Boolean(next.layers[id]));
  const radians = group.rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const pivot = { x: group.size.width * group.anchor.x, y: group.size.height * group.anchor.y };
  for (const childId of childIds) {
    const child = next.layers[childId];
    const local = {
      x: (child.position.x - pivot.x) * group.scale.x,
      y: (child.position.y - pivot.y) * group.scale.y,
    };
    child.position = {
      x: group.position.x + pivot.x + local.x * cos - local.y * sin,
      y: group.position.y + pivot.y + local.x * sin + local.y * cos,
    };
    child.rotation += group.rotation;
    child.scale = {
      x: child.scale.x * group.scale.x,
      y: child.scale.y * group.scale.y,
    };
    child.opacity *= group.opacity;
    child.parentId = undefined;
  }
  delete next.layers[groupId];
  const scene = next.scenes[group.sceneId];
  if (scene) scene.layerIds = scene.layerIds.filter((id) => id !== groupId);
  return { project: touchProject(next), layerIds: childIds };
}

export function applyMask(
  project: KurogiProject,
  targetLayerId: string,
  sourceLayerId: string,
  type: MaskDefinition["type"],
): KurogiProject {
  const target = project.layers[targetLayerId];
  const source = project.layers[sourceLayerId];
  if (!target || !source || target.id === source.id || target.sceneId !== source.sceneId) return project;
  if (type === "vector" && source.type !== "shape") return project;
  if (type === "alpha" && source.type !== "image" && source.type !== "svg") return project;
  const next = cloneProject(project);
  const previousSourceId = next.layers[targetLayerId].mask?.sourceLayerId;
  next.layers[targetLayerId].mask = { type, sourceLayerId, inverted: false };
  next.layers[sourceLayerId].maskSource = true;
  if (previousSourceId && previousSourceId !== sourceLayerId) releaseMaskSource(next, previousSourceId, targetLayerId);
  return touchProject(next);
}

export function clearMask(project: KurogiProject, targetLayerId: string): KurogiProject {
  const target = project.layers[targetLayerId];
  if (!target?.mask) return project;
  const next = cloneProject(project);
  const sourceId = next.layers[targetLayerId].mask?.sourceLayerId;
  next.layers[targetLayerId].mask = undefined;
  if (sourceId) releaseMaskSource(next, sourceId, targetLayerId);
  return touchProject(next);
}

export function canCreateClippingMask(project: KurogiProject, targetLayerId: string): boolean {
  const target = project.layers[targetLayerId];
  const scene = target ? project.scenes[target.sceneId] : undefined;
  if (!target || !scene || target.parentId) return false;
  const index = scene.layerIds.indexOf(target.id);
  if (index <= 0) return false;
  const source = project.layers[scene.layerIds[index - 1]];
  return Boolean(source && !source.parentId && source.id !== target.id);
}

export function createClippingMask(
  project: KurogiProject,
  targetLayerId: string,
): { project: KurogiProject; sourceLayerId: string | null } {
  if (!canCreateClippingMask(project, targetLayerId)) return { project, sourceLayerId: null };
  const target = project.layers[targetLayerId];
  const scene = project.scenes[target.sceneId];
  const sourceLayerId = scene.layerIds[scene.layerIds.indexOf(targetLayerId) - 1];
  const next = cloneProject(project);
  const previous = next.layers[targetLayerId].mask;
  if (previous?.sourceLayerId && !previous.clipping) releaseMaskSource(next, previous.sourceLayerId, targetLayerId);
  next.layers[targetLayerId].mask = { type: "alpha", sourceLayerId, inverted: false, clipping: true };
  return { project: touchProject(next), sourceLayerId };
}

export function releaseClippingMask(project: KurogiProject, targetLayerId: string): KurogiProject {
  if (!project.layers[targetLayerId]?.mask?.clipping) return project;
  return clearMask(project, targetLayerId);
}

export function setGradient(
  project: KurogiProject,
  layerIds: string[],
  gradient: GradientFill | undefined,
): KurogiProject {
  const next = cloneProject(project);
  let changed = false;
  for (const id of layerIds) {
    const layer = next.layers[id];
    if (layer?.type === "shape" || layer?.type === "text") {
      layer.style.gradient = gradient ? cloneProject(gradient) : undefined;
      changed = true;
    }
  }
  return changed ? touchProject(next) : project;
}

export function setBlendMode(project: KurogiProject, layerIds: string[], blendMode: BlendMode): KurogiProject {
  const next = cloneProject(project);
  let changed = false;
  for (const id of layerIds) {
    const layer = next.layers[id];
    if (!layer) continue;
    layer.blendMode = blendMode;
    changed = true;
  }
  return changed ? touchProject(next) : project;
}

export function setBackgroundBlur(project: KurogiProject, layerIds: string[], radius: number): KurogiProject {
  const next = cloneProject(project);
  let changed = false;
  for (const id of layerIds) {
    const layer = next.layers[id];
    if (!layer) continue;
    layer.backgroundBlur = clamp(radius, 0, 80);
    changed = true;
  }
  return changed ? touchProject(next) : project;
}

export function setFontFamily(project: KurogiProject, layerIds: string[], fontFamily: string): KurogiProject {
  const clean = fontFamily.trim();
  if (!clean) return project;
  const next = cloneProject(project);
  let changed = false;
  for (const id of layerIds) {
    const layer = next.layers[id];
    if (layer?.type !== "text") continue;
    layer.style.fontFamily = clean;
    changed = true;
  }
  return changed ? touchProject(next) : project;
}

export function snapLayerPosition(
  movingLayer: Layer,
  candidate: Point,
  scene: Scene,
  siblingLayers: Layer[],
  threshold = 8,
): SnapResult {
  const width = movingLayer.size.width * Math.abs(movingLayer.scale.x);
  const height = movingLayer.size.height * Math.abs(movingLayer.scale.y);
  const sourceX = [candidate.x, candidate.x + width / 2, candidate.x + width];
  const sourceY = [candidate.y, candidate.y + height / 2, candidate.y + height];
  const targetX: Array<{ value: number; kind: AlignmentGuide["kind"]; targetLayerId?: string }> = [
    { value: 0, kind: "scene" },
    { value: scene.width / 2, kind: "scene" },
    { value: scene.width, kind: "scene" },
  ];
  const targetY: Array<{ value: number; kind: AlignmentGuide["kind"]; targetLayerId?: string }> = [
    { value: 0, kind: "scene" },
    { value: scene.height / 2, kind: "scene" },
    { value: scene.height, kind: "scene" },
  ];
  for (const sibling of siblingLayers) {
    if (sibling.id === movingLayer.id || sibling.parentId || sibling.maskSource || !sibling.visible) continue;
    const box = layerBounds(sibling);
    targetX.push(
      { value: box.left, kind: "layer", targetLayerId: sibling.id },
      { value: box.centerX, kind: "layer", targetLayerId: sibling.id },
      { value: box.right, kind: "layer", targetLayerId: sibling.id },
    );
    targetY.push(
      { value: box.top, kind: "layer", targetLayerId: sibling.id },
      { value: box.centerY, kind: "layer", targetLayerId: sibling.id },
      { value: box.bottom, kind: "layer", targetLayerId: sibling.id },
    );
  }
  const bestX = closestSnap(sourceX, targetX, threshold);
  const bestY = closestSnap(sourceY, targetY, threshold);
  return {
    position: {
      x: candidate.x + (bestX?.delta ?? 0),
      y: candidate.y + (bestY?.delta ?? 0),
    },
    guides: [
      ...(bestX ? [{ axis: "x" as const, position: bestX.target.value, kind: bestX.target.kind, targetLayerId: bestX.target.targetLayerId }] : []),
      ...(bestY ? [{ axis: "y" as const, position: bestY.target.value, kind: bestY.target.kind, targetLayerId: bestY.target.targetLayerId }] : []),
    ],
  };
}

function selectableLayers(project: KurogiProject, ids: string[]): Layer[] {
  const unique = [...new Set(ids)];
  const layers = unique.map((id) => project.layers[id]).filter((layer): layer is Layer => Boolean(layer));
  const sceneId = layers[0]?.sceneId;
  return layers.filter((layer) => layer.sceneId === sceneId && !layer.maskSource);
}

function layerBounds(layer: Layer): SelectionBounds {
  const width = layer.size.width * Math.abs(layer.scale.x);
  const height = layer.size.height * Math.abs(layer.scale.y);
  const left = layer.position.x;
  const top = layer.position.y;
  const right = left + width;
  const bottom = top + height;
  return { left, top, right, bottom, width, height, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

function closestSnap(
  sourceValues: number[],
  targets: Array<{ value: number; kind: AlignmentGuide["kind"]; targetLayerId?: string }>,
  threshold: number,
) {
  let best: { delta: number; distance: number; target: (typeof targets)[number] } | null = null;
  for (const source of sourceValues) {
    for (const target of targets) {
      const delta = target.value - source;
      const distance = Math.abs(delta);
      if (distance <= threshold && (!best || distance < best.distance)) best = { delta, distance, target };
    }
  }
  return best;
}

function releaseMaskSource(project: KurogiProject, sourceId: string, ignoredTargetId: string) {
  const stillUsed = Object.values(project.layers).some((layer) => layer.id !== ignoredTargetId && layer.mask?.sourceLayerId === sourceId);
  if (!stillUsed && project.layers[sourceId]) project.layers[sourceId].maskSource = false;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

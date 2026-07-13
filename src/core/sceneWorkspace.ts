import type { KurogiProject, Layer, Scene } from "../types";
import { cloneProject, createId, touchProject } from "./project";

export interface SceneWorkspacePosition {
  x: number;
  y: number;
}

export interface SceneUpdatePatch {
  name?: string;
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  background?: Scene["background"];
}

export interface SceneMutationResult {
  project: KurogiProject;
  sceneId: string;
  layerIds: string[];
}

type WorkspaceScene = Scene & { workspace?: SceneWorkspacePosition };

const SCENE_GAP = 240;
const DEFAULT_SCENE_WIDTH = 1080;
const DEFAULT_SCENE_HEIGHT = 1080;

export function ensureSceneWorkspace(project: KurogiProject): KurogiProject {
  const scenes = Object.values(project.scenes);
  if (scenes.length === 0) return project;

  const positioned = scenes.filter((scene) => isWorkspacePosition((scene as WorkspaceScene).workspace));
  let cursorX = positioned.reduce((right, scene) => {
    const position = (scene as WorkspaceScene).workspace!;
    return Math.max(right, position.x + scene.width + SCENE_GAP);
  }, 0);

  let changed = false;
  const next = cloneProject(project);
  for (const scene of Object.values(next.scenes)) {
    const workspaceScene = scene as WorkspaceScene;
    if (isWorkspacePosition(workspaceScene.workspace)) continue;
    workspaceScene.workspace = { x: cursorX, y: 0 };
    cursorX += scene.width + SCENE_GAP;
    changed = true;
  }
  return changed ? next : project;
}

export function getSceneWorkspacePosition(scene: Scene): SceneWorkspacePosition {
  const position = (scene as WorkspaceScene).workspace;
  return isWorkspacePosition(position) ? position : { x: 0, y: 0 };
}

export function getSceneWorkspaceBounds(project: KurogiProject) {
  const scenes = Object.values(project.scenes);
  if (scenes.length === 0) {
    return { left: 0, top: 0, right: DEFAULT_SCENE_WIDTH, bottom: DEFAULT_SCENE_HEIGHT, width: DEFAULT_SCENE_WIDTH, height: DEFAULT_SCENE_HEIGHT };
  }
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const scene of scenes) {
    const position = getSceneWorkspacePosition(scene);
    left = Math.min(left, position.x);
    top = Math.min(top, position.y);
    right = Math.max(right, position.x + scene.width);
    bottom = Math.max(bottom, position.y + scene.height);
  }
  return { left, top, right, bottom, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export function setActiveScene(project: KurogiProject, sceneId: string): KurogiProject {
  if (!project.scenes[sceneId] || project.activeSceneId === sceneId) return project;
  const next = cloneProject(project);
  next.activeSceneId = sceneId;
  return touchProject(next);
}

export function createScene(project: KurogiProject): SceneMutationResult {
  const prepared = ensureSceneWorkspace(project);
  const next = cloneProject(prepared);
  const source = next.scenes[next.activeSceneId] ?? Object.values(next.scenes)[0];
  const id = createId("scene");
  const right = Object.values(next.scenes).reduce((value, scene) => {
    const position = getSceneWorkspacePosition(scene);
    return Math.max(value, position.x + scene.width);
  }, 0);
  const scene: WorkspaceScene = {
    id,
    name: uniqueSceneName(next, "Scene"),
    width: source?.width ?? DEFAULT_SCENE_WIDTH,
    height: source?.height ?? DEFAULT_SCENE_HEIGHT,
    duration: source?.duration ?? 5,
    fps: source?.fps ?? next.settings.defaultFps,
    background: cloneProject(source?.background ?? { type: "solid", color: "#ffffff" }),
    layerIds: [],
    workspace: { x: right + SCENE_GAP, y: source ? getSceneWorkspacePosition(source).y : 0 },
  };
  next.scenes[id] = scene;
  next.activeSceneId = id;
  return { project: touchProject(next), sceneId: id, layerIds: [] };
}

export function duplicateScene(project: KurogiProject, sceneId: string): SceneMutationResult {
  const prepared = ensureSceneWorkspace(project);
  const sourceScene = prepared.scenes[sceneId];
  if (!sourceScene) return { project, sceneId: project.activeSceneId, layerIds: [] };

  const next = cloneProject(prepared);
  const id = createId("scene");
  const sourcePosition = getSceneWorkspacePosition(sourceScene);
  const layerMap = new Map<string, string>();
  const sourceLayers = Object.values(prepared.layers).filter((layer) => layer.sceneId === sceneId);
  for (const layer of sourceLayers) layerMap.set(layer.id, createId("layer"));

  const copiedLayers: Layer[] = sourceLayers.map((layer) => cloneLayerForScene(layer, id, layerMap));
  for (const layer of copiedLayers) next.layers[layer.id] = layer;

  const copiedScene: WorkspaceScene = {
    ...cloneProject(sourceScene),
    id,
    name: uniqueSceneName(next, `${sourceScene.name} copy`),
    layerIds: sourceScene.layerIds.map((layerId) => layerMap.get(layerId)).filter(Boolean) as string[],
    workspace: { x: sourcePosition.x + sourceScene.width + SCENE_GAP, y: sourcePosition.y },
  };
  next.scenes[id] = copiedScene;
  next.activeSceneId = id;
  return { project: touchProject(next), sceneId: id, layerIds: copiedScene.layerIds };
}

export function removeScene(project: KurogiProject, sceneId: string): SceneMutationResult {
  const sceneIds = Object.keys(project.scenes);
  if (!project.scenes[sceneId] || sceneIds.length <= 1) {
    return { project, sceneId: project.activeSceneId, layerIds: [] };
  }
  const next = cloneProject(project);
  const removedIndex = sceneIds.indexOf(sceneId);
  for (const [layerId, layer] of Object.entries(next.layers)) {
    if (layer.sceneId === sceneId) delete next.layers[layerId];
  }
  delete next.scenes[sceneId];
  const remaining = Object.keys(next.scenes);
  const fallback = remaining[Math.min(removedIndex, remaining.length - 1)] ?? remaining[0];
  if (next.activeSceneId === sceneId) next.activeSceneId = fallback;
  return { project: touchProject(next), sceneId: next.activeSceneId, layerIds: next.scenes[next.activeSceneId]?.layerIds ?? [] };
}

export function renameScene(project: KurogiProject, sceneId: string, name: string): KurogiProject {
  const clean = name.trim();
  if (!clean || project.scenes[sceneId]?.name === clean) return project;
  return updateScene(project, sceneId, { name: clean });
}

export function updateScene(project: KurogiProject, sceneId: string, patch: SceneUpdatePatch): KurogiProject {
  const scene = project.scenes[sceneId];
  if (!scene) return project;
  const next = cloneProject(project);
  const target = next.scenes[sceneId];
  if (patch.name !== undefined && patch.name.trim()) target.name = patch.name.trim();
  if (patch.width !== undefined) target.width = clampInteger(patch.width, 64, 7680);
  if (patch.height !== undefined) target.height = clampInteger(patch.height, 64, 7680);
  if (patch.duration !== undefined) target.duration = clampNumber(patch.duration, 0.1, 3600);
  if (patch.fps !== undefined) target.fps = normalizeFps(patch.fps);
  if (patch.background !== undefined) {
    target.background = patch.background.type === "transparent"
      ? { type: "transparent" }
      : { type: "solid", color: patch.background.color || "#ffffff" };
  }
  return touchProject(next);
}

export function moveScene(project: KurogiProject, sceneId: string, position: SceneWorkspacePosition): KurogiProject {
  const scene = project.scenes[sceneId] as WorkspaceScene | undefined;
  if (!scene || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return project;
  const current = getSceneWorkspacePosition(scene);
  if (Math.abs(current.x - position.x) < 0.01 && Math.abs(current.y - position.y) < 0.01) return project;
  const next = cloneProject(project);
  (next.scenes[sceneId] as WorkspaceScene).workspace = { x: position.x, y: position.y };
  return touchProject(next);
}

export function copyLayersToScene(project: KurogiProject, layerIds: string[], targetSceneId: string): SceneMutationResult {
  const targetScene = project.scenes[targetSceneId];
  if (!targetScene || layerIds.length === 0) return { project, sceneId: project.activeSceneId, layerIds: [] };

  const expanded = expandLayerSelection(project, layerIds);
  const sourceLayers = expanded.map((id) => project.layers[id]).filter((layer): layer is Layer => Boolean(layer));
  if (sourceLayers.length === 0) return { project, sceneId: project.activeSceneId, layerIds: [] };

  const next = cloneProject(project);
  const layerMap = new Map<string, string>();
  for (const layer of sourceLayers) layerMap.set(layer.id, createId("layer"));

  const copied = sourceLayers.map((layer) => {
    const cloned = cloneLayerForScene(layer, targetSceneId, layerMap);
    const sourceScene = project.scenes[layer.sceneId];
    if (sourceScene && sourceScene.id !== targetSceneId) {
      const xRatio = targetScene.width / Math.max(1, sourceScene.width);
      const yRatio = targetScene.height / Math.max(1, sourceScene.height);
      cloned.position = {
        x: clampNumber(layer.position.x * xRatio + 32, -cloned.size.width * 0.5, targetScene.width - cloned.size.width * 0.5),
        y: clampNumber(layer.position.y * yRatio + 32, -cloned.size.height * 0.5, targetScene.height - cloned.size.height * 0.5),
      };
    } else {
      cloned.position = { x: cloned.position.x + 32, y: cloned.position.y + 32 };
    }
    return cloned;
  });

  for (const layer of copied) next.layers[layer.id] = layer;
  const copiedOrder = sourceLayers
    .slice()
    .sort((left, right) => {
      const leftScene = project.scenes[left.sceneId];
      const rightScene = project.scenes[right.sceneId];
      return (leftScene?.layerIds.indexOf(left.id) ?? 0) - (rightScene?.layerIds.indexOf(right.id) ?? 0);
    })
    .map((layer) => layerMap.get(layer.id)!)
    .filter(Boolean);
  next.scenes[targetSceneId].layerIds.push(...copiedOrder);
  next.activeSceneId = targetSceneId;
  const selectedCopies = layerIds.map((id) => layerMap.get(id)).filter(Boolean) as string[];
  return { project: touchProject(next), sceneId: targetSceneId, layerIds: selectedCopies.length ? selectedCopies : copiedOrder };
}

function cloneLayerForScene(layer: Layer, sceneId: string, layerMap: Map<string, string>): Layer {
  const id = layerMap.get(layer.id) ?? createId("layer");
  const copy = cloneProject(layer);
  copy.id = id;
  copy.sceneId = sceneId;
  copy.parentId = copy.parentId ? layerMap.get(copy.parentId) : undefined;
  copy.animationActions = copy.animationActions.map((action) => ({
    ...action,
    id: createId("action"),
    layerId: id,
  }));
  if (copy.type === "group") {
    copy.childIds = copy.childIds.map((childId) => layerMap.get(childId)).filter(Boolean) as string[];
  }
  return copy;
}

function expandLayerSelection(project: KurogiProject, layerIds: string[]): string[] {
  const selected = new Set(layerIds.filter((id) => Boolean(project.layers[id])));
  const visit = (layerId: string) => {
    const layer = project.layers[layerId];
    if (!layer || layer.type !== "group") return;
    for (const childId of layer.childIds) {
      if (!selected.has(childId)) selected.add(childId);
      visit(childId);
    }
  };
  for (const id of [...selected]) visit(id);
  return [...selected];
}

function uniqueSceneName(project: KurogiProject, base: string) {
  const names = new Set(Object.values(project.scenes).map((scene) => scene.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let index = 2;
  while (names.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

function isWorkspacePosition(value: unknown): value is SceneWorkspacePosition {
  if (!value || typeof value !== "object") return false;
  const position = value as Partial<SceneWorkspacePosition>;
  return Number.isFinite(position.x) && Number.isFinite(position.y);
}

function normalizeFps(value: number) {
  return value <= 24 ? 24 : value >= 60 ? 60 : 30;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.round(clampNumber(value, min, max));
}

function clampNumber(value: number, min: number, max: number) {
  const finite = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, finite));
}

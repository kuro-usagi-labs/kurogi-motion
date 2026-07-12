import {
  PROJECT_VERSION,
  type AnimationAction,
  type AnimationCategory,
  type AnimationType,
  type ImageLayer,
  type KurogiProject,
  type Layer,
  type ProjectAsset,
  type Scene,
  type ShapeLayer,
  type ShapeType,
  type SvgLayer,
  type TextLayer,
} from "../types";

export type ProjectFormat = "square" | "vertical" | "landscape" | "portrait" | "custom";

export interface CreateProjectOptions {
  name: string;
  format: ProjectFormat;
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  background?: string;
  transparent?: boolean;
}

const FORMAT_SIZES: Record<Exclude<ProjectFormat, "custom">, [number, number]> = {
  square: [1080, 1080],
  vertical: [1080, 1920],
  landscape: [1920, 1080],
  portrait: [1080, 1350],
};

export function createId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

export function createProject(options: CreateProjectOptions): KurogiProject {
  const now = new Date().toISOString();
  const projectId = createId("project");
  const sceneId = createId("scene");
  const preset = options.format === "custom" ? null : FORMAT_SIZES[options.format];
  const width = clampInteger(options.width ?? preset?.[0] ?? 1080, 64, 7680);
  const height = clampInteger(options.height ?? preset?.[1] ?? 1080, 64, 7680);
  const fps = normalizeFps(options.fps ?? 30);
  const duration = clampNumber(options.duration ?? 5, 0.1, 3600);

  const scene: Scene = {
    id: sceneId,
    name: "Scene 01",
    width,
    height,
    duration,
    fps,
    background: options.transparent
      ? { type: "transparent" }
      : { type: "solid", color: options.background ?? "#ffffff" },
    layerIds: [],
  };

  return {
    id: projectId,
    name: options.name.trim() || "Untitled motion",
    version: PROJECT_VERSION,
    createdAt: now,
    updatedAt: now,
    activeSceneId: sceneId,
    scenes: { [sceneId]: scene },
    layers: {},
    assets: {},
    settings: {
      autoSave: true,
      snapEnabled: true,
      defaultFps: fps,
    },
  };
}

export function createStarterProject(): KurogiProject {
  let project = createProject({
    name: "Untitled motion",
    format: "square",
    duration: 5,
    fps: 30,
    background: "#f5f4ff",
  });
  const scene = getActiveScene(project);
  const hero = createTextLayer(scene, {
    name: "Make it move",
    text: "MAKE IT\nMOVE.",
    position: { x: 120, y: 180 },
    size: { width: 760, height: 280 },
    fontSize: 128,
    color: "#1b173a",
  });
  hero.animationActions.push(
    createAnimationAction(hero.id, "in", "moveIn", {
      startTime: 0,
      duration: 0.75,
      easing: "overshoot",
      parameters: { direction: "up", distance: 90 },
    }),
  );

  const orb = createShapeLayer(scene, "circle", {
    name: "Violet orb",
    position: { x: 700, y: 570 },
    size: { width: 235, height: 235 },
    fill: "#8b5cf6",
  });
  orb.animationActions.push(
    createAnimationAction(orb.id, "in", "scaleIn", {
      startTime: 0.2,
      duration: 0.7,
      easing: "backOut",
      parameters: { scale: 0.55 },
    }),
    createAnimationAction(orb.id, "loop", "float", {
      startTime: 0.9,
      duration: 2.2,
      easing: "easeInOut",
      parameters: { intensity: 18 },
      repeat: { count: "infinite", delay: 0 },
    }),
    createAnimationAction(orb.id, "loop", "pulse", {
      startTime: 0.9,
      duration: 1.2,
      easing: "easeInOut",
      parameters: { intensity: 0.045 },
      repeat: { count: "infinite", delay: 0 },
    }),
  );

  const label = createTextLayer(scene, {
    name: "Action-based animation",
    text: "ACTION-BASED ANIMATION",
    position: { x: 125, y: 725 },
    size: { width: 550, height: 60 },
    fontSize: 25,
    color: "#6b6389",
  });
  label.animationActions.push(
    createAnimationAction(label.id, "in", "fadeIn", {
      startTime: 0.45,
      duration: 0.6,
      easing: "easeOut",
    }),
  );

  project = addLayers(project, [hero, orb, label]);
  return project;
}

export const starterProject = createStarterProject();

export function getActiveScene(project: KurogiProject): Scene {
  const scene = project.scenes[project.activeSceneId];
  if (!scene) throw new Error(`Active scene ${project.activeSceneId} does not exist.`);
  return scene;
}

export function getSceneLayers(project: KurogiProject, sceneId = project.activeSceneId): Layer[] {
  const scene = project.scenes[sceneId];
  if (!scene) return [];
  return scene.layerIds.map((id) => project.layers[id]).filter((layer): layer is Layer => Boolean(layer));
}

export function addLayers(project: KurogiProject, layers: Layer[]): KurogiProject {
  if (layers.length === 0) return project;
  const next = cloneProject(project);
  for (const layer of layers) {
    next.layers[layer.id] = layer;
    const scene = next.scenes[layer.sceneId];
    if (scene && !scene.layerIds.includes(layer.id)) scene.layerIds.push(layer.id);
  }
  return touchProject(next);
}

export function removeLayer(project: KurogiProject, layerId: string): KurogiProject {
  const layer = project.layers[layerId];
  if (!layer) return project;
  const next = cloneProject(project);
  delete next.layers[layerId];
  const scene = next.scenes[layer.sceneId];
  if (scene) scene.layerIds = scene.layerIds.filter((id) => id !== layerId);
  for (const candidate of Object.values(next.layers)) {
    if (candidate.parentId === layerId) candidate.parentId = undefined;
    if (candidate.type === "group") candidate.childIds = candidate.childIds.filter((id) => id !== layerId);
  }
  return touchProject(next);
}

export function updateLayer(
  project: KurogiProject,
  layerId: string,
  updater: (layer: Layer) => Layer,
): KurogiProject {
  const layer = project.layers[layerId];
  if (!layer) return project;
  const next = cloneProject(project);
  next.layers[layerId] = updater(next.layers[layerId]);
  return touchProject(next);
}

export function updateAction(
  project: KurogiProject,
  layerId: string,
  actionId: string,
  updater: (action: AnimationAction) => AnimationAction,
): KurogiProject {
  return updateLayer(project, layerId, (layer) => ({
    ...layer,
    animationActions: layer.animationActions.map((action) =>
      action.id === actionId ? updater(action) : action,
    ),
  }));
}

export function duplicateLayer(project: KurogiProject, layerId: string): { project: KurogiProject; layerId: string } {
  const source = project.layers[layerId];
  if (!source) return { project, layerId };
  const id = createId("layer");
  const copy = cloneProject(source);
  copy.id = id;
  copy.name = `${source.name} copy`;
  copy.position = { x: source.position.x + 32, y: source.position.y + 32 };
  copy.animationActions = source.animationActions.map((action) => ({
    ...action,
    id: createId("action"),
    layerId: id,
  }));
  const next = addLayers(project, [copy]);
  return { project: next, layerId: id };
}

export function reorderLayer(project: KurogiProject, layerId: string, direction: "up" | "down"): KurogiProject {
  const layer = project.layers[layerId];
  if (!layer) return project;
  const scene = project.scenes[layer.sceneId];
  if (!scene) return project;
  const index = scene.layerIds.indexOf(layerId);
  const target = direction === "up" ? index + 1 : index - 1;
  if (index < 0 || target < 0 || target >= scene.layerIds.length) return project;
  const next = cloneProject(project);
  const ids = next.scenes[layer.sceneId].layerIds;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return touchProject(next);
}

export function createTextLayer(
  scene: Scene,
  options: Partial<{
    name: string;
    text: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    fontSize: number;
    color: string;
  }> = {},
): TextLayer {
  const id = createId("layer");
  return {
    id,
    sceneId: scene.id,
    name: options.name ?? "New headline",
    type: "text",
    visible: true,
    locked: false,
    position: options.position ?? centerPosition(scene, 700, 140),
    size: options.size ?? { width: 700, height: 140 },
    rotation: 0,
    opacity: 1,
    scale: { x: 1, y: 1 },
    anchor: { x: 0.5, y: 0.5 },
    animationActions: [],
    text: options.text ?? "YOUR IDEA",
    style: {
      fontFamily: "Inter",
      fontSize: options.fontSize ?? 82,
      fontWeight: 800,
      lineHeight: 0.95,
      letterSpacing: -1,
      align: "left",
      color: options.color ?? "#1b173a",
    },
  };
}

export function createShapeLayer(
  scene: Scene,
  shape: ShapeType,
  options: Partial<{
    name: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    fill: string;
  }> = {},
): ShapeLayer {
  const size = options.size ?? (shape === "line" ? { width: 280, height: 8 } : { width: 220, height: 220 });
  return {
    id: createId("layer"),
    sceneId: scene.id,
    name: options.name ?? titleCase(shape),
    type: "shape",
    visible: true,
    locked: false,
    position: options.position ?? centerPosition(scene, size.width, size.height),
    size,
    rotation: 0,
    opacity: 1,
    scale: { x: 1, y: 1 },
    anchor: { x: 0.5, y: 0.5 },
    animationActions: [],
    shape,
    style: {
      fill: options.fill ?? "#8b5cf6",
      stroke: "#00000000",
      strokeWidth: 0,
      borderRadius: shape === "rectangle" ? 24 : 0,
      shadow: 0,
      blur: 0,
    },
  };
}

export function createAssetLayer(scene: Scene, asset: ProjectAsset): ImageLayer | SvgLayer {
  const size = fitInside(scene, asset.width ?? 600, asset.height ?? 400, 0.55);
  const base: Omit<ImageLayer, "type" | "fit"> = {
    id: createId("layer"),
    sceneId: scene.id,
    name: asset.name,
    visible: true,
    locked: false,
    position: centerPosition(scene, size.width, size.height),
    size,
    rotation: 0,
    opacity: 1,
    scale: { x: 1, y: 1 },
    anchor: { x: 0.5, y: 0.5 },
    animationActions: [],
    assetId: asset.id,
  };
  return asset.type === "svg"
    ? { ...base, type: "svg" }
    : { ...base, type: "image", fit: "contain" };
}

export function createAnimationAction(
  layerId: string,
  category: AnimationCategory,
  type: AnimationType,
  overrides: Partial<Omit<AnimationAction, "id" | "layerId" | "category" | "type">> = {},
): AnimationAction {
  return {
    id: createId("action"),
    layerId,
    category,
    type,
    startTime: overrides.startTime ?? 0,
    duration: Math.max(0.05, overrides.duration ?? 0.6),
    delay: Math.max(0, overrides.delay ?? 0),
    easing: overrides.easing ?? (category === "loop" ? "easeInOut" : "easeOut"),
    parameters: { ...defaultParameters(type), ...(overrides.parameters ?? {}) },
    stagger: overrides.stagger,
    repeat: overrides.repeat ?? (category === "loop" ? { count: "infinite", delay: 0 } : undefined),
  };
}

export function normalizeProject(input: unknown): KurogiProject {
  if (isV2Project(input)) return sanitizeProject(input);
  if (isLegacyProject(input)) return migrateLegacyProject(input);
  return createStarterProject();
}

export function cloneProject<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function touchProject(project: KurogiProject): KurogiProject {
  project.updatedAt = new Date().toISOString();
  project.version = PROJECT_VERSION;
  return project;
}

function migrateLegacyProject(input: LegacyProject): KurogiProject {
  let project = createProject({
    name: input.name ?? "Migrated project",
    format: "custom",
    width: input.width,
    height: input.height,
    fps: input.fps,
    duration: input.duration,
    background: input.background,
  });
  const scene = getActiveScene(project);
  const layers: Layer[] = [];
  const assets: Record<string, ProjectAsset> = {};

  for (const legacy of input.layers ?? []) {
    let layer: Layer;
    if (legacy.kind === "text") {
      layer = createTextLayer(scene, {
        name: legacy.name,
        text: legacy.text ?? "Text",
        position: { x: legacy.x, y: legacy.y },
        size: { width: legacy.width, height: legacy.height },
        fontSize: legacy.fontSize ?? 48,
        color: legacy.color,
      });
    } else if (legacy.kind === "image" && legacy.src) {
      const assetId = createId("asset");
      const asset: ProjectAsset = {
        id: assetId,
        projectId: project.id,
        name: legacy.name,
        type: legacy.src.startsWith("data:image/svg") ? "svg" : "image",
        mimeType: legacy.src.slice(5, legacy.src.indexOf(";")) || "image/png",
        sourceUrl: legacy.src,
      };
      assets[assetId] = asset;
      layer = createAssetLayer(scene, asset);
      layer.position = { x: legacy.x, y: legacy.y };
      layer.size = { width: legacy.width, height: legacy.height };
    } else {
      layer = createShapeLayer(scene, "circle", {
        name: legacy.name,
        position: { x: legacy.x, y: legacy.y },
        size: { width: legacy.width, height: legacy.height },
        fill: legacy.color,
      });
    }

    layer.rotation = legacy.rotation ?? 0;
    layer.opacity = legacy.opacity ?? 1;
    layer.visible = !legacy.hidden;
    layer.locked = Boolean(legacy.locked);
    layer.animationActions = legacyMotionsToActions(layer.id, legacy);
    layers.push(layer);
  }

  project.assets = assets;
  project = addLayers(project, layers);
  return project;
}

function legacyMotionsToActions(layerId: string, layer: LegacyLayer): AnimationAction[] {
  const motions = layer.motion ?? [];
  const actions: AnimationAction[] = [];
  for (const motion of motions) {
    if (motion === "fadeUp") {
      actions.push(createAnimationAction(layerId, "in", "moveIn", {
        startTime: layer.start ?? 0,
        duration: Math.min(layer.duration ?? 0.7, 1.2),
        easing: "overshoot",
        parameters: { direction: "up", distance: 80 },
      }));
    } else if (motion === "scaleIn") {
      actions.push(createAnimationAction(layerId, "in", "scaleIn", {
        startTime: layer.start ?? 0,
        duration: Math.min(layer.duration ?? 0.7, 1.2),
        easing: "backOut",
      }));
    } else if (motion === "float" || motion === "pulse") {
      actions.push(createAnimationAction(layerId, "loop", motion, {
        startTime: layer.start ?? 0,
        duration: Math.max(0.4, layer.duration ?? 1.4),
        repeat: { count: "infinite", delay: 0 },
      }));
    } else if (motion === "fadeOut") {
      const duration = Math.max(0.3, Math.min(0.8, layer.duration ?? 0.5));
      actions.push(createAnimationAction(layerId, "out", "fadeOut", {
        startTime: Math.max(0, (layer.start ?? 0) + (layer.duration ?? 1) - duration),
        duration,
        easing: "easeIn",
      }));
    }
  }
  return actions;
}

function sanitizeProject(project: KurogiProject): KurogiProject {
  const next = cloneProject(project);
  next.version = PROJECT_VERSION;
  next.settings = {
    autoSave: next.settings?.autoSave !== false,
    snapEnabled: next.settings?.snapEnabled !== false,
    defaultFps: normalizeFps(next.settings?.defaultFps ?? 30),
  };
  for (const scene of Object.values(next.scenes)) {
    scene.width = clampInteger(scene.width, 64, 7680);
    scene.height = clampInteger(scene.height, 64, 7680);
    scene.duration = clampNumber(scene.duration, 0.1, 3600);
    scene.fps = normalizeFps(scene.fps);
    scene.layerIds = scene.layerIds.filter((id) => Boolean(next.layers[id]));
  }
  for (const layer of Object.values(next.layers)) {
    layer.opacity = clampNumber(layer.opacity, 0, 1);
    layer.size.width = Math.max(1, layer.size.width);
    layer.size.height = Math.max(1, layer.size.height);
    layer.animationActions = (layer.animationActions ?? []).map((action) => ({
      ...action,
      layerId: layer.id,
      startTime: Math.max(0, action.startTime),
      duration: Math.max(0.05, action.duration),
      delay: Math.max(0, action.delay),
      parameters: action.parameters ?? {},
    }));
  }
  return next;
}

function isV2Project(value: unknown): value is KurogiProject {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<KurogiProject>;
  return Boolean(candidate.id && candidate.activeSceneId && candidate.scenes && candidate.layers);
}

interface LegacyLayer {
  id?: string;
  name: string;
  kind: "text" | "shape" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  color: string;
  text?: string;
  src?: string;
  fontSize?: number;
  hidden?: boolean;
  locked?: boolean;
  motion?: Array<"fadeUp" | "scaleIn" | "float" | "pulse" | "fadeOut">;
  start?: number;
  duration?: number;
}

interface LegacyProject {
  name?: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: string;
  layers: LegacyLayer[];
}

function isLegacyProject(value: unknown): value is LegacyProject {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LegacyProject>;
  return Array.isArray(candidate.layers) && typeof candidate.width === "number";
}

function defaultParameters(type: AnimationType): Record<string, number | string | boolean> {
  if (type === "moveIn" || type === "moveOut") return { direction: "up", distance: 90 };
  if (type === "scaleIn") return { scale: 0.7 };
  if (type === "scaleOut") return { scale: 0.7 };
  if (type === "rotateIn" || type === "rotateOut") return { rotation: 25 };
  if (type === "blurIn" || type === "blurOut") return { blur: 18 };
  if (type === "maskReveal" || type === "maskHide") return { direction: "left" };
  if (type === "pulse" || type === "breathe") return { intensity: 0.06 };
  if (type === "float") return { intensity: 18 };
  if (type === "shake") return { intensity: 10, frequency: 5 };
  if (type === "spin") return { turns: 1, direction: "clockwise" };
  if (type === "swing") return { intensity: 8 };
  return {};
}

function centerPosition(scene: Scene, width: number, height: number): { x: number; y: number } {
  return { x: (scene.width - width) / 2, y: (scene.height - height) / 2 };
}

function fitInside(scene: Scene, width: number, height: number, ratio: number): SizeLike {
  const maxWidth = scene.width * ratio;
  const maxHeight = scene.height * ratio;
  const scale = Math.min(1, maxWidth / Math.max(1, width), maxHeight / Math.max(1, height));
  return { width: Math.max(1, width * scale), height: Math.max(1, height * scale) };
}

type SizeLike = { width: number; height: number };

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeFps(value: number): number {
  return value <= 24 ? 24 : value >= 60 ? 60 : 30;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

function clampNumber(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, finite));
}

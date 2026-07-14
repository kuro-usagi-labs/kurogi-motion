import type { KurogiProject, Layer, ShapeType } from "../types";
import {
  addLayers,
  cloneProject,
  createShapeLayer,
  createTextLayer,
  getSceneLayers,
  removeLayer,
  updateLayer,
} from "./project";
import {
  createScene,
  ensureSceneWorkspace,
  setActiveScene,
  updateScene,
} from "./sceneWorkspace";

export interface McpBridgeRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export type McpBridgeResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string };

export interface McpProjectCommandResult {
  project: KurogiProject;
  result: Record<string, unknown>;
  changed: boolean;
  selectedLayerId?: string;
  activeSceneId?: string;
}

const MUTATION_METHODS = new Set([
  "project.create_scene",
  "project.set_active_scene",
  "project.create_layer",
  "project.update_layer",
  "project.delete_layer",
]);

const SHAPE_TYPES = new Set<ShapeType>([
  "rectangle",
  "circle",
  "line",
  "polygon",
  "arrow",
  "triangle",
  "star",
  "heart",
  "diamond",
  "hexagon",
]);

export function isMcpMutationMethod(method: string): boolean {
  return MUTATION_METHODS.has(method);
}

export function describeMcpMutation(method: string, params: Record<string, unknown> = {}): string {
  switch (method) {
    case "project.create_scene": return `create a new scene${text(params.name) ? ` named “${text(params.name)}”` : ""}`;
    case "project.set_active_scene": return `switch the active scene to ${text(params.sceneId) || "the requested scene"}`;
    case "project.create_layer": return `create a ${text(params.type) || "new"} layer`;
    case "project.update_layer": return `update layer ${text(params.layerId) || "properties"}`;
    case "project.delete_layer": return `delete layer ${text(params.layerId) || "the requested layer"}`;
    default: return "change the active project";
  }
}

export function getMcpProjectContext(project: KurogiProject, includeDocument = false) {
  const prepared = ensureSceneWorkspace(project);
  const scenes = Object.values(prepared.scenes).map((scene) => ({
    id: scene.id,
    name: scene.name,
    width: scene.width,
    height: scene.height,
    duration: scene.duration,
    fps: scene.fps,
    background: scene.background,
    active: scene.id === prepared.activeSceneId,
    layers: getSceneLayers(prepared, scene.id).map(summarizeLayer),
  }));
  return {
    project: {
      id: prepared.id,
      name: prepared.name,
      version: prepared.version,
      createdAt: prepared.createdAt,
      updatedAt: prepared.updatedAt,
      activeSceneId: prepared.activeSceneId,
      sceneCount: scenes.length,
      layerCount: Object.keys(prepared.layers).length,
    },
    scenes,
    ...(includeDocument ? { document: sanitizeProjectDocument(prepared) } : {}),
  };
}

export function executeMcpProjectCommand(
  project: KurogiProject,
  method: string,
  rawParams: Record<string, unknown> = {},
): McpProjectCommandResult {
  const params = rawParams ?? {};
  const prepared = ensureSceneWorkspace(project);

  if (method === "project.get_context") {
    return {
      project: prepared,
      changed: false,
      result: getMcpProjectContext(prepared, Boolean(params.includeDocument)),
    };
  }

  if (method === "project.create_scene") {
    const created = createScene(prepared);
    let next = created.project;
    const background = Boolean(params.transparent)
      ? { type: "transparent" as const }
      : color(params.background)
        ? { type: "solid" as const, color: color(params.background) }
        : undefined;
    next = updateScene(next, created.sceneId, {
      name: optionalText(params.name),
      width: optionalNumber(params.width),
      height: optionalNumber(params.height),
      duration: optionalNumber(params.duration),
      fps: optionalNumber(params.fps),
      background,
    });
    const scene = next.scenes[created.sceneId];
    return {
      project: next,
      changed: true,
      activeSceneId: created.sceneId,
      result: { created: true, scene: summarizeScene(scene) },
    };
  }

  if (method === "project.set_active_scene") {
    const sceneId = requiredText(params.sceneId, "sceneId");
    if (!prepared.scenes[sceneId]) throw new Error(`Scene ${sceneId} does not exist.`);
    const next = setActiveScene(prepared, sceneId);
    return {
      project: next,
      changed: next !== prepared,
      activeSceneId: sceneId,
      result: { activeSceneId: sceneId, scene: summarizeScene(next.scenes[sceneId]) },
    };
  }

  if (method === "project.create_layer") {
    const layerType = requiredText(params.type, "type");
    const sceneId = optionalText(params.sceneId) || prepared.activeSceneId;
    const scene = prepared.scenes[sceneId];
    if (!scene) throw new Error(`Scene ${sceneId} does not exist.`);
    const position = pointFromParams(params);
    const size = sizeFromParams(params);
    let layer: Layer;
    if (layerType === "text") {
      layer = createTextLayer(scene, {
        name: optionalText(params.name),
        text: optionalTextAllowEmpty(params.text),
        position,
        size,
        fontSize: optionalNumber(params.fontSize),
        color: color(params.color),
      });
    } else if (layerType === "shape") {
      const requestedShape = optionalText(params.shape) || "rectangle";
      if (!SHAPE_TYPES.has(requestedShape as ShapeType)) throw new Error(`Unsupported shape type: ${requestedShape}.`);
      layer = createShapeLayer(scene, requestedShape as ShapeType, {
        name: optionalText(params.name),
        position,
        size,
        fill: color(params.color),
      });
    } else {
      throw new Error("MCP V1 can create text or shape layers.");
    }
    const next = addLayers(prepared, [layer]);
    return {
      project: next,
      changed: true,
      selectedLayerId: layer.id,
      activeSceneId: sceneId,
      result: { created: true, layer: summarizeLayer(layer) },
    };
  }

  if (method === "project.update_layer") {
    const layerId = requiredText(params.layerId, "layerId");
    const source = prepared.layers[layerId];
    if (!source) throw new Error(`Layer ${layerId} does not exist.`);
    const next = updateLayer(prepared, layerId, (current) => updateLayerFromParams(current, params));
    return {
      project: next,
      changed: next !== prepared,
      selectedLayerId: layerId,
      activeSceneId: source.sceneId,
      result: { updated: true, layer: summarizeLayer(next.layers[layerId]) },
    };
  }

  if (method === "project.delete_layer") {
    const layerId = requiredText(params.layerId, "layerId");
    const source = prepared.layers[layerId];
    if (!source) throw new Error(`Layer ${layerId} does not exist.`);
    const next = removeLayer(prepared, layerId);
    return {
      project: next,
      changed: next !== prepared,
      activeSceneId: source.sceneId,
      result: { deleted: true, layerId, sceneId: source.sceneId },
    };
  }

  throw new Error(`Unsupported MCP project method: ${method}`);
}

function updateLayerFromParams(layer: Layer, params: Record<string, unknown>): Layer {
  const next = cloneProject(layer);
  const name = optionalText(params.name);
  if (name) next.name = name;
  const x = optionalNumber(params.x);
  const y = optionalNumber(params.y);
  if (x !== undefined) next.position.x = x;
  if (y !== undefined) next.position.y = y;
  const width = optionalNumber(params.width);
  const height = optionalNumber(params.height);
  if (width !== undefined) next.size.width = Math.max(1, width);
  if (height !== undefined) next.size.height = Math.max(1, height);
  const rotation = optionalNumber(params.rotation);
  if (rotation !== undefined) next.rotation = rotation;
  const opacity = optionalNumber(params.opacity);
  if (opacity !== undefined) next.opacity = clamp(opacity, 0, 1);
  if (typeof params.visible === "boolean") next.visible = params.visible;
  if (typeof params.locked === "boolean") next.locked = params.locked;

  if (next.type === "text") {
    if (typeof params.text === "string") next.text = params.text;
    const fontSize = optionalNumber(params.fontSize);
    if (fontSize !== undefined) next.style.fontSize = Math.max(1, fontSize);
    const textColor = color(params.color);
    if (textColor) next.style.color = textColor;
  }
  if (next.type === "shape") {
    const fill = color(params.fill) || color(params.color);
    if (fill) next.style.fill = fill;
  }
  return next;
}

function summarizeScene(scene: KurogiProject["scenes"][string]) {
  return {
    id: scene.id,
    name: scene.name,
    width: scene.width,
    height: scene.height,
    duration: scene.duration,
    fps: scene.fps,
    background: scene.background,
    layerIds: [...scene.layerIds],
  };
}

function summarizeLayer(layer: Layer) {
  const common = {
    id: layer.id,
    sceneId: layer.sceneId,
    name: layer.name,
    type: layer.type,
    visible: layer.visible,
    locked: layer.locked,
    position: layer.position,
    size: layer.size,
    rotation: layer.rotation,
    opacity: layer.opacity,
    animationActionCount: layer.animationActions.length,
  };
  if (layer.type === "text") return { ...common, text: layer.text, style: layer.style };
  if (layer.type === "shape") return { ...common, shape: layer.shape, style: layer.style };
  if (layer.type === "image" || layer.type === "svg") return { ...common, assetId: layer.assetId };
  if (layer.type === "group") return { ...common, childIds: layer.childIds };
  return common;
}

function sanitizeProjectDocument(project: KurogiProject): KurogiProject {
  const next = cloneProject(project);
  for (const asset of Object.values(next.assets)) {
    asset.sourceUrl = "";
    asset.thumbnailUrl = undefined;
  }
  return next;
}

function pointFromParams(params: Record<string, unknown>) {
  const x = optionalNumber(params.x);
  const y = optionalNumber(params.y);
  return x === undefined && y === undefined ? undefined : { x: x ?? 0, y: y ?? 0 };
}

function sizeFromParams(params: Record<string, unknown>) {
  const width = optionalNumber(params.width);
  const height = optionalNumber(params.height);
  return width === undefined && height === undefined
    ? undefined
    : { width: Math.max(1, width ?? 100), height: Math.max(1, height ?? 100) };
}

function requiredText(value: unknown, name: string): string {
  const result = text(value);
  if (!result) throw new Error(`${name} is required.`);
  return result;
}

function optionalText(value: unknown): string | undefined {
  return text(value) || undefined;
}

function optionalTextAllowEmpty(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Expected a finite number, received ${String(value)}.`);
  return result;
}

function color(value: unknown): string | undefined {
  const result = text(value);
  if (!result) return undefined;
  if (!/^#[0-9a-f]{3,8}$/i.test(result)) throw new Error(`Invalid color: ${result}. Use a hex color.`);
  return result;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

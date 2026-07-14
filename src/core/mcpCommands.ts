import type {
  AnimationAction,
  AnimationCategory,
  AnimationType,
  AudioClip,
  EasingName,
  KurogiProject,
  Layer,
  ShapeType,
} from "../types";
import {
  addLayers,
  cloneProject,
  createAnimationAction,
  createAssetLayer,
  createShapeLayer,
  createTextLayer,
  duplicateLayer,
  getSceneLayers,
  removeLayer,
  reorderLayer,
  touchProject,
  updateAction,
  updateLayer,
} from "./project";
import {
  createScene,
  duplicateScene,
  ensureSceneWorkspace,
  removeScene,
  setActiveScene,
  updateScene,
} from "./sceneWorkspace";
import {
  createAudioClip,
  duplicateAudioClip,
  getSceneAudioClips,
  removeAudioClip,
  updateAudioClip,
} from "./audio";

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
  selectedAudioClipId?: string;
  activeSceneId?: string;
}

const MUTATION_METHODS = new Set([
  "asset.import_file",
  "project.rename",
  "project.create_scene",
  "project.update_scene",
  "project.duplicate_scene",
  "project.delete_scene",
  "project.set_active_scene",
  "project.create_layer",
  "project.update_layer",
  "project.duplicate_layer",
  "project.delete_layer",
  "project.reorder_layer",
  "project.add_animation",
  "project.update_animation",
  "project.delete_animation",
  "project.create_audio_clip",
  "project.update_audio_clip",
  "project.duplicate_audio_clip",
  "project.delete_audio_clip",
  "project.apply_edit_plan",
]);

const SHAPE_TYPES = new Set<ShapeType>([
  "rectangle", "circle", "line", "polygon", "arrow", "triangle", "diamond", "star", "heart",
  "hexagon", "octagon", "plus", "cross", "speechBubble", "cloud", "burst", "chevron", "ring",
  "droplet", "lightning",
]);

const ANIMATION_TYPES = new Set<AnimationType>([
  "fadeIn", "moveIn", "scaleIn", "rotateIn", "blurIn", "maskReveal", "popIn", "slideIn", "springIn",
  "flipIn", "stretchIn", "wipeIn", "zoomBlurIn", "dropIn", "rollIn", "elasticIn", "counter", "motionPath",
  "pulse", "float", "shake", "spin", "breathe", "swing", "hover", "wobble", "heartbeat", "drift", "orbit",
  "wave", "jiggle", "glowPulse", "ripple", "liquid", "fadeOut", "moveOut", "scaleOut", "rotateOut", "blurOut",
  "maskHide", "popOut", "slideOut", "flipOut", "stretchOut", "wipeOut", "zoomBlurOut", "dropOut", "rollOut",
]);

const EASINGS = new Set<EasingName>([
  "linear", "easeIn", "easeOut", "easeInOut", "backIn", "backOut", "overshoot", "bounce", "elastic", "custom",
]);

export function isMcpMutationMethod(method: string): boolean {
  return MUTATION_METHODS.has(method);
}

export function describeMcpMutation(method: string, params: Record<string, unknown> = {}): string {
  switch (method) {
    case "asset.import_file": return `import media from ${text(params.path) || "a local file"}`;
    case "project.rename": return `rename the project to “${text(params.name) || "Untitled"}”`;
    case "project.create_scene": return `create a new scene${text(params.name) ? ` named “${text(params.name)}”` : ""}`;
    case "project.update_scene": return `update scene ${text(params.sceneId) || "settings"}`;
    case "project.duplicate_scene": return `duplicate scene ${text(params.sceneId) || "the active scene"}`;
    case "project.delete_scene": return `delete scene ${text(params.sceneId) || "the requested scene"}`;
    case "project.set_active_scene": return `switch the active scene to ${text(params.sceneId) || "the requested scene"}`;
    case "project.create_layer": return `create a ${text(params.type) || "new"} layer`;
    case "project.update_layer": return `update layer ${text(params.layerId) || "properties"}`;
    case "project.duplicate_layer": return `duplicate layer ${text(params.layerId) || "the requested layer"}`;
    case "project.delete_layer": return `delete layer ${text(params.layerId) || "the requested layer"}`;
    case "project.reorder_layer": return `reorder layer ${text(params.layerId) || "the requested layer"}`;
    case "project.add_animation": return `add animation ${text(params.type) || "action"}`;
    case "project.update_animation": return `update animation ${text(params.actionId) || "action"}`;
    case "project.delete_animation": return `delete animation ${text(params.actionId) || "action"}`;
    case "project.create_audio_clip": return "add an audio clip to the timeline";
    case "project.update_audio_clip": return `update audio clip ${text(params.clipId) || "properties"}`;
    case "project.duplicate_audio_clip": return `duplicate audio clip ${text(params.clipId) || "the requested clip"}`;
    case "project.delete_audio_clip": return `delete audio clip ${text(params.clipId) || "the requested clip"}`;
    case "project.apply_edit_plan": return `apply ${Array.isArray(params.operations) ? params.operations.length : "multiple"} project edits as one transaction`;
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
    audioClips: getSceneAudioClips(prepared, scene.id).map((clip) => summarizeAudioClip(prepared, clip)),
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
      audioClipCount: Object.keys(prepared.audioClips ?? {}).length,
      assetCount: Object.keys(prepared.assets).length,
    },
    scenes,
    assets: Object.values(prepared.assets).map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      duration: asset.duration,
      byteSize: asset.byteSize,
    })),
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
    return { project: prepared, changed: false, result: getMcpProjectContext(prepared, Boolean(params.includeDocument)) };
  }

  if (method === "project.rename") {
    const name = requiredText(params.name, "name");
    if (prepared.name === name) return { project: prepared, changed: false, result: { renamed: false, name } };
    const next = cloneProject(prepared);
    next.name = name;
    return { project: touchProject(next), changed: true, result: { renamed: true, name } };
  }

  if (method === "project.create_scene") {
    const created = createScene(prepared);
    let next = updateScene(created.project, created.sceneId, scenePatch(params));
    const scene = next.scenes[created.sceneId];
    return { project: next, changed: true, activeSceneId: created.sceneId, result: { created: true, scene: summarizeScene(scene) } };
  }

  if (method === "project.update_scene") {
    const sceneId = optionalText(params.sceneId) || prepared.activeSceneId;
    if (!prepared.scenes[sceneId]) throw new Error(`Scene ${sceneId} does not exist.`);
    const next = updateScene(prepared, sceneId, scenePatch(params));
    return { project: next, changed: next !== prepared, activeSceneId: sceneId, result: { updated: true, scene: summarizeScene(next.scenes[sceneId]) } };
  }

  if (method === "project.duplicate_scene") {
    const sceneId = optionalText(params.sceneId) || prepared.activeSceneId;
    const duplicated = duplicateScene(prepared, sceneId);
    return { project: duplicated.project, changed: duplicated.project !== prepared, activeSceneId: duplicated.sceneId, result: { duplicated: true, scene: summarizeScene(duplicated.project.scenes[duplicated.sceneId]) } };
  }

  if (method === "project.delete_scene") {
    const sceneId = requiredText(params.sceneId, "sceneId");
    if (!prepared.scenes[sceneId]) throw new Error(`Scene ${sceneId} does not exist.`);
    const removed = removeScene(prepared, sceneId);
    return { project: removed.project, changed: removed.project !== prepared, activeSceneId: removed.sceneId, result: { deleted: removed.project !== prepared, sceneId, activeSceneId: removed.sceneId } };
  }

  if (method === "project.set_active_scene") {
    const sceneId = requiredText(params.sceneId, "sceneId");
    if (!prepared.scenes[sceneId]) throw new Error(`Scene ${sceneId} does not exist.`);
    const next = setActiveScene(prepared, sceneId);
    return { project: next, changed: next !== prepared, activeSceneId: sceneId, result: { activeSceneId: sceneId, scene: summarizeScene(next.scenes[sceneId]) } };
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
        name: optionalText(params.name), text: optionalTextAllowEmpty(params.text), position, size,
        fontSize: optionalNumber(params.fontSize), color: color(params.color),
      });
    } else if (layerType === "shape") {
      const requestedShape = optionalText(params.shape) || "rectangle";
      if (!SHAPE_TYPES.has(requestedShape as ShapeType)) throw new Error(`Unsupported shape type: ${requestedShape}.`);
      layer = createShapeLayer(scene, requestedShape as ShapeType, { name: optionalText(params.name), position, size, fill: color(params.color) });
    } else if (layerType === "asset") {
      const assetId = requiredText(params.assetId, "assetId");
      const asset = prepared.assets[assetId];
      if (!asset || asset.type === "audio" || asset.type === "font") throw new Error(`Asset ${assetId} cannot be placed as a visual layer.`);
      layer = createAssetLayer(scene, asset);
      if (position) layer.position = position;
      if (size) layer.size = size;
      if (optionalText(params.name)) layer.name = optionalText(params.name)!;
    } else {
      throw new Error("Layer type must be text, shape, or asset.");
    }
    layer = updateLayerFromParams(layer, params);
    const next = addLayers(prepared, [layer]);
    return { project: next, changed: true, selectedLayerId: layer.id, activeSceneId: sceneId, result: { created: true, layer: summarizeLayer(layer) } };
  }

  if (method === "project.update_layer") {
    const layerId = requiredText(params.layerId, "layerId");
    const source = prepared.layers[layerId];
    if (!source) throw new Error(`Layer ${layerId} does not exist.`);
    const next = updateLayer(prepared, layerId, (current) => updateLayerFromParams(current, params));
    return { project: next, changed: next !== prepared, selectedLayerId: layerId, activeSceneId: source.sceneId, result: { updated: true, layer: summarizeLayer(next.layers[layerId]) } };
  }

  if (method === "project.duplicate_layer") {
    const layerId = requiredText(params.layerId, "layerId");
    if (!prepared.layers[layerId]) throw new Error(`Layer ${layerId} does not exist.`);
    const result = duplicateLayer(prepared, layerId);
    return { project: result.project, changed: result.project !== prepared, selectedLayerId: result.layerId, activeSceneId: result.project.layers[result.layerId]?.sceneId, result: { duplicated: true, layer: summarizeLayer(result.project.layers[result.layerId]) } };
  }

  if (method === "project.delete_layer") {
    const layerId = requiredText(params.layerId, "layerId");
    const source = prepared.layers[layerId];
    if (!source) throw new Error(`Layer ${layerId} does not exist.`);
    const next = removeLayer(prepared, layerId);
    return { project: next, changed: next !== prepared, activeSceneId: source.sceneId, result: { deleted: true, layerId, sceneId: source.sceneId } };
  }

  if (method === "project.reorder_layer") {
    const layerId = requiredText(params.layerId, "layerId");
    const direction = requiredText(params.direction, "direction");
    if (direction !== "up" && direction !== "down") throw new Error("direction must be up or down.");
    const next = reorderLayer(prepared, layerId, direction);
    return { project: next, changed: next !== prepared, selectedLayerId: layerId, result: { reordered: next !== prepared, layerId, direction } };
  }

  if (method === "project.add_animation") {
    const layerId = requiredText(params.layerId, "layerId");
    const layer = prepared.layers[layerId];
    if (!layer) throw new Error(`Layer ${layerId} does not exist.`);
    const category = animationCategory(params.category);
    const type = animationType(params.type);
    const action = createAnimationAction(layerId, category, type, animationOverrides(params));
    const next = updateLayer(prepared, layerId, (current) => ({ ...current, animationActions: [...current.animationActions, action] }));
    return { project: next, changed: true, selectedLayerId: layerId, activeSceneId: layer.sceneId, result: { created: true, action } };
  }

  if (method === "project.update_animation") {
    const actionId = requiredText(params.actionId, "actionId");
    const owner = findActionOwner(prepared, actionId);
    if (!owner) throw new Error(`Animation action ${actionId} does not exist.`);
    const next = updateAction(prepared, owner.layer.id, actionId, (action) => updateAnimationFromParams(action, params));
    return { project: next, changed: next !== prepared, selectedLayerId: owner.layer.id, activeSceneId: owner.layer.sceneId, result: { updated: true, action: findActionOwner(next, actionId)?.action } };
  }

  if (method === "project.delete_animation") {
    const actionId = requiredText(params.actionId, "actionId");
    const owner = findActionOwner(prepared, actionId);
    if (!owner) throw new Error(`Animation action ${actionId} does not exist.`);
    const next = updateLayer(prepared, owner.layer.id, (layer) => ({ ...layer, animationActions: layer.animationActions.filter((action) => action.id !== actionId) }));
    return { project: next, changed: true, selectedLayerId: owner.layer.id, activeSceneId: owner.layer.sceneId, result: { deleted: true, actionId, layerId: owner.layer.id } };
  }

  if (method === "project.create_audio_clip") {
    const sceneId = optionalText(params.sceneId) || prepared.activeSceneId;
    const assetId = requiredText(params.assetId, "assetId");
    const result = createAudioClip(prepared, sceneId, assetId, audioOptions(params));
    return { project: result.project, changed: true, selectedAudioClipId: result.clipId, activeSceneId: sceneId, result: { created: true, clip: summarizeAudioClip(result.project, result.project.audioClips[result.clipId]) } };
  }

  if (method === "project.update_audio_clip") {
    const clipId = requiredText(params.clipId, "clipId");
    const clip = prepared.audioClips[clipId];
    if (!clip) throw new Error(`Audio clip ${clipId} does not exist.`);
    const next = updateAudioClip(prepared, clipId, audioOptions(params));
    return { project: next, changed: next !== prepared, selectedAudioClipId: clipId, activeSceneId: clip.sceneId, result: { updated: true, clip: summarizeAudioClip(next, next.audioClips[clipId]) } };
  }

  if (method === "project.duplicate_audio_clip") {
    const clipId = requiredText(params.clipId, "clipId");
    if (!prepared.audioClips[clipId]) throw new Error(`Audio clip ${clipId} does not exist.`);
    const result = duplicateAudioClip(prepared, clipId);
    return { project: result.project, changed: result.project !== prepared, selectedAudioClipId: result.clipId, activeSceneId: result.project.audioClips[result.clipId]?.sceneId, result: { duplicated: true, clip: summarizeAudioClip(result.project, result.project.audioClips[result.clipId]) } };
  }

  if (method === "project.delete_audio_clip") {
    const clipId = requiredText(params.clipId, "clipId");
    const clip = prepared.audioClips[clipId];
    if (!clip) throw new Error(`Audio clip ${clipId} does not exist.`);
    const next = removeAudioClip(prepared, clipId);
    return { project: next, changed: true, activeSceneId: clip.sceneId, result: { deleted: true, clipId, sceneId: clip.sceneId } };
  }

  if (method === "project.apply_edit_plan") {
    if (!Array.isArray(params.operations) || params.operations.length === 0) throw new Error("operations must be a non-empty array.");
    if (params.operations.length > 200) throw new Error("An edit plan can contain at most 200 operations.");
    let working = prepared;
    const results: unknown[] = [];
    let selectedLayerId: string | undefined;
    let selectedAudioClipId: string | undefined;
    let activeSceneId: string | undefined;
    for (const raw of params.operations) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Each edit-plan operation must be an object.");
      const operation = raw as Record<string, unknown>;
      const operationMethod = requiredText(operation.method, "operation.method");
      if (operationMethod === "project.apply_edit_plan" || operationMethod === "asset.import_file" || operationMethod === "project.save" || operationMethod === "project.export") {
        throw new Error(`Method ${operationMethod} is not allowed inside an edit plan.`);
      }
      const operationParams = operation.params && typeof operation.params === "object" && !Array.isArray(operation.params)
        ? operation.params as Record<string, unknown>
        : {};
      const outcome = executeMcpProjectCommand(working, operationMethod, operationParams);
      working = outcome.project;
      results.push({ method: operationMethod, result: outcome.result });
      selectedLayerId = outcome.selectedLayerId ?? selectedLayerId;
      selectedAudioClipId = outcome.selectedAudioClipId ?? selectedAudioClipId;
      activeSceneId = outcome.activeSceneId ?? activeSceneId;
    }
    return { project: working, changed: working !== prepared, selectedLayerId, selectedAudioClipId, activeSceneId, result: { applied: results.length, operations: results } };
  }

  throw new Error(`Unsupported MCP project method: ${method}`);
}

function scenePatch(params: Record<string, unknown>) {
  const background = Boolean(params.transparent)
    ? { type: "transparent" as const }
    : color(params.background)
      ? { type: "solid" as const, color: color(params.background) }
      : undefined;
  return {
    name: optionalText(params.name), width: optionalNumber(params.width), height: optionalNumber(params.height),
    duration: optionalNumber(params.duration), fps: optionalNumber(params.fps), background,
  };
}

function updateLayerFromParams(layer: Layer, params: Record<string, unknown>): Layer {
  const next = cloneProject(layer);
  const name = optionalText(params.name);
  if (name) next.name = name;
  const x = optionalNumber(params.x); const y = optionalNumber(params.y);
  if (x !== undefined) next.position.x = x; if (y !== undefined) next.position.y = y;
  const width = optionalNumber(params.width); const height = optionalNumber(params.height);
  if (width !== undefined) next.size.width = Math.max(1, width); if (height !== undefined) next.size.height = Math.max(1, height);
  const rotation = optionalNumber(params.rotation); if (rotation !== undefined) next.rotation = rotation;
  const opacity = optionalNumber(params.opacity); if (opacity !== undefined) next.opacity = clamp(opacity, 0, 1);
  const scaleX = optionalNumber(params.scaleX); const scaleY = optionalNumber(params.scaleY);
  if (scaleX !== undefined) next.scale.x = scaleX; if (scaleY !== undefined) next.scale.y = scaleY;
  if (typeof params.visible === "boolean") next.visible = params.visible;
  if (typeof params.locked === "boolean") next.locked = params.locked;
  if (next.type === "text") {
    if (typeof params.text === "string") next.text = params.text;
    const fontSize = optionalNumber(params.fontSize); if (fontSize !== undefined) next.style.fontSize = Math.max(1, fontSize);
    const fontFamily = optionalText(params.fontFamily); if (fontFamily) next.style.fontFamily = fontFamily;
    const fontWeight = optionalNumber(params.fontWeight); if (fontWeight !== undefined) next.style.fontWeight = clamp(fontWeight, 100, 900);
    const textColor = color(params.color); if (textColor) next.style.color = textColor;
    const align = optionalText(params.align); if (align === "left" || align === "center" || align === "right") next.style.align = align;
  }
  if (next.type === "shape") {
    const fill = color(params.fill) || color(params.color); if (fill) next.style.fill = fill;
    const stroke = color(params.stroke); if (stroke) next.style.stroke = stroke;
    const strokeWidth = optionalNumber(params.strokeWidth); if (strokeWidth !== undefined) next.style.strokeWidth = Math.max(0, strokeWidth);
    const borderRadius = optionalNumber(params.borderRadius); if (borderRadius !== undefined) next.style.borderRadius = Math.max(0, borderRadius);
  }
  return next;
}

function animationOverrides(params: Record<string, unknown>) {
  const easing = optionalText(params.easing);
  if (easing && !EASINGS.has(easing as EasingName)) throw new Error(`Unsupported easing: ${easing}.`);
  const repeatCount = params.repeatCount === "infinite" ? "infinite" : optionalNumber(params.repeatCount);
  const parameters = primitiveRecord(params.parameters);
  return {
    startTime: optionalNumber(params.startTime), duration: optionalNumber(params.duration), delay: optionalNumber(params.delay),
    easing: easing as EasingName | undefined,
    easingCurve: Array.isArray(params.easingCurve) && params.easingCurve.length === 4 ? {
      x1: Number(params.easingCurve[0]),
      y1: Number(params.easingCurve[1]),
      x2: Number(params.easingCurve[2]),
      y2: Number(params.easingCurve[3]),
    } : undefined,
    parameters,
    repeat: repeatCount === undefined ? undefined : { count: repeatCount as number | "infinite", delay: Math.max(0, optionalNumber(params.repeatDelay) ?? 0) },
    motionPath: params.motionPath && typeof params.motionPath === "object" && !Array.isArray(params.motionPath) ? cloneProject(params.motionPath) as AnimationAction["motionPath"] : undefined,
  };
}

function updateAnimationFromParams(action: AnimationAction, params: Record<string, unknown>): AnimationAction {
  const next = cloneProject(action);
  if (params.category !== undefined) next.category = animationCategory(params.category);
  if (params.type !== undefined) next.type = animationType(params.type);
  const overrides = animationOverrides(params);
  if (overrides.startTime !== undefined) next.startTime = Math.max(0, overrides.startTime);
  if (overrides.duration !== undefined) next.duration = Math.max(.05, overrides.duration);
  if (overrides.delay !== undefined) next.delay = Math.max(0, overrides.delay);
  if (overrides.easing) next.easing = overrides.easing;
  if (overrides.easingCurve) next.easingCurve = overrides.easingCurve;
  if (params.parameters !== undefined) next.parameters = overrides.parameters ?? {};
  if (params.repeatCount !== undefined) next.repeat = overrides.repeat;
  if (params.motionPath !== undefined) next.motionPath = overrides.motionPath;
  return next;
}

function audioOptions(params: Record<string, unknown>) {
  return {
    name: optionalText(params.name), startTime: optionalNumber(params.startTime), trimStart: optionalNumber(params.trimStart),
    duration: optionalNumber(params.duration), volume: optionalNumber(params.volume),
    muted: typeof params.muted === "boolean" ? params.muted : undefined,
    fadeIn: optionalNumber(params.fadeIn), fadeOut: optionalNumber(params.fadeOut), playbackRate: optionalNumber(params.playbackRate),
  };
}

function summarizeScene(scene: KurogiProject["scenes"][string]) {
  return { id: scene.id, name: scene.name, width: scene.width, height: scene.height, duration: scene.duration, fps: scene.fps, background: scene.background, layerIds: [...scene.layerIds], audioClipIds: [...(scene.audioClipIds ?? [])] };
}

function summarizeLayer(layer: Layer) {
  const common = { id: layer.id, sceneId: layer.sceneId, name: layer.name, type: layer.type, visible: layer.visible, locked: layer.locked, position: layer.position, size: layer.size, rotation: layer.rotation, opacity: layer.opacity, scale: layer.scale, animationActions: layer.animationActions };
  if (layer.type === "text") return { ...common, text: layer.text, style: layer.style };
  if (layer.type === "shape") return { ...common, shape: layer.shape, style: layer.style };
  if (layer.type === "image" || layer.type === "svg") return { ...common, assetId: layer.assetId };
  if (layer.type === "group") return { ...common, childIds: layer.childIds };
  return common;
}

function summarizeAudioClip(project: KurogiProject, clip: AudioClip) {
  const asset = project.assets[clip.assetId];
  return { ...clip, asset: asset ? { id: asset.id, name: asset.name, type: asset.type, mimeType: asset.mimeType, duration: asset.duration } : null };
}

export function sanitizeProjectDocument(project: KurogiProject): KurogiProject {
  const next = cloneProject(project);
  for (const asset of Object.values(next.assets)) { asset.sourceUrl = ""; asset.thumbnailUrl = undefined; }
  return next;
}

function findActionOwner(project: KurogiProject, actionId: string) {
  for (const layer of Object.values(project.layers)) {
    const action = layer.animationActions.find((candidate) => candidate.id === actionId);
    if (action) return { layer, action };
  }
  return null;
}

function animationCategory(value: unknown): AnimationCategory {
  const result = requiredText(value, "category");
  if (result !== "in" && result !== "loop" && result !== "out") throw new Error("category must be in, loop, or out.");
  return result;
}
function animationType(value: unknown): AnimationType {
  const result = requiredText(value, "type") as AnimationType;
  if (!ANIMATION_TYPES.has(result)) throw new Error(`Unsupported animation type: ${result}.`);
  return result;
}
function primitiveRecord(value: unknown): Record<string, number | string | boolean> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("parameters must be an object.");
  const result: Record<string, number | string | boolean> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (typeof candidate !== "number" && typeof candidate !== "string" && typeof candidate !== "boolean") throw new Error(`Animation parameter ${key} must be a number, string, or boolean.`);
    result[key] = candidate;
  }
  return result;
}
function pointFromParams(params: Record<string, unknown>) { const x = optionalNumber(params.x); const y = optionalNumber(params.y); return x === undefined && y === undefined ? undefined : { x: x ?? 0, y: y ?? 0 }; }
function sizeFromParams(params: Record<string, unknown>) { const width = optionalNumber(params.width); const height = optionalNumber(params.height); return width === undefined && height === undefined ? undefined : { width: Math.max(1, width ?? 100), height: Math.max(1, height ?? 100) }; }
function requiredText(value: unknown, name: string): string { const result = text(value); if (!result) throw new Error(`${name} is required.`); return result; }
function optionalText(value: unknown): string | undefined { return text(value) || undefined; }
function optionalTextAllowEmpty(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function optionalNumber(value: unknown): number | undefined { if (value === undefined || value === null || value === "") return undefined; const result = Number(value); if (!Number.isFinite(result)) throw new Error(`Expected a finite number, received ${String(value)}.`); return result; }
function color(value: unknown): string | undefined { const result = text(value); if (!result) return undefined; if (!/^#[0-9a-f]{3,8}$/i.test(result)) throw new Error(`Invalid color: ${result}. Use a hex color.`); return result; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

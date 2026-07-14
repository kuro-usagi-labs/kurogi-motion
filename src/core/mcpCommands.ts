import type {
  AnimationAction,
  AnimationCategory,
  AnimationType,
  AudioClip,
  BlendMode,
  EasingName,
  GradientFill,
  KurogiProject,
  Layer,
  LayerEffectType,
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
  reorderScene,
  setActiveScene,
  setSceneTransition,
  updateScene,
} from "./sceneWorkspace";
import {
  createAudioClip,
  duplicateAudioClip,
  getSceneAudioClips,
  removeAudioClip,
  updateAudioClip,
} from "./audio";
import {
  alignLayers,
  createClippingMask,
  distributeLayers,
  groupLayers,
  releaseClippingMask,
  setBlendMode,
  setGradient,
  ungroupLayer,
} from "./designTools";
import { createLayerEffect, EFFECT_TYPES, normalizeEffects } from "./effects";
import { estimateAutoFitFontSize, validateProject } from "./projectValidation";

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
const BLEND_MODES = new Set<BlendMode>(["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"]);
const EFFECT_TYPE_SET = new Set<LayerEffectType>(EFFECT_TYPES);

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

  if (method === "project.validate") {
    return { project: prepared, changed: false, result: validateProject(prepared) as unknown as Record<string, unknown> };
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

  if (method === "project.reorder_scene") {
    const sceneId = requiredText(params.sceneId, "sceneId");
    const targetIndex = Math.round(requiredNumber(params.targetIndex, "targetIndex"));
    if (!prepared.scenes[sceneId]) throw new Error(`Scene ${sceneId} does not exist.`);
    const next = reorderScene(prepared, sceneId, targetIndex);
    return { project: next, changed: next !== prepared, activeSceneId: sceneId, result: { reordered: next !== prepared, sceneId, targetIndex, sceneOrder: Object.keys(next.scenes) } };
  }

  if (method === "project.set_scene_transition") {
    const sceneId = optionalText(params.sceneId) || prepared.activeSceneId;
    if (!prepared.scenes[sceneId]) throw new Error(`Scene ${sceneId} does not exist.`);
    const type = requiredText(params.type, "type") as NonNullable<KurogiProject["scenes"][string]["transition"]>["type"];
    if (!["cut", "fade", "slide-left", "slide-right", "zoom"].includes(type)) throw new Error("type must be cut, fade, slide-left, slide-right, or zoom.");
    const duration = Math.max(0, optionalNumber(params.duration) ?? .4);
    const next = setSceneTransition(prepared, sceneId, { type, duration });
    return { project: next, changed: next !== prepared, activeSceneId: sceneId, result: { updated: next !== prepared, scene: summarizeScene(next.scenes[sceneId]) } };
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

  if (method === "project.update_layers") {
    const layerIds = requiredTextArray(params.layerIds, "layerIds");
    const deltaX = optionalNumber(params.deltaX) ?? 0;
    const deltaY = optionalNumber(params.deltaY) ?? 0;
    let next = prepared;
    const layers: unknown[] = [];
    for (const layerId of layerIds) {
      const source = next.layers[layerId];
      if (!source) throw new Error(`Layer ${layerId} does not exist.`);
      const patch = { ...params, x: params.x === undefined ? source.position.x + deltaX : params.x, y: params.y === undefined ? source.position.y + deltaY : params.y };
      next = updateLayer(next, layerId, (current) => updateLayerFromParams(current, patch));
      layers.push(summarizeLayer(next.layers[layerId]));
    }
    return { project: next, changed: next !== prepared, selectedLayerId: layerIds.at(-1), result: { updated: layerIds.length, layers } };
  }

  if (method === "project.set_layer_timing") {
    const layerId = requiredText(params.layerId, "layerId");
    const layer = prepared.layers[layerId];
    if (!layer) throw new Error(`Layer ${layerId} does not exist.`);
    const scene = prepared.scenes[layer.sceneId];
    const startTime = clamp(optionalNumber(params.startTime) ?? layer.startTime ?? 0, 0, Math.max(0, scene.duration - .01));
    const duration = clamp(optionalNumber(params.duration) ?? layer.duration ?? scene.duration - startTime, .01, Math.max(.01, scene.duration - startTime));
    const next = updateLayer(prepared, layerId, (current) => ({ ...current, startTime, duration }));
    return { project: next, changed: next !== prepared, selectedLayerId: layerId, activeSceneId: layer.sceneId, result: { updated: true, layer: summarizeLayer(next.layers[layerId]) } };
  }

  if (method === "project.group_layers") {
    const layerIds = requiredTextArray(params.layerIds, "layerIds");
    const grouped = groupLayers(prepared, layerIds);
    if (!grouped.groupId) throw new Error("At least two ungrouped layers from the same scene are required.");
    if (optionalText(params.name)) grouped.project.layers[grouped.groupId].name = optionalText(params.name)!;
    return { project: grouped.project, changed: true, selectedLayerId: grouped.groupId, result: { grouped: true, group: summarizeLayer(grouped.project.layers[grouped.groupId]) } };
  }

  if (method === "project.ungroup_layer") {
    const groupId = requiredText(params.groupId, "groupId");
    const ungrouped = ungroupLayer(prepared, groupId);
    if (!ungrouped.layerIds.length) throw new Error(`Group ${groupId} does not exist or has no children.`);
    return { project: ungrouped.project, changed: true, selectedLayerId: ungrouped.layerIds.at(-1), result: { ungrouped: true, groupId, layerIds: ungrouped.layerIds } };
  }

  if (method === "project.align_layers") {
    const layerIds = requiredTextArray(params.layerIds, "layerIds");
    const mode = requiredText(params.mode, "mode");
    if (!["left", "center", "right", "top", "middle", "bottom"].includes(mode)) throw new Error("Invalid alignment mode.");
    const next = alignLayers(prepared, layerIds, mode as Parameters<typeof alignLayers>[2]);
    return { project: next, changed: next !== prepared, result: { aligned: next !== prepared, layerIds, mode } };
  }

  if (method === "project.distribute_layers") {
    const layerIds = requiredTextArray(params.layerIds, "layerIds");
    const mode = requiredText(params.mode, "mode");
    if (mode !== "horizontal" && mode !== "vertical") throw new Error("mode must be horizontal or vertical.");
    const next = distributeLayers(prepared, layerIds, mode);
    return { project: next, changed: next !== prepared, result: { distributed: next !== prepared, layerIds, mode } };
  }

  if (method === "project.set_gradient") {
    const layerIds = requiredTextArray(params.layerIds, "layerIds");
    const gradient = params.gradient === null || params.gradient === undefined ? undefined : gradientFromParams(params.gradient);
    const next = setGradient(prepared, layerIds, gradient);
    return { project: next, changed: next !== prepared, result: { updated: next !== prepared, layerIds, gradient } };
  }

  if (method === "project.set_blend_mode") {
    const layerIds = requiredTextArray(params.layerIds, "layerIds");
    const blendMode = requiredText(params.blendMode, "blendMode") as BlendMode;
    if (!BLEND_MODES.has(blendMode)) throw new Error(`Unsupported blend mode: ${blendMode}.`);
    const next = setBlendMode(prepared, layerIds, blendMode);
    return { project: next, changed: next !== prepared, result: { updated: next !== prepared, layerIds, blendMode } };
  }

  if (method === "project.create_clipping_mask") {
    const targetLayerId = requiredText(params.targetLayerId, "targetLayerId");
    const masked = createClippingMask(prepared, targetLayerId);
    if (!masked.sourceLayerId) throw new Error("A clipping mask needs an eligible source layer directly below the target.");
    return { project: masked.project, changed: true, selectedLayerId: targetLayerId, result: { created: true, targetLayerId, sourceLayerId: masked.sourceLayerId } };
  }

  if (method === "project.release_clipping_mask") {
    const targetLayerId = requiredText(params.targetLayerId, "targetLayerId");
    const next = releaseClippingMask(prepared, targetLayerId);
    return { project: next, changed: next !== prepared, selectedLayerId: targetLayerId, result: { released: next !== prepared, targetLayerId } };
  }

  if (method === "project.add_effect") {
    const layerId = requiredText(params.layerId, "layerId");
    const type = requiredText(params.type, "type") as LayerEffectType;
    if (!prepared.layers[layerId]) throw new Error(`Layer ${layerId} does not exist.`);
    if (!EFFECT_TYPE_SET.has(type)) throw new Error(`Unsupported effect type: ${type}.`);
    const effect = updateEffectFromParams(createLayerEffect(type), params);
    const next = updateLayer(prepared, layerId, (layer) => ({ ...layer, effects: [...(layer.effects ?? []), effect] }));
    return { project: next, changed: true, selectedLayerId: layerId, result: { created: true, effect } };
  }

  if (method === "project.update_effect") {
    const layerId = requiredText(params.layerId, "layerId");
    const effectId = requiredText(params.effectId, "effectId");
    const layer = prepared.layers[layerId];
    if (!layer) throw new Error(`Layer ${layerId} does not exist.`);
    if (!(layer.effects ?? []).some((effect) => effect.id === effectId)) throw new Error(`Effect ${effectId} does not exist on layer ${layerId}.`);
    const next = updateLayer(prepared, layerId, (current) => ({ ...current, effects: normalizeEffects((current.effects ?? []).map((effect) => effect.id === effectId ? updateEffectFromParams(effect, params) : effect)) }));
    return { project: next, changed: true, selectedLayerId: layerId, result: { updated: true, effect: next.layers[layerId].effects?.find((effect) => effect.id === effectId) } };
  }

  if (method === "project.delete_effect") {
    const layerId = requiredText(params.layerId, "layerId");
    const effectId = requiredText(params.effectId, "effectId");
    const layer = prepared.layers[layerId];
    if (!layer) throw new Error(`Layer ${layerId} does not exist.`);
    const next = updateLayer(prepared, layerId, (current) => ({ ...current, effects: (current.effects ?? []).filter((effect) => effect.id !== effectId) }));
    return { project: next, changed: next !== prepared, selectedLayerId: layerId, result: { deleted: true, effectId, layerId } };
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

  if (method === "asset.search") {
    const query = optionalText(params.query)?.toLowerCase() ?? "";
    const type = optionalText(params.type);
    const limit = Math.round(clamp(optionalNumber(params.limit) ?? 20, 1, 100));
    const offset = Math.max(0, Math.round(optionalNumber(params.offset) ?? 0));
    const matches = Object.values(prepared.assets).filter((asset) => (!query || `${asset.name} ${asset.mimeType} ${asset.fontFamily ?? ""}`.toLowerCase().includes(query)) && (!type || asset.type === type));
    const items = matches.slice(offset, offset + limit).map(summarizeAsset);
    return { project: prepared, changed: false, result: { total: matches.length, count: items.length, offset, items, hasMore: offset + items.length < matches.length, nextOffset: offset + items.length < matches.length ? offset + items.length : undefined } };
  }

  if (method === "asset.get") {
    const assetId = requiredText(params.assetId, "assetId");
    const asset = prepared.assets[assetId];
    if (!asset) throw new Error(`Asset ${assetId} does not exist.`);
    const usedByLayers = Object.values(prepared.layers).filter((layer) => (layer.type === "image" || layer.type === "svg") && layer.assetId === assetId).map((layer) => layer.id);
    const usedByAudioClips = Object.values(prepared.audioClips).filter((clip) => clip.assetId === assetId).map((clip) => clip.id);
    return { project: prepared, changed: false, result: { asset: summarizeAsset(asset), usedByLayers, usedByAudioClips } };
  }

  if (method === "asset.replace_layer") {
    const layerId = requiredText(params.layerId, "layerId");
    const assetId = requiredText(params.assetId, "assetId");
    const layer = prepared.layers[layerId];
    const asset = prepared.assets[assetId];
    if (!layer || (layer.type !== "image" && layer.type !== "svg")) throw new Error(`Layer ${layerId} is not an image or SVG layer.`);
    if (!asset || (asset.type !== "image" && asset.type !== "svg")) throw new Error(`Asset ${assetId} is not a visual asset.`);
    const next = cloneProject(prepared);
    const source = next.layers[layerId];
    next.layers[layerId] = asset.type === "svg"
      ? { ...source, type: "svg", assetId } as Layer
      : { ...source, type: "image", assetId, fit: source.type === "image" ? source.fit : "contain" } as Layer;
    return { project: touchProject(next), changed: true, selectedLayerId: layerId, result: { replaced: true, layer: summarizeLayer(next.layers[layerId]), asset: summarizeAsset(asset) } };
  }

  if (method === "asset.delete_unused") {
    const used = referencedAssetIds(prepared);
    const next = cloneProject(prepared);
    const deleted: string[] = [];
    for (const assetId of Object.keys(next.assets)) if (!used.has(assetId)) { delete next.assets[assetId]; deleted.push(assetId); }
    return { project: deleted.length ? touchProject(next) : prepared, changed: deleted.length > 0, result: { deleted: deleted.length, assetIds: deleted } };
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
      if (operationMethod === "project.apply_edit_plan" || operationMethod === "project.apply_workflow" || operationMethod === "asset.import_file" || operationMethod === "project.save" || operationMethod === "project.export") {
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

  if (method === "project.apply_workflow") {
    return executeMcpWorkflow(prepared, params.steps);
  }

  throw new Error(`Unsupported MCP project method: ${method}`);
}

export function executeMcpWorkflow(project: KurogiProject, rawSteps: unknown): McpProjectCommandResult {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) throw new Error("steps must be a non-empty array.");
  if (rawSteps.length > 200) throw new Error("A workflow can contain at most 200 steps.");
  let working = project;
  const projectSummary = getMcpProjectContext(project, false).project as Record<string, unknown>;
  const aliases: Record<string, unknown> = { project: { ...projectSummary, projectId: projectSummary.id } };
  const steps: Array<Record<string, unknown>> = [];
  let selectedLayerId: string | undefined;
  let selectedAudioClipId: string | undefined;
  let activeSceneId: string | undefined;
  for (let index = 0; index < rawSteps.length; index += 1) {
    const raw = rawSteps[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Workflow step ${index + 1} must be an object.`);
    const step = raw as Record<string, unknown>;
    const method = requiredText(step.method, `steps[${index}].method`);
    if (["project.apply_workflow", "project.apply_edit_plan", "asset.import_file", "project.save", "project.export"].includes(method)) throw new Error(`Method ${method} is not allowed inside an atomic workflow.`);
    const rawParams = step.params && typeof step.params === "object" && !Array.isArray(step.params) ? step.params : {};
    const resolved = resolveWorkflowReferences(rawParams, aliases) as Record<string, unknown>;
    const outcome = executeMcpProjectCommand(working, method, resolved);
    working = outcome.project;
    const assign = optionalText(step.assign);
    if (assign && assign in aliases) throw new Error(`Workflow alias ${assign} is already assigned.`);
    if (assign) aliases[assign] = outcome.result;
    steps.push({ index, method, assign, result: outcome.result });
    selectedLayerId = outcome.selectedLayerId ?? selectedLayerId;
    selectedAudioClipId = outcome.selectedAudioClipId ?? selectedAudioClipId;
    activeSceneId = outcome.activeSceneId ?? activeSceneId;
  }
  return { project: working, changed: working !== project, selectedLayerId, selectedAudioClipId, activeSceneId, result: { applied: steps.length, rolledBackOnError: true, steps, aliases } };
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
  const startTime = optionalNumber(params.startTime); if (startTime !== undefined) next.startTime = Math.max(0, startTime);
  const duration = optionalNumber(params.duration); if (duration !== undefined) next.duration = Math.max(.01, duration);
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
    const lineHeight = optionalNumber(params.lineHeight); if (lineHeight !== undefined) next.style.lineHeight = clamp(lineHeight, .5, 4);
    const letterSpacing = optionalNumber(params.letterSpacing); if (letterSpacing !== undefined) next.style.letterSpacing = clamp(letterSpacing, -100, 300);
    const textStroke = color(params.textStroke); if (textStroke) next.style.stroke = textStroke;
    const textStrokeWidth = optionalNumber(params.textStrokeWidth); if (textStrokeWidth !== undefined) next.style.strokeWidth = clamp(textStrokeWidth, 0, 40);
    if (typeof params.autoFit === "boolean") next.style.autoFit = params.autoFit;
    if (next.style.autoFit) next.style.fontSize = estimateAutoFitFontSize(next);
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
  return { id: scene.id, name: scene.name, width: scene.width, height: scene.height, duration: scene.duration, fps: scene.fps, background: scene.background, transition: scene.transition, layerIds: [...scene.layerIds], audioClipIds: [...(scene.audioClipIds ?? [])] };
}

function summarizeLayer(layer: Layer) {
  const common = { id: layer.id, sceneId: layer.sceneId, name: layer.name, type: layer.type, visible: layer.visible, locked: layer.locked, position: layer.position, size: layer.size, rotation: layer.rotation, opacity: layer.opacity, scale: layer.scale, startTime: layer.startTime ?? 0, duration: layer.duration, blendMode: layer.blendMode, backgroundBlur: layer.backgroundBlur, mask: layer.mask, effects: layer.effects ?? [], animationActions: layer.animationActions };
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

function summarizeAsset(asset: KurogiProject["assets"][string]) {
  return { id: asset.id, projectId: asset.projectId, name: asset.name, type: asset.type, mimeType: asset.mimeType, width: asset.width, height: asset.height, duration: asset.duration, byteSize: asset.byteSize, storage: asset.storage, fontFamily: asset.fontFamily, fontWeight: asset.fontWeight, fontStyle: asset.fontStyle, sourceAvailable: Boolean(asset.sourceUrl || asset.blobId) };
}

function referencedAssetIds(project: KurogiProject) {
  const used = new Set<string>();
  for (const layer of Object.values(project.layers)) {
    if (layer.type === "image" || layer.type === "svg") used.add(layer.assetId);
    if (layer.type === "text") {
      const family = layer.style.fontFamily.trim().toLowerCase();
      for (const asset of Object.values(project.assets)) if (asset.type === "font" && (asset.fontFamily || asset.name).trim().toLowerCase() === family) used.add(asset.id);
    }
  }
  for (const clip of Object.values(project.audioClips)) used.add(clip.assetId);
  return used;
}

function gradientFromParams(value: unknown): GradientFill {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("gradient must be an object.");
  const record = value as Record<string, unknown>;
  const type = requiredText(record.type, "gradient.type");
  if (type !== "linear" && type !== "radial") throw new Error("gradient.type must be linear or radial.");
  return { type, startColor: color(record.startColor) ?? "#000000", endColor: color(record.endColor) ?? "#ffffff", angle: optionalNumber(record.angle) ?? 0 };
}

function updateEffectFromParams(effect: NonNullable<Layer["effects"]>[number], params: Record<string, unknown>) {
  const next = cloneProject(effect);
  if (typeof params.enabled === "boolean") next.enabled = params.enabled;
  const intensity = optionalNumber(params.intensity); if (intensity !== undefined) next.intensity = intensity;
  const radius = optionalNumber(params.radius); if (radius !== undefined) next.radius = Math.max(0, radius);
  const speed = optionalNumber(params.speed); if (speed !== undefined) next.speed = Math.max(0, speed);
  const effectColor = color(params.color); if (effectColor) next.color = effectColor;
  const seed = optionalNumber(params.seed); if (seed !== undefined) next.seed = Math.max(0, Math.round(seed));
  return next;
}

function resolveWorkflowReferences(value: unknown, aliases: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveWorkflowReferences(item, aliases));
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 1 && entries[0][0] === "$ref") {
    const reference = requiredText(entries[0][1], "$ref");
    const [alias, ...segments] = reference.split(".");
    if (!(alias in aliases)) throw new Error(`Unknown workflow reference alias: ${alias}.`);
    let resolved = aliases[alias];
    for (const segment of segments) {
      if (!resolved || typeof resolved !== "object" || !(segment in resolved)) throw new Error(`Workflow reference ${reference} does not exist.`);
      resolved = (resolved as Record<string, unknown>)[segment];
    }
    return cloneProject(resolved);
  }
  return Object.fromEntries(entries.map(([key, item]) => [key, resolveWorkflowReferences(item, aliases)]));
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
function requiredNumber(value: unknown, name: string): number { const result = optionalNumber(value); if (result === undefined) throw new Error(`${name} is required.`); return result; }
function requiredTextArray(value: unknown, name: string): string[] { if (!Array.isArray(value) || value.length === 0) throw new Error(`${name} must be a non-empty array.`); const result = [...new Set(value.map((item) => requiredText(item, name)))]; return result; }
function optionalText(value: unknown): string | undefined { return text(value) || undefined; }
function optionalTextAllowEmpty(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function optionalNumber(value: unknown): number | undefined { if (value === undefined || value === null || value === "") return undefined; const result = Number(value); if (!Number.isFinite(result)) throw new Error(`Expected a finite number, received ${String(value)}.`); return result; }
function color(value: unknown): string | undefined { const result = text(value); if (!result) return undefined; if (!/^#[0-9a-f]{3,8}$/i.test(result)) throw new Error(`Invalid color: ${result}. Use a hex color.`); return result; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

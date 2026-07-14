import type { AudioClip, KurogiProject, Layer } from "../types";
import { cloneProject, createId, touchProject } from "./project";

const MIN_LAYER_DURATION = .01;
const MIN_AUDIO_DURATION = .05;

export type TrimEdge = "start" | "end";

export interface TimelineEditResult {
  project: KurogiProject;
  changed: boolean;
  affectedLayerIds: string[];
  createdLayerIds: string[];
  affectedAudioClipIds: string[];
  createdAudioClipIds: string[];
}

export function trimTimelineSelection(
  project: KurogiProject,
  layerIds: string[],
  audioClipId: string,
  playheadTime: number,
  edge: TrimEdge,
): TimelineEditResult {
  const next = cloneProject(project);
  const scene = next.scenes[next.activeSceneId];
  const time = clamp(playheadTime, 0, scene?.duration ?? 0);
  const affectedLayerIds: string[] = [];
  const affectedAudioClipIds: string[] = [];

  for (const layerId of new Set(layerIds)) {
    const layer = next.layers[layerId];
    if (!layer || layer.sceneId !== scene?.id || layer.locked) continue;
    if (trimLayer(layer, time, edge, scene.duration)) affectedLayerIds.push(layerId);
  }

  const clip = audioClipId ? next.audioClips[audioClipId] : undefined;
  if (clip?.sceneId === scene?.id && trimAudioClip(clip, time, edge)) affectedAudioClipIds.push(clip.id);

  const changed = affectedLayerIds.length > 0 || affectedAudioClipIds.length > 0;
  return editResult(changed ? touchProject(next) : project, changed, affectedLayerIds, [], affectedAudioClipIds, []);
}

export function cutTimelineSelection(
  project: KurogiProject,
  layerIds: string[],
  audioClipId: string,
  playheadTime: number,
): TimelineEditResult {
  const next = cloneProject(project);
  const scene = next.scenes[next.activeSceneId];
  const time = clamp(playheadTime, 0, scene?.duration ?? 0);
  const affectedLayerIds: string[] = [];
  const createdLayerIds: string[] = [];
  const affectedAudioClipIds: string[] = [];
  const createdAudioClipIds: string[] = [];

  for (const layerId of new Set(layerIds)) {
    const source = next.layers[layerId];
    if (!source || source.sceneId !== scene?.id || source.locked || source.type === "group" || source.parentId || source.maskSource) continue;
    const start = layerStart(source);
    const end = start + layerDuration(source, scene.duration);
    if (time <= start + MIN_LAYER_DURATION || time >= end - MIN_LAYER_DURATION) continue;

    const rightId = createId("layer");
    const right = cloneProject(source) as Layer;
    right.id = rightId;
    right.name = `${source.name} cut`;
    right.startTime = time;
    right.duration = end - time;
    right.animationActions = source.animationActions.map((action) => ({
      ...cloneProject(action),
      id: createId("action"),
      layerId: rightId,
    }));
    source.duration = time - start;
    next.layers[rightId] = right;
    const sourceIndex = scene.layerIds.indexOf(source.id);
    scene.layerIds.splice(sourceIndex >= 0 ? sourceIndex + 1 : scene.layerIds.length, 0, rightId);
    affectedLayerIds.push(source.id);
    createdLayerIds.push(rightId);
  }

  const clip = audioClipId ? next.audioClips[audioClipId] : undefined;
  if (clip?.sceneId === scene?.id) {
    const end = clip.startTime + clip.duration;
    if (time > clip.startTime + MIN_AUDIO_DURATION && time < end - MIN_AUDIO_DURATION) {
      const elapsed = time - clip.startTime;
      const rightId = createId("audio");
      const right: AudioClip = {
        ...cloneProject(clip),
        id: rightId,
        name: `${clip.name} cut`,
        startTime: time,
        trimStart: clip.trimStart + elapsed * clip.playbackRate,
        duration: end - time,
        fadeIn: 0,
      };
      clip.duration = elapsed;
      clip.fadeOut = 0;
      next.audioClips[rightId] = right;
      const sourceIndex = scene.audioClipIds.indexOf(clip.id);
      scene.audioClipIds.splice(sourceIndex >= 0 ? sourceIndex + 1 : scene.audioClipIds.length, 0, rightId);
      affectedAudioClipIds.push(clip.id);
      createdAudioClipIds.push(rightId);
    }
  }

  const changed = createdLayerIds.length > 0 || createdAudioClipIds.length > 0;
  return editResult(changed ? touchProject(next) : project, changed, affectedLayerIds, createdLayerIds, affectedAudioClipIds, createdAudioClipIds);
}

function trimLayer(layer: Layer, time: number, edge: TrimEdge, sceneDuration: number) {
  const start = layerStart(layer);
  const end = start + layerDuration(layer, sceneDuration);
  if (time <= start + MIN_LAYER_DURATION || time >= end - MIN_LAYER_DURATION) return false;
  if (edge === "start") {
    layer.startTime = time;
    layer.duration = end - time;
  } else {
    layer.duration = time - start;
  }
  return true;
}

function trimAudioClip(clip: AudioClip, time: number, edge: TrimEdge) {
  const end = clip.startTime + clip.duration;
  if (time <= clip.startTime + MIN_AUDIO_DURATION || time >= end - MIN_AUDIO_DURATION) return false;
  if (edge === "start") {
    const elapsed = time - clip.startTime;
    clip.startTime = time;
    clip.trimStart += elapsed * clip.playbackRate;
    clip.duration = end - time;
    clip.fadeIn = Math.min(clip.fadeIn, clip.duration);
  } else {
    clip.duration = time - clip.startTime;
    clip.fadeOut = Math.min(clip.fadeOut, clip.duration);
  }
  return true;
}

function layerStart(layer: Layer) {
  return Math.max(0, layer.startTime ?? 0);
}

function layerDuration(layer: Layer, sceneDuration: number) {
  const start = layerStart(layer);
  return Math.max(MIN_LAYER_DURATION, layer.duration ?? sceneDuration - start);
}

function editResult(
  project: KurogiProject,
  changed: boolean,
  affectedLayerIds: string[],
  createdLayerIds: string[],
  affectedAudioClipIds: string[],
  createdAudioClipIds: string[],
): TimelineEditResult {
  return { project, changed, affectedLayerIds, createdLayerIds, affectedAudioClipIds, createdAudioClipIds };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

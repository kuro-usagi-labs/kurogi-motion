import type { AudioClip, KurogiProject } from "../types";
import { cloneProject, createId, touchProject } from "./project";

export interface CreateAudioClipOptions {
  name?: string;
  startTime?: number;
  trimStart?: number;
  duration?: number;
  volume?: number;
  muted?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  playbackRate?: number;
}

export type AudioClipPatch = Partial<Omit<AudioClip, "id" | "sceneId" | "assetId">>;

export function getSceneAudioClips(project: KurogiProject, sceneId = project.activeSceneId): AudioClip[] {
  const scene = project.scenes[sceneId];
  if (!scene) return [];
  return (scene.audioClipIds ?? [])
    .map((id) => project.audioClips[id])
    .filter((clip): clip is AudioClip => Boolean(clip));
}

export function createAudioClip(
  project: KurogiProject,
  sceneId: string,
  assetId: string,
  options: CreateAudioClipOptions = {},
): { project: KurogiProject; clipId: string } {
  const scene = project.scenes[sceneId];
  const asset = project.assets[assetId];
  if (!scene) throw new Error(`Scene ${sceneId} does not exist.`);
  if (!asset || asset.type !== "audio") throw new Error(`Asset ${assetId} is not an audio asset.`);

  const id = createId("audio");
  const playbackRate = clamp(options.playbackRate ?? 1, .25, 4);
  const trimStart = clamp(options.trimStart ?? 0, 0, Math.max(0, (asset.duration ?? 0) - .01));
  const startTime = clamp(options.startTime ?? 0, 0, Math.max(0, scene.duration - .05));
  const sourceDuration = asset.duration && asset.duration > trimStart
    ? (asset.duration - trimStart) / playbackRate
    : scene.duration - startTime;
  const duration = clamp(
    options.duration ?? sourceDuration,
    .05,
    Math.max(.05, Math.min(scene.duration - startTime, sourceDuration)),
  );
  const clip: AudioClip = normalizeAudioClip({
    id,
    sceneId,
    assetId,
    name: options.name?.trim() || asset.name,
    startTime,
    trimStart,
    duration,
    volume: options.volume ?? 1,
    muted: Boolean(options.muted),
    fadeIn: options.fadeIn ?? 0,
    fadeOut: options.fadeOut ?? 0,
    playbackRate,
  }, project);

  const next = cloneProject(project);
  next.audioClips[id] = clip;
  next.scenes[sceneId].audioClipIds = [...(next.scenes[sceneId].audioClipIds ?? []), id];
  return { project: touchProject(next), clipId: id };
}

export function updateAudioClip(project: KurogiProject, clipId: string, patch: AudioClipPatch): KurogiProject {
  const source = project.audioClips[clipId];
  if (!source) return project;
  const next = cloneProject(project);
  next.audioClips[clipId] = normalizeAudioClip({ ...next.audioClips[clipId], ...patch }, next);
  return touchProject(next);
}

export function removeAudioClip(project: KurogiProject, clipId: string): KurogiProject {
  const source = project.audioClips[clipId];
  if (!source) return project;
  const next = cloneProject(project);
  delete next.audioClips[clipId];
  const scene = next.scenes[source.sceneId];
  if (scene) scene.audioClipIds = (scene.audioClipIds ?? []).filter((id) => id !== clipId);
  return touchProject(next);
}

export function duplicateAudioClip(project: KurogiProject, clipId: string): { project: KurogiProject; clipId: string } {
  const source = project.audioClips[clipId];
  if (!source) return { project, clipId };
  const id = createId("audio");
  const scene = project.scenes[source.sceneId];
  const copy = normalizeAudioClip({
    ...cloneProject(source),
    id,
    name: `${source.name} copy`,
    startTime: Math.min(Math.max(0, scene.duration - .05), source.startTime + .25),
  }, project);
  const next = cloneProject(project);
  next.audioClips[id] = copy;
  next.scenes[source.sceneId].audioClipIds = [...(next.scenes[source.sceneId].audioClipIds ?? []), id];
  return { project: touchProject(next), clipId: id };
}

export function normalizeAudioClip(clip: AudioClip, project: KurogiProject): AudioClip {
  const scene = project.scenes[clip.sceneId];
  const asset = project.assets[clip.assetId];
  const playbackRate = clamp(Number(clip.playbackRate) || 1, .25, 4);
  const trimStart = clamp(Number(clip.trimStart) || 0, 0, Math.max(0, (asset?.duration ?? 0) - .01));
  const startTime = clamp(Number(clip.startTime) || 0, 0, Math.max(0, (scene?.duration ?? 3600) - .05));
  const sourceDuration = asset?.duration && asset.duration > trimStart
    ? (asset.duration - trimStart) / playbackRate
    : Number.POSITIVE_INFINITY;
  const maximumDuration = Math.max(.05, Math.min((scene?.duration ?? 3600) - startTime, sourceDuration));
  const duration = clamp(Number(clip.duration) || .05, .05, maximumDuration);
  return {
    ...clip,
    name: clip.name?.trim() || asset?.name || "Audio clip",
    startTime,
    trimStart,
    duration,
    volume: clamp(Number(clip.volume) || 0, 0, 2),
    muted: Boolean(clip.muted),
    fadeIn: clamp(Number(clip.fadeIn) || 0, 0, duration),
    fadeOut: clamp(Number(clip.fadeOut) || 0, 0, duration),
    playbackRate,
  };
}

export function audioClipVolumeAt(clip: AudioClip, localTime: number): number {
  if (clip.muted) return 0;
  const fadeIn = clip.fadeIn > 0 ? clamp(localTime / clip.fadeIn, 0, 1) : 1;
  const remaining = clip.duration - localTime;
  const fadeOut = clip.fadeOut > 0 ? clamp(remaining / clip.fadeOut, 0, 1) : 1;
  return clamp(clip.volume * Math.min(fadeIn, fadeOut), 0, 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

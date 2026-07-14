import type { AudioClip, KurogiProject, Layer, ProjectAsset, Scene } from "../types";
import { cloneProject, createId, normalizeProject } from "./project";

export const KUROMOTION_FILE_VERSION = 1;
export const KUROMOTION_EXTENSION = ".kuromotion";

export type KuroMotionFileKind = "project" | "template";

export interface KuroMotionFileEnvelope {
  application: "Kurogi Motion";
  kind: KuroMotionFileKind;
  fileVersion: number;
  exportedAt: string;
  project: KurogiProject;
}

export function createKuroMotionEnvelope(
  project: KurogiProject,
  kind: KuroMotionFileKind = "project",
): KuroMotionFileEnvelope {
  return {
    application: "Kurogi Motion",
    kind,
    fileVersion: KUROMOTION_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    project: cloneProject(project),
  };
}

export function serializeKuroMotion(
  project: KurogiProject,
  kind: KuroMotionFileKind = "project",
): string {
  return JSON.stringify(createKuroMotionEnvelope(project, kind), null, 2);
}

export function parseKuroMotionText(source: string): {
  kind: KuroMotionFileKind;
  project: KurogiProject;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("This .kuromotion file does not contain valid JSON.");
  }

  const envelope = isEnvelope(parsed) ? parsed : null;
  if (envelope && envelope.fileVersion > KUROMOTION_FILE_VERSION) {
    throw new Error("This .kuromotion file was created by a newer version of Kurogi Motion.");
  }

  const candidate = envelope ? envelope.project : parsed;
  if (!isRecognizedProjectDocument(candidate)) {
    throw new Error("This file does not contain a valid Kurogi Motion project.");
  }

  const project = normalizeProject(candidate);
  assertProjectIntegrity(project);
  return { kind: envelope?.kind ?? "project", project };
}

export async function readKuroMotionFile(file: File) {
  if (!file.name.toLowerCase().endsWith(KUROMOTION_EXTENSION)) {
    throw new Error("Choose a .kuromotion file.");
  }
  return parseKuroMotionText(await file.text());
}

export async function exportKuroMotionFile(
  project: KurogiProject,
  kind: KuroMotionFileKind = "project",
): Promise<{ canceled?: boolean; path?: string }> {
  const envelope = createKuroMotionEnvelope(project, kind);
  const filename = `${safeFileName(project.name)}${KUROMOTION_EXTENSION}`;
  if (window.kurogi?.saveKuroMotionFile) {
    return window.kurogi.saveKuroMotionFile(envelope, filename);
  }

  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/vnd.kurogi.motion+json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { path: filename };
}

export function instantiateProject(
  source: KurogiProject,
  name = source.name,
): KurogiProject {
  const normalized = normalizeProject(source);
  assertProjectIntegrity(normalized);
  const now = new Date().toISOString();
  const projectId = createId("project");
  const sceneIds = new Map<string, string>();
  const layerIds = new Map<string, string>();
  const assetIds = new Map<string, string>();
  const audioClipIds = new Map<string, string>();

  for (const id of Object.keys(normalized.scenes)) sceneIds.set(id, createId("scene"));
  for (const id of Object.keys(normalized.layers)) layerIds.set(id, createId("layer"));
  for (const id of Object.keys(normalized.assets)) assetIds.set(id, createId("asset"));
  for (const id of Object.keys(normalized.audioClips ?? {})) audioClipIds.set(id, createId("audio"));

  const scenes: Record<string, Scene> = {};
  for (const scene of Object.values(normalized.scenes)) {
    const id = sceneIds.get(scene.id)!;
    scenes[id] = {
      ...cloneProject(scene),
      id,
      layerIds: scene.layerIds.map((layerId) => layerIds.get(layerId)).filter(Boolean) as string[],
      audioClipIds: (scene.audioClipIds ?? []).map((clipId) => audioClipIds.get(clipId)).filter(Boolean) as string[],
    };
  }

  const assets: Record<string, ProjectAsset> = {};
  for (const asset of Object.values(normalized.assets)) {
    const id = assetIds.get(asset.id)!;
    assets[id] = { ...cloneProject(asset), id, projectId };
  }

  const audioClips: Record<string, AudioClip> = {};
  for (const clip of Object.values(normalized.audioClips ?? {})) {
    const id = audioClipIds.get(clip.id)!;
    audioClips[id] = {
      ...cloneProject(clip),
      id,
      sceneId: sceneIds.get(clip.sceneId) ?? clip.sceneId,
      assetId: assetIds.get(clip.assetId) ?? clip.assetId,
    };
  }

  const layers: Record<string, Layer> = {};
  for (const sourceLayer of Object.values(normalized.layers)) {
    const id = layerIds.get(sourceLayer.id)!;
    const base = {
      ...cloneProject(sourceLayer),
      id,
      sceneId: sceneIds.get(sourceLayer.sceneId) ?? sourceLayer.sceneId,
      parentId: sourceLayer.parentId ? layerIds.get(sourceLayer.parentId) : undefined,
      animationActions: sourceLayer.animationActions.map((action) => ({
        ...cloneProject(action),
        id: createId("action"),
        layerId: id,
      })),
    } as Layer;

    if (base.type === "image" || base.type === "svg") {
      base.assetId = assetIds.get(base.assetId) ?? base.assetId;
    }
    if (base.type === "group") {
      base.childIds = base.childIds.map((childId) => layerIds.get(childId)).filter(Boolean) as string[];
    }
    layers[id] = base;
  }

  return {
    ...cloneProject(normalized),
    id: projectId,
    name: name.trim() || normalized.name,
    createdAt: now,
    updatedAt: now,
    activeSceneId: sceneIds.get(normalized.activeSceneId) ?? Object.keys(scenes)[0],
    scenes,
    layers,
    assets,
    audioClips,
  };
}

function isEnvelope(value: unknown): value is KuroMotionFileEnvelope {
  if (!isRecord(value)) return false;
  return value.application === "Kurogi Motion" &&
    (value.kind === "project" || value.kind === "template") &&
    Number.isInteger(value.fileVersion) &&
    Number(value.fileVersion) >= 1 &&
    isRecord(value.project);
}

function isRecognizedProjectDocument(value: unknown): boolean {
  if (!isRecord(value)) return false;

  if (Array.isArray(value.layers)) {
    return isFiniteNumber(value.width) &&
      isFiniteNumber(value.height) &&
      isFiniteNumber(value.duration) &&
      isFiniteNumber(value.fps);
  }

  if (typeof value.id !== "string" || !value.id.trim()) return false;
  if (typeof value.activeSceneId !== "string" || !value.activeSceneId.trim()) return false;
  if (!isRecord(value.scenes) || !isRecord(value.layers) || !isRecord(value.assets)) return false;
  if (!isRecord(value.scenes[value.activeSceneId])) return false;

  for (const [sceneId, sceneValue] of Object.entries(value.scenes)) {
    if (!isRecord(sceneValue)) return false;
    if (typeof sceneValue.id !== "string" || sceneValue.id !== sceneId) return false;
    if (!isFiniteNumber(sceneValue.width) || !isFiniteNumber(sceneValue.height)) return false;
    if (!isFiniteNumber(sceneValue.duration) || !isFiniteNumber(sceneValue.fps)) return false;
    if (!Array.isArray(sceneValue.layerIds) || sceneValue.layerIds.some((id) => typeof id !== "string")) return false;
    if (sceneValue.audioClipIds !== undefined && (!Array.isArray(sceneValue.audioClipIds) || sceneValue.audioClipIds.some((id) => typeof id !== "string"))) return false;
  }

  for (const [layerId, layerValue] of Object.entries(value.layers)) {
    if (!isRecord(layerValue)) return false;
    if (typeof layerValue.id !== "string" || layerValue.id !== layerId) return false;
    if (typeof layerValue.sceneId !== "string" || !isRecord(value.scenes[layerValue.sceneId])) return false;
    if (!Array.isArray(layerValue.animationActions)) return false;
    if (!isRecord(layerValue.position) || !isFiniteNumber(layerValue.position.x) || !isFiniteNumber(layerValue.position.y)) return false;
    if (!isRecord(layerValue.size) || !isFiniteNumber(layerValue.size.width) || !isFiniteNumber(layerValue.size.height)) return false;
  }

  for (const [sceneId, sceneValue] of Object.entries(value.scenes)) {
    if (!isRecord(sceneValue) || !Array.isArray(sceneValue.layerIds)) return false;
    for (const layerId of sceneValue.layerIds) {
      if (typeof layerId !== "string") return false;
      const layerValue = value.layers[layerId];
      if (!isRecord(layerValue) || layerValue.sceneId !== sceneId) return false;
    }
  }

  return true;
}

function assertProjectIntegrity(project: KurogiProject): void {
  const activeScene = project.scenes[project.activeSceneId];
  if (!activeScene) throw new Error("The project does not contain its active scene.");

  for (const [sceneId, scene] of Object.entries(project.scenes)) {
    for (const layerId of scene.layerIds) {
      const layer = project.layers[layerId];
      if (!layer) throw new Error(`Scene ${scene.name || sceneId} references a missing layer.`);
      if (layer.sceneId !== sceneId) throw new Error(`Layer ${layer.name || layerId} belongs to a different scene.`);
    }
  }

  for (const layer of Object.values(project.layers)) {
    if (!project.scenes[layer.sceneId]) throw new Error(`Layer ${layer.name || layer.id} references a missing scene.`);
  }
  for (const clip of Object.values(project.audioClips ?? {})) {
    if (!project.scenes[clip.sceneId]) throw new Error(`Audio clip ${clip.name || clip.id} references a missing scene.`);
    if (project.assets[clip.assetId]?.type !== "audio") throw new Error(`Audio clip ${clip.name || clip.id} references a missing audio asset.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeFileName(value: string) {
  return value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/[. ]+$/g, "").slice(0, 120) || "kurogi-motion";
}

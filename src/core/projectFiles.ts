import type { KurogiProject, Layer, ProjectAsset, Scene } from "../types";
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
  const parsed = JSON.parse(source) as Partial<KuroMotionFileEnvelope> | KurogiProject;
  if (isEnvelope(parsed)) {
    if (parsed.fileVersion > KUROMOTION_FILE_VERSION) {
      throw new Error("This .kuromotion file was created by a newer version of Kurogi Motion.");
    }
    return { kind: parsed.kind, project: normalizeProject(parsed.project) };
  }
  return { kind: "project", project: normalizeProject(parsed) };
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
  const now = new Date().toISOString();
  const projectId = createId("project");
  const sceneIds = new Map<string, string>();
  const layerIds = new Map<string, string>();
  const assetIds = new Map<string, string>();

  for (const id of Object.keys(normalized.scenes)) sceneIds.set(id, createId("scene"));
  for (const id of Object.keys(normalized.layers)) layerIds.set(id, createId("layer"));
  for (const id of Object.keys(normalized.assets)) assetIds.set(id, createId("asset"));

  const scenes: Record<string, Scene> = {};
  for (const scene of Object.values(normalized.scenes)) {
    const id = sceneIds.get(scene.id)!;
    scenes[id] = {
      ...cloneProject(scene),
      id,
      layerIds: scene.layerIds.map((layerId) => layerIds.get(layerId)).filter(Boolean) as string[],
    };
  }

  const assets: Record<string, ProjectAsset> = {};
  for (const asset of Object.values(normalized.assets)) {
    const id = assetIds.get(asset.id)!;
    assets[id] = { ...cloneProject(asset), id, projectId };
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
  };
}

function isEnvelope(value: unknown): value is KuroMotionFileEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<KuroMotionFileEnvelope>;
  return candidate.application === "Kurogi Motion" &&
    (candidate.kind === "project" || candidate.kind === "template") &&
    typeof candidate.fileVersion === "number" &&
    Boolean(candidate.project);
}

function safeFileName(value: string) {
  return value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/[. ]+$/g, "").slice(0, 120) || "kurogi-motion";
}

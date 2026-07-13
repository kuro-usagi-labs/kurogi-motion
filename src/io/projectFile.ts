import type { KurogiProject } from "../domain/project";
import { kurogiProjectSchema } from "../domain/schema";

export const KUROGI_PROJECT_FORMAT = "kurogi-motion-project";
export const KUROGI_PROJECT_FORMAT_VERSION = 1;
export const KUROGI_PROJECT_EXTENSION = ".kurogi.json";

interface KurogiProjectEnvelope {
  format: typeof KUROGI_PROJECT_FORMAT;
  formatVersion: typeof KUROGI_PROJECT_FORMAT_VERSION;
  exportedAt: string;
  project: KurogiProject;
}

export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFileError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertUnique = (values: string[], label: string): void => {
  if (new Set(values).size !== values.length) {
    throw new ProjectFileError(`${label} contains duplicate IDs.`);
  }
};

export const validateProjectReferences = (project: KurogiProject): void => {
  const sceneIds = Object.keys(project.scenes);
  assertUnique(project.sceneOrder, "Scene order");

  if (!project.scenes[project.activeSceneId]) {
    throw new ProjectFileError("The active scene does not exist.");
  }

  const orderedSceneIds = new Set(project.sceneOrder);
  for (const sceneId of project.sceneOrder) {
    if (!project.scenes[sceneId]) {
      throw new ProjectFileError(`Scene order references missing scene ${sceneId}.`);
    }
  }
  for (const sceneId of sceneIds) {
    if (!orderedSceneIds.has(sceneId)) {
      throw new ProjectFileError(`Scene ${sceneId} is missing from scene order.`);
    }
  }

  for (const scene of Object.values(project.scenes)) {
    assertUnique(scene.rootLayerIds, `Scene ${scene.id} root layers`);
    for (const layerId of scene.rootLayerIds) {
      const layer = project.layers[layerId];
      if (!layer) {
        throw new ProjectFileError(`Scene ${scene.id} references missing layer ${layerId}.`);
      }
      if (layer.sceneId !== scene.id) {
        throw new ProjectFileError(`Layer ${layerId} belongs to a different scene.`);
      }
      if (layer.parentId !== null) {
        throw new ProjectFileError(`Root layer ${layerId} cannot have a parent.`);
      }
    }
  }

  for (const layer of Object.values(project.layers)) {
    if (!project.scenes[layer.sceneId]) {
      throw new ProjectFileError(`Layer ${layer.id} references missing scene ${layer.sceneId}.`);
    }
    if (layer.parentId && !project.layers[layer.parentId]) {
      throw new ProjectFileError(`Layer ${layer.id} references missing parent ${layer.parentId}.`);
    }

    assertUnique(layer.animationActionIds, `Layer ${layer.id} animation actions`);
    for (const actionId of layer.animationActionIds) {
      const action = project.animationActions[actionId];
      if (!action) {
        throw new ProjectFileError(`Layer ${layer.id} references missing action ${actionId}.`);
      }
      if (action.layerId !== layer.id || action.sceneId !== layer.sceneId) {
        throw new ProjectFileError(`Animation action ${actionId} is attached to the wrong layer or scene.`);
      }
    }
  }

  for (const action of Object.values(project.animationActions)) {
    const layer = project.layers[action.layerId];
    if (!layer) {
      throw new ProjectFileError(`Animation action ${action.id} references missing layer ${action.layerId}.`);
    }
    if (!project.scenes[action.sceneId] || layer.sceneId !== action.sceneId) {
      throw new ProjectFileError(`Animation action ${action.id} references an invalid scene.`);
    }
    if (!layer.animationActionIds.includes(action.id)) {
      throw new ProjectFileError(`Animation action ${action.id} is missing from its layer action list.`);
    }
  }
};

const parseProjectDocument = (value: unknown): KurogiProject => {
  const result = kurogiProjectSchema.safeParse(value);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const location = firstIssue?.path.length ? ` at ${firstIssue.path.join(".")}` : "";
    throw new ProjectFileError(`Invalid Kurogi project${location}: ${firstIssue?.message ?? "unknown schema error"}.`);
  }

  const project = result.data as KurogiProject;
  validateProjectReferences(project);
  return structuredClone(project);
};

export const serializeProjectFile = (project: KurogiProject): string => {
  const parsed = parseProjectDocument(project);
  const envelope: KurogiProjectEnvelope = {
    format: KUROGI_PROJECT_FORMAT,
    formatVersion: KUROGI_PROJECT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    project: parsed,
  };
  return JSON.stringify(envelope, null, 2);
};

export const parseProjectFile = (contents: string): KurogiProject => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(contents);
  } catch {
    throw new ProjectFileError("This file is not valid JSON.");
  }

  if (!isRecord(decoded) || decoded.format !== KUROGI_PROJECT_FORMAT) {
    // Backward-compatible import for early raw project JSON exports.
    return parseProjectDocument(decoded);
  }

  if (decoded.formatVersion !== KUROGI_PROJECT_FORMAT_VERSION) {
    throw new ProjectFileError(
      `Unsupported Kurogi project file version ${String(decoded.formatVersion)}.`,
    );
  }

  return parseProjectDocument(decoded.project);
};

export const buildProjectFileName = (projectName: string): string => {
  const slug = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${slug || "untitled-motion"}${KUROGI_PROJECT_EXTENSION}`;
};

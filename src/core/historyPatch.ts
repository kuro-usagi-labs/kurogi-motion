import type { KurogiProject, Layer, ProjectAsset, Scene } from "../types";

type Direction = "before" | "after";
type Change<T> = { before?: T; after?: T };
type RootKey = "name" | "version" | "createdAt" | "updatedAt" | "activeSceneId" | "settings";

export interface ProjectPatch {
  root: Partial<Record<RootKey, Change<unknown>>>;
  scenes: Record<string, Change<Scene>>;
  layers: Record<string, Change<Layer>>;
  assets: Record<string, Change<ProjectAsset>>;
}

export function createProjectPatch(before: KurogiProject, after: KurogiProject): ProjectPatch {
  const patch: ProjectPatch = { root: {}, scenes: {}, layers: {}, assets: {} };
  for (const key of ["name", "version", "createdAt", "updatedAt", "activeSceneId", "settings"] as const) {
    if (!same(before[key], after[key])) patch.root[key] = { before: clone(before[key]), after: clone(after[key]) };
  }
  diffRecord(before.scenes, after.scenes, patch.scenes);
  diffRecord(before.layers, after.layers, patch.layers);
  diffRecord(before.assets, after.assets, patch.assets);
  return patch;
}

export function applyProjectPatch(project: KurogiProject, patch: ProjectPatch, direction: Direction): KurogiProject {
  const next: KurogiProject = { ...project };
  for (const [key, change] of Object.entries(patch.root) as Array<[RootKey, Change<unknown>]>) {
    const value = clone(change[direction]);
    (next as unknown as Record<string, unknown>)[key] = value;
  }
  next.scenes = applyRecord(project.scenes, patch.scenes, direction);
  next.layers = applyRecord(project.layers, patch.layers, direction);
  next.assets = applyRecord(project.assets, patch.assets, direction);
  return next;
}

export function isProjectPatchEmpty(patch: ProjectPatch): boolean {
  return Object.keys(patch.root).length === 0 &&
    Object.keys(patch.scenes).length === 0 &&
    Object.keys(patch.layers).length === 0 &&
    Object.keys(patch.assets).length === 0;
}

export function estimateProjectPatchBytes(patch: ProjectPatch): number {
  return new Blob([JSON.stringify(patch)]).size;
}

function diffRecord<T>(before: Record<string, T>, after: Record<string, T>, output: Record<string, Change<T>>) {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const id of ids) {
    if (!same(before[id], after[id])) output[id] = { before: clone(before[id]), after: clone(after[id]) };
  }
}

function applyRecord<T>(current: Record<string, T>, changes: Record<string, Change<T>>, direction: Direction): Record<string, T> {
  if (Object.keys(changes).length === 0) return current;
  const next = { ...current };
  for (const [id, change] of Object.entries(changes)) {
    const value = clone(change[direction]);
    if (value === undefined) delete next[id];
    else next[id] = value;
  }
  return next;
}

function same(left: unknown, right: unknown) {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

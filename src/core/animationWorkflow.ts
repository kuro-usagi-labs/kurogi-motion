import type {
  AnimationAction,
  AnimationClipboard,
  AnimationGroup,
  AnimationPresetAction,
  CustomAnimationPreset,
  KurogiProject,
  Layer,
  StaggerOrder,
} from "../types";
import { cloneProject, createId, touchProject } from "./project";

export interface ActionRef {
  layerId: string;
  actionId: string;
}

export interface AnimationMutationResult {
  project: KurogiProject;
  refs: ActionRef[];
}

export function actionKey(ref: ActionRef) {
  return `${ref.layerId}:${ref.actionId}`;
}

export function refsFromActionIds(project: KurogiProject, actionIds: string[]): ActionRef[] {
  const wanted = new Set(actionIds);
  const refs: ActionRef[] = [];
  for (const layer of Object.values(project.layers)) {
    for (const action of layer.animationActions) {
      if (wanted.has(action.id)) refs.push({ layerId: layer.id, actionId: action.id });
    }
  }
  return refs;
}

export function expandActionSelection(project: KurogiProject, refs: ActionRef[]): ActionRef[] {
  const result = new Map<string, ActionRef>();
  const groupIds = new Set<string>();
  for (const ref of refs) {
    const action = findAction(project, ref);
    if (!action) continue;
    result.set(actionKey(ref), ref);
    if (action.groupId) groupIds.add(action.groupId);
  }
  if (groupIds.size) {
    for (const layer of Object.values(project.layers)) {
      for (const action of layer.animationActions) {
        if (action.groupId && groupIds.has(action.groupId)) {
          const ref = { layerId: layer.id, actionId: action.id };
          result.set(actionKey(ref), ref);
        }
      }
    }
  }
  return [...result.values()];
}

export function updateAnimationActions(
  project: KurogiProject,
  patches: Array<ActionRef & Partial<Pick<AnimationAction, "startTime" | "duration">>>,
): KurogiProject {
  if (!patches.length) return project;
  const patchMap = new Map(patches.map((patch) => [actionKey(patch), patch]));
  const next = cloneProject(project);
  let changed = false;
  for (const layer of Object.values(next.layers)) {
    layer.animationActions = layer.animationActions.map((action) => {
      const patch = patchMap.get(actionKey({ layerId: layer.id, actionId: action.id }));
      if (!patch) return action;
      changed = true;
      return {
        ...action,
        startTime: patch.startTime === undefined ? action.startTime : Math.max(0, patch.startTime),
        duration: patch.duration === undefined ? action.duration : Math.max(.05, patch.duration),
      };
    });
  }
  return changed ? touchProject(next) : project;
}

export function deleteAnimationActions(project: KurogiProject, refs: ActionRef[]): KurogiProject {
  const expanded = expandActionSelection(project, refs);
  if (!expanded.length) return project;
  const keys = new Set(expanded.map(actionKey));
  const next = cloneProject(project);
  for (const layer of Object.values(next.layers)) {
    layer.animationActions = layer.animationActions.filter((action) => !keys.has(actionKey({ layerId: layer.id, actionId: action.id })));
  }
  cleanupAnimationGroups(next);
  return touchProject(next);
}

export function duplicateAnimationActions(project: KurogiProject, refs: ActionRef[]): AnimationMutationResult {
  const expanded = expandActionSelection(project, refs);
  if (!expanded.length) return { project, refs: [] };
  const next = cloneProject(project);
  const created: ActionRef[] = [];
  const groupMap = new Map<string, string>();
  for (const ref of expanded) {
    const layer = next.layers[ref.layerId];
    const source = layer?.animationActions.find((action) => action.id === ref.actionId);
    if (!layer || !source) continue;
    let groupId: string | undefined;
    if (source.groupId) {
      groupId = groupMap.get(source.groupId);
      if (!groupId) {
        groupId = createId("animation-group");
        groupMap.set(source.groupId, groupId);
        const sourceGroup = project.animationGroups[source.groupId];
        next.animationGroups[groupId] = { id: groupId, name: `${sourceGroup?.name ?? "Animation group"} copy` };
      }
    }
    const copy: AnimationAction = {
      ...cloneProject(source),
      id: createId("action"),
      layerId: layer.id,
      groupId,
      startTime: Math.max(0, source.startTime + .12),
    };
    layer.animationActions.push(copy);
    created.push({ layerId: layer.id, actionId: copy.id });
  }
  return { project: created.length ? touchProject(next) : project, refs: created };
}

export function staggerAnimationActions(
  project: KurogiProject,
  refs: ActionRef[],
  step: number,
  order: StaggerOrder,
): KurogiProject {
  const selected = expandActionSelection(project, refs);
  if (selected.length < 2) return project;
  const records = selected.map((ref) => {
    const layer = project.layers[ref.layerId];
    const action = findAction(project, ref);
    return layer && action ? { ref, layer, action } : null;
  }).filter((record): record is { ref: ActionRef; layer: Layer; action: AnimationAction } => Boolean(record));
  if (records.length < 2) return project;

  const sceneOrder = new Map<string, number>();
  for (const scene of Object.values(project.scenes)) scene.layerIds.forEach((id, index) => sceneOrder.set(id, index));
  const layerIds = [...new Set(records.map((record) => record.layer.id))].sort((left, right) => (sceneOrder.get(left) ?? 0) - (sceneOrder.get(right) ?? 0));
  const ordered = orderLayerIds(layerIds, order);
  const rank = new Map(ordered.map((id, index) => [id, index]));
  const base = Math.min(...records.map(({ action }) => action.startTime + action.delay));
  const layerBase = new Map<string, number>();
  for (const record of records) {
    const effective = record.action.startTime + record.action.delay;
    layerBase.set(record.layer.id, Math.min(layerBase.get(record.layer.id) ?? effective, effective));
  }
  const patches = records.map(({ ref, layer, action }) => {
    const offsetWithinLayer = action.startTime + action.delay - (layerBase.get(layer.id) ?? base);
    const effective = base + (rank.get(layer.id) ?? 0) * Math.max(0, step) + offsetWithinLayer;
    return { ...ref, startTime: Math.max(0, effective - action.delay) };
  });
  return updateAnimationActions(project, patches);
}

export function createAnimationGroup(project: KurogiProject, refs: ActionRef[], name = "Animation group"): AnimationMutationResult {
  const selected = refsFromActionIds(project, refs.map((ref) => ref.actionId));
  if (selected.length < 2) return { project, refs: selected };
  const next = cloneProject(project);
  const id = createId("animation-group");
  const group: AnimationGroup = { id, name: name.trim() || "Animation group" };
  next.animationGroups[id] = group;
  const keys = new Set(selected.map(actionKey));
  for (const layer of Object.values(next.layers)) {
    layer.animationActions = layer.animationActions.map((action) => keys.has(actionKey({ layerId: layer.id, actionId: action.id })) ? { ...action, groupId: id } : action);
  }
  cleanupAnimationGroups(next);
  return { project: touchProject(next), refs: selected };
}

export function ungroupAnimationActions(project: KurogiProject, refs: ActionRef[]): KurogiProject {
  const selected = expandActionSelection(project, refs);
  const groupIds = new Set(selected.map((ref) => findAction(project, ref)?.groupId).filter(Boolean) as string[]);
  if (!groupIds.size) return project;
  const next = cloneProject(project);
  for (const layer of Object.values(next.layers)) {
    layer.animationActions = layer.animationActions.map((action) => action.groupId && groupIds.has(action.groupId) ? { ...action, groupId: undefined } : action);
  }
  for (const id of groupIds) delete next.animationGroups[id];
  return touchProject(next);
}

export function copyAnimationActions(project: KurogiProject, refs: ActionRef[]): AnimationClipboard | null {
  const selected = expandActionSelection(project, refs);
  const records = selected.map((ref) => {
    const action = findAction(project, ref);
    return action ? { ref, action } : null;
  }).filter((record): record is { ref: ActionRef; action: AnimationAction } => Boolean(record));
  if (!records.length) return null;
  const base = Math.min(...records.map(({ action }) => action.startTime + action.delay));
  return {
    version: 1,
    copiedAt: new Date().toISOString(),
    actions: records.map(({ action }) => ({
      ...actionToPreset(action),
      effectiveOffset: action.startTime + action.delay - base,
    })),
  };
}

export function pasteAnimationActions(
  project: KurogiProject,
  targetLayerIds: string[],
  clipboard: AnimationClipboard | null,
  startTime = 0,
): AnimationMutationResult {
  if (!clipboard?.actions.length || !targetLayerIds.length) return { project, refs: [] };
  const next = cloneProject(project);
  const created: ActionRef[] = [];
  for (const layerId of targetLayerIds) {
    const layer = next.layers[layerId];
    const scene = layer ? next.scenes[layer.sceneId] : null;
    if (!layer || !scene) continue;
    for (const template of clipboard.actions) {
      if (template.type === "counter" && layer.type !== "text") continue;
      const action = presetToAction(layer.id, template, startTime, scene.duration);
      layer.animationActions.push(action);
      created.push({ layerId, actionId: action.id });
    }
  }
  return { project: created.length ? touchProject(next) : project, refs: created };
}

export function saveCustomAnimationPreset(
  project: KurogiProject,
  name: string,
  refs: ActionRef[],
): { project: KurogiProject; presetId?: string } {
  const clipboard = copyAnimationActions(project, refs);
  if (!clipboard) return { project };
  const next = cloneProject(project);
  const id = createId("animation-preset");
  const preset: CustomAnimationPreset = {
    id,
    name: name.trim() || "Custom motion",
    createdAt: new Date().toISOString(),
    actions: clipboard.actions.map(({ effectiveOffset: _effectiveOffset, ...action }) => action),
  };
  next.animationPresets[id] = preset;
  return { project: touchProject(next), presetId: id };
}

export function deleteCustomAnimationPreset(project: KurogiProject, presetId: string): KurogiProject {
  if (!project.animationPresets[presetId]) return project;
  const next = cloneProject(project);
  delete next.animationPresets[presetId];
  return touchProject(next);
}

export function applyCustomAnimationPreset(
  project: KurogiProject,
  presetId: string,
  targetLayerIds: string[],
  startTime = 0,
): AnimationMutationResult {
  const preset = project.animationPresets[presetId];
  if (!preset) return { project, refs: [] };
  const clipboard: AnimationClipboard = {
    version: 1,
    copiedAt: new Date().toISOString(),
    actions: preset.actions.map((action, index) => ({ ...cloneProject(action), effectiveOffset: action.startOffset ?? index * .05 })),
  };
  return pasteAnimationActions(project, targetLayerIds, clipboard, startTime);
}

export function findAction(project: KurogiProject, ref: ActionRef): AnimationAction | null {
  return project.layers[ref.layerId]?.animationActions.find((action) => action.id === ref.actionId) ?? null;
}

function actionToPreset(action: AnimationAction): AnimationPresetAction & { effectiveOffset: number } {
  return {
    category: action.category,
    type: action.type,
    startOffset: 0,
    effectiveOffset: 0,
    duration: action.duration,
    delay: action.delay,
    easing: action.easing,
    easingCurve: action.easingCurve ? cloneProject(action.easingCurve) : undefined,
    parameters: cloneProject(action.parameters),
    stagger: action.stagger ? cloneProject(action.stagger) : undefined,
    repeat: action.repeat ? cloneProject(action.repeat) : undefined,
    motionPath: action.motionPath ? cloneProject(action.motionPath) : undefined,
  };
}

function presetToAction(layerId: string, template: AnimationPresetAction & { effectiveOffset?: number }, startTime: number, sceneDuration: number): AnimationAction {
  const delay = Math.max(0, template.delay ?? 0);
  const effectiveOffset = Math.max(0, template.effectiveOffset ?? template.startOffset ?? 0);
  const duration = Math.max(.05, Math.min(template.duration, sceneDuration));
  return {
    id: createId("action"),
    layerId,
    category: template.category,
    type: template.type,
    startTime: Math.max(0, Math.min(sceneDuration - duration, startTime + effectiveOffset - delay)),
    duration,
    delay,
    easing: template.easing,
    easingCurve: template.easingCurve ? cloneProject(template.easingCurve) : undefined,
    parameters: cloneProject(template.parameters),
    stagger: template.stagger ? cloneProject(template.stagger) : undefined,
    repeat: template.repeat ? cloneProject(template.repeat) : undefined,
    motionPath: template.motionPath ? cloneProject(template.motionPath) : undefined,
  };
}

function cleanupAnimationGroups(project: KurogiProject) {
  const used = new Set<string>();
  for (const layer of Object.values(project.layers)) {
    for (const action of layer.animationActions) if (action.groupId) used.add(action.groupId);
  }
  for (const id of Object.keys(project.animationGroups)) if (!used.has(id)) delete project.animationGroups[id];
}

function orderLayerIds(layerIds: string[], order: StaggerOrder) {
  if (order === "reverse") return [...layerIds].reverse();
  if (order === "center") return [...layerIds].sort((left, right) => Math.abs(layerIds.indexOf(left) - (layerIds.length - 1) / 2) - Math.abs(layerIds.indexOf(right) - (layerIds.length - 1) / 2));
  if (order === "edges") return [...layerIds].sort((left, right) => Math.min(layerIds.indexOf(left), layerIds.length - 1 - layerIds.indexOf(left)) - Math.min(layerIds.indexOf(right), layerIds.length - 1 - layerIds.indexOf(right)));
  if (order === "random") return [...layerIds].sort((left, right) => seeded(left) - seeded(right));
  return layerIds;
}

function seeded(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0) / 4294967295;
}

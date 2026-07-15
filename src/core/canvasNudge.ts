import { cloneProject, touchProject } from "./project";
import type { KurogiProject, Point } from "../types";

export type CanvasArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export type CanvasArrowAction =
  | { type: "none" }
  | { type: "seek"; frames: -1 | 1 }
  | { type: "nudge"; key: CanvasArrowKey; delta: Point };

export interface CanvasArrowInput {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shortcutBlocked: boolean;
  editableLayerCount: number;
}

export function isCanvasArrowKey(key: string): key is CanvasArrowKey {
  return key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
}

/** Pure keyboard policy shared by the editor and its regression audit. */
export function resolveCanvasArrowAction(input: CanvasArrowInput): CanvasArrowAction {
  if (!isCanvasArrowKey(input.key) || input.shortcutBlocked || input.ctrlKey || input.metaKey || input.altKey) return { type: "none" };
  if (input.editableLayerCount > 0) {
    const step = input.shiftKey ? 10 : 1;
    if (input.key === "ArrowLeft") return { type: "nudge", key: input.key, delta: { x: -step, y: 0 } };
    if (input.key === "ArrowRight") return { type: "nudge", key: input.key, delta: { x: step, y: 0 } };
    if (input.key === "ArrowUp") return { type: "nudge", key: input.key, delta: { x: 0, y: -step } };
    return { type: "nudge", key: input.key, delta: { x: 0, y: step } };
  }
  if (input.key === "ArrowLeft") return { type: "seek", frames: -1 };
  if (input.key === "ArrowRight") return { type: "seek", frames: 1 };
  return { type: "none" };
}

export function getNudgeableLayerIds(project: KurogiProject, selectedLayerIds: readonly string[]): string[] {
  const sceneId = project.activeSceneId;
  return [...new Set(selectedLayerIds)].filter((layerId) => {
    const layer = project.layers[layerId];
    return Boolean(layer && layer.sceneId === sceneId && !layer.locked);
  });
}

/** Moves all currently valid, unlocked targets in one immutable project update. */
export function nudgeCanvasLayers(project: KurogiProject, layerIds: readonly string[], delta: Point): KurogiProject {
  if ((!delta.x && !delta.y) || !layerIds.length) return project;
  const nudgeableLayerIds = getNudgeableLayerIds(project, layerIds);
  if (!nudgeableLayerIds.length) return project;
  const next = cloneProject(project);
  for (const layerId of nudgeableLayerIds) {
    const layer = next.layers[layerId];
    layer.position = {
      x: layer.position.x + delta.x,
      y: layer.position.y + delta.y,
    };
  }
  return touchProject(next);
}

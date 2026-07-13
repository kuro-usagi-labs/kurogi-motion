import type { AnimationActionDocument, AnimationActionId, KurogiProject, LayerDocument, LayerId } from "../../domain/project";
import { useDocumentStore } from "../../stores/documentStore";
import type { EditorCommand } from "./CommandManager";

export const createLayerPatchCommand = (
  layerId: LayerId,
  before: Partial<LayerDocument>,
  after: Partial<LayerDocument>,
  label = "Update layer",
): EditorCommand => ({
  label,
  execute: () => useDocumentStore.getState().patchLayer(layerId, after),
  undo: () => useDocumentStore.getState().patchLayer(layerId, before),
});

export const createAnimationPatchCommand = (
  actionId: AnimationActionId,
  before: Partial<AnimationActionDocument>,
  after: Partial<AnimationActionDocument>,
  label = "Update animation",
): EditorCommand => ({
  label,
  execute: () => useDocumentStore.getState().patchAnimationAction(actionId, after),
  undo: () => useDocumentStore.getState().patchAnimationAction(actionId, before),
});

export const createProjectSnapshotCommand = (
  label: string,
  before: KurogiProject,
  after: KurogiProject,
): EditorCommand => ({
  label,
  execute: () =>
    useDocumentStore.getState().updateProject(() => structuredClone(after)),
  undo: () =>
    useDocumentStore.getState().updateProject(() => structuredClone(before)),
});

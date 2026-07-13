import { create } from "zustand";
import type {
  AnimationActionDocument,
  AnimationActionId,
  KurogiProject,
  LayerDocument,
  LayerId,
} from "../domain/project";
import { createBlankProject } from "../domain/project";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

interface DocumentState {
  project: KurogiProject;
  revision: number;
  saveStatus: SaveStatus;
  replaceProject: (project: KurogiProject) => void;
  updateProject: (updater: (project: KurogiProject) => KurogiProject) => void;
  patchLayer: (layerId: LayerId, patch: Partial<LayerDocument>) => void;
  addLayer: (layer: LayerDocument) => void;
  deleteLayer: (layerId: LayerId) => void;
  reorderLayer: (layerId: LayerId, targetIndex: number) => void;
  addAnimationAction: (action: AnimationActionDocument) => void;
  patchAnimationAction: (
    actionId: AnimationActionId,
    patch: Partial<AnimationActionDocument>,
  ) => void;
  deleteAnimationAction: (actionId: AnimationActionId) => void;
  setSaveStatus: (status: SaveStatus) => void;
}

const touchProject = (project: KurogiProject): KurogiProject => ({
  ...project,
  updatedAt: new Date().toISOString(),
});

export const useDocumentStore = create<DocumentState>((set) => ({
  project: createBlankProject("Kurogi Motion Demo"),
  revision: 0,
  saveStatus: "saved",

  replaceProject: (project) =>
    set({ project, revision: 0, saveStatus: "saved" }),

  updateProject: (updater) =>
    set((state) => ({
      project: touchProject(updater(state.project)),
      revision: state.revision + 1,
      saveStatus: "dirty",
    })),

  patchLayer: (layerId, patch) =>
    set((state) => {
      const layer = state.project.layers[layerId];
      if (!layer) return state;
      const updated = {
        ...layer,
        ...patch,
        updatedAt: new Date().toISOString(),
      } as LayerDocument;
      return {
        project: touchProject({
          ...state.project,
          layers: { ...state.project.layers, [layerId]: updated },
        }),
        revision: state.revision + 1,
        saveStatus: "dirty",
      };
    }),

  addLayer: (layer) =>
    set((state) => {
      const scene = state.project.scenes[layer.sceneId];
      if (!scene) return state;
      return {
        project: touchProject({
          ...state.project,
          layers: { ...state.project.layers, [layer.id]: layer },
          scenes: {
            ...state.project.scenes,
            [scene.id]: {
              ...scene,
              rootLayerIds: [...scene.rootLayerIds, layer.id],
            },
          },
        }),
        revision: state.revision + 1,
        saveStatus: "dirty",
      };
    }),

  deleteLayer: (layerId) =>
    set((state) => {
      const layer = state.project.layers[layerId];
      if (!layer) return state;
      const layers = { ...state.project.layers };
      delete layers[layerId];
      const actions = { ...state.project.animationActions };
      for (const actionId of layer.animationActionIds) delete actions[actionId];
      const scene = state.project.scenes[layer.sceneId];
      return {
        project: touchProject({
          ...state.project,
          layers,
          animationActions: actions,
          scenes: {
            ...state.project.scenes,
            [scene.id]: {
              ...scene,
              rootLayerIds: scene.rootLayerIds.filter((id) => id !== layerId),
            },
          },
        }),
        revision: state.revision + 1,
        saveStatus: "dirty",
      };
    }),

  reorderLayer: (layerId, targetIndex) =>
    set((state) => {
      const layer = state.project.layers[layerId];
      if (!layer) return state;
      const scene = state.project.scenes[layer.sceneId];
      const order = scene.rootLayerIds.filter((id) => id !== layerId);
      const index = Math.max(0, Math.min(order.length, targetIndex));
      order.splice(index, 0, layerId);
      return {
        project: touchProject({
          ...state.project,
          scenes: {
            ...state.project.scenes,
            [scene.id]: { ...scene, rootLayerIds: order },
          },
        }),
        revision: state.revision + 1,
        saveStatus: "dirty",
      };
    }),

  addAnimationAction: (action) =>
    set((state) => {
      const layer = state.project.layers[action.layerId];
      if (!layer) return state;
      const updatedLayer = {
        ...layer,
        animationActionIds: [...layer.animationActionIds, action.id],
        updatedAt: new Date().toISOString(),
      } as LayerDocument;
      return {
        project: touchProject({
          ...state.project,
          layers: { ...state.project.layers, [layer.id]: updatedLayer },
          animationActions: {
            ...state.project.animationActions,
            [action.id]: action,
          },
        }),
        revision: state.revision + 1,
        saveStatus: "dirty",
      };
    }),

  patchAnimationAction: (actionId, patch) =>
    set((state) => {
      const action = state.project.animationActions[actionId];
      if (!action) return state;
      return {
        project: touchProject({
          ...state.project,
          animationActions: {
            ...state.project.animationActions,
            [actionId]: { ...action, ...patch },
          },
        }),
        revision: state.revision + 1,
        saveStatus: "dirty",
      };
    }),

  deleteAnimationAction: (actionId) =>
    set((state) => {
      const action = state.project.animationActions[actionId];
      if (!action) return state;
      const actions = { ...state.project.animationActions };
      delete actions[actionId];
      const layer = state.project.layers[action.layerId];
      const updatedLayer = {
        ...layer,
        animationActionIds: layer.animationActionIds.filter((id) => id !== actionId),
      } as LayerDocument;
      return {
        project: touchProject({
          ...state.project,
          layers: { ...state.project.layers, [layer.id]: updatedLayer },
          animationActions: actions,
        }),
        revision: state.revision + 1,
        saveStatus: "dirty",
      };
    }),

  setSaveStatus: (saveStatus) => set({ saveStatus }),
}));

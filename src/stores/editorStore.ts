import { create } from "zustand";
import type { LayerId, Point } from "../domain/project";

export type ActiveTool = "select" | "hand" | "text" | "shape";
export type SidebarTab = "layers" | "assets" | "text" | "shapes" | "templates";
export type InspectorTab = "design" | "animation" | "export";

interface EditorState {
  selectedLayerIds: LayerId[];
  hoveredLayerId: LayerId | null;
  selectedAnimationId: string | null;
  activeTool: ActiveTool;
  sidebarTab: SidebarTab;
  inspectorTab: InspectorTab;
  zoom: number;
  pan: Point;
  selectLayer: (layerId: LayerId | null, additive?: boolean) => void;
  setHoveredLayer: (layerId: LayerId | null) => void;
  selectAnimation: (actionId: string | null) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  resetViewport: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedLayerIds: [],
  hoveredLayerId: null,
  selectedAnimationId: null,
  activeTool: "select",
  sidebarTab: "layers",
  inspectorTab: "design",
  zoom: 0.58,
  pan: { x: 0, y: 0 },

  selectLayer: (layerId, additive = false) =>
    set((state) => {
      if (!layerId) return { selectedLayerIds: [] };
      if (!additive) return { selectedLayerIds: [layerId] };
      return {
        selectedLayerIds: state.selectedLayerIds.includes(layerId)
          ? state.selectedLayerIds.filter((id) => id !== layerId)
          : [...state.selectedLayerIds, layerId],
      };
    }),
  setHoveredLayer: (hoveredLayerId) => set({ hoveredLayerId }),
  selectAnimation: (selectedAnimationId) => set({ selectedAnimationId }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.1, zoom)) }),
  setPan: (pan) => set({ pan }),
  resetViewport: () => set({ zoom: 0.58, pan: { x: 0, y: 0 } }),
}));

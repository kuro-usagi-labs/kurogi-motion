import type { KurogiProject } from "../domain/project";
import {
  createBlankProject,
  createEllipseLayer,
  createId,
  createTextLayer,
} from "../domain/project";

interface LegacyLayer {
  id: string;
  name: string;
  kind: "text" | "shape" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  color: string;
  text?: string;
  fontSize?: number;
  hidden?: boolean;
  locked?: boolean;
  motion?: string[];
  start?: number;
  duration?: number;
}

interface LegacyProject {
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: string;
  layers: LegacyLayer[];
}

const isLegacyProject = (value: unknown): value is LegacyProject => {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<LegacyProject>;
  return (
    typeof project.name === "string" &&
    typeof project.width === "number" &&
    typeof project.height === "number" &&
    Array.isArray(project.layers)
  );
};

export const migrateLegacyLocalProject = (): KurogiProject | null => {
  const raw = localStorage.getItem("kurogi-project");
  if (!raw) return null;
  try {
    const legacy: unknown = JSON.parse(raw);
    if (!isLegacyProject(legacy)) return null;
    const project = createBlankProject(legacy.name, legacy.width, legacy.height);
    const scene = project.scenes[project.activeSceneId];
    project.layers = {};
    project.animationActions = {};
    scene.rootLayerIds = [];
    scene.durationMs = Math.max(100, legacy.duration * 1000);
    scene.fps = legacy.fps === 24 || legacy.fps === 60 ? legacy.fps : 30;
    scene.background = { type: "solid", color: legacy.background };

    for (const legacyLayer of legacy.layers) {
      const common = {
        id: legacyLayer.id || createId("layer"),
        name: legacyLayer.name,
        visible: !legacyLayer.hidden,
        locked: Boolean(legacyLayer.locked),
        transform: {
          position: { x: legacyLayer.x, y: legacyLayer.y },
          size: { width: legacyLayer.width, height: legacyLayer.height },
          scale: { x: 1, y: 1 },
          rotation: legacyLayer.rotation,
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        appearance: {
          opacity: legacyLayer.opacity,
          fill: { color: legacyLayer.color },
          blur: 0,
        },
      };
      const layer =
        legacyLayer.kind === "text"
          ? createTextLayer(project.activeSceneId, {
              ...common,
              content: legacyLayer.text ?? "Text",
              textStyle: {
                ...createTextLayer(project.activeSceneId).textStyle,
                fontSize: legacyLayer.fontSize ?? 48,
                color: legacyLayer.color,
              },
            })
          : createEllipseLayer(project.activeSceneId, common);
      project.layers[layer.id] = layer;
      scene.rootLayerIds.push(layer.id);
    }

    project.updatedAt = new Date().toISOString();
    return project;
  } catch {
    return null;
  }
};

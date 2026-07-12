export type ProjectId = string;
export type SceneId = string;
export type LayerId = string;
export type AnimationActionId = string;
export type AssetId = string;

export type LayerType =
  | "text"
  | "rectangle"
  | "ellipse"
  | "image"
  | "svg"
  | "group";

export type AnimationCategory = "in" | "loop" | "out";
export type AnimationActionType =
  | "fade"
  | "move"
  | "scale"
  | "rotate"
  | "blur"
  | "pulse"
  | "float";

export type EasingName =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "backIn"
  | "backOut"
  | "overshoot"
  | "bounce"
  | "elastic";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface TransformDocument {
  position: Point;
  size: Size;
  scale: Point;
  rotation: number;
  anchor: Point;
  skew: Point;
}

export interface FillDocument {
  color: string;
}

export interface StrokeDocument {
  color: string;
  width: number;
}

export interface ShadowDocument {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

export interface AppearanceDocument {
  opacity: number;
  fill?: FillDocument;
  stroke?: StrokeDocument;
  borderRadius?: number;
  shadow?: ShadowDocument;
  blur: number;
}

export interface BaseLayerDocument {
  id: LayerId;
  sceneId: SceneId;
  parentId: LayerId | null;
  type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  transform: TransformDocument;
  appearance: AppearanceDocument;
  animationActionIds: AnimationActionId[];
  createdAt: string;
  updatedAt: string;
}

export interface TextStyleDocument {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  color: string;
  lineHeight: number;
  letterSpacing: number;
  horizontalAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  wrapping: "auto-width" | "fixed-width";
}

export interface TextLayerDocument extends BaseLayerDocument {
  type: "text";
  content: string;
  textStyle: TextStyleDocument;
}

export interface RectangleLayerDocument extends BaseLayerDocument {
  type: "rectangle";
}

export interface EllipseLayerDocument extends BaseLayerDocument {
  type: "ellipse";
}

export interface ImageLayerDocument extends BaseLayerDocument {
  type: "image";
  assetId: AssetId;
  fit: "contain" | "cover" | "fill";
}

export interface SvgLayerDocument extends BaseLayerDocument {
  type: "svg";
  assetId: AssetId;
}

export interface GroupLayerDocument extends BaseLayerDocument {
  type: "group";
  childIds: LayerId[];
}

export type LayerDocument =
  | TextLayerDocument
  | RectangleLayerDocument
  | EllipseLayerDocument
  | ImageLayerDocument
  | SvgLayerDocument
  | GroupLayerDocument;

export interface AnimationParameters {
  direction?: "left" | "right" | "up" | "down";
  distance?: number;
  fromOpacity?: number;
  toOpacity?: number;
  fromScale?: number;
  toScale?: number;
  rotationDegrees?: number;
  blurAmount?: number;
  intensity?: number;
}

export interface StaggerDocument {
  enabled: boolean;
  unit: "line" | "word" | "character";
  delayMs: number;
  order: "forward" | "reverse" | "center-out" | "edges-in" | "random";
  seed: number;
}

export interface RepeatDocument {
  count: number | "infinite";
  delayMs: number;
  alternate: boolean;
}

export interface AnimationActionDocument {
  id: AnimationActionId;
  sceneId: SceneId;
  layerId: LayerId;
  category: AnimationCategory;
  type: AnimationActionType;
  startTimeMs: number;
  durationMs: number;
  easing: EasingName;
  parameters: AnimationParameters;
  stagger?: StaggerDocument;
  repeat?: RepeatDocument;
  enabled: boolean;
}

export type SceneBackground =
  | { type: "solid"; color: string }
  | { type: "transparent" };

export interface SceneDocument {
  id: SceneId;
  name: string;
  width: number;
  height: number;
  durationMs: number;
  fps: 24 | 30 | 60;
  background: SceneBackground;
  rootLayerIds: LayerId[];
}

export interface AssetDocument {
  id: AssetId;
  projectId: ProjectId;
  name: string;
  type: "image" | "svg";
  mimeType: string;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface ProjectSettings {
  defaultFps: 24 | 30 | 60;
  autoSave: boolean;
  snapEnabled: boolean;
  gridEnabled: boolean;
  guidesEnabled: boolean;
}

export interface KurogiProject {
  id: ProjectId;
  version: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeSceneId: SceneId;
  sceneOrder: SceneId[];
  scenes: Record<SceneId, SceneDocument>;
  layers: Record<LayerId, LayerDocument>;
  animationActions: Record<AnimationActionId, AnimationActionDocument>;
  assets: Record<AssetId, AssetDocument>;
  settings: ProjectSettings;
}

export interface EvaluatedLayer {
  id: LayerId;
  type: LayerType;
  name: string;
  visible: boolean;
  transform: {
    x: number;
    y: number;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    anchorX: number;
    anchorY: number;
  };
  appearance: {
    opacity: number;
    blur: number;
    fillColor?: string;
    strokeColor?: string;
    strokeWidth?: number;
    borderRadius?: number;
  };
  source: LayerDocument;
}

export interface EvaluatedScene {
  id: SceneId;
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  background: SceneBackground;
  timeMs: number;
  frame: number;
  layers: EvaluatedLayer[];
}

export const createId = (prefix: string): string => {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${performance.now()}`;
  return `${prefix}-${uuid}`;
};

const nowIso = (): string => new Date().toISOString();

const baseTransform = (x: number, y: number, width: number, height: number): TransformDocument => ({
  position: { x, y },
  size: { width, height },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 },
  skew: { x: 0, y: 0 },
});

const baseAppearance = (color: string): AppearanceDocument => ({
  opacity: 1,
  fill: { color },
  blur: 0,
  borderRadius: 0,
});

export const createTextLayer = (
  sceneId: SceneId,
  overrides: Partial<TextLayerDocument> = {},
): TextLayerDocument => {
  const timestamp = nowIso();
  return {
    id: createId("layer"),
    sceneId,
    parentId: null,
    type: "text",
    name: "Headline",
    visible: true,
    locked: false,
    transform: baseTransform(130, 170, 780, 240),
    appearance: baseAppearance("#19162d"),
    animationActionIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    content: "MAKE IT\nMOVE.",
    textStyle: {
      fontFamily: "Arial",
      fontSize: 130,
      fontWeight: 800,
      fontStyle: "normal",
      color: "#19162d",
      lineHeight: 0.9,
      letterSpacing: -5,
      horizontalAlign: "left",
      verticalAlign: "top",
      wrapping: "fixed-width",
    },
    ...overrides,
  };
};

export const createRectangleLayer = (
  sceneId: SceneId,
  overrides: Partial<RectangleLayerDocument> = {},
): RectangleLayerDocument => {
  const timestamp = nowIso();
  return {
    id: createId("layer"),
    sceneId,
    parentId: null,
    type: "rectangle",
    name: "Rectangle",
    visible: true,
    locked: false,
    transform: baseTransform(390, 520, 300, 220),
    appearance: { ...baseAppearance("#8b5cf6"), borderRadius: 38 },
    animationActionIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
};

export const createEllipseLayer = (
  sceneId: SceneId,
  overrides: Partial<EllipseLayerDocument> = {},
): EllipseLayerDocument => {
  const timestamp = nowIso();
  return {
    id: createId("layer"),
    sceneId,
    parentId: null,
    type: "ellipse",
    name: "Ellipse",
    visible: true,
    locked: false,
    transform: baseTransform(720, 600, 220, 220),
    appearance: baseAppearance("#ff6b8a"),
    animationActionIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
};

export const createBlankProject = (
  name = "Untitled motion",
  width = 1080,
  height = 1080,
): KurogiProject => {
  const projectId = createId("project");
  const sceneId = createId("scene");
  const timestamp = nowIso();
  const headline = createTextLayer(sceneId);
  const shape = createEllipseLayer(sceneId);

  const moveInId = createId("action");
  const floatId = createId("action");
  headline.animationActionIds = [moveInId];
  shape.animationActionIds = [floatId];

  return {
    id: projectId,
    version: 2,
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    activeSceneId: sceneId,
    sceneOrder: [sceneId],
    scenes: {
      [sceneId]: {
        id: sceneId,
        name: "Scene 01",
        width,
        height,
        durationMs: 5000,
        fps: 30,
        background: { type: "solid", color: "#f5f4ff" },
        rootLayerIds: [headline.id, shape.id],
      },
    },
    layers: {
      [headline.id]: headline,
      [shape.id]: shape,
    },
    animationActions: {
      [moveInId]: {
        id: moveInId,
        sceneId,
        layerId: headline.id,
        category: "in",
        type: "move",
        startTimeMs: 0,
        durationMs: 650,
        easing: "overshoot",
        parameters: { direction: "up", distance: 90 },
        enabled: true,
      },
      [floatId]: {
        id: floatId,
        sceneId,
        layerId: shape.id,
        category: "loop",
        type: "float",
        startTimeMs: 300,
        durationMs: 1700,
        easing: "easeInOut",
        parameters: { direction: "up", distance: 20, intensity: 1 },
        repeat: { count: "infinite", delayMs: 0, alternate: true },
        enabled: true,
      },
    },
    assets: {},
    settings: {
      defaultFps: 30,
      autoSave: true,
      snapEnabled: true,
      gridEnabled: true,
      guidesEnabled: true,
    },
  };
};

export const cloneProject = (project: KurogiProject): KurogiProject =>
  structuredClone(project);

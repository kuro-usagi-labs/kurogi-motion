export const PROJECT_VERSION = 7;

export type LayerType = "text" | "shape" | "image" | "svg" | "group";
export type ShapeType =
  | "rectangle" | "circle" | "line" | "polygon" | "arrow"
  | "triangle" | "diamond" | "star" | "heart" | "hexagon" | "octagon"
  | "plus" | "cross" | "speechBubble" | "cloud" | "burst" | "chevron"
  | "ring" | "droplet" | "lightning";
export type AnimationCategory = "in" | "loop" | "out";
export type TextAnimationUnit = "layer" | "line" | "word" | "character";
export type StaggerOrder = "normal" | "reverse" | "center" | "edges" | "random";
export type TextVerticalAlign = "top" | "middle" | "bottom";
export type BlendMode =
  | "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten"
  | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference"
  | "exclusion" | "hue" | "saturation" | "color" | "luminosity";

export interface GradientFill {
  type: "linear" | "radial";
  startColor: string;
  endColor: string;
  angle: number;
}

export interface MaskDefinition {
  type: "vector" | "alpha" | "clipping";
  sourceLayerId: string;
  inverted?: boolean;
}

export type EasingName =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "backIn"
  | "backOut"
  | "overshoot"
  | "bounce"
  | "elastic"
  | "custom";

export type AnimationType =
  | "fadeIn"
  | "moveIn"
  | "scaleIn"
  | "rotateIn"
  | "blurIn"
  | "maskReveal"
  | "popIn"
  | "slideIn"
  | "springIn"
  | "flipIn"
  | "stretchIn"
  | "wipeIn"
  | "zoomBlurIn"
  | "dropIn"
  | "rollIn"
  | "elasticIn"
  | "counter"
  | "motionPath"
  | "pulse"
  | "float"
  | "shake"
  | "spin"
  | "breathe"
  | "swing"
  | "hover"
  | "wobble"
  | "heartbeat"
  | "drift"
  | "orbit"
  | "wave"
  | "jiggle"
  | "glowPulse"
  | "ripple"
  | "liquid"
  | "fadeOut"
  | "moveOut"
  | "scaleOut"
  | "rotateOut"
  | "blurOut"
  | "maskHide"
  | "popOut"
  | "slideOut"
  | "flipOut"
  | "stretchOut"
  | "wipeOut"
  | "zoomBlurOut"
  | "dropOut"
  | "rollOut"
  | "dissolveOut";

export type LayerEffectType =
  | "blur"
  | "dropShadow"
  | "glow"
  | "glass"
  | "waterDrop"
  | "ripple"
  | "chromatic"
  | "grain"
  | "hueShift"
  | "vignette";

export interface LayerEffect {
  id: string;
  type: LayerEffectType;
  enabled: boolean;
  intensity: number;
  radius: number;
  speed: number;
  color?: string;
  seed?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CubicBezier {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MotionPathDefinition {
  enabled: boolean;
  start: Point;
  control1: Point;
  control2: Point;
  end: Point;
  orientToPath: boolean;
}

export interface Size {
  width: number;
  height: number;
}

export interface AnimationAction {
  id: string;
  layerId: string;
  category: AnimationCategory;
  type: AnimationType;
  startTime: number;
  duration: number;
  delay: number;
  easing: EasingName;
  easingCurve?: CubicBezier;
  groupId?: string;
  motionPath?: MotionPathDefinition;
  parameters: Record<string, number | string | boolean>;
  stagger?: {
    enabled: boolean;
    unit: TextAnimationUnit;
    delay: number;
    order: StaggerOrder;
    seed?: number;
  };
  repeat?: {
    count: number | "infinite";
    delay: number;
  };
}

export interface BaseLayer {
  id: string;
  sceneId: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  position: Point;
  size: Size;
  rotation: number;
  opacity: number;
  scale: Point;
  anchor: Point;
  parentId?: string;
  blendMode?: BlendMode;
  backgroundBlur?: number;
  mask?: MaskDefinition;
  maskSource?: boolean;
  animationActions: AnimationAction[];
  effects?: LayerEffect[];
}

export interface TextLayer extends BaseLayer {
  type: "text";
  text: string;
  style: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    letterSpacing: number;
    align: "left" | "center" | "right";
    verticalAlign: TextVerticalAlign;
    color: string;
    gradient?: GradientFill;
  };
}

export interface ShapeLayer extends BaseLayer {
  type: "shape";
  shape: ShapeType;
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    borderRadius: number;
    shadow: number;
    blur: number;
    gradient?: GradientFill;
  };
}

export interface ImageLayer extends BaseLayer {
  type: "image";
  assetId: string;
  fit: "contain" | "cover" | "fill";
}

export interface SvgLayer extends BaseLayer {
  type: "svg";
  assetId: string;
}

export interface GroupLayer extends BaseLayer {
  type: "group";
  childIds: string[];
}

export type Layer = TextLayer | ShapeLayer | ImageLayer | SvgLayer | GroupLayer;

export interface Scene {
  id: string;
  name: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  background: {
    type: "solid" | "transparent";
    color?: string;
  };
  layerIds: string[];
  audioClipIds: string[];
}

export interface ProjectAsset {
  id: string;
  projectId: string;
  name: string;
  type: "image" | "svg" | "font" | "audio";
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  sourceUrl: string;
  thumbnailUrl?: string;
  storage?: "inline" | "blob";
  blobId?: string;
  byteSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
}

export interface AudioClip {
  id: string;
  sceneId: string;
  assetId: string;
  name: string;
  startTime: number;
  trimStart: number;
  duration: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  playbackRate: number;
}

export interface AnimationGroup {
  id: string;
  name: string;
}

export interface AnimationPresetAction {
  category: AnimationCategory;
  type: AnimationType;
  startOffset?: number;
  duration: number;
  delay: number;
  easing: EasingName;
  easingCurve?: CubicBezier;
  parameters: Record<string, number | string | boolean>;
  stagger?: AnimationAction["stagger"];
  repeat?: AnimationAction["repeat"];
  motionPath?: MotionPathDefinition;
}

export interface CustomAnimationPreset {
  id: string;
  name: string;
  createdAt: string;
  actions: AnimationPresetAction[];
}

export interface AnimationClipboardAction extends AnimationPresetAction {
  effectiveOffset: number;
}

export interface AnimationClipboard {
  version: 1;
  copiedAt: string;
  actions: AnimationClipboardAction[];
}

export interface KurogiProject {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  activeSceneId: string;
  scenes: Record<string, Scene>;
  layers: Record<string, Layer>;
  assets: Record<string, ProjectAsset>;
  audioClips: Record<string, AudioClip>;
  animationGroups: Record<string, AnimationGroup>;
  animationPresets: Record<string, CustomAnimationPreset>;
  settings: {
    autoSave: boolean;
    snapEnabled: boolean;
    defaultFps: number;
  };
}

export type Project = KurogiProject;

export type ExportFormat = "webm" | "mp4" | "mov" | "gif" | "png-sequence";
export type ExportQuality = "low" | "medium" | "high";

export interface ExportOptions {
  format: ExportFormat;
  fps: 24 | 30 | 60;
  scale: number;
  quality: ExportQuality;
  transparent: boolean;
  gifLoops: number | null;
}

export interface ExportProgress {
  phase: "preparing" | "rendering" | "encoding" | "completed" | "failed";
  progress: number;
  renderedFrames?: number;
  encodedFrames?: number;
  frameCount?: number;
  message?: string;
}

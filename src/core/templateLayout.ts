import { createShapeLayer, createTextLayer } from "./project";
import type { Layer, Scene, ShapeLayer, TextLayer } from "../types";

export type TemplateTextRole = "display" | "headline" | "title" | "body" | "label" | "meta";
export type TemplateRect = { x: number; y: number; width: number; height: number };

export const TEMPLATE_TOKENS = {
  safeMargin: 0.065,
  compactGap: 0.018,
  sectionGap: 0.035,
  cardRadius: 0.035,
  largeRadius: 0.05,
  pillRadius: 999,
  shadow: 28,
} as const;

const ROLE_SIZE: Record<TemplateTextRole, number> = {
  display: 126,
  headline: 82,
  title: 52,
  body: 32,
  label: 23,
  meta: 18,
};

const ROLE_LINE_HEIGHT: Record<TemplateTextRole, number> = {
  display: 0.86,
  headline: 0.93,
  title: 1,
  body: 1.15,
  label: 1.08,
  meta: 1.12,
};

export interface TemplateTextOptions {
  align?: "left" | "center" | "right";
  weight?: number;
  letterSpacing?: number;
  fontSize?: number;
  lineHeight?: number;
}

export interface TemplateShapeOptions {
  radius?: number;
  shadow?: number;
  stroke?: string;
  strokeWidth?: number;
  rotation?: number;
  opacity?: number;
}

export interface TemplateFrame {
  scene: Scene;
  unit: number;
  safe: TemplateRect;
  rect: (x: number, y: number, width: number, height: number) => TemplateRect;
  bleedRect: (x: number, y: number, width: number, height: number) => TemplateRect;
  text: (name: string, value: string, rect: TemplateRect, role: TemplateTextRole, color: string, options?: TemplateTextOptions) => TextLayer;
  card: (name: string, rect: TemplateRect, fill: string, options?: TemplateShapeOptions) => ShapeLayer;
  circle: (name: string, rect: TemplateRect, fill: string, options?: TemplateShapeOptions) => ShapeLayer;
  decorativeCard: (name: string, rect: TemplateRect, fill: string, options?: TemplateShapeOptions) => ShapeLayer;
  decorativeCircle: (name: string, rect: TemplateRect, fill: string, options?: TemplateShapeOptions) => ShapeLayer;
}

export function createTemplateFrame(scene: Scene): TemplateFrame {
  const unit = Math.min(scene.width, scene.height) / 1080;
  const marginX = scene.width * TEMPLATE_TOKENS.safeMargin;
  const marginY = scene.height * TEMPLATE_TOKENS.safeMargin;
  const safe: TemplateRect = {
    x: marginX,
    y: marginY,
    width: scene.width - marginX * 2,
    height: scene.height - marginY * 2,
  };

  const rect = (x: number, y: number, width: number, height: number): TemplateRect => ({
    x: safe.x + safe.width * x,
    y: safe.y + safe.height * y,
    width: safe.width * width,
    height: safe.height * height,
  });
  const bleedRect = (x: number, y: number, width: number, height: number): TemplateRect => ({
    x: scene.width * x,
    y: scene.height * y,
    width: scene.width * width,
    height: scene.height * height,
  });

  const makeText = (name: string, value: string, box: TemplateRect, role: TemplateTextRole, color: string, options: TemplateTextOptions = {}) => {
    const layer = createTextLayer(scene, {
      name,
      text: value,
      position: { x: box.x, y: box.y },
      size: { width: box.width, height: box.height },
      fontSize: options.fontSize ?? ROLE_SIZE[role] * unit,
      color,
    });
    layer.style.fontWeight = options.weight ?? (role === "display" || role === "headline" ? 800 : role === "title" ? 700 : role === "label" ? 700 : 500);
    layer.style.lineHeight = options.lineHeight ?? ROLE_LINE_HEIGHT[role];
    layer.style.letterSpacing = options.letterSpacing ?? (role === "display" ? -3 * unit : role === "headline" ? -2 * unit : role === "meta" ? 0.7 * unit : 0);
    layer.style.align = options.align ?? "left";
    fitTemplateText(layer, unit);
    return layer;
  };

  const makeShape = (kind: "rectangle" | "circle", name: string, box: TemplateRect, fill: string, options: TemplateShapeOptions = {}) => {
    const layer = createShapeLayer(scene, kind, {
      name,
      position: { x: box.x, y: box.y },
      size: { width: box.width, height: box.height },
      fill,
    });
    layer.style.borderRadius = kind === "circle" ? 0 : options.radius ?? TEMPLATE_TOKENS.cardRadius * Math.min(scene.width, scene.height);
    layer.style.shadow = options.shadow ?? 0;
    layer.style.stroke = options.stroke ?? "#00000000";
    layer.style.strokeWidth = options.strokeWidth ?? 0;
    layer.rotation = options.rotation ?? 0;
    layer.opacity = options.opacity ?? 1;
    return layer;
  };

  return {
    scene,
    unit,
    safe,
    rect,
    bleedRect,
    text: makeText,
    card: (name, box, fill, options) => makeShape("rectangle", name, box, fill, options),
    circle: (name, box, fill, options) => makeShape("circle", name, box, fill, options),
    decorativeCard: (name, box, fill, options) => makeShape("rectangle", `Decorative · ${name}`, box, fill, options),
    decorativeCircle: (name, box, fill, options) => makeShape("circle", `Decorative · ${name}`, box, fill, options),
  };
}

export function normalizeTemplateLayers(scene: Scene, layers: Layer[]): Layer[] {
  const insetX = scene.width * 0.012;
  const insetY = scene.height * 0.012;
  const unit = Math.min(scene.width, scene.height) / 1080;

  return layers.map((source) => {
    const layer = cloneLayer(source);
    layer.scale = { x: 1, y: 1 };
    layer.size.width = clamp(layer.size.width, 1, scene.width * 1.3);
    layer.size.height = clamp(layer.size.height, 1, scene.height * 1.3);

    if (!isDecorativeLayer(layer)) {
      layer.position.x = clamp(layer.position.x, insetX, Math.max(insetX, scene.width - insetX - layer.size.width));
      layer.position.y = clamp(layer.position.y, insetY, Math.max(insetY, scene.height - insetY - layer.size.height));
    }

    layer.position.x = round(layer.position.x);
    layer.position.y = round(layer.position.y);
    layer.size.width = round(layer.size.width);
    layer.size.height = round(layer.size.height);
    if (layer.type === "text") fitTemplateText(layer, unit);
    return layer;
  });
}

export function estimateTextMetrics(layer: TextLayer) {
  const fontSize = Math.max(1, layer.style.fontSize);
  const lineHeightPx = fontSize * Math.max(0.6, layer.style.lineHeight);
  const averageGlyphWidth = fontSize * 0.54;
  const charsPerLine = Math.max(1, Math.floor(layer.size.width / Math.max(1, averageGlyphWidth)));
  const lines = layer.text.split("\n").reduce((count, segment) => count + Math.max(1, Math.ceil(segment.length / charsPerLine)), 0);
  return { lines, requiredHeight: lines * lineHeightPx, charsPerLine };
}

export function isDecorativeLayer(layer: Layer) {
  return layer.name.startsWith("Decorative ·");
}

function fitTemplateText(layer: TextLayer, unit: number) {
  const minimum = Math.max(12, 14 * unit);
  let metrics = estimateTextMetrics(layer);
  let guard = 0;
  while (metrics.requiredHeight > layer.size.height * 0.94 && layer.style.fontSize > minimum && guard < 24) {
    layer.style.fontSize *= 0.94;
    metrics = estimateTextMetrics(layer);
    guard += 1;
  }
  layer.style.fontSize = round(layer.style.fontSize);
}

function cloneLayer<T extends Layer>(layer: T): T {
  return typeof structuredClone === "function" ? structuredClone(layer) : JSON.parse(JSON.stringify(layer)) as T;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

import type { ShapeType } from "../types";

export type ShapeGroup = "Basic" | "Geometric" | "Symbols" | "Decorative";

export interface ShapeDefinition {
  type: ShapeType;
  label: string;
  group: ShapeGroup;
  path: string;
  fillRule?: "nonzero" | "evenodd";
  aspectRatio: number;
  defaultWidth: number;
  defaultHeight: number;
}

export const SHAPE_DEFINITIONS: readonly ShapeDefinition[] = [
  { type: "rectangle", label: "Rectangle", group: "Basic", path: "M6 6H94V94H6Z", aspectRatio: 1.25, defaultWidth: 260, defaultHeight: 208 },
  { type: "circle", label: "Circle", group: "Basic", path: "M50 4A46 46 0 1 1 49.99 4Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },
  { type: "line", label: "Line", group: "Basic", path: "M4 43H96V57H4Z", aspectRatio: 8, defaultWidth: 300, defaultHeight: 38 },
  { type: "arrow", label: "Arrow", group: "Basic", path: "M4 36H64V14L96 50L64 86V64H4Z", aspectRatio: 1.75, defaultWidth: 280, defaultHeight: 160 },
  { type: "triangle", label: "Triangle", group: "Geometric", path: "M50 5L96 93H4Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },
  { type: "diamond", label: "Diamond", group: "Geometric", path: "M50 4L96 50L50 96L4 50Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },
  { type: "polygon", label: "Pentagon", group: "Geometric", path: "M50 4L96 38L78 94H22L4 38Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },
  { type: "hexagon", label: "Hexagon", group: "Geometric", path: "M26 5H74L98 50L74 95H26L2 50Z", aspectRatio: 1.08, defaultWidth: 238, defaultHeight: 220 },
  { type: "octagon", label: "Octagon", group: "Geometric", path: "M30 4H70L96 30V70L70 96H30L4 70V30Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },
  { type: "star", label: "Star", group: "Symbols", path: "M50 4L61.2 36.2L95.5 36.8L68 57.2L78 90L50 70.5L22 90L32 57.2L4.5 36.8L38.8 36.2Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },
  { type: "heart", label: "Heart", group: "Symbols", path: "M50 91C44 84 14 62 8 43C2 24 14 9 31 9C41 9 47 14 50 21C53 14 59 9 69 9C86 9 98 24 92 43C86 62 56 84 50 91Z", aspectRatio: 1.05, defaultWidth: 230, defaultHeight: 220 },
  { type: "plus", label: "Plus", group: "Symbols", path: "M37 5H63V37H95V63H63V95H37V63H5V37H37Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },
  { type: "cross", label: "Cross", group: "Symbols", path: "M19 4L50 35L81 4L96 19L65 50L96 81L81 96L50 65L19 96L4 81L35 50L4 19Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },
  { type: "speechBubble", label: "Speech bubble", group: "Symbols", path: "M12 10H88C94 10 97 14 97 20V65C97 71 93 75 87 75H60L39 94L43 75H12C6 75 3 71 3 65V20C3 14 6 10 12 10Z", aspectRatio: 1.28, defaultWidth: 300, defaultHeight: 234 },
  { type: "chevron", label: "Chevron", group: "Symbols", path: "M13 7L57 50L13 93L33 98L82 50L33 2Z", aspectRatio: .82, defaultWidth: 180, defaultHeight: 220 },
  { type: "cloud", label: "Cloud", group: "Decorative", path: "M23 79C10 79 3 70 3 58C3 47 11 39 22 38C26 22 40 12 56 15C69 17 78 26 80 39C90 41 97 49 97 59C97 71 88 79 76 79Z", aspectRatio: 1.45, defaultWidth: 300, defaultHeight: 207 },
  { type: "burst", label: "Burst", group: "Decorative", path: "M50 2L59 20L77 9L76 30L97 28L84 45L100 56L79 63L86 83L65 77L58 98L47 81L29 93L30 71L8 74L20 55L2 44L24 37L17 17L39 23Z", aspectRatio: 1, defaultWidth: 230, defaultHeight: 230 },
  { type: "ring", label: "Ring", group: "Decorative", path: "M50 3A47 47 0 1 1 49.99 3ZM50 27A23 23 0 1 0 50.01 27Z", fillRule: "evenodd", aspectRatio: 1, defaultWidth: 230, defaultHeight: 230 },
  { type: "droplet", label: "Droplet", group: "Decorative", path: "M50 3C50 3 17 39 17 63C17 82 31 96 50 96C69 96 83 82 83 63C83 39 50 3 50 3Z", aspectRatio: .82, defaultWidth: 190, defaultHeight: 230 },
  { type: "lightning", label: "Lightning", group: "Decorative", path: "M57 2L18 56H43L34 98L83 40H57Z", aspectRatio: .72, defaultWidth: 166, defaultHeight: 230 },
] as const;

const SHAPE_MAP = new Map<ShapeType, ShapeDefinition>(SHAPE_DEFINITIONS.map((definition) => [definition.type, definition]));
const SHAPE_TYPES = new Set<ShapeType>(SHAPE_DEFINITIONS.map((definition) => definition.type));

export function normalizeShapeType(value: unknown): ShapeType {
  return typeof value === "string" && SHAPE_TYPES.has(value as ShapeType) ? value as ShapeType : "rectangle";
}

export function getShapeDefinition(shape: ShapeType): ShapeDefinition {
  return SHAPE_MAP.get(shape) ?? SHAPE_MAP.get("rectangle")!;
}

export function getShapeDefaultSize(shape: ShapeType) {
  const definition = getShapeDefinition(shape);
  return { width: definition.defaultWidth, height: definition.defaultHeight };
}

export function getShapeMaskDataUri(shape: ShapeType) {
  const definition = getShapeDefinition(shape);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${definition.path}" fill="black" fill-rule="${definition.fillRule ?? "nonzero"}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function getShapeMaskStyle(shape: ShapeType): { WebkitMaskImage: string; maskImage: string; WebkitMaskSize: string; maskSize: string; WebkitMaskPosition: string; maskPosition: string; WebkitMaskRepeat: string; maskRepeat: string } {
  const url = `url("${getShapeMaskDataUri(shape)}")`;
  return {
    WebkitMaskImage: url,
    maskImage: url,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };
}

export function isBoxShape(shape: ShapeType) {
  return shape === "rectangle" || shape === "circle" || shape === "line";
}

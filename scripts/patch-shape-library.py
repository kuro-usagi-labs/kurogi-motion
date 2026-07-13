from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace(path: str, old: str, new: str) -> None:
    content = read(path)
    if old not in content:
        raise RuntimeError(f"Expected block not found in {path}: {old[:140]!r}")
    write(path, content.replace(old, new, 1))


replace("src/types.ts", "export const PROJECT_VERSION = 3;", "export const PROJECT_VERSION = 4;")
replace(
    "src/types.ts",
    'export type ShapeType = "rectangle" | "circle" | "line" | "polygon" | "arrow";',
    'export type ShapeType =\n  | "rectangle" | "circle" | "line" | "polygon" | "arrow"\n  | "triangle" | "diamond" | "star" | "heart" | "hexagon" | "octagon"\n  | "plus" | "cross" | "speechBubble" | "cloud" | "burst" | "chevron"\n  | "ring" | "droplet" | "lightning";',
)

write(
    "src/core/shapeLibrary.ts",
    '''import type { ShapeType } from "../types";\n\nexport type ShapeGroup = "Basic" | "Geometric" | "Symbols" | "Decorative";\n\nexport interface ShapeDefinition {\n  type: ShapeType;\n  label: string;\n  group: ShapeGroup;\n  path: string;\n  fillRule?: "nonzero" | "evenodd";\n  aspectRatio: number;\n  defaultWidth: number;\n  defaultHeight: number;\n}\n\nexport const SHAPE_DEFINITIONS: readonly ShapeDefinition[] = [\n  { type: "rectangle", label: "Rectangle", group: "Basic", path: "M6 6H94V94H6Z", aspectRatio: 1.25, defaultWidth: 260, defaultHeight: 208 },\n  { type: "circle", label: "Circle", group: "Basic", path: "M50 4A46 46 0 1 1 49.99 4Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },\n  { type: "line", label: "Line", group: "Basic", path: "M4 43H96V57H4Z", aspectRatio: 8, defaultWidth: 300, defaultHeight: 38 },\n  { type: "arrow", label: "Arrow", group: "Basic", path: "M4 36H64V14L96 50L64 86V64H4Z", aspectRatio: 1.75, defaultWidth: 280, defaultHeight: 160 },\n  { type: "triangle", label: "Triangle", group: "Geometric", path: "M50 5L96 93H4Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },\n  { type: "diamond", label: "Diamond", group: "Geometric", path: "M50 4L96 50L50 96L4 50Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },\n  { type: "polygon", label: "Pentagon", group: "Geometric", path: "M50 4L96 38L78 94H22L4 38Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },\n  { type: "hexagon", label: "Hexagon", group: "Geometric", path: "M26 5H74L98 50L74 95H26L2 50Z", aspectRatio: 1.08, defaultWidth: 238, defaultHeight: 220 },\n  { type: "octagon", label: "Octagon", group: "Geometric", path: "M30 4H70L96 30V70L70 96H30L4 70V30Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },\n  { type: "star", label: "Star", group: "Symbols", path: "M50 4L61.2 36.2L95.5 36.8L68 57.2L78 90L50 70.5L22 90L32 57.2L4.5 36.8L38.8 36.2Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },\n  { type: "heart", label: "Heart", group: "Symbols", path: "M50 91C44 84 14 62 8 43C2 24 14 9 31 9C41 9 47 14 50 21C53 14 59 9 69 9C86 9 98 24 92 43C86 62 56 84 50 91Z", aspectRatio: 1.05, defaultWidth: 230, defaultHeight: 220 },\n  { type: "plus", label: "Plus", group: "Symbols", path: "M37 5H63V37H95V63H63V95H37V63H5V37H37Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },\n  { type: "cross", label: "Cross", group: "Symbols", path: "M19 4L50 35L81 4L96 19L65 50L96 81L81 96L50 65L19 96L4 81L35 50L4 19Z", aspectRatio: 1, defaultWidth: 220, defaultHeight: 220 },\n  { type: "speechBubble", label: "Speech bubble", group: "Symbols", path: "M12 10H88C94 10 97 14 97 20V65C97 71 93 75 87 75H60L39 94L43 75H12C6 75 3 71 3 65V20C3 14 6 10 12 10Z", aspectRatio: 1.28, defaultWidth: 300, defaultHeight: 234 },\n  { type: "chevron", label: "Chevron", group: "Symbols", path: "M13 7L57 50L13 93L33 98L82 50L33 2Z", aspectRatio: .82, defaultWidth: 180, defaultHeight: 220 },\n  { type: "cloud", label: "Cloud", group: "Decorative", path: "M23 79C10 79 3 70 3 58C3 47 11 39 22 38C26 22 40 12 56 15C69 17 78 26 80 39C90 41 97 49 97 59C97 71 88 79 76 79Z", aspectRatio: 1.45, defaultWidth: 300, defaultHeight: 207 },\n  { type: "burst", label: "Burst", group: "Decorative", path: "M50 2L59 20L77 9L76 30L97 28L84 45L100 56L79 63L86 83L65 77L58 98L47 81L29 93L30 71L8 74L20 55L2 44L24 37L17 17L39 23Z", aspectRatio: 1, defaultWidth: 230, defaultHeight: 230 },\n  { type: "ring", label: "Ring", group: "Decorative", path: "M50 3A47 47 0 1 1 49.99 3ZM50 27A23 23 0 1 0 50.01 27Z", fillRule: "evenodd", aspectRatio: 1, defaultWidth: 230, defaultHeight: 230 },\n  { type: "droplet", label: "Droplet", group: "Decorative", path: "M50 3C50 3 17 39 17 63C17 82 31 96 50 96C69 96 83 82 83 63C83 39 50 3 50 3Z", aspectRatio: .82, defaultWidth: 190, defaultHeight: 230 },\n  { type: "lightning", label: "Lightning", group: "Decorative", path: "M57 2L18 56H43L34 98L83 40H57Z", aspectRatio: .72, defaultWidth: 166, defaultHeight: 230 },\n] as const;\n\nconst SHAPE_MAP = new Map<ShapeType, ShapeDefinition>(SHAPE_DEFINITIONS.map((definition) => [definition.type, definition]));\nconst SHAPE_TYPES = new Set<ShapeType>(SHAPE_DEFINITIONS.map((definition) => definition.type));\n\nexport function normalizeShapeType(value: unknown): ShapeType {\n  return typeof value === "string" && SHAPE_TYPES.has(value as ShapeType) ? value as ShapeType : "rectangle";\n}\n\nexport function getShapeDefinition(shape: ShapeType): ShapeDefinition {\n  return SHAPE_MAP.get(shape) ?? SHAPE_MAP.get("rectangle")!;\n}\n\nexport function getShapeDefaultSize(shape: ShapeType) {\n  const definition = getShapeDefinition(shape);\n  return { width: definition.defaultWidth, height: definition.defaultHeight };\n}\n\nexport function getShapeMaskDataUri(shape: ShapeType) {\n  const definition = getShapeDefinition(shape);\n  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${definition.path}" fill="black" fill-rule="${definition.fillRule ?? "nonzero"}"/></svg>`;\n  return `data:image/svg+xml,${encodeURIComponent(svg)}`;\n}\n\nexport function getShapeMaskStyle(shape: ShapeType): { WebkitMaskImage: string; maskImage: string; WebkitMaskSize: string; maskSize: string; WebkitMaskPosition: string; maskPosition: string; WebkitMaskRepeat: string; maskRepeat: string } {\n  const url = `url("${getShapeMaskDataUri(shape)}")`;\n  return {\n    WebkitMaskImage: url,\n    maskImage: url,\n    WebkitMaskSize: "100% 100%",\n    maskSize: "100% 100%",\n    WebkitMaskPosition: "center",\n    maskPosition: "center",\n    WebkitMaskRepeat: "no-repeat",\n    maskRepeat: "no-repeat",\n  };\n}\n\nexport function isBoxShape(shape: ShapeType) {\n  return shape === "rectangle" || shape === "circle" || shape === "line";\n}\n''',
)

write(
    "src/ui/ShapeIcon.tsx",
    '''import React from "react";\nimport { getShapeDefinition } from "../core/shapeLibrary";\nimport type { ShapeType } from "../types";\n\nexport function ShapeIcon({ shape, size = 28, className }: { shape: ShapeType; size?: number; className?: string }) {\n  const definition = getShapeDefinition(shape);\n  return (\n    <svg className={className} width={size} height={size} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">\n      <path d={definition.path} fillRule={definition.fillRule ?? "nonzero"} />\n    </svg>\n  );\n}\n''',
)

replace(
    "src/core/project.ts",
    'import { normalizeTextVerticalAlign } from "./textLayout";\n',
    'import { normalizeTextVerticalAlign } from "./textLayout";\nimport { getShapeDefaultSize, normalizeShapeType } from "./shapeLibrary";\n',
)
replace(
    "src/core/project.ts",
    '''export function createShapeLayer(\n  scene: Scene,\n  shape: ShapeType,\n  options: Partial<{\n    name: string;\n    position: { x: number; y: number };\n    size: { width: number; height: number };\n    fill: string;\n  }> = {},\n): ShapeLayer {\n  const size = options.size ?? (shape === "line" ? { width: 280, height: 8 } : { width: 220, height: 220 });\n  return {\n    id: createId("layer"),\n    sceneId: scene.id,\n    name: options.name ?? titleCase(shape),\n    type: "shape",\n''',
    '''export function createShapeLayer(\n  scene: Scene,\n  shape: ShapeType,\n  options: Partial<{\n    name: string;\n    position: { x: number; y: number };\n    size: { width: number; height: number };\n    fill: string;\n  }> = {},\n): ShapeLayer {\n  const normalizedShape = normalizeShapeType(shape);\n  const size = options.size ?? getShapeDefaultSize(normalizedShape);\n  return {\n    id: createId("layer"),\n    sceneId: scene.id,\n    name: options.name ?? titleCase(normalizedShape),\n    type: "shape",\n''',
)
replace("src/core/project.ts", "    shape,\n    style: {", "    shape: normalizedShape,\n    style: {")
replace(
    "src/core/project.ts",
    '      borderRadius: shape === "rectangle" ? 24 : 0,\n',
    '      borderRadius: normalizedShape === "rectangle" ? 24 : normalizedShape === "line" ? 999 : 0,\n',
)
replace(
    "src/core/project.ts",
    '''    if (layer.type === "text") {\n      layer.style.verticalAlign = normalizeTextVerticalAlign(layer.style.verticalAlign);\n    }\n''',
    '''    if (layer.type === "text") {\n      layer.style.verticalAlign = normalizeTextVerticalAlign(layer.style.verticalAlign);\n    }\n    if (layer.type === "shape") {\n      layer.shape = normalizeShapeType(layer.shape);\n    }\n''',
)

replace(
    "src/MotionComposition.tsx",
    'import { textVerticalJustification } from "./core/textLayout";\n',
    'import { textVerticalJustification } from "./core/textLayout";\nimport { getShapeDefinition, getShapeMaskStyle, isBoxShape } from "./core/shapeLibrary";\n',
)
replace(
    "src/MotionComposition.tsx",
    '''function ShapeVisual({ layer }: { layer: Extract<Layer, { type: "shape" }> }) {\n  const base: React.CSSProperties = {\n    width: "100%",\n    height: "100%",\n    background: layer.style.fill,\n    border: layer.style.strokeWidth > 0\n      ? `${layer.style.strokeWidth}px solid ${layer.style.stroke}`\n      : undefined,\n    borderRadius: layer.shape === "circle" ? "50%" : layer.style.borderRadius,\n    boxShadow: layer.style.shadow > 0\n      ? `0 ${layer.style.shadow * .5}px ${layer.style.shadow * 1.8}px rgba(18,14,35,.28)`\n      : undefined,\n    boxSizing: "border-box",\n  };\n  if (layer.shape === "polygon") base.clipPath = "polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)";\n  if (layer.shape === "arrow") base.clipPath = "polygon(0 35%,66% 35%,66% 0,100% 50%,66% 100%,66% 65%,0 65%)";\n  if (layer.shape === "line") base.borderRadius = 999;\n  return <div style={base} />;\n}\n''',
    '''function ShapeVisual({ layer }: { layer: Extract<Layer, { type: "shape" }> }) {\n  const shadowFilter = layer.style.shadow > 0\n    ? `drop-shadow(0 ${layer.style.shadow * .45}px ${layer.style.shadow * 1.25}px rgba(18,14,35,.28))`\n    : undefined;\n\n  if (isBoxShape(layer.shape)) {\n    return (\n      <div style={{\n        width: "100%",\n        height: "100%",\n        background: layer.style.fill,\n        border: layer.style.strokeWidth > 0 ? `${layer.style.strokeWidth}px solid ${layer.style.stroke}` : undefined,\n        borderRadius: layer.shape === "circle" ? "50%" : layer.shape === "line" ? 999 : layer.style.borderRadius,\n        filter: shadowFilter,\n        boxSizing: "border-box",\n      }} />\n    );\n  }\n\n  const definition = getShapeDefinition(layer.shape);\n  const maskStyle = getShapeMaskStyle(layer.shape);\n  return (\n    <div style={{ position: "relative", width: "100%", height: "100%", filter: shadowFilter }}>\n      <div style={{ position: "absolute", inset: 0, background: layer.style.fill, ...maskStyle }} />\n      {layer.style.strokeWidth > 0 ? (\n        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>\n          <path d={definition.path} fill="none" fillRule={definition.fillRule ?? "nonzero"} stroke={layer.style.stroke} strokeWidth={Math.max(.5, layer.style.strokeWidth / 2)} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />\n        </svg>\n      ) : null}\n    </div>\n  );\n}\n''',
)

replace(
    "src/renderer/LayerEffects.tsx",
    'import { normalizeEffects } from "../core/effects";\n',
    'import { normalizeEffects } from "../core/effects";\nimport { getShapeMaskStyle, isBoxShape } from "../core/shapeLibrary";\n',
)
replace(
    "src/renderer/LayerEffects.tsx",
    '''  const innerStyle: React.CSSProperties = {\n    position: "relative",\n    width: "100%",\n    height: "100%",\n    overflow: shouldClip ? "hidden" : "visible",\n    borderRadius: clipRadius,\n    filter: innerFilter || undefined,\n    isolation: "isolate",\n  };\n''',
    '''  const shapeMask = layer.type === "shape" && !isBoxShape(layer.shape)\n    ? getShapeMaskStyle(layer.shape)\n    : undefined;\n  const innerStyle: React.CSSProperties = {\n    position: "relative",\n    width: "100%",\n    height: "100%",\n    overflow: shouldClip ? "hidden" : "visible",\n    borderRadius: clipRadius,\n    filter: innerFilter || undefined,\n    isolation: "isolate",\n    ...shapeMask,\n  };\n''',
)
replace(
    "src/renderer/LayerEffects.tsx",
    '''    if (layer.shape === "line") return 999;\n    return Math.max(0, layer.style.borderRadius);\n''',
    '''    if (layer.shape === "line") return 999;\n    if (!isBoxShape(layer.shape)) return 0;\n    return Math.max(0, layer.style.borderRadius);\n''',
)

replace(
    "src/app/Editor.tsx",
    'import { Icon, type IconName } from "../ui/Icon";\n',
    'import { Icon, type IconName } from "../ui/Icon";\nimport { ShapeIcon } from "../ui/ShapeIcon";\nimport { SHAPE_DEFINITIONS, type ShapeGroup } from "../core/shapeLibrary";\n',
)
replace(
    "src/app/Editor.tsx",
    '''          {sidebarTab === "shapes" ? (\n            <div className="add-grid shape-presets">\n              {(["rectangle", "circle", "line", "polygon", "arrow"] as const).map((shape) => (\n                <button type="button" key={shape} onClick={() => addShape(shape)}><strong><Icon name={shape} size={25} /></strong><span>{shape.charAt(0).toUpperCase() + shape.slice(1)}</span></button>\n              ))}\n            </div>\n          ) : null}\n''',
    '''          {sidebarTab === "shapes" ? (\n            <div className="shape-library sidebar-scroll">\n              {(["Basic", "Geometric", "Symbols", "Decorative"] as ShapeGroup[]).map((group) => (\n                <section className="shape-library-section" key={group}>\n                  <div className="shape-library-heading"><span>{group}</span><small>{SHAPE_DEFINITIONS.filter((shape) => shape.group === group).length}</small></div>\n                  <div className="add-grid shape-presets shape-presets-expanded">\n                    {SHAPE_DEFINITIONS.filter((shape) => shape.group === group).map((definition) => (\n                      <button type="button" key={definition.type} onClick={() => addShape(definition.type)} title={`Add ${definition.label}`}>\n                        <strong><ShapeIcon shape={definition.type} size={28} /></strong>\n                        <span>{definition.label}</span>\n                      </button>\n                    ))}\n                  </div>\n                </section>\n              ))}\n            </div>\n          ) : null}\n''',
)

replace(
    "src/core/templateLayout.ts",
    'import type { Layer, Scene, ShapeLayer, TextLayer } from "../types";\n',
    'import type { Layer, Scene, ShapeLayer, ShapeType, TextLayer } from "../types";\n',
)
replace(
    "src/core/templateLayout.ts",
    '''  circle: (name: string, rect: TemplateRect, fill: string, options?: TemplateShapeOptions) => ShapeLayer;\n  decorativeCard: (name: string, rect: TemplateRect, fill: string, options?: TemplateShapeOptions) => ShapeLayer;\n  decorativeCircle: (name: string, rect: TemplateRect, fill: string, options?: TemplateShapeOptions) => ShapeLayer;\n''',
    '''  circle: (name: string, rect: TemplateRect, fill: string, options?: TemplateShapeOptions) => ShapeLayer;\n  shape: (shape: ShapeType, name: string, rect: TemplateRect, fill: string, options?: TemplateShapeOptions) => ShapeLayer;\n  decorativeCard: (name: string, rect: TemplateRect, fill: string, options?: TemplateShapeOptions) => ShapeLayer;\n  decorativeCircle: (name: string, rect: TemplateRect, fill: string, options?: TemplateShapeOptions) => ShapeLayer;\n  decorativeShape: (shape: ShapeType, name: string, rect: TemplateRect, fill: string, options?: TemplateShapeOptions) => ShapeLayer;\n''',
)
replace(
    "src/core/templateLayout.ts",
    '  const makeShape = (kind: "rectangle" | "circle", name: string, box: TemplateRect, fill: string, options: TemplateShapeOptions = {}) => {\n',
    '  const makeShape = (kind: ShapeType, name: string, box: TemplateRect, fill: string, options: TemplateShapeOptions = {}) => {\n',
)
replace(
    "src/core/templateLayout.ts",
    '    layer.style.borderRadius = kind === "circle" ? 0 : options.radius ?? TEMPLATE_TOKENS.cardRadius * Math.min(scene.width, scene.height);\n',
    '    layer.style.borderRadius = kind === "circle" ? 0 : kind === "line" ? 999 : options.radius ?? TEMPLATE_TOKENS.cardRadius * Math.min(scene.width, scene.height);\n',
)
replace(
    "src/core/templateLayout.ts",
    '''    circle: (name, box, fill, options) => makeShape("circle", name, box, fill, options),\n    decorativeCard: (name, box, fill, options) => makeShape("rectangle", `Decorative · ${name}`, box, fill, options),\n    decorativeCircle: (name, box, fill, options) => makeShape("circle", `Decorative · ${name}`, box, fill, options),\n''',
    '''    circle: (name, box, fill, options) => makeShape("circle", name, box, fill, options),\n    shape: (shape, name, box, fill, options) => makeShape(shape, name, box, fill, options),\n    decorativeCard: (name, box, fill, options) => makeShape("rectangle", `Decorative · ${name}`, box, fill, options),\n    decorativeCircle: (name, box, fill, options) => makeShape("circle", `Decorative · ${name}`, box, fill, options),\n    decorativeShape: (shape, name, box, fill, options) => makeShape(shape, `Decorative · ${name}`, box, fill, options),\n''',
)

# Replace emoji and text-glyph decorations with precise editable vector shapes.
replace(
    "src/core/templateCatalog.ts",
    '  const messageA = f.text("Message from Alex copy", "Alex · 09:42\\nThe launch draft is ready ✨", f.rect(0.19, 0.335, 0.53, 0.105), "body", "#202235", { fontSize: 30 * f.unit });\n',
    '  const messageA = f.text("Message from Alex copy", "Alex · 09:42\\nThe launch draft is ready.", f.rect(0.19, 0.335, 0.48, 0.105), "body", "#202235", { fontSize: 30 * f.unit });\n  const messageSpark = f.shape("star", "Message sparkle", f.rect(.69, .385, .045, .026), "#ffb84d");\n',
)
replace(
    "src/core/templateCatalog.ts",
    '  const dots = f.text("Typing dots", "●  ●  ●", f.rect(0.075, 0.765, 0.16, 0.03), "meta", "#7c5cff", { align: "center" });\n',
    '  const dotA = f.circle("Typing dot A", sq(f, .085, .77, .022), "#7c5cff");\n  const dotB = f.circle("Typing dot B", sq(f, .135, .77, .022), "#7c5cff");\n  const dotC = f.circle("Typing dot C", sq(f, .185, .77, .022), "#7c5cff");\n',
)
replace(
    "src/core/templateCatalog.ts",
    '  enter(bubbleA, "springIn", .42, .75); enter(avatarA, "popIn", .62, .45); enter(messageA, "fadeIn", .72, .42);\n',
    '  enter(bubbleA, "springIn", .42, .75); enter(avatarA, "popIn", .62, .45); enter(messageA, "fadeIn", .72, .42); enter(messageSpark, "popIn", .9, .35); loop(messageSpark, "spin", 1.25, 3.4, { turns: 1 });\n',
)
replace(
    "src/core/templateCatalog.ts",
    '  enter(typing, "popIn", 1.72, .42); enter(dots, "fadeIn", 1.85, .3); loop(dots, "heartbeat", 2.1, 1.25, { intensity: .12 }); loop(bubbleB, "hover", 1.8, 2.8, { intensity: 8 });\n  return [eyebrow, title, bubbleA, avatarA, messageA, bubbleB, messageB, typing, dots];\n',
    '  enter(typing, "popIn", 1.72, .42); enter(dotA, "popIn", 1.82, .28); enter(dotB, "popIn", 1.92, .28); enter(dotC, "popIn", 2.02, .28); loop(dotA, "heartbeat", 2.15, 1.25, { intensity: .12 }); loop(dotB, "heartbeat", 2.3, 1.25, { intensity: .12 }); loop(dotC, "heartbeat", 2.45, 1.25, { intensity: .12 }); loop(bubbleB, "hover", 1.8, 2.8, { intensity: 8 });\n  return [eyebrow, title, bubbleA, avatarA, messageA, messageSpark, bubbleB, messageB, typing, dotA, dotB, dotC];\n',
)
replace(
    "src/core/templateCatalog.ts",
    '  const likes = f.text("Likes", "♥  1,284", f.rect(.12, .69, .25, .04), "label", "#ff5d78");\n',
    '  const likeHeart = f.shape("heart", "Like heart", f.rect(.12, .69, .04, .034), "#ff5d78");\n  const likes = f.text("Likes", "1,284", f.rect(.18, .69, .19, .04), "label", "#ff5d78");\n',
)
replace(
    "src/core/templateCatalog.ts",
    '  enter(comment, "moveIn", .66, .68, { direction: "up", distance: 70 }, true, "word"); enter(likes, "popIn", 1.18, .42); enter(reply, "fadeIn", 1.28, .36); loop(avatar, "glowPulse", 1.25, 2.1, { intensity: 16 });\n  return [halo, card, avatar, user, badge, badgeText, comment, likes, reply];\n',
    '  enter(comment, "moveIn", .66, .68, { direction: "up", distance: 70 }, true, "word"); enter(likeHeart, "popIn", 1.12, .42); enter(likes, "fadeIn", 1.22, .32); enter(reply, "fadeIn", 1.28, .36); loop(likeHeart, "heartbeat", 1.6, 1.45, { intensity: .1 }); loop(avatar, "glowPulse", 1.25, 2.1, { intensity: 16 });\n  return [halo, card, avatar, user, badge, badgeText, comment, likeHeart, likes, reply];\n',
)
replace(
    "src/core/templateCatalog.ts",
    '  const stars = f.text("Rating", "★★★★★", f.rect(.09, .7, .28, .035), "label", "#ffb84d", { letterSpacing: 2 * f.unit });\n',
    '  const ratingStars = Array.from({ length: 5 }, (_, index) => f.shape("star", `Rating star ${index + 1}`, f.rect(.09 + index * .047, .698, .035, .032), "#ffb84d"));\n',
)
replace(
    "src/core/templateCatalog.ts",
    '  enter(quote, "moveIn", .82, .7, { direction: "up", distance: 58 }, true, "word"); enter(divider, "wipeIn", 1.25, .4, { direction: "left" }); enter(stars, "stretchIn", 1.38, .45, { axis: "x" }); enter(meta, "fadeIn", 1.5, .35); loop(stars, "glowPulse", 1.9, 2.2, { intensity: 10 });\n  return [blob, card, quoteMark, avatar, initials, name, role, quote, divider, stars, meta];\n',
    '  enter(quote, "moveIn", .82, .7, { direction: "up", distance: 58 }, true, "word"); enter(divider, "wipeIn", 1.25, .4, { direction: "left" }); ratingStars.forEach((star, index) => enter(star, "popIn", 1.34 + index * .06, .34)); enter(meta, "fadeIn", 1.62, .35); ratingStars.forEach((star, index) => loop(star, "glowPulse", 1.95 + index * .04, 2.2, { intensity: 8 }));\n  return [blob, card, quoteMark, avatar, initials, name, role, quote, divider, ...ratingStars, meta];\n',
)
replace(
    "src/core/templateCatalog.ts",
    '  const arrow = f.text("Arrow", "↗", f.rect(.65, .61, .16, .12), "display", "#163c31", { align: "center", fontSize: 86 * f.unit });\n',
    '  const arrow = f.shape("arrow", "Direction arrow", f.rect(.69, .63, .11, .075), "#163c31", { rotation: -45 });\n',
)
replace(
    "src/core/templateCatalog.ts",
    '  const chipText = f.text("Trend text", "↗  12.8%", f.rect(.69, .29, .12, .025), "meta", "#19866c", { align: "center" });\n',
    '  const trendArrow = f.shape("arrow", "Trend arrow", f.rect(.67, .287, .032, .024), "#19866c", { rotation: -45 });\n  const chipText = f.text("Trend text", "12.8%", f.rect(.705, .29, .105, .025), "meta", "#19866c", { align: "center" });\n',
)
replace(
    "src/core/templateCatalog.ts",
    '  enter(back, "rotateIn", 0, .72); enter(card, "springIn", .12, .8); enter(eyebrow, "fadeIn", .38, .35); enter(metric, "moveIn", .48, .72, { direction: "up", distance: 80 }, true, "character"); enter(detail, "fadeIn", 1.05, .42); enter(chip, "popIn", .82, .44); enter(chipText, "fadeIn", .95, .3); enter(dotA, "popIn", 1.15, .42); enter(dotB, "popIn", 1.3, .4); loop(metric, "breathe", 1.6, 2, { intensity: .025 }); loop(dotA, "orbit", 1.6, 2.6, { intensity: 10 });\n  return [back, card, eyebrow, metric, detail, chip, chipText, dotA, dotB];\n',
    '  enter(back, "rotateIn", 0, .72); enter(card, "springIn", .12, .8); enter(eyebrow, "fadeIn", .38, .35); enter(metric, "moveIn", .48, .72, { direction: "up", distance: 80 }, true, "character"); enter(detail, "fadeIn", 1.05, .42); enter(chip, "popIn", .82, .44); enter(trendArrow, "slideIn", .91, .32, { direction: "left", distance: 22 }); enter(chipText, "fadeIn", .98, .3); enter(dotA, "popIn", 1.15, .42); enter(dotB, "popIn", 1.3, .4); loop(metric, "breathe", 1.6, 2, { intensity: .025 }); loop(dotA, "orbit", 1.6, 2.6, { intensity: 10 });\n  return [back, card, eyebrow, metric, detail, chip, trendArrow, chipText, dotA, dotB];\n',
)
replace(
    "src/core/templateCatalog.ts",
    '  const ctaText = f.text("CTA text", "SHOP THE DROP  ↗", f.rect(.09, .855, .36, .03), "label", "#1b1630", { align: "center" });\n',
    '  const ctaText = f.text("CTA text", "SHOP THE DROP", f.rect(.085, .855, .29, .03), "label", "#1b1630", { align: "center" });\n  const ctaArrow = f.shape("arrow", "CTA arrow", f.rect(.39, .853, .035, .028), "#1b1630", { rotation: -45 });\n',
)
replace(
    "src/core/templateCatalog.ts",
    '  enter(burst, "zoomBlurIn", 0, .85); loop(burst, "heartbeat", .9, 1.3, { intensity: .08 }); enter(label, "fadeIn", .1, .4); enter(title, "stretchIn", .2, .72, { axis: "y" }, true, "line"); enter(discount, "popIn", .62, .72); enter(off, "rollIn", .86, .6, { direction: "right", distance: 90, rotation: 120 }); enter(cta, "slideIn", 1.12, .55, { direction: "left", distance: 120 }); enter(ctaText, "fadeIn", 1.32, .3); loop(discount, "glowPulse", 1.6, 2, { intensity: 22 });\n  return [burst, label, title, discount, off, cta, ctaText];\n',
    '  enter(burst, "zoomBlurIn", 0, .85); loop(burst, "heartbeat", .9, 1.3, { intensity: .08 }); enter(label, "fadeIn", .1, .4); enter(title, "stretchIn", .2, .72, { axis: "y" }, true, "line"); enter(discount, "popIn", .62, .72); enter(off, "rollIn", .86, .6, { direction: "right", distance: 90, rotation: 120 }); enter(cta, "slideIn", 1.12, .55, { direction: "left", distance: 120 }); enter(ctaText, "fadeIn", 1.32, .3); enter(ctaArrow, "slideIn", 1.38, .3, { direction: "left", distance: 18 }); loop(discount, "glowPulse", 1.6, 2, { intensity: 22 });\n  return [burst, label, title, discount, off, cta, ctaText, ctaArrow];\n',
)
replace(
    "src/core/templateCatalog.ts",
    '  const cursor = f.text("Cursor", "↗", f.rect(.8, .55, .08, .075), "title", "#171821", { align: "center", fontSize: 50 * f.unit });\n',
    '  const cursor = f.shape("arrow", "Cursor arrow", f.rect(.81, .56, .055, .05), "#171821", { rotation: -45 });\n',
)

write(
    "scripts/audit-shapes.mjs",
    '''import { readFile } from "node:fs/promises";\nimport { createServer } from "vite";\n\nconst server = await createServer({\n  appType: "custom",\n  configFile: false,\n  logLevel: "error",\n  optimizeDeps: { noDiscovery: true },\n  server: { hmr: false, middlewareMode: true, watch: null },\n});\n\ntry {\n  const shapes = await server.ssrLoadModule("/src/core/shapeLibrary.ts");\n  const projectCore = await server.ssrLoadModule("/src/core/project.ts");\n  const templates = await server.ssrLoadModule("/src/core/templateCatalog.ts");\n  const rendererSource = await readFile(new URL("../src/MotionComposition.tsx", import.meta.url), "utf8");\n  const editorSource = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");\n  const templateSource = await readFile(new URL("../src/core/templateCatalog.ts", import.meta.url), "utf8");\n  const issues = [];\n\n  const seen = new Set();\n  for (const definition of shapes.SHAPE_DEFINITIONS) {\n    if (seen.has(definition.type)) issues.push(`Duplicate shape definition: ${definition.type}`);\n    seen.add(definition.type);\n    if (!definition.path.startsWith("M")) issues.push(`${definition.type} path must start with M`);\n    if (!(definition.aspectRatio > 0)) issues.push(`${definition.type} aspect ratio must be positive`);\n    if (!(definition.defaultWidth > 0 && definition.defaultHeight > 0)) issues.push(`${definition.type} default size is invalid`);\n    const mask = shapes.getShapeMaskDataUri(definition.type);\n    if (!mask.startsWith("data:image/svg+xml,")) issues.push(`${definition.type} mask URI is invalid`);\n  }\n\n  const project = projectCore.createProject({ name: "Shape audit", format: "square", duration: 5, fps: 30, background: "#ffffff" });\n  const scene = projectCore.getActiveScene(project);\n  for (const definition of shapes.SHAPE_DEFINITIONS) {\n    const layer = projectCore.createShapeLayer(scene, definition.type);\n    if (layer.shape !== definition.type) issues.push(`${definition.type} did not survive layer creation`);\n    if (layer.size.width <= 0 || layer.size.height <= 0) issues.push(`${definition.type} created invalid bounds`);\n    if (layer.scale.x !== 1 || layer.scale.y !== 1) issues.push(`${definition.type} must use identity base scale`);\n  }\n\n  if (!rendererSource.includes("getShapeMaskStyle")) issues.push("Renderer does not use vector shape masks");\n  if (!rendererSource.includes("preserveAspectRatio=\"none\"")) issues.push("Renderer is missing precise responsive SVG stroke geometry");\n  if (!editorSource.includes("SHAPE_DEFINITIONS")) issues.push("Editor shape library is not catalog-driven");\n  if (!editorSource.includes("shape-library-section")) issues.push("Editor shape groups are missing");\n\n  const forbiddenGlyphs = [/♥/u, /❤/u, /✨/u, /⭐/u, /★/u];\n  for (const glyph of forbiddenGlyphs) {\n    if (glyph.test(templateSource)) issues.push(`Template catalog still contains decorative text glyph ${glyph}`);\n  }\n\n  const reports = templates.auditAllCatalogTemplates();\n  const blocking = reports.flatMap((report) => report.errors.map((error) => `${report.templateId}: ${error.code} ${error.layerName}`));\n  issues.push(...blocking);\n\n  if (issues.length) {\n    console.error("Shape library audit failed:");\n    for (const issue of issues) console.error(`- ${issue}`);\n    process.exitCode = 1;\n  } else {\n    console.log(`Shape library audit passed: ${shapes.SHAPE_DEFINITIONS.length} editable vector shapes, precise renderer masks, grouped editor controls, emoji-free template accents, and ${reports.length} template layouts are valid.`);\n  }\n} finally {\n  await server.close();\n}\n''',
)

replace(
    "package.json",
    '    "audit:text-canvas": "node scripts/audit-text-canvas.mjs",\n    "audit": "npm run audit:templates && npm run audit:effects && npm run audit:loops && npm run audit:text-canvas",\n',
    '    "audit:text-canvas": "node scripts/audit-text-canvas.mjs",\n    "audit:shapes": "node scripts/audit-shapes.mjs",\n    "audit": "npm run audit:templates && npm run audit:effects && npm run audit:loops && npm run audit:text-canvas && npm run audit:shapes",\n',
)

replace(
    ".github/workflows/ci.yml",
    '''      - name: Audit effect renderer\n        shell: bash\n''',
    '''      - name: Audit vector shape library\n        shell: bash\n        run: |\n          set -o pipefail\n          npm run audit:shapes 2>&1 | tee shape-audit.log\n\n      - name: Audit effect renderer\n        shell: bash\n''',
)
replace(
    ".github/workflows/ci.yml",
    '            template-audit.log\n            effect-audit.log\n',
    '            template-audit.log\n            shape-audit.log\n            effect-audit.log\n',
)

with (ROOT / "src/finalUx.css").open("a", encoding="utf-8") as handle:
    handle.write('''\n\n/* Expanded vector shape library */\n.shape-library { padding: 8px 10px 24px; }\n.shape-library-section + .shape-library-section { margin-top: 17px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,.065); }\n.shape-library-heading { display: flex; align-items: center; justify-content: space-between; padding: 0 3px 8px; color: #d8d4e0; font-size: 10px; font-weight: 760; letter-spacing: .2px; }\n.shape-library-heading small { color: #777282; font: 8px "DM Mono"; }\n.shape-presets-expanded { grid-template-columns: repeat(2,minmax(0,1fr)); padding: 0 !important; gap: 7px !important; overflow: visible !important; }\n.shape-presets-expanded button { display: grid; grid-template-columns: 36px minmax(0,1fr); align-items: center; min-height: 58px !important; padding: 9px 10px !important; border: 1px solid #343540; border-radius: 10px; color: #bcb6ca; background: #20212a; text-align: left; }\n.shape-presets-expanded button:hover { color: #f1ecff; border-color: #6b5a8c; background: #292733; transform: translateY(-1px); }\n.shape-presets-expanded button strong { display: grid; width: 34px; height: 34px; place-items: center; color: #b49afc; }\n.shape-presets-expanded button span { overflow: hidden; font-size: 9px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }\n''')

print("Expanded shape library and precision template patch applied.")

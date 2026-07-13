import type { LayerEffect, LayerEffectType } from "../types";

export type EffectRendererStage = "inner-filter" | "outer-filter" | "material" | "displacement" | "overlay";

export interface EffectDefinition {
  type: LayerEffectType;
  label: string;
  description: string;
  animated: boolean;
  rendererStage: EffectRendererStage;
  defaultIntensity: number;
  defaultRadius: number;
  defaultSpeed: number;
  defaultColor?: string;
  intensityLabel: string;
  radiusLabel?: string;
  speedLabel?: string;
  colorLabel?: string;
}

export const EFFECT_TYPES = [
  "blur",
  "dropShadow",
  "glow",
  "glass",
  "waterDrop",
  "ripple",
  "chromatic",
  "grain",
  "hueShift",
  "vignette",
] as const satisfies readonly LayerEffectType[];

const DEFINITIONS: Record<LayerEffectType, EffectDefinition> = {
  blur: {
    type: "blur",
    label: "Gaussian blur",
    description: "Soften the complete layer with a controllable blur radius",
    animated: false,
    rendererStage: "inner-filter",
    defaultIntensity: 70,
    defaultRadius: 18,
    defaultSpeed: 0,
    intensityLabel: "Amount",
    radiusLabel: "Radius",
  },
  dropShadow: {
    type: "dropShadow",
    label: "Drop shadow",
    description: "Add an unclipped shadow outside the complete layer",
    animated: false,
    rendererStage: "outer-filter",
    defaultIntensity: 28,
    defaultRadius: 28,
    defaultSpeed: 0,
    defaultColor: "#15111f",
    intensityLabel: "Opacity",
    radiusLabel: "Softness",
    colorLabel: "Color",
  },
  glow: {
    type: "glow",
    label: "Glow",
    description: "Create a two-stage luminous aura around the complete layer",
    animated: false,
    rendererStage: "outer-filter",
    defaultIntensity: 30,
    defaultRadius: 34,
    defaultSpeed: 0,
    defaultColor: "#8b5cf6",
    intensityLabel: "Strength",
    radiusLabel: "Radius",
    colorLabel: "Color",
  },
  glass: {
    type: "glass",
    label: "Frosted glass",
    description: "Cover the full layer with tint, refraction, blur, border, and specular light",
    animated: false,
    rendererStage: "material",
    defaultIntensity: 58,
    defaultRadius: 24,
    defaultSpeed: 0,
    defaultColor: "#ffffff",
    intensityLabel: "Frost",
    radiusLabel: "Blur",
    colorLabel: "Tint",
  },
  waterDrop: {
    type: "waterDrop",
    label: "Water drop",
    description: "Organic full-surface liquid lens distortion",
    animated: true,
    rendererStage: "displacement",
    defaultIntensity: 28,
    defaultRadius: 24,
    defaultSpeed: 0.75,
    intensityLabel: "Strength",
    radiusLabel: "Drop scale",
    speedLabel: "Motion",
  },
  ripple: {
    type: "ripple",
    label: "Ripple",
    description: "Animated full-surface wave displacement",
    animated: true,
    rendererStage: "displacement",
    defaultIntensity: 22,
    defaultRadius: 22,
    defaultSpeed: 1.2,
    intensityLabel: "Strength",
    radiusLabel: "Wavelength",
    speedLabel: "Speed",
  },
  chromatic: {
    type: "chromatic",
    label: "Chromatic split",
    description: "Separate red and cyan edges across the layer silhouette",
    animated: false,
    rendererStage: "inner-filter",
    defaultIntensity: 10,
    defaultRadius: 8,
    defaultSpeed: 0,
    intensityLabel: "Offset",
    radiusLabel: "Softness",
  },
  grain: {
    type: "grain",
    label: "Film grain",
    description: "Apply a deterministic animated texture across the full layer",
    animated: true,
    rendererStage: "overlay",
    defaultIntensity: 18,
    defaultRadius: 10,
    defaultSpeed: 1.5,
    intensityLabel: "Amount",
    radiusLabel: "Grain size",
    speedLabel: "Speed",
  },
  hueShift: {
    type: "hueShift",
    label: "Hue shift",
    description: "Rotate all layer colors through the spectrum",
    animated: true,
    rendererStage: "inner-filter",
    defaultIntensity: 55,
    defaultRadius: 0,
    defaultSpeed: 0.5,
    intensityLabel: "Hue",
    speedLabel: "Cycle speed",
  },
  vignette: {
    type: "vignette",
    label: "Vignette",
    description: "Darken the full layer edge with adjustable feathering",
    animated: false,
    rendererStage: "overlay",
    defaultIntensity: 32,
    defaultRadius: 42,
    defaultSpeed: 0,
    defaultColor: "#000000",
    intensityLabel: "Darkness",
    radiusLabel: "Feather",
    colorLabel: "Color",
  },
};

export const EFFECT_DEFINITIONS: EffectDefinition[] = EFFECT_TYPES.map((type) => DEFINITIONS[type]);

export function effectDefinition(type: LayerEffectType): EffectDefinition {
  return DEFINITIONS[type] ?? DEFINITIONS.blur;
}

export function createLayerEffect(type: LayerEffectType): LayerEffect {
  const definition = effectDefinition(type);
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id: `effect-${random}`,
    type,
    enabled: true,
    intensity: definition.defaultIntensity,
    radius: definition.defaultRadius,
    speed: definition.defaultSpeed,
    color: definition.defaultColor,
    seed: Math.abs(hashString(`${type}-${random}`)) % 999,
  };
}

export function normalizeEffects(effects: LayerEffect[] | undefined): LayerEffect[] {
  if (!Array.isArray(effects)) return [];
  return effects
    .filter((effect): effect is LayerEffect => Boolean(effect && EFFECT_TYPES.includes(effect.type)))
    .map((effect) => {
      const definition = effectDefinition(effect.type);
      return {
        ...effect,
        enabled: effect.enabled !== false,
        intensity: finite(effect.intensity, definition.defaultIntensity),
        radius: Math.max(0, finite(effect.radius, definition.defaultRadius)),
        speed: Math.max(0, finite(effect.speed, definition.defaultSpeed)),
        color: effect.color ?? definition.defaultColor,
        seed: Math.max(0, Math.round(finite(effect.seed, 7))),
      };
    });
}

export function auditEffectDefinitions(): string[] {
  const issues: string[] = [];
  const seen = new Set<LayerEffectType>();
  for (const definition of EFFECT_DEFINITIONS) {
    if (seen.has(definition.type)) issues.push(`Duplicate effect definition: ${definition.type}`);
    seen.add(definition.type);
    if (!definition.label.trim()) issues.push(`${definition.type}: missing label`);
    if (!definition.description.trim()) issues.push(`${definition.type}: missing description`);
    if (!Number.isFinite(definition.defaultIntensity) || definition.defaultIntensity < 0) issues.push(`${definition.type}: invalid default intensity`);
    if (!Number.isFinite(definition.defaultRadius) || definition.defaultRadius < 0) issues.push(`${definition.type}: invalid default radius`);
    if (!Number.isFinite(definition.defaultSpeed) || definition.defaultSpeed < 0) issues.push(`${definition.type}: invalid default speed`);
    if (definition.animated && (!definition.speedLabel || definition.defaultSpeed <= 0)) issues.push(`${definition.type}: animated effects require a speed control and positive default speed`);
    if (!definition.animated && definition.speedLabel) issues.push(`${definition.type}: static effect exposes an unused speed control`);
    if (definition.colorLabel && !definition.defaultColor) issues.push(`${definition.type}: color control requires a default color`);
  }
  for (const type of EFFECT_TYPES) if (!seen.has(type)) issues.push(`Missing effect definition: ${type}`);
  return issues;
}

function finite(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

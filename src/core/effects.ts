import type { LayerEffect, LayerEffectType } from "../types";

export interface EffectDefinition {
  type: LayerEffectType;
  label: string;
  description: string;
  animated: boolean;
  defaultIntensity: number;
  defaultRadius: number;
  defaultSpeed: number;
  defaultColor?: string;
}

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  { type: "blur", label: "Gaussian blur", description: "Soften focus and build depth", animated: false, defaultIntensity: 12, defaultRadius: 18, defaultSpeed: 1 },
  { type: "dropShadow", label: "Drop shadow", description: "Add grounded dimensional depth", animated: false, defaultIntensity: 24, defaultRadius: 28, defaultSpeed: 1, defaultColor: "#15111f" },
  { type: "glow", label: "Glow", description: "Create a luminous neon aura", animated: false, defaultIntensity: 26, defaultRadius: 34, defaultSpeed: 1, defaultColor: "#8b5cf6" },
  { type: "glass", label: "Frosted glass", description: "A translucent premium glass surface", animated: false, defaultIntensity: 55, defaultRadius: 22, defaultSpeed: 1, defaultColor: "#ffffff" },
  { type: "waterDrop", label: "Water drop", description: "Organic liquid lens distortion", animated: true, defaultIntensity: 28, defaultRadius: 20, defaultSpeed: .75 },
  { type: "ripple", label: "Ripple", description: "Animated wave displacement", animated: true, defaultIntensity: 20, defaultRadius: 18, defaultSpeed: 1.2 },
  { type: "chromatic", label: "Chromatic split", description: "RGB edge separation and energy", animated: false, defaultIntensity: 8, defaultRadius: 8, defaultSpeed: 1 },
  { type: "grain", label: "Film grain", description: "Tactile editorial texture", animated: true, defaultIntensity: 18, defaultRadius: 10, defaultSpeed: 1.5 },
  { type: "hueShift", label: "Hue shift", description: "Rotate colors through the spectrum", animated: true, defaultIntensity: 55, defaultRadius: 0, defaultSpeed: .5 },
  { type: "vignette", label: "Vignette", description: "Focus attention toward the center", animated: false, defaultIntensity: 32, defaultRadius: 42, defaultSpeed: 1, defaultColor: "#000000" },
];

export function effectDefinition(type: LayerEffectType): EffectDefinition {
  return EFFECT_DEFINITIONS.find((definition) => definition.type === type) ?? EFFECT_DEFINITIONS[0];
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
  return Array.isArray(effects) ? effects : [];
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

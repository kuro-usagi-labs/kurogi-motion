import React from "react";
import { normalizeEffects } from "../core/effects";
import { getShapeMaskStyle, isBoxShape } from "../core/shapeLibrary";
import type { Layer, LayerEffect, LayerEffectType } from "../types";

interface LayerEffectsProps {
  layer: Layer;
  time: number;
  children: React.ReactNode;
}

export const RENDERED_EFFECT_TYPES = [
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

export function LayerEffects({ layer, time, children }: LayerEffectsProps) {
  const effects = normalizeEffects(layer.effects).filter((effect) => effect.enabled);
  const displacementEffects = effects.filter((effect) => effect.type === "waterDrop" || effect.type === "ripple");
  const glassEffects = effects.filter((effect) => effect.type === "glass");
  const grainEffects = effects.filter((effect) => effect.type === "grain");
  const vignetteEffects = effects.filter((effect) => effect.type === "vignette");
  const filterIds = displacementEffects.map((effect, index) => `kuro-effect-${sanitizeId(layer.id)}-${sanitizeId(effect.id)}-${index}`);
  const outerFilter = buildOuterFilters(effects);
  const innerFilter = [
    ...filterIds.map((id) => `url(#${id})`),
    buildInnerFilters(effects, time),
  ].filter(Boolean).join(" ");
  const clipRadius = resolveClipRadius(layer, glassEffects.at(-1));
  const shouldClip = Boolean(glassEffects.length || grainEffects.length || vignetteEffects.length || displacementEffects.length);
  const glassContentOpacity = resolveGlassContentOpacity(layer.type, glassEffects);

  const outerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "visible",
    filter: outerFilter || undefined,
  };
  const shapeMask = layer.type === "shape" && !isBoxShape(layer.shape)
    ? getShapeMaskStyle(layer.shape)
    : undefined;
  const innerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: shouldClip ? "hidden" : "visible",
    borderRadius: clipRadius,
    filter: innerFilter || undefined,
    isolation: "isolate",
    ...shapeMask,
  };
  const contentStyle: React.CSSProperties = {
    position: "relative",
    zIndex: 1,
    width: "100%",
    height: "100%",
    opacity: glassContentOpacity,
  };

  return (
    <div style={outerStyle}>
      {displacementEffects.length ? (
        <DisplacementDefinitions effects={displacementEffects} ids={filterIds} time={time} />
      ) : null}
      <div style={innerStyle}>
        <div style={contentStyle}>{children}</div>
        {glassEffects.map((effect, index) => (
          <GlassSurface key={effect.id} effect={effect} layer={layer} index={index} />
        ))}
        {grainEffects.map((effect, index) => (
          <GrainOverlay key={effect.id} effect={effect} time={time} index={index} />
        ))}
        {vignetteEffects.map((effect, index) => (
          <VignetteOverlay key={effect.id} effect={effect} index={index} />
        ))}
      </div>
    </div>
  );
}

export function resolveGlassContentOpacity(
  layerType: Layer["type"],
  glassEffects: readonly Pick<LayerEffect, "intensity">[],
) {
  if (layerType !== "shape" || glassEffects.length === 0) return 1;
  const strongestGlass = glassEffects.reduce((strongest, effect) => Math.max(strongest, effect.intensity), 0);
  return clamp(1 - strongestGlass / 170, 0.38, 0.86);
}

function DisplacementDefinitions({ effects, ids, time }: { effects: LayerEffect[]; ids: string[]; time: number }) {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <defs>
        {effects.map((effect, index) => {
          const radius = clamp(effect.radius, 1, 180);
          const wavelength = clamp(0.048 - radius / 5200, 0.006, 0.045);
          const phase = time * Math.max(0.01, effect.speed) * Math.PI * 2;
          const frequency = wavelength * (1 + Math.sin(phase) * (effect.type === "ripple" ? 0.12 : 0.055));
          const distortion = Math.max(0, effect.intensity)
            * (effect.type === "waterDrop" ? 1.55 : 1.15)
            * (0.94 + Math.sin(phase * 0.7) * 0.06);
          return (
            <filter
              key={effect.id}
              id={ids[index]}
              x="-35%"
              y="-35%"
              width="170%"
              height="170%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type={effect.type === "waterDrop" ? "fractalNoise" : "turbulence"}
                baseFrequency={`${Math.max(0.001, frequency)} ${Math.max(0.001, frequency * 0.72)}`}
                numOctaves={effect.type === "waterDrop" ? 2 : 1}
                seed={effect.seed ?? 7}
                result="noise"
              />
              <feGaussianBlur
                in="noise"
                stdDeviation={Math.max(0.15, radius / 22)}
                result="softNoise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="softNoise"
                scale={distortion}
                xChannelSelector="R"
                yChannelSelector="B"
              />
            </filter>
          );
        })}
      </defs>
    </svg>
  );
}

function GlassSurface({ effect, layer, index }: { effect: LayerEffect; layer: Layer; index: number }) {
  const strength = clamp(effect.intensity / 100, 0, 1);
  const blur = clamp(effect.radius, 0, 180);
  const tint = effect.color ?? "#ffffff";
  const tintAlpha = 0.08 + strength * 0.24;
  const highlightAlpha = 0.13 + strength * 0.3;
  const borderAlpha = 0.2 + strength * 0.38;
  const saturation = 1 + strength * 0.72;
  const contrast = 1 + strength * 0.08;
  const isShape = layer.type === "shape";

  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20 + index,
        pointerEvents: "none",
        borderRadius: "inherit",
        boxSizing: "border-box",
        overflow: "hidden",
        background: [
          `linear-gradient(145deg, ${rgba(tint, tintAlpha + 0.08)}, ${rgba(tint, tintAlpha * 0.46)})`,
          `radial-gradient(circle at 18% 8%, rgba(255,255,255,${highlightAlpha}), transparent 42%)`,
          `linear-gradient(125deg, rgba(255,255,255,${highlightAlpha * 0.78}), transparent 26%, transparent 72%, rgba(255,255,255,${highlightAlpha * 0.22}))`,
        ].join(","),
        border: `1px solid rgba(255,255,255,${borderAlpha})`,
        boxShadow: [
          `inset 0 1px 0 rgba(255,255,255,${highlightAlpha})`,
          `inset 0 -1px 0 rgba(255,255,255,${highlightAlpha * 0.22})`,
          isShape ? `0 ${Math.max(6, blur * 0.48)}px ${Math.max(18, blur * 1.65)}px rgba(15,12,28,${0.07 + strength * 0.11})` : "",
        ].filter(Boolean).join(","),
        backdropFilter: `blur(${blur}px) saturate(${saturation}) contrast(${contrast})`,
        WebkitBackdropFilter: `blur(${blur}px) saturate(${saturation}) contrast(${contrast})`,
      }}
    />
  );
}

function GrainOverlay({ effect, time, index }: { effect: LayerEffect; time: number; index: number }) {
  const size = clamp(effect.radius, 3, 80);
  const shift = Math.round((time * Math.max(0.01, effect.speed) * 47 + (effect.seed ?? 1)) % 37);
  const opacity = clamp(effect.intensity / 100, 0, 1) * 0.34;
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: -Math.max(6, size),
        zIndex: 40 + index,
        pointerEvents: "none",
        opacity,
        mixBlendMode: "overlay",
        backgroundImage: [
          "radial-gradient(circle,rgba(255,255,255,.95) 0 1px,transparent 1.2px)",
          "radial-gradient(circle,rgba(0,0,0,.85) 0 1px,transparent 1.2px)",
          "radial-gradient(circle,rgba(255,255,255,.65) 0 .8px,transparent 1px)",
        ].join(","),
        backgroundPosition: `${shift}px ${shift * 0.7}px, ${-shift * 0.8}px ${shift * 0.45}px, ${shift * 0.3}px ${-shift}px`,
        backgroundSize: `${size}px ${size * 0.82}px, ${size * 1.3}px ${size * 1.18}px, ${size * 0.74}px ${size * 0.68}px`,
        transform: `translate(${shift % 5}px, ${shift % 7}px)`,
        filter: "contrast(145%)",
      }}
    />
  );
}

function VignetteOverlay({ effect, index }: { effect: LayerEffect; index: number }) {
  const alpha = clamp(effect.intensity / 100, 0, 1) * 0.82;
  const feather = clamp(effect.radius, 0, 100);
  const innerStop = clamp(78 - feather * 0.62, 8, 74);
  const color = rgba(effect.color ?? "#000000", alpha);
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60 + index,
        pointerEvents: "none",
        borderRadius: "inherit",
        background: `radial-gradient(ellipse at center, transparent ${innerStop}%, ${color} 100%)`,
      }}
    />
  );
}

function buildOuterFilters(effects: LayerEffect[]) {
  const filters: string[] = [];
  for (const effect of effects) {
    if (effect.type === "dropShadow") {
      const opacity = clamp(effect.intensity / 100, 0, 0.9);
      const softness = clamp(effect.radius, 0, 180);
      const y = Math.max(1, softness * 0.42);
      filters.push(`drop-shadow(0 ${y}px ${Math.max(1, softness)}px ${rgba(effect.color ?? "#15111f", opacity)})`);
    }
    if (effect.type === "glow") {
      const opacity = clamp(effect.intensity / 100, 0, 1);
      const radius = clamp(effect.radius, 0, 180);
      const color = effect.color ?? "#8b5cf6";
      filters.push(`drop-shadow(0 0 ${Math.max(1, radius * 0.42)}px ${rgba(color, opacity * 0.82)})`);
      filters.push(`drop-shadow(0 0 ${Math.max(1, radius)}px ${rgba(color, opacity * 0.46)})`);
    }
  }
  return filters.join(" ");
}

function buildInnerFilters(effects: LayerEffect[], time: number) {
  const filters: string[] = [];
  for (const effect of effects) {
    if (effect.type === "blur") {
      const amount = clamp(effect.intensity / 100, 0, 1);
      const radius = clamp(effect.radius, 0, 180);
      filters.push(`blur(${radius * amount}px)`);
    }
    if (effect.type === "chromatic") {
      const offset = clamp(effect.intensity, 0, 100) * 0.45;
      const softness = clamp(effect.radius, 0, 180) * 0.12;
      filters.push(`drop-shadow(${offset}px 0 ${softness}px rgba(255,38,112,.48))`);
      filters.push(`drop-shadow(${-offset}px 0 ${softness}px rgba(30,214,255,.48))`);
    }
    if (effect.type === "hueShift") {
      const degrees = effect.intensity + time * effect.speed * 90;
      filters.push(`hue-rotate(${degrees}deg)`);
      filters.push(`saturate(${1 + Math.min(360, Math.max(0, effect.intensity)) / 220})`);
    }
  }
  return filters.join(" ");
}

function resolveClipRadius(layer: Layer, glass?: LayerEffect): string | number | undefined {
  if (layer.type === "shape") {
    if (layer.shape === "circle") return "50%";
    if (layer.shape === "line") return 999;
    if (!isBoxShape(layer.shape)) return 0;
    return Math.max(0, layer.style.borderRadius);
  }
  if (glass) return Math.max(8, Math.min(layer.size.width, layer.size.height) * 0.045);
  return undefined;
}

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function rgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return `rgba(255,255,255,${clamp(alpha, 0, 1)})`;
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${clamp(alpha, 0, 1)})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

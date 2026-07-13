import React, { useMemo } from "react";
import { normalizeEffects } from "../core/effects";
import type { Layer, LayerEffect } from "../types";

interface LayerEffectsProps {
  layer: Layer;
  time: number;
  children: React.ReactNode;
}

export function LayerEffects({ layer, time, children }: LayerEffectsProps) {
  const effects = normalizeEffects(layer.effects).filter((effect) => effect.enabled);
  const filterId = `kuro-effect-${sanitizeId(layer.id)}`;
  const displacement = strongestDisplacement(effects);
  const filters = buildCssFilters(effects, time);
  const glass = effects.find((effect) => effect.type === "glass");
  const grain = effects.find((effect) => effect.type === "grain");
  const vignette = effects.find((effect) => effect.type === "vignette");

  const wrapperStyle = useMemo<React.CSSProperties>(() => ({
    position: "relative",
    width: "100%",
    height: "100%",
    filter: [displacement ? `url(#${filterId})` : "", filters].filter(Boolean).join(" ") || undefined,
    borderRadius: glass ? Math.max(10, glass.radius) : undefined,
    overflow: glass || displacement || grain || vignette ? "hidden" : "visible",
    background: glass
      ? `linear-gradient(145deg, rgba(255,255,255,${clamp(glass.intensity / 180, .08, .48)}), rgba(255,255,255,${clamp(glass.intensity / 520, .025, .18)}))`
      : undefined,
    border: glass ? "1px solid rgba(255,255,255,.34)" : undefined,
    boxShadow: glass ? "inset 0 1px rgba(255,255,255,.36), 0 18px 44px rgba(15,12,28,.16)" : undefined,
    backdropFilter: glass ? `blur(${Math.max(4, glass.radius)}px) saturate(${1 + glass.intensity / 100})` : undefined,
  }), [displacement, filterId, filters, glass]);

  return (
    <div style={wrapperStyle}>
      {displacement ? <DisplacementFilter id={filterId} effect={displacement} time={time} /> : null}
      {children}
      {grain ? <GrainOverlay effect={grain} time={time} /> : null}
      {vignette ? <VignetteOverlay effect={vignette} /> : null}
      {glass ? <GlassHighlight /> : null}
    </div>
  );
}

function DisplacementFilter({ id, effect, time }: { id: string; effect: LayerEffect; time: number }) {
  const animated = effect.type === "ripple";
  const base = effect.type === "waterDrop" ? .009 : .018;
  const frequency = base + (animated ? Math.sin(time * Math.max(.1, effect.speed) * Math.PI * 2) * .0035 : 0);
  const scale = Math.max(0, effect.intensity) * (effect.type === "waterDrop" ? 1.4 : 1);
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <defs>
        <filter id={id} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
          <feTurbulence
            type={effect.type === "waterDrop" ? "fractalNoise" : "turbulence"}
            baseFrequency={`${Math.max(.001, frequency)} ${Math.max(.001, frequency * .72)}`}
            numOctaves={effect.type === "waterDrop" ? 2 : 1}
            seed={effect.seed ?? 7}
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation={Math.max(.2, effect.radius / 18)} result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="B"
          />
        </filter>
      </defs>
    </svg>
  );
}

function GrainOverlay({ effect, time }: { effect: LayerEffect; time: number }) {
  const shift = Math.round((time * effect.speed * 37 + (effect.seed ?? 1)) % 31);
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: -12,
        pointerEvents: "none",
        opacity: clamp(effect.intensity / 100, .02, .38),
        mixBlendMode: "overlay",
        backgroundImage:
          "radial-gradient(circle at 20% 20%,rgba(255,255,255,.9) 0 1px,transparent 1px),radial-gradient(circle at 80% 35%,rgba(0,0,0,.8) 0 1px,transparent 1px),radial-gradient(circle at 45% 78%,rgba(255,255,255,.7) 0 1px,transparent 1px)",
        backgroundSize: `${13 + shift % 4}px ${11 + shift % 5}px, ${17 + shift % 3}px ${15 + shift % 4}px, ${19 + shift % 5}px ${18 + shift % 3}px`,
        transform: `translate(${shift % 5}px, ${shift % 7}px)`,
      }}
    />
  );
}

function VignetteOverlay({ effect }: { effect: LayerEffect }) {
  const alpha = clamp(effect.intensity / 100, .05, .72);
  const radius = clamp(effect.radius, 0, 100);
  const color = rgba(effect.color ?? "#000000", alpha);
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: `radial-gradient(circle at center, transparent ${Math.max(10, 70 - radius)}%, ${color} 100%)`,
      }}
    />
  );
}

function GlassHighlight() {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: "linear-gradient(125deg,rgba(255,255,255,.28),transparent 28%,transparent 72%,rgba(255,255,255,.09))",
      }}
    />
  );
}

function buildCssFilters(effects: LayerEffect[], time: number) {
  const filters: string[] = [];
  for (const effect of effects) {
    if (effect.type === "blur") filters.push(`blur(${Math.max(0, effect.intensity)}px)`);
    if (effect.type === "dropShadow") {
      const y = Math.max(1, effect.radius * .45);
      const blur = Math.max(1, effect.radius);
      filters.push(`drop-shadow(0 ${y}px ${blur}px ${rgba(effect.color ?? "#15111f", clamp(effect.intensity / 100, .06, .75))})`);
    }
    if (effect.type === "glow") {
      const glow = Math.max(1, effect.radius);
      const color = rgba(effect.color ?? "#8b5cf6", clamp(effect.intensity / 100, .08, .95));
      filters.push(`drop-shadow(0 0 ${glow * .45}px ${color}) drop-shadow(0 0 ${glow}px ${color})`);
    }
    if (effect.type === "chromatic") {
      const offset = Math.max(1, effect.intensity / 2);
      filters.push(`drop-shadow(${offset}px 0 0 rgba(255,40,120,.38)) drop-shadow(${-offset}px 0 0 rgba(40,210,255,.38))`);
    }
    if (effect.type === "hueShift") {
      const degrees = effect.intensity + time * effect.speed * 90;
      filters.push(`hue-rotate(${degrees}deg) saturate(${1 + Math.max(0, effect.intensity) / 140})`);
    }
  }
  return filters.join(" ");
}

function strongestDisplacement(effects: LayerEffect[]) {
  return effects
    .filter((effect) => effect.type === "waterDrop" || effect.type === "ripple")
    .sort((a, b) => b.intensity - a.intensity)[0];
}

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function rgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return `rgba(0,0,0,${alpha})`;
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

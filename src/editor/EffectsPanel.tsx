import React from "react";
import { createLayerEffect, EFFECT_DEFINITIONS, effectDefinition, normalizeEffects } from "../core/effects";
import type { Layer, LayerEffect, LayerEffectType } from "../types";
import { Icon } from "../ui/Icon";

interface EffectsPanelProps {
  layer: Layer;
  onBegin: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onPreview: (updater: (layer: Layer) => Layer) => void;
  onCommit: (updater: (layer: Layer) => Layer) => void;
}

export function EffectsPanel({ layer, onBegin, onFinish, onCancel, onPreview, onCommit }: EffectsPanelProps) {
  const effects = normalizeEffects(layer.effects);

  function addEffect(type: LayerEffectType) {
    onCommit((current) => ({
      ...current,
      effects: [...normalizeEffects(current.effects), createLayerEffect(type)],
    }));
  }

  function updateEffect(effectId: string, updater: (effect: LayerEffect) => LayerEffect, commit = false) {
    const updateLayer = (current: Layer): Layer => ({
      ...current,
      effects: normalizeEffects(current.effects).map((effect) => effect.id === effectId ? updater(effect) : effect),
    });
    if (commit) onCommit(updateLayer);
    else onPreview(updateLayer);
  }

  function removeEffect(effectId: string) {
    onCommit((current) => ({
      ...current,
      effects: normalizeEffects(current.effects).filter((effect) => effect.id !== effectId),
    }));
  }

  return (
    <section className="property-section compact-property-section effects-section">
      <div className="section-label">Effects</div>
      <div className="effect-library-grid">
        {EFFECT_DEFINITIONS.map((definition) => (
          <button
            key={definition.type}
            type="button"
            title={definition.description}
            onClick={() => addEffect(definition.type)}
          >
            <EffectGlyph type={definition.type} />
            <span>{definition.label}</span>
          </button>
        ))}
      </div>

      {effects.length ? (
        <div className="effect-stack">
          {effects.map((effect) => {
            const definition = effectDefinition(effect.type);
            return (
              <article className={`effect-card ${effect.enabled ? "is-enabled" : ""}`} key={effect.id}>
                <header>
                  <span><EffectGlyph type={effect.type} /><strong>{definition.label}</strong></span>
                  <span>
                    <label className="effect-toggle" title={effect.enabled ? "Disable effect" : "Enable effect"}>
                      <input
                        type="checkbox"
                        checked={effect.enabled}
                        onChange={(event) => updateEffect(effect.id, (current) => ({ ...current, enabled: event.currentTarget.checked }), true)}
                      />
                      <i />
                    </label>
                    <button type="button" className="svg-button danger-text" title="Remove effect" onClick={() => removeEffect(effect.id)}><Icon name="trash" size={13} /></button>
                  </span>
                </header>
                <label className="effect-range">
                  <span>Intensity <b>{Math.round(effect.intensity)}</b></span>
                  <input
                    type="range"
                    min="0"
                    max={effect.type === "hueShift" ? 360 : 100}
                    step="1"
                    value={effect.intensity}
                    onPointerDown={onBegin}
                    onChange={(event) => updateEffect(effect.id, (current) => ({ ...current, intensity: Number(event.currentTarget.value) }))}
                    onPointerUp={onFinish}
                    onPointerCancel={onCancel}
                  />
                </label>
                <div className="property-grid two">
                  <label className="number-field">Radius<span><input type="number" min="0" max="180" step="1" value={Number(effect.radius.toFixed(2))} onFocus={onBegin} onChange={(event) => updateEffect(effect.id, (current) => ({ ...current, radius: Math.max(0, Number(event.currentTarget.value)) }))} onBlur={onFinish} /></span></label>
                  <label className="number-field">Speed<span><input type="number" min="0" max="10" step=".05" value={Number(effect.speed.toFixed(2))} onFocus={onBegin} onChange={(event) => updateEffect(effect.id, (current) => ({ ...current, speed: Math.max(0, Number(event.currentTarget.value)) }))} onBlur={onFinish} /></span></label>
                </div>
                {definition.defaultColor ? (
                  <label className="effect-color">Color<input type="color" value={normalizeColor(effect.color ?? definition.defaultColor)} onFocus={onBegin} onChange={(event) => updateEffect(effect.id, (current) => ({ ...current, color: event.currentTarget.value }))} onBlur={onFinish} /></label>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="effect-empty">Add blur, glow, liquid distortion, grain, or other effects. They remain editable and render in preview and export.</p>
      )}
    </section>
  );
}

function EffectGlyph({ type }: { type: LayerEffectType }) {
  const glyphs: Record<LayerEffectType, string> = {
    blur: "◌",
    dropShadow: "◒",
    glow: "✦",
    glass: "◇",
    waterDrop: "◉",
    ripple: "≈",
    chromatic: "RGB",
    grain: "⁙",
    hueShift: "◐",
    vignette: "◍",
  };
  return <i className={`effect-glyph effect-${type}`}>{glyphs[type]}</i>;
}

function normalizeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}

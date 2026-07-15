import React, { useState } from "react";
import { createLayerEffect, EFFECT_DEFINITIONS, effectDefinition, normalizeEffects } from "../core/effects";
import type { Layer, LayerEffect, LayerEffectType } from "../types";
import { Icon, type IconName } from "../ui/Icon";
import { NumberField } from "./NumericField";

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
  const [libraryOpen, setLibraryOpen] = useState(false);

  function addEffect(type: LayerEffectType) {
    onCommit((current) => ({
      ...current,
      effects: [...normalizeEffects(current.effects), createLayerEffect(type)],
    }));
    setLibraryOpen(false);
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
      <header className="effects-section-header">
        <div className="section-label">Effects{effects.length ? <span>{effects.length}</span> : null}</div>
        <button type="button" className={libraryOpen ? "is-open" : ""} aria-expanded={libraryOpen} aria-controls="effect-library" onClick={() => setLibraryOpen((open) => !open)}><Icon name={libraryOpen ? "close" : "plus"} size={13} />{libraryOpen ? "Close" : "Add effect"}</button>
      </header>
      {libraryOpen ? (
        <div className="effect-library-panel" id="effect-library">
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
          <small>Effects are non-destructive and render the same in preview and export.</small>
        </div>
      ) : null}

      {effects.length ? (
        <div className="effect-stack">
          {effects.map((effect) => {
            const definition = effectDefinition(effect.type);
            const hasSecondaryControls = Boolean(definition.radiusLabel || definition.speedLabel);
            return (
              <article className={`effect-card ${effect.enabled ? "is-enabled" : ""}`} key={effect.id}>
                <header>
                  <span><EffectGlyph type={effect.type} /><strong>{definition.label}</strong></span>
                  <span>
                    <label className="effect-toggle" title={effect.enabled ? "Disable effect" : "Enable effect"}>
                      <input
                        type="checkbox"
                        aria-label={`${effect.enabled ? "Disable" : "Enable"} ${definition.label}`}
                        checked={effect.enabled}
                        onChange={(event) => updateEffect(effect.id, (current) => ({ ...current, enabled: event.currentTarget.checked }), true)}
                      />
                      <i />
                    </label>
                    <button type="button" className="svg-button danger-text" title="Remove effect" aria-label={`Remove ${definition.label}`} onClick={() => removeEffect(effect.id)}><Icon name="trash" size={13} /></button>
                  </span>
                </header>
                <p className="effect-description">{definition.description}</p>
                <label className="effect-range">
                  <span>{definition.intensityLabel} <b>{Math.round(effect.intensity)}</b></span>
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
                {hasSecondaryControls ? (
                  <div className="property-grid two effect-secondary-controls">
                    {definition.radiusLabel ? (
                      <NumberField label={definition.radiusLabel} value={effect.radius} min={0} max={180} step={1} suffix="px" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => updateEffect(effect.id, (current) => ({ ...current, radius: clamp(value, 0, 180) }))} />
                    ) : <span />}
                    {definition.speedLabel ? (
                      <NumberField label={definition.speedLabel} value={effect.speed} min={0} max={10} step={.05} suffix="×" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => updateEffect(effect.id, (current) => ({ ...current, speed: clamp(value, 0, 10) }))} />
                    ) : null}
                  </div>
                ) : null}
                {definition.colorLabel && definition.defaultColor ? (
                  <label className="effect-color">{definition.colorLabel}<input type="color" value={normalizeColor(effect.color ?? definition.defaultColor)} onFocus={onBegin} onChange={(event) => updateEffect(effect.id, (current) => ({ ...current, color: event.currentTarget.value }))} onBlur={onFinish} /></label>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="effect-empty"><strong>No effects applied</strong><span>Keep the layer clean, or choose Add effect when the design needs more depth.</span></p>
      )}
    </section>
  );
}

function EffectGlyph({ type }: { type: LayerEffectType }) {
  const icons: Record<LayerEffectType, IconName> = {
    blur: "blur",
    dropShadow: "shadow",
    glow: "glow",
    glass: "glass",
    waterDrop: "droplet",
    ripple: "ripple",
    chromatic: "chromatic",
    grain: "grain",
    hueShift: "hue",
    vignette: "vignette",
  };
  return <i className={`effect-glyph effect-${type}`}><Icon name={icons[type]} size={16} /></i>;
}

function normalizeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

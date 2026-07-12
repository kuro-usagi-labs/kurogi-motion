import React, { useEffect, useMemo, useState } from "react";
import type { AnimationCategory, AnimationType, KurogiProject, Layer } from "../types";
import { Icon, animationIconName } from "../ui/Icon";
import { ANIMATION_PRESETS } from "./animationPresets";

interface AnimationPresetDialogProps {
  project: KurogiProject;
  layer: Layer;
  initialCategory: AnimationCategory;
  onClose: () => void;
  onChoose: (category: AnimationCategory, type: AnimationType) => void;
}

export function AnimationPresetDialog({ project, layer, initialCategory, onClose, onChoose }: AnimationPresetDialogProps) {
  const [category, setCategory] = useState<AnimationCategory>(initialCategory);
  const [query, setQuery] = useState("");
  const presets = useMemo(() => ANIMATION_PRESETS.filter((preset) =>
    preset.category === category && `${preset.label} ${preset.description}`.toLowerCase().includes(query.toLowerCase()),
  ), [category, query]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="preset-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="preset-dialog" role="dialog" aria-modal="true" aria-label="Choose animation preset">
        <header className="preset-dialog-header">
          <div><span>ANIMATION PRESETS</span><h2>Preview motion on {layer.name}</h2></div>
          <button type="button" className="svg-button" onClick={onClose} aria-label="Close preset browser"><Icon name="close" /></button>
        </header>

        <div className="preset-dialog-toolbar">
          <div className="preset-dialog-categories">
            {(["in", "loop", "out"] as const).map((candidate) => <button type="button" key={candidate} className={category === candidate ? "active" : ""} onClick={() => setCategory(candidate)}>{candidate === "in" ? "In" : candidate === "loop" ? "Loop" : "Out"}</button>)}
          </div>
          <label className="preset-search"><Icon name="search" size={16} /><input autoFocus placeholder="Search presets" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
        </div>

        <div className="preset-browser-grid">
          {presets.map((preset) => (
            <button type="button" className={`preset-browser-card preset-card-${category}`} key={preset.type} onClick={() => onChoose(category, preset.type)}>
              <PresetPreview project={project} layer={layer} type={preset.type} />
              <span className="preset-browser-copy">
                <span className={`preset-browser-icon preset-${category}`}><Icon name={animationIconName(preset.type)} size={17} /></span>
                <span><strong>{preset.label}</strong><small>{preset.description}</small></span>
                <Icon name="plus" size={15} />
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function PresetPreview({ project, layer, type }: { project: KurogiProject; layer: Layer; type: AnimationType }) {
  const style: React.CSSProperties = {
    width: `${Math.max(34, Math.min(72, layer.size.width / 8))}%`,
    height: `${Math.max(28, Math.min(62, layer.size.height / 6))}%`,
    transformOrigin: `${layer.anchor.x * 100}% ${layer.anchor.y * 100}%`,
  };
  const backdrop = previewBackdrop(layer);

  return (
    <div className="preset-live-preview contrast-preview" style={{ background: backdrop.background, color: backdrop.foreground }}>
      <div className="preset-preview-grid" />
      <div className={`preset-live-element preview-${type}`} style={style}>
        {layer.type === "text" ? (
          <span style={{ fontFamily: layer.style.fontFamily, fontWeight: layer.style.fontWeight, color: layer.style.color, textShadow: backdrop.textShadow }}>{layer.text.replace(/\n/g, " ").slice(0, 28) || "Text"}</span>
        ) : layer.type === "shape" ? (
          <i style={{ display: "block", width: "100%", height: "100%", background: layer.style.fill, border: layer.style.strokeWidth ? `${Math.min(3, layer.style.strokeWidth)}px solid ${layer.style.stroke}` : undefined, borderRadius: layer.shape === "circle" ? "50%" : Math.min(14, layer.style.borderRadius), boxShadow: "0 14px 30px rgba(0,0,0,.2)" }} />
        ) : layer.type === "image" || layer.type === "svg" ? (
          <img src={project.assets[layer.assetId]?.thumbnailUrl ?? project.assets[layer.assetId]?.sourceUrl} alt="" />
        ) : (
          <span>{layer.name}</span>
        )}
      </div>
      <span className="preset-preview-floor" />
    </div>
  );
}

function previewBackdrop(layer: Layer) {
  const color = layer.type === "text" ? layer.style.color : layer.type === "shape" ? layer.style.fill : "#7c5cff";
  const light = isLightColor(color);
  return light
    ? { background: "linear-gradient(145deg,#171821,#252637)", foreground: "#ffffff", textShadow: "0 2px 12px rgba(0,0,0,.38)" }
    : { background: "linear-gradient(145deg,#f8f8fb,#e9e8f0)", foreground: "#171821", textShadow: "0 1px 8px rgba(255,255,255,.65)" };
}

function isLightColor(value: string) {
  const normalized = value.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return false;
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 155;
}

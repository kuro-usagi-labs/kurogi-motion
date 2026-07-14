import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AlignMode, DistributeMode } from "../core/designTools";
import type { BlendMode, GradientFill, KurogiProject, Layer } from "../types";
import { Icon, type IconName } from "../ui/Icon";

interface DesignToolsPanelProps {
  project: KurogiProject;
  selectedLayers: Layer[];
  onAlign: (mode: AlignMode) => void;
  onDistribute: (mode: DistributeMode) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onGradient: (gradient?: GradientFill) => void;
  onBlendMode: (mode: BlendMode) => void;
  onBackgroundBlur: (radius: number) => void;
  onApplyMask: (type: "vector" | "alpha") => void;
  onClearMask: () => void;
  onFontFamily: (fontFamily: string) => void;
  onImportFont: (file: File) => void;
  onToggleSnap: () => void;
}

type PaintDraftPatch = Omit<Partial<GradientFill>, "type"> & {
  type?: "solid" | GradientFill["type"];
};

const BLEND_MODES: BlendMode[] = [
  "normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge",
  "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue",
  "saturation", "color", "luminosity",
];

const SYSTEM_FONTS = ["Inter", "Arial", "Georgia", "Times New Roman", "Courier New", "Verdana"];
const ALIGNMENT_ICONS: Record<AlignMode, IconName> = { left: "alignLeft", center: "alignCenterHorizontal", right: "alignRight", top: "alignTop", middle: "alignCenterVertical", bottom: "alignBottom" };

export function DesignToolsPanel({
  project,
  selectedLayers,
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
  onGradient,
  onBlendMode,
  onBackgroundBlur,
  onApplyMask,
  onClearMask,
  onFontFamily,
  onImportFont,
  onToggleSnap,
}: DesignToolsPanelProps) {
  const primary = selectedLayers.at(-1) ?? null;
  const gradient = primary && (primary.type === "shape" || primary.type === "text") ? primary.style.gradient : undefined;
  const fallbackColor = primary?.type === "shape" ? primary.style.fill : primary?.type === "text" ? primary.style.color : "#8b5cf6";
  const [paintType, setPaintType] = useState<"solid" | "linear" | "radial">(gradient?.type ?? "solid");
  const [startColor, setStartColor] = useState(gradient?.startColor ?? fallbackColor);
  const [endColor, setEndColor] = useState(gradient?.endColor ?? "#22d3ee");
  const [angle, setAngle] = useState(gradient?.angle ?? 90);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const customFonts = useMemo(
    () => Object.values(project.assets).filter((asset) => asset.type === "font" && asset.fontFamily),
    [project.assets],
  );

  useEffect(() => {
    setPaintType(gradient?.type ?? "solid");
    setStartColor(gradient?.startColor ?? fallbackColor);
    setEndColor(gradient?.endColor ?? "#22d3ee");
    setAngle(gradient?.angle ?? 90);
  }, [primary?.id, gradient?.type, gradient?.startColor, gradient?.endColor, gradient?.angle, fallbackColor]);

  function commitGradient(next: PaintDraftPatch) {
    const type = next.type ?? paintType;
    const nextStart = next.startColor ?? startColor;
    const nextEnd = next.endColor ?? endColor;
    const nextAngle = next.angle ?? angle;
    setPaintType(type);
    setStartColor(nextStart);
    setEndColor(nextEnd);
    setAngle(nextAngle);
    if (type === "solid") onGradient(undefined);
    else onGradient({ type, startColor: nextStart, endColor: nextEnd, angle: nextAngle });
  }

  const canVectorMask = selectedLayers.length === 2 && selectedLayers[0].type === "shape";
  const canAlphaMask = selectedLayers.length === 2 && (selectedLayers[0].type === "image" || selectedLayers[0].type === "svg");
  const textSelected = selectedLayers.some((layer) => layer.type === "text");

  return (
    <div className="design-tools-panel" data-design-tools="true">
      <div className="design-tools-section design-tools-selection">
        <span className="design-tools-label">{selectedLayers.length ? `${selectedLayers.length} selected` : "Select a layer"}</span>
        <button type="button" className={project.settings.snapEnabled ? "active" : ""} onClick={onToggleSnap} title="Toggle smart snapping">Snap</button>
      </div>

      <div className="design-tools-section design-tools-align-section" aria-label="Alignment tools">
        {(["left", "center", "right", "top", "middle", "bottom"] as AlignMode[]).map((mode) => (
          <button type="button" className="design-tools-icon-button" key={mode} disabled={!selectedLayers.length} onClick={() => onAlign(mode)} title={alignmentTitle(mode)} aria-label={alignmentTitle(mode)}><Icon name={ALIGNMENT_ICONS[mode]} size={15} /></button>
        ))}
        <span className="design-tools-mini-divider" />
        <button type="button" className="design-tools-icon-button" disabled={selectedLayers.length < 3} onClick={() => onDistribute("horizontal")} title="Distribute horizontal spacing" aria-label="Distribute horizontal spacing"><Icon name="distributeHorizontal" size={15} /></button>
        <button type="button" className="design-tools-icon-button" disabled={selectedLayers.length < 3} onClick={() => onDistribute("vertical")} title="Distribute vertical spacing" aria-label="Distribute vertical spacing"><Icon name="distributeVertical" size={15} /></button>
      </div>

      <div className="design-tools-section">
        <button type="button" disabled={selectedLayers.length < 2} onClick={onGroup}>Group</button>
        <button type="button" disabled={primary?.type !== "group"} onClick={onUngroup}>Ungroup</button>
      </div>

      <details className="design-tools-popover">
        <summary>Fill</summary>
        <div className="design-tools-popover-body">
          <label>Paint
            <select disabled={!primary || (primary.type !== "shape" && primary.type !== "text")} value={paintType} onChange={(event) => commitGradient({ type: event.target.value as "solid" | "linear" | "radial" })}>
              <option value="solid">Solid</option>
              <option value="linear">Linear gradient</option>
              <option value="radial">Radial gradient</option>
            </select>
          </label>
          {paintType !== "solid" ? (
            <>
              <label>Start<input type="color" value={startColor} onChange={(event) => commitGradient({ startColor: event.target.value })} /></label>
              <label>End<input type="color" value={endColor} onChange={(event) => commitGradient({ endColor: event.target.value })} /></label>
              {paintType === "linear" ? <label>Angle<input type="range" min="0" max="360" value={angle} onChange={(event) => commitGradient({ angle: Number(event.target.value) })} /><output>{angle}°</output></label> : null}
            </>
          ) : null}
        </div>
      </details>

      <details className="design-tools-popover">
        <summary>Composite</summary>
        <div className="design-tools-popover-body">
          <label>Blend mode
            <select disabled={!primary} value={primary?.blendMode ?? "normal"} onChange={(event) => onBlendMode(event.target.value as BlendMode)}>
              {BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </label>
          <label>Background blur
            <input type="range" min="0" max="80" step="1" disabled={!primary} value={primary?.backgroundBlur ?? 0} onChange={(event) => onBackgroundBlur(Number(event.target.value))} />
            <output>{Math.round(primary?.backgroundBlur ?? 0)} px</output>
          </label>
        </div>
      </details>

      <details className="design-tools-popover">
        <summary>Mask</summary>
        <div className="design-tools-popover-body mask-actions">
          <small>Select the mask source first, then Shift-select the target.</small>
          <button type="button" disabled={!canVectorMask} onClick={() => onApplyMask("vector")}>Use vector mask</button>
          <button type="button" disabled={!canAlphaMask} onClick={() => onApplyMask("alpha")}>Use alpha mask</button>
          <button type="button" disabled={!primary?.mask} onClick={onClearMask}>Remove mask</button>
        </div>
      </details>

      <details className="design-tools-popover">
        <summary>Font</summary>
        <div className="design-tools-popover-body">
          <input ref={fontInputRef} hidden type="file" accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf" onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onImportFont(file);
            event.currentTarget.value = "";
          }} />
          <label>Family
            <select disabled={!textSelected} value={primary?.type === "text" ? primary.style.fontFamily : "Inter"} onChange={(event) => onFontFamily(event.target.value)}>
              {SYSTEM_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
              {customFonts.map((asset) => <option key={asset.id} value={asset.fontFamily}>{asset.fontFamily}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => fontInputRef.current?.click()}>Import font</button>
        </div>
      </details>
    </div>
  );
}

function alignmentTitle(mode: AlignMode) {
  if (mode === "center") return "Align horizontal center";
  if (mode === "middle") return "Align vertical center";
  return `Align ${mode}`;
}

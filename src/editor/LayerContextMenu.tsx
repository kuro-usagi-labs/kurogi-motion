import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ImageLayer, KurogiProject, Layer } from "../types";
import { Icon } from "../ui/Icon";

export interface LayerContextMenuState {
  layerId: string;
  x: number;
  y: number;
}

interface LayerContextMenuProps {
  project: KurogiProject;
  state: LayerContextMenuState | null;
  onClose: () => void;
  onCreateClippingMask: (layerId: string) => void;
  onReleaseClippingMask: (layerId: string) => void;
  onDuplicate: (layerId: string) => void;
  onDelete: (layerId: string) => void;
  onBringForward: (layerId: string) => void;
  onSendBackward: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onSetImageFit: (layerId: string, fit: ImageLayer["fit"]) => void;
}

export function LayerContextMenu({
  project,
  state,
  onClose,
  onCreateClippingMask,
  onReleaseClippingMask,
  onDuplicate,
  onDelete,
  onBringForward,
  onSendBackward,
  onToggleVisibility,
  onToggleLock,
  onSetImageFit,
}: LayerContextMenuProps) {
  useEffect(() => {
    if (!state) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const close = () => onClose();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [onClose, state]);

  if (!state) return null;
  const layer = project.layers[state.layerId];
  if (!layer) return null;
  const scene = project.scenes[layer.sceneId];
  const index = scene?.layerIds.indexOf(layer.id) ?? -1;
  const sourceId = index > 0 ? scene?.layerIds[index - 1] : undefined;
  const sourceLayer = sourceId ? project.layers[sourceId] : undefined;
  const clipping = Boolean(layer.mask?.clipping);
  const canCreateClipping = Boolean(sourceLayer && !layer.parentId && !sourceLayer.parentId);
  const width = 264;
  const estimatedHeight = layer.type === "image" ? 424 : 330;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, state.x));
  const top = Math.max(8, Math.min(window.innerHeight - estimatedHeight - 8, state.y));

  const run = (callback: (layerId: string) => void) => {
    callback(layer.id);
    onClose();
  };

  return createPortal(
    <div
      className="layer-context-menu-layer"
      role="presentation"
      onMouseDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <section
        className="layer-context-menu"
        role="menu"
        aria-label={`Layer actions for ${layer.name}`}
        style={{ left, top }}
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <header>
          <span className={`layer-context-icon is-${layer.type}`}><Icon name={layerIcon(layer)} size={14} /></span>
          <span><strong>{layer.name}</strong><small>{layer.type}{clipping && layer.mask ? ` · clipped to ${project.layers[layer.mask.sourceLayerId]?.name ?? "layer below"}` : ""}</small></span>
        </header>

        <div className="layer-context-section">
          <button
            type="button"
            role="menuitem"
            disabled={!clipping && !canCreateClipping}
            title={!clipping && !canCreateClipping ? "A clipping mask needs a top-level layer directly below this layer." : undefined}
            onClick={() => clipping ? run(onReleaseClippingMask) : run(onCreateClippingMask)}
          >
            <Icon name="mask" size={15} />
            <span>{clipping ? "Release Clipping Mask" : "Create Clipping Mask"}</span>
            <kbd>{clipping ? "Release" : "Below"}</kbd>
          </button>
          {!clipping && sourceLayer ? <p className="layer-context-hint">Uses “{sourceLayer.name}” directly below as the alpha mask.</p> : null}
        </div>

        {layer.type === "image" ? (
          <div className="layer-context-section">
            <span className="layer-context-label">Image fitting</span>
            <button type="button" role="menuitem" onClick={() => { onSetImageFit(layer.id, "cover"); onClose(); }}><Icon name="frame" size={15} /><span>Crop to fill</span></button>
            <button type="button" role="menuitem" onClick={() => { onSetImageFit(layer.id, "contain"); onClose(); }}><Icon name="assets" size={15} /><span>Fit inside</span></button>
            <button type="button" role="menuitem" onClick={() => { onSetImageFit(layer.id, "fill"); onClose(); }}><Icon name="shapes" size={15} /><span>Stretch to frame</span></button>
          </div>
        ) : null}

        <div className="layer-context-section">
          <button type="button" role="menuitem" onClick={() => run(onDuplicate)}><Icon name="copy" size={15} /><span>Duplicate</span><kbd>Ctrl+D</kbd></button>
          <button type="button" role="menuitem" disabled={index < 0 || index >= (scene?.layerIds.length ?? 0) - 1} onClick={() => run(onBringForward)}><Icon name="chevronUp" size={15} /><span>Bring Forward</span></button>
          <button type="button" role="menuitem" disabled={index <= 0} onClick={() => run(onSendBackward)}><Icon name="chevronDown" size={15} /><span>Send Backward</span></button>
        </div>

        <div className="layer-context-section">
          <button type="button" role="menuitem" onClick={() => run(onToggleVisibility)}><Icon name={layer.visible ? "eyeOff" : "eye"} size={15} /><span>{layer.visible ? "Hide Layer" : "Show Layer"}</span></button>
          <button type="button" role="menuitem" onClick={() => run(onToggleLock)}><Icon name={layer.locked ? "unlock" : "lock"} size={15} /><span>{layer.locked ? "Unlock Layer" : "Lock Layer"}</span></button>
        </div>

        <div className="layer-context-section is-danger">
          <button type="button" role="menuitem" onClick={() => run(onDelete)}><Icon name="trash" size={15} /><span>Delete</span><kbd>Del</kbd></button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function layerIcon(layer: Layer) {
  if (layer.type === "text") return "text" as const;
  if (layer.type === "shape") return "shapes" as const;
  if (layer.type === "group") return "layers" as const;
  return "assets" as const;
}

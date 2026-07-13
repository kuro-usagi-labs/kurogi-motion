import React, { useMemo, useRef, useState } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import {
  evaluateLayer,
  evaluateTextUnit,
  getTextAnimationUnit,
  splitTextUnits,
} from "./core/evaluator";
import { getActiveScene, getSceneLayers } from "./core/project";
import { LayerEffects } from "./renderer/LayerEffects";
import type { KurogiProject, Layer, TextLayer } from "./types";

type TransformPatch = Partial<
  Pick<Layer, "position" | "size" | "rotation" | "scale" | "anchor">
>;

type Props = {
  project: KurogiProject;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onTransformCommit?: (id: string, patch: TransformPatch) => void;
  onTextCommit?: (id: string, text: string) => void;
  editable?: boolean;
  showSelection?: boolean;
  showSafeArea?: boolean;
};

type Gesture = {
  id: string;
  pointerId: number;
  mode: "move" | "resize" | "rotate";
  start: { x: number; y: number };
  initial: Layer;
  offset?: { x: number; y: number };
  center?: { x: number; y: number };
  startAngle?: number;
};

type TextEdit = {
  layerId: string;
  value: string;
  original: string;
};

export const MotionComposition: React.FC<Props> = ({
  project,
  selectedId,
  onSelect,
  onTransformCommit,
  onTextCommit,
  editable = false,
  showSelection = true,
  showSafeArea = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const scene = getActiveScene(project);
  const layers = getSceneLayers(project);
  const canvasRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [draftLayer, setDraftLayer] = useState<Layer | null>(null);
  const draftLayerRef = useRef<Layer | null>(null);
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);

  const renderedLayers = useMemo(
    () => layers.map((layer) => (draftLayer?.id === layer.id ? draftLayer : layer)),
    [draftLayer, layers],
  );

  function projectPoint(event: { clientX: number; clientY: number }) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * scene.width,
      y: ((event.clientY - rect.top) / rect.height) * scene.height,
    };
  }

  function startGesture(
    event: React.PointerEvent<HTMLElement>,
    layer: Layer,
    mode: Gesture["mode"],
  ) {
    if (!editable || layer.locked || textEdit) return;
    const point = projectPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(layer.id);
    event.currentTarget.setPointerCapture?.(event.pointerId);

    gestureRef.current = {
      id: layer.id,
      pointerId: event.pointerId,
      mode,
      start: point,
      initial: cloneLayer(layer),
      offset:
        mode === "move"
          ? { x: point.x - layer.position.x, y: point.y - layer.position.y }
          : undefined,
      center:
        mode === "rotate"
          ? {
              x: layer.position.x + layer.size.width / 2,
              y: layer.position.y + layer.size.height / 2,
            }
          : undefined,
      startAngle:
        mode === "rotate"
          ? Math.atan2(
              point.y - (layer.position.y + layer.size.height / 2),
              point.x - (layer.position.x + layer.size.width / 2),
            )
          : undefined,
    };
    const initialDraft = cloneLayer(layer);
    draftLayerRef.current = initialDraft;
    setDraftLayer(initialDraft);
  }

  function moveGesture(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = projectPoint(event);
    if (!point) return;

    const next = cloneLayer(gesture.initial);
    if (gesture.mode === "move") {
      next.position = {
        x: clamp(point.x - (gesture.offset?.x ?? 0), -next.size.width, scene.width),
        y: clamp(point.y - (gesture.offset?.y ?? 0), -next.size.height, scene.height),
      };
    } else if (gesture.mode === "resize") {
      next.size = {
        width: Math.max(24, gesture.initial.size.width + point.x - gesture.start.x),
        height: Math.max(24, gesture.initial.size.height + point.y - gesture.start.y),
      };
    } else {
      const center = gesture.center ?? { x: 0, y: 0 };
      const angle = Math.atan2(point.y - center.y, point.x - center.x);
      const delta = ((angle - (gesture.startAngle ?? 0)) * 180) / Math.PI;
      next.rotation = gesture.initial.rotation + delta;
    }
    draftLayerRef.current = next;
    setDraftLayer(next);
  }

  function finishGesture(event?: React.PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (event && gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    const finalLayer = draftLayerRef.current;
    draftLayerRef.current = null;
    setDraftLayer(null);
    if (!finalLayer || finalLayer.id !== gesture.id) return;
    onTransformCommit?.(finalLayer.id, {
      position: finalLayer.position,
      size: finalLayer.size,
      rotation: finalLayer.rotation,
      scale: finalLayer.scale,
      anchor: finalLayer.anchor,
    });
  }

  function beginTextEditing(event: React.MouseEvent, layer: TextLayer) {
    if (!editable || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(layer.id);
    setTextEdit({ layerId: layer.id, value: layer.text, original: layer.text });
  }

  function commitTextEdit() {
    if (!textEdit) return;
    if (textEdit.value !== textEdit.original) onTextCommit?.(textEdit.layerId, textEdit.value);
    setTextEdit(null);
  }

  return (
    <div
      ref={canvasRef}
      onPointerMove={moveGesture}
      onPointerUp={finishGesture}
      onPointerCancel={finishGesture}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelect?.("");
      }}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background:
          scene.background.type === "transparent"
            ? "transparent"
            : scene.background.color ?? "#ffffff",
      }}
    >
      {editable && scene.background.type === "transparent" ? <TransparencyGrid /> : null}
      {showSafeArea ? <SafeArea /> : null}
      {renderedLayers.map((layer) => {
        if (!layer.visible || layer.type === "group") return null;
        const visual = evaluateLayer(layer, scene, time);
        const selected = editable && showSelection && selectedId === layer.id;
        const isEditing = textEdit?.layerId === layer.id;
        const transformOrigin = `${layer.anchor.x * 100}% ${layer.anchor.y * 100}%`;
        const wrapperStyle: React.CSSProperties = {
          position: "absolute",
          left: `${(visual.x / scene.width) * 100}%`,
          top: `${(visual.y / scene.height) * 100}%`,
          width: `${(visual.width / scene.width) * 100}%`,
          height: `${(visual.height / scene.height) * 100}%`,
          opacity: visual.opacity,
          transform: `perspective(${scene.width * 1.4}px) rotate(${visual.rotation}deg) rotateX(${visual.rotateX}deg) rotateY(${visual.rotateY}deg) skew(${visual.skewX}deg, ${visual.skewY}deg) scale(${visual.scaleX}, ${visual.scaleY})`,
          transformOrigin,
          clipPath: visual.clipPath,
          cursor: editable && !layer.locked ? "move" : "default",
          outline: selected ? `${Math.max(1, scene.width / 540)}px solid #7c5cff` : "none",
          outlineOffset: selected ? Math.max(2, scene.width / 360) : 0,
          boxSizing: "border-box",
          userSelect: "none",
          transformStyle: "preserve-3d",
        };
        const animatedFilter = [
          visual.blur > 0 ? `blur(${visual.blur}px)` : "",
          visual.brightness !== 1 ? `brightness(${visual.brightness})` : "",
          visual.saturation !== 1 ? `saturate(${visual.saturation})` : "",
          visual.glow > 0
            ? `drop-shadow(0 0 ${visual.glow * .5}px rgba(139,92,246,.65)) drop-shadow(0 0 ${visual.glow}px rgba(98,212,173,.3))`
            : "",
        ].filter(Boolean).join(" ");

        return (
          <div
            key={layer.id}
            style={wrapperStyle}
            onPointerDown={
              editable && !isEditing
                ? (event) => startGesture(event, layer, "move")
                : undefined
            }
            onDoubleClick={
              layer.type === "text"
                ? (event) => beginTextEditing(event, layer)
                : undefined
            }
          >
            <LayerEffects layer={layer} time={time}>
              <div style={{ width: "100%", height: "100%", filter: animatedFilter || undefined }}>
                {layer.type === "text" ? (
                  isEditing && textEdit ? (
                    <textarea
                      autoFocus
                      value={textEdit.value}
                      spellCheck={false}
                      onChange={(event) =>
                        setTextEdit((current) =>
                          current ? { ...current, value: event.currentTarget.value } : current,
                        )
                      }
                      onBlur={commitTextEdit}
                      onPointerDown={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setTextEdit(null);
                        }
                        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                          event.preventDefault();
                          commitTextEdit();
                        }
                      }}
                      style={{
                        ...textStyle(layer),
                        width: "100%",
                        height: "100%",
                        margin: 0,
                        padding: 0,
                        border: 0,
                        outline: `${Math.max(1, scene.width / 540)}px solid #7c5cff`,
                        resize: "none",
                        overflow: "hidden",
                        background: "transparent",
                      }}
                    />
                  ) : (
                    <AnimatedText layer={layer} scene={scene} time={time} />
                  )
                ) : layer.type === "shape" ? (
                  <ShapeVisual layer={layer} />
                ) : (
                  <AssetVisual project={project} layer={layer} />
                )}
              </div>
            </LayerEffects>
            {selected && !isEditing && !layer.locked ? (
              <SelectionHandles
                sceneWidth={scene.width}
                onResize={(event) => startGesture(event, layer, "resize")}
                onRotate={(event) => startGesture(event, layer, "rotate")}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

function AnimatedText({ layer, scene, time }: { layer: TextLayer; scene: ReturnType<typeof getActiveScene>; time: number }) {
  const unit = getTextAnimationUnit(layer);
  const units = splitTextUnits(layer.text, unit);
  if (unit === "layer") {
    return <div style={{ ...textStyle(layer), width: "100%", height: "100%" }}>{layer.text}</div>;
  }

  return (
    <div style={{ ...textStyle(layer), width: "100%", height: "100%" }}>
      {units.map((part, index) => {
        if (part.text === "\n") return <br key={part.key} />;
        const visual = evaluateTextUnit(layer, scene, time, index, units.length);
        return (
          <span
            key={part.key}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              opacity: visual.opacity,
              transform: `perspective(${scene.width}px) translate(${visual.translateX}px, ${visual.translateY}px) rotate(${visual.rotation}deg) rotateX(${visual.rotateX}deg) rotateY(${visual.rotateY}deg) scale(${visual.scale})`,
              transformOrigin: "center",
              filter: visual.blur > 0 ? `blur(${visual.blur}px)` : undefined,
            }}
          >
            {part.text}
          </span>
        );
      })}
    </div>
  );
}

function textStyle(layer: TextLayer): React.CSSProperties {
  return {
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    fontFamily: `${layer.style.fontFamily}, Inter, Arial, sans-serif`,
    fontWeight: layer.style.fontWeight,
    fontSize: layer.style.fontSize,
    lineHeight: layer.style.lineHeight,
    letterSpacing: layer.style.letterSpacing,
    textAlign: layer.style.align,
    color: layer.style.color,
    WebkitTextFillColor: layer.style.color,
    boxSizing: "border-box",
  };
}

function ShapeVisual({ layer }: { layer: Extract<Layer, { type: "shape" }> }) {
  const base: React.CSSProperties = {
    width: "100%",
    height: "100%",
    background: layer.style.fill,
    border: layer.style.strokeWidth > 0
      ? `${layer.style.strokeWidth}px solid ${layer.style.stroke}`
      : undefined,
    borderRadius: layer.shape === "circle" ? "50%" : layer.style.borderRadius,
    boxShadow: layer.style.shadow > 0
      ? `0 ${layer.style.shadow * .5}px ${layer.style.shadow * 1.8}px rgba(18,14,35,.28)`
      : undefined,
    boxSizing: "border-box",
  };
  if (layer.shape === "polygon") base.clipPath = "polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)";
  if (layer.shape === "arrow") base.clipPath = "polygon(0 35%,66% 35%,66% 0,100% 50%,66% 100%,66% 65%,0 65%)";
  if (layer.shape === "line") base.borderRadius = 999;
  return <div style={base} />;
}

function AssetVisual({ project, layer }: { project: KurogiProject; layer: Extract<Layer, { type: "image" | "svg" }> }) {
  const asset = project.assets[layer.assetId];
  if (!asset?.sourceUrl) {
    return (
      <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "rgba(255,255,255,.72)", border: "2px dashed rgba(80,70,100,.35)", color: "#756f80", fontFamily: "Inter,sans-serif", fontSize: 20 }}>
        Missing asset
      </div>
    );
  }
  return (
    <img
      src={asset.sourceUrl}
      alt=""
      draggable={false}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: layer.type === "image" ? layer.fit : "contain",
        pointerEvents: "none",
      }}
    />
  );
}

function SelectionHandles({ sceneWidth, onResize, onRotate }: { sceneWidth: number; onResize: (event: React.PointerEvent<HTMLSpanElement>) => void; onRotate: (event: React.PointerEvent<HTMLSpanElement>) => void }) {
  const size = Math.max(12, sceneWidth / 72);
  const border = Math.max(2, sceneWidth / 540);
  return (
    <>
      <span aria-label="Rotate layer" onPointerDown={onRotate} style={{ position: "absolute", left: "50%", top: -size * 2.1, width: size, height: size, marginLeft: -size / 2, borderRadius: "50%", background: "#a78bfa", border: `${border}px solid white`, cursor: "grab", boxSizing: "border-box" }} />
      <span aria-label="Resize layer" onPointerDown={onResize} style={{ position: "absolute", right: -size / 2, bottom: -size / 2, width: size, height: size, borderRadius: Math.max(2, size / 5), background: "white", border: `${border}px solid #7c5cff`, cursor: "nwse-resize", boxSizing: "border-box" }} />
    </>
  );
}

function TransparencyGrid() {
  return <div style={{ position: "absolute", inset: 0, backgroundColor: "#ffffff", backgroundImage: "linear-gradient(45deg,#e7e5eb 25%,transparent 25%),linear-gradient(-45deg,#e7e5eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e7e5eb 75%),linear-gradient(-45deg,transparent 75%,#e7e5eb 75%)", backgroundPosition: "0 0,0 16px,16px -16px,-16px 0", backgroundSize: "32px 32px" }} />;
}

function SafeArea() {
  return <div style={{ position: "absolute", inset: "5%", border: "2px dashed rgba(124,92,255,.45)", pointerEvents: "none", zIndex: 9999 }} />;
}

function cloneLayer<T extends Layer>(layer: T): T {
  return JSON.parse(JSON.stringify(layer)) as T;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

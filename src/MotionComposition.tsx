import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Layer, Project } from "./types";

const animated = (layer: Layer, frame: number, fps: number) => {
  const t = frame / fps;
  const local = Math.max(0, t - layer.start);
  let opacity = layer.opacity;
  let y = layer.y;
  let scale = 1;
  if (layer.motion.includes("fadeUp")) {
    const p = spring({
      frame: Math.round(local * fps),
      fps,
      config: { damping: 15, stiffness: 130 },
    });
    opacity *= p;
    y += (1 - p) * 80;
  }
  if (layer.motion.includes("scaleIn")) {
    const p = spring({
      frame: Math.round(local * fps),
      fps,
      config: { damping: 12, stiffness: 130 },
    });
    opacity *= p;
    scale *= 0.75 + p * 0.25;
  }
  if (layer.motion.includes("float"))
    y += Math.sin((t - layer.start) * Math.PI * 1.4) * 18;
  if (layer.motion.includes("pulse"))
    scale *= 1 + Math.sin((t - layer.start) * Math.PI * 2) * 0.045;
  if (
    layer.motion.includes("fadeOut") &&
    t > layer.start + layer.duration - 0.5
  )
    opacity *= interpolate(
      t,
      [layer.start + layer.duration - 0.5, layer.start + layer.duration],
      [1, 0],
      { extrapolateRight: "clamp" },
    );
  return { opacity, y, scale };
};

type Props = {
  project: Project;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onTransform?: (
    id: string,
    patch: Partial<Pick<Layer, "width" | "height" | "rotation">>,
  ) => void;
  editable?: boolean;
};
type Drag = {
  id: string;
  mode: "move" | "resize" | "rotate";
  startX: number;
  startY: number;
  offsetX?: number;
  offsetY?: number;
  width?: number;
  height?: number;
  rotation?: number;
  centerX?: number;
  centerY?: number;
  startAngle?: number;
};

export const MotionComposition: React.FC<Props> = ({
  project,
  selectedId,
  onSelect,
  onMove,
  onTransform,
  editable,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const canvas = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<Drag | null>(null);
  const startDrag = (
    event: React.PointerEvent,
    layer: Layer,
    mode: Drag["mode"],
  ) => {
    event.stopPropagation();
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((event.clientX - rect.left) / rect.width) * project.width;
    const py = ((event.clientY - rect.top) / rect.height) * project.height;
    drag.current =
      mode === "move"
        ? {
            id: layer.id,
            mode,
            startX: px,
            startY: py,
            offsetX: px - layer.x,
            offsetY: py - layer.y,
          }
        : mode === "resize"
          ? {
              id: layer.id,
              mode,
              startX: px,
              startY: py,
              width: layer.width,
              height: layer.height,
            }
          : {
              id: layer.id,
              mode,
              startX: px,
              startY: py,
              rotation: layer.rotation,
              centerX: layer.x + layer.width / 2,
              centerY: layer.y + layer.height / 2,
              startAngle: Math.atan2(
                py - (layer.y + layer.height / 2),
                px - (layer.x + layer.width / 2),
              ),
            };
    onSelect?.(layer.id);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const move = (event: React.PointerEvent) => {
    if (!drag.current || !canvas.current) return;
    const rect = canvas.current.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * project.width;
    const py = ((event.clientY - rect.top) / rect.height) * project.height;
    const d = drag.current;
    if (d.mode === "move")
      onMove?.(
        d.id,
        Math.max(-300, Math.min(project.width, px - (d.offsetX || 0))),
        Math.max(-300, Math.min(project.height, py - (d.offsetY || 0))),
      );
    if (d.mode === "resize")
      onTransform?.(d.id, {
        width: Math.max(40, (d.width || 40) + px - d.startX),
        height: Math.max(30, (d.height || 30) + py - d.startY),
      });
    if (d.mode === "rotate") {
      const angle = Math.atan2(py - (d.centerY || 0), px - (d.centerX || 0));
      onTransform?.(d.id, {
        rotation:
          (d.rotation || 0) + ((angle - (d.startAngle || 0)) * 180) / Math.PI,
      });
    }
  };
  return (
    <div
      ref={canvas}
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: project.background,
      }}
    >
      {project.layers
        .filter((l) => !l.hidden)
        .map((layer) => {
          const a = animated(layer, frame, fps);
          const selected = selectedId === layer.id;
          const style: React.CSSProperties = {
            position: "absolute",
            left: `${(layer.x / project.width) * 100}%`,
            top: `${(a.y / project.height) * 100}%`,
            width: `${(layer.width / project.width) * 100}%`,
            height: `${(layer.height / project.height) * 100}%`,
            opacity: a.opacity,
            transform: `rotate(${layer.rotation}deg) scale(${a.scale})`,
            transformOrigin: "center",
            cursor: editable ? "move" : "default",
            outline: selected ? "3px solid #7c5cff" : "none",
            outlineOffset: 5,
          };
          return (
            <div
              key={layer.id}
              style={style}
              onPointerDown={
                editable ? (e) => startDrag(e, layer, "move") : undefined
              }
            >
              {layer.kind === "text" ? (
                <div
                  style={{
                    whiteSpace: "pre-line",
                    fontFamily: "Inter, Arial, sans-serif",
                    fontWeight: 800,
                    letterSpacing: "-.065em",
                    lineHeight: 0.86,
                    color: layer.color,
                    fontSize: `${layer.fontSize || 48}px`,
                  }}
                >
                  {layer.text}
                </div>
              ) : layer.kind === "image" && layer.src ? (
                <img
                  src={layer.src}
                  draggable={false}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    pointerEvents: "none",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    background: layer.color,
                    boxShadow: "0 25px 50px rgba(91,55,212,.27)",
                  }}
                />
              )}
              {editable && selected && (
                <>
                  <span
                    aria-label="Rotate layer"
                    onPointerDown={(e) => startDrag(e, layer, "rotate")}
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: -29,
                      width: 15,
                      height: 15,
                      marginLeft: -8,
                      borderRadius: "50%",
                      background: "#a78bfa",
                      border: "2px solid white",
                      cursor: "grab",
                    }}
                  />
                  <span
                    onPointerDown={(e) => startDrag(e, layer, "resize")}
                    style={{
                      position: "absolute",
                      right: -9,
                      bottom: -9,
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      background: "#fff",
                      border: "3px solid #7c5cff",
                      cursor: "nwse-resize",
                    }}
                  />
                </>
              )}
            </div>
          );
        })}
    </div>
  );
};

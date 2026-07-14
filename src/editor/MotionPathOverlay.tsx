import React, { useEffect, useRef, useState } from "react";
import type { AnimationAction, Layer, MotionPathDefinition, Scene } from "../types";

interface MotionPathOverlayProps {
  scene: Scene;
  layer: Layer;
  action: AnimationAction;
  onCommit?: (layerId: string, actionId: string, motionPath: MotionPathDefinition) => void;
}

type PointName = "start" | "control1" | "control2" | "end";

export function MotionPathOverlay({ scene, layer, action, onCommit }: MotionPathOverlayProps) {
  const initial = action.motionPath ?? defaultMotionPath();
  const [draft, setDraft] = useState(initial);
  const draftRef = useRef(initial);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number; point: PointName } | null>(null);

  useEffect(() => {
    const next = action.motionPath ?? defaultMotionPath();
    draftRef.current = next;
    setDraft(next);
  }, [action.id, action.motionPath]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      const svg = svgRef.current;
      if (!drag || !svg || drag.pointerId !== event.pointerId) return;
      const rect = svg.getBoundingClientRect();
      const world = {
        x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * scene.width,
        y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * scene.height,
      };
      const relative = {
        x: round(world.x - layer.position.x),
        y: round(world.y - layer.position.y),
      };
      const next = { ...draftRef.current, [drag.point]: relative };
      draftRef.current = next;
      setDraft(next);
    };
    const finish = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      onCommit?.(layer.id, action.id, draftRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [action.id, layer.id, layer.position.x, layer.position.y, onCommit, scene.height, scene.width]);

  function world(point: { x: number; y: number }) {
    return { x: layer.position.x + point.x, y: layer.position.y + point.y };
  }

  function begin(event: React.PointerEvent<SVGCircleElement>, point: PointName) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { pointerId: event.pointerId, point };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  const start = world(draft.start);
  const control1 = world(draft.control1);
  const control2 = world(draft.control2);
  const end = world(draft.end);
  const handleRadius = Math.max(8, scene.width / 100);

  return (
    <svg
      ref={svgRef}
      className="motion-path-overlay"
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      preserveAspectRatio="none"
      aria-label="Editable motion path"
    >
      <path d={`M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`} />
      <line x1={start.x} y1={start.y} x2={control1.x} y2={control1.y} />
      <line x1={end.x} y1={end.y} x2={control2.x} y2={control2.y} />
      <circle className="motion-path-anchor" cx={start.x} cy={start.y} r={handleRadius} onPointerDown={(event) => begin(event, "start")} />
      <circle className="motion-path-control" cx={control1.x} cy={control1.y} r={handleRadius * .82} onPointerDown={(event) => begin(event, "control1")} />
      <circle className="motion-path-control" cx={control2.x} cy={control2.y} r={handleRadius * .82} onPointerDown={(event) => begin(event, "control2")} />
      <circle className="motion-path-anchor" cx={end.x} cy={end.y} r={handleRadius} onPointerDown={(event) => begin(event, "end")} />
    </svg>
  );
}

export function defaultMotionPath(): MotionPathDefinition {
  return {
    enabled: true,
    start: { x: 0, y: 0 },
    control1: { x: 100, y: -120 },
    control2: { x: 220, y: 120 },
    end: { x: 320, y: 0 },
    orientToPath: false,
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

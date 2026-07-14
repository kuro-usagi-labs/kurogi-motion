import React, { useEffect, useRef, useState } from "react";
import type { CubicBezier } from "../types";

interface CubicBezierEditorProps {
  value: CubicBezier;
  onBegin: () => void;
  onPreview: (value: CubicBezier) => void;
  onFinish: () => void;
}

type HandleName = "one" | "two";

export function CubicBezierEditor({ value, onBegin, onPreview, onFinish }: CubicBezierEditorProps) {
  const [draft, setDraft] = useState(value);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number; handle: HandleName } | null>(null);

  useEffect(() => setDraft(value), [value.x1, value.y1, value.x2, value.y2]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      const svg = svgRef.current;
      if (!drag || !svg || drag.pointerId !== event.pointerId) return;
      const rect = svg.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const y = clamp(1 - (event.clientY - rect.top) / Math.max(1, rect.height), -1.5, 2.5);
      const next = drag.handle === "one"
        ? { ...draft, x1: round(x), y1: round(y) }
        : { ...draft, x2: round(x), y2: round(y) };
      setDraft(next);
      onPreview(next);
    };
    const finish = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      onFinish();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [draft, onFinish, onPreview]);

  function begin(event: React.PointerEvent<SVGCircleElement>, handle: HandleName) {
    event.preventDefault();
    event.stopPropagation();
    onBegin();
    dragRef.current = { pointerId: event.pointerId, handle };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function field(label: string, key: keyof CubicBezier, min: number, max: number) {
    return (
      <label>{label}
        <input
          type="number"
          min={min}
          max={max}
          step={.01}
          value={draft[key]}
          onFocus={onBegin}
          onChange={(event) => {
            const next = { ...draft, [key]: clamp(Number(event.currentTarget.value), min, max) };
            setDraft(next);
            onPreview(next);
          }}
          onBlur={onFinish}
        />
      </label>
    );
  }

  return (
    <div className="cubic-bezier-editor">
      <svg ref={svgRef} viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Cubic bezier curve editor">
        <path d="M0 100 L100 0" className="bezier-reference" />
        <path d={`M0 100 C${draft.x1 * 100} ${(1 - draft.y1) * 100} ${draft.x2 * 100} ${(1 - draft.y2) * 100} 100 0`} className="bezier-curve" />
        <line x1="0" y1="100" x2={draft.x1 * 100} y2={(1 - draft.y1) * 100} />
        <line x1="100" y1="0" x2={draft.x2 * 100} y2={(1 - draft.y2) * 100} />
        <circle cx={draft.x1 * 100} cy={(1 - draft.y1) * 100} r="4.5" onPointerDown={(event) => begin(event, "one")} />
        <circle cx={draft.x2 * 100} cy={(1 - draft.y2) * 100} r="4.5" onPointerDown={(event) => begin(event, "two")} />
      </svg>
      <div className="bezier-values">
        {field("X1", "x1", 0, 1)}
        {field("Y1", "y1", -1.5, 2.5)}
        {field("X2", "x2", 0, 1)}
        {field("Y2", "y2", -1.5, 2.5)}
      </div>
      <code>cubic-bezier({draft.x1}, {draft.y1}, {draft.x2}, {draft.y2})</code>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  const finite = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, finite));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

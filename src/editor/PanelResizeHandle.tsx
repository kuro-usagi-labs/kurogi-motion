import React, { useEffect, useRef } from "react";

interface PanelResizeHandleProps {
  edge: "sidebar" | "inspector";
  value: number;
  minimum: number;
  maximum: number;
  defaultValue: number;
  onChange: (value: number) => void;
}

interface ResizeGesture {
  pointerId: number;
  startX: number;
  startValue: number;
}

export function PanelResizeHandle({ edge, value, minimum, maximum, defaultValue, onChange }: PanelResizeHandleProps) {
  const gestureRef = useRef<ResizeGesture | null>(null);
  const configRef = useRef({ edge, minimum, maximum, onChange });
  configRef.current = { edge, minimum, maximum, onChange };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const config = configRef.current;
      const direction = config.edge === "sidebar" ? 1 : -1;
      config.onChange(clamp(gesture.startValue + (event.clientX - gesture.startX) * direction, config.minimum, config.maximum));
    };
    const finish = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      document.body.classList.remove("workspace-panel-resizing");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("workspace-panel-resizing");
    };
  }, []);

  const label = edge === "sidebar" ? "Resize layer panel" : "Resize inspector panel";

  return (
    <div
      className={`workspace-panel-resizer is-${edge}`}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title={`${label}. Double-click to reset.`}
      onDoubleClick={() => onChange(defaultValue)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startValue: value };
        document.body.classList.add("workspace-panel-resizing");
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 24 : 8;
        const growKey = edge === "sidebar" ? "ArrowRight" : "ArrowLeft";
        const shrinkKey = edge === "sidebar" ? "ArrowLeft" : "ArrowRight";
        if (event.key === growKey) {
          event.preventDefault();
          onChange(clamp(value + step, minimum, maximum));
        } else if (event.key === shrinkKey) {
          event.preventDefault();
          onChange(clamp(value - step, minimum, maximum));
        } else if (event.key === "Home") {
          event.preventDefault();
          onChange(minimum);
        } else if (event.key === "End") {
          event.preventDefault();
          onChange(maximum);
        }
      }}
    >
      <span aria-hidden="true" />
    </div>
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

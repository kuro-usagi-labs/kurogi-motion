import React from "react";
import { getShapeDefinition } from "../core/shapeLibrary";
import type { ShapeType } from "../types";

export function ShapeIcon({ shape, size = 28, className }: { shape: ShapeType; size?: number; className?: string }) {
  const definition = getShapeDefinition(shape);
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
      <path d={definition.path} fillRule={definition.fillRule ?? "nonzero"} />
    </svg>
  );
}

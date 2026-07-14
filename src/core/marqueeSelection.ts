import type { Layer } from "../types";

export interface SelectionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function selectionRect(start: { x: number; y: number }, end: { x: number; y: number }): SelectionRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}

export function selectionRectSize(rect: SelectionRect) {
  return { width: rect.right - rect.left, height: rect.bottom - rect.top };
}

export function selectionRectsIntersect(a: SelectionRect, b: SelectionRect) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export function layerSelectionRect(layer: Pick<Layer, "position" | "size" | "scale" | "anchor" | "rotation">): SelectionRect {
  const width = Math.abs(layer.size.width * layer.scale.x);
  const height = Math.abs(layer.size.height * layer.scale.y);
  const center = {
    x: layer.position.x + layer.size.width * layer.anchor.x + (0.5 - layer.anchor.x) * width,
    y: layer.position.y + layer.size.height * layer.anchor.y + (0.5 - layer.anchor.y) * height,
  };
  const radians = (layer.rotation * Math.PI) / 180;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const rotatedHalfWidth = Math.abs(Math.cos(radians)) * halfWidth + Math.abs(Math.sin(radians)) * halfHeight;
  const rotatedHalfHeight = Math.abs(Math.sin(radians)) * halfWidth + Math.abs(Math.cos(radians)) * halfHeight;
  return {
    left: center.x - rotatedHalfWidth,
    top: center.y - rotatedHalfHeight,
    right: center.x + rotatedHalfWidth,
    bottom: center.y + rotatedHalfHeight,
  };
}

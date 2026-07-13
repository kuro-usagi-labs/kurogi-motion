export interface CanvasPoint { x: number; y: number }

export function clampCanvasZoom(value: number, min = 20, max = 400) {
  const finite = Number.isFinite(value) ? value : 100;
  return Math.min(max, Math.max(min, finite));
}

export function normalizeWheelDelta(deltaY: number, deltaMode: number) {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * 800;
  return deltaY;
}

export function zoomFromWheel(currentZoom: number, deltaY: number) {
  const current = clampCanvasZoom(currentZoom);
  const next = current * Math.exp(-deltaY * 0.0015);
  return Math.round(clampCanvasZoom(next) * 10) / 10;
}

export function panForZoomAnchor(
  pan: CanvasPoint,
  pointerFromViewportCenter: CanvasPoint,
  currentZoom: number,
  nextZoom: number,
): CanvasPoint {
  const current = Math.max(0.0001, currentZoom);
  const ratio = nextZoom / current;
  return {
    x: pan.x + (pointerFromViewportCenter.x - pan.x) * (1 - ratio),
    y: pan.y + (pointerFromViewportCenter.y - pan.y) * (1 - ratio),
  };
}

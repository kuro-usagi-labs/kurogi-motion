export interface CanvasPoint {
  x: number;
  y: number;
}

const MIN_CANVAS_ZOOM = 20;
const MAX_CANVAS_ZOOM = 400;
const WHEEL_ZOOM_SENSITIVITY = 0.00115;

export function clampCanvasZoom(
  value: number,
  min = MIN_CANVAS_ZOOM,
  max = MAX_CANVAS_ZOOM,
) {
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
  const next = current * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY);
  return Math.round(clampCanvasZoom(next) * 10) / 10;
}

export function canvasPointUnderViewportPoint(
  pointerFromViewportCenter: CanvasPoint,
  pan: CanvasPoint,
  zoom: number,
): CanvasPoint {
  const scale = Math.max(0.0001, clampCanvasZoom(zoom) / 100);
  return {
    x: (pointerFromViewportCenter.x - pan.x) / scale,
    y: (pointerFromViewportCenter.y - pan.y) / scale,
  };
}

export function viewportPointForCanvasPoint(
  canvasPoint: CanvasPoint,
  pan: CanvasPoint,
  zoom: number,
): CanvasPoint {
  const scale = Math.max(0.0001, clampCanvasZoom(zoom) / 100);
  return {
    x: pan.x + canvasPoint.x * scale,
    y: pan.y + canvasPoint.y * scale,
  };
}

export function panForZoomAnchor(
  pan: CanvasPoint,
  pointerFromViewportCenter: CanvasPoint,
  currentZoom: number,
  nextZoom: number,
): CanvasPoint {
  const anchoredCanvasPoint = canvasPointUnderViewportPoint(
    pointerFromViewportCenter,
    pan,
    currentZoom,
  );
  const nextScale = Math.max(0.0001, clampCanvasZoom(nextZoom) / 100);

  return {
    x: pointerFromViewportCenter.x - anchoredCanvasPoint.x * nextScale,
    y: pointerFromViewportCenter.y - anchoredCanvasPoint.y * nextScale,
  };
}

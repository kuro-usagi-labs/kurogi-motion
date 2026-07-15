import type { SelectionRect } from "../core/marqueeSelection";

export interface TimelinePoint {
  x: number;
  y: number;
}

export interface TimelineRectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TimelineLayerRowRect {
  id: string;
  top: number;
  bottom: number;
}

export interface TimelineLayerDropTarget {
  targetId: string;
  edge: "before" | "after";
}

export const TIMELINE_DRAG_THRESHOLD = 4;

/**
 * Elements that own their pointer interaction. A pointer starting on any of
 * these must never be converted into a background marquee gesture.
 */
export const TIMELINE_MARQUEE_BLOCKER_SELECTOR = [
  ".timeline-action",
  ".timeline-layer-span",
  ".audio-clip-block",
  "button",
  "input",
  "select",
  "textarea",
  "a",
  "[role='button']",
  "[data-timeline-no-marquee]",
].join(",");

/** Convert a viewport pointer to coordinates local to the scrolling lanes. */
export function timelineLocalPoint(point: TimelinePoint, lanesRect: Pick<TimelineRectLike, "left" | "top">): TimelinePoint {
  return { x: point.x - lanesRect.left, y: point.y - lanesRect.top };
}

/** Convert an element viewport rect to the exact coordinate space used by the marquee. */
export function timelineLocalRect(rect: TimelineRectLike, lanesRect: Pick<TimelineRectLike, "left" | "top">): SelectionRect {
  return {
    left: rect.left - lanesRect.left,
    top: rect.top - lanesRect.top,
    right: rect.right - lanesRect.left,
    bottom: rect.bottom - lanesRect.top,
  };
}

export function timelineDragThresholdPassed(start: TimelinePoint, current: TimelinePoint, threshold = TIMELINE_DRAG_THRESHOLD) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

/**
 * Resolve the visual row a vertical reorder gesture has crossed. The source
 * remains stationary until the pointer crosses the midpoint to a neighbour,
 * preventing a tiny grip movement from unexpectedly changing z-order.
 */
export function timelineLayerDropTargetAtY(
  rows: TimelineLayerRowRect[],
  sourceId: string,
  clientY: number,
): TimelineLayerDropTarget | null {
  const ordered = rows
    .filter((row) => row.id && Number.isFinite(row.top) && Number.isFinite(row.bottom) && row.bottom >= row.top)
    .sort((left, right) => left.top - right.top);
  const sourceIndex = ordered.findIndex((row) => row.id === sourceId);
  if (sourceIndex < 0 || ordered.length < 2 || !Number.isFinite(clientY)) return null;

  let targetIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  ordered.forEach((row, index) => {
    const center = row.top + (row.bottom - row.top) / 2;
    const distance = Math.abs(clientY - center);
    if (distance < closestDistance) {
      closestDistance = distance;
      targetIndex = index;
    }
  });
  if (targetIndex === sourceIndex) return null;
  return {
    targetId: ordered[targetIndex].id,
    edge: sourceIndex < targetIndex ? "after" : "before",
  };
}

/** Return a signed scroll speed while a reorder pointer sits near an edge. */
export function timelineLayerReorderAutoScrollVelocity(
  clientY: number,
  viewportTop: number,
  viewportBottom: number,
  edgeSize = 54,
  maximumSpeed = 14,
) {
  if (!Number.isFinite(clientY) || viewportBottom <= viewportTop) return 0;
  const safeEdge = Math.max(1, Math.min(edgeSize, (viewportBottom - viewportTop) / 2));
  if (clientY < viewportTop + safeEdge) {
    const intensity = clampTimelineValue((viewportTop + safeEdge - clientY) / safeEdge, 0, 1);
    return -maximumSpeed * intensity;
  }
  if (clientY > viewportBottom - safeEdge) {
    const intensity = clampTimelineValue((clientY - (viewportBottom - safeEdge)) / safeEdge, 0, 1);
    return maximumSpeed * intensity;
  }
  return 0;
}

/** The same mapping used by seek and tests; laneWidth already includes zoom. */
export function timelineTimeAtClientX({
  clientX,
  viewportLeft,
  scrollLeft,
  labelWidth,
  laneWidth,
  duration,
}: {
  clientX: number;
  viewportLeft: number;
  scrollLeft: number;
  labelWidth: number;
  laneWidth: number;
  duration: number;
}) {
  const laneX = clientX - viewportLeft + scrollLeft - labelWidth;
  const ratio = Math.min(1, Math.max(0, laneX / Math.max(1, laneWidth)));
  return ratio * Math.max(0, duration);
}

/**
 * Return only ruler labels close to the visible viewport. At high zoom a long
 * project can contain thousands of logical ticks; mounting all of them would
 * make horizontal scrolling feel progressively slower.
 */
export function visibleTimelineRulerMarks({
  duration,
  laneWidth,
  scrollLeft,
  viewportWidth,
  labelWidth,
  targetPixelGap = 110,
  overscanPixels = 140,
  maximumMarks = 256,
}: {
  duration: number;
  laneWidth: number;
  scrollLeft: number;
  viewportWidth: number;
  labelWidth: number;
  targetPixelGap?: number;
  overscanPixels?: number;
  maximumMarks?: number;
}) {
  const safeDuration = Math.max(0, duration);
  const safeLaneWidth = Math.max(1, laneWidth);
  const step = niceTimelineRulerStep(safeDuration / Math.max(2, Math.floor(safeLaneWidth / Math.max(24, targetPixelGap))));
  const visibleStartPixels = clampTimelineValue(scrollLeft - labelWidth - overscanPixels, 0, safeLaneWidth);
  const visibleEndPixels = clampTimelineValue(scrollLeft + Math.max(0, viewportWidth) - labelWidth + overscanPixels, 0, safeLaneWidth);
  const visibleStart = (visibleStartPixels / safeLaneWidth) * safeDuration;
  const visibleEnd = (visibleEndPixels / safeLaneWidth) * safeDuration;
  const firstIndex = Math.max(0, Math.floor(visibleStart / step));
  const lastIndex = Math.min(Math.ceil(safeDuration / step), Math.ceil(visibleEnd / step));
  const marks: number[] = [];
  for (let index = firstIndex; index <= lastIndex && marks.length < Math.max(2, maximumMarks); index += 1) {
    const time = Number((index * step).toFixed(6));
    if (time <= safeDuration + .000001) marks.push(Math.min(safeDuration, time));
  }
  if (visibleStartPixels <= .5 && marks[0] !== 0) marks.unshift(0);
  if (visibleEndPixels >= safeLaneWidth - .5 && Math.abs((marks.at(-1) ?? -1) - safeDuration) > .001) marks.push(safeDuration);
  return [...new Set(marks)];
}

export function niceTimelineRulerStep(raw: number) {
  const safe = Math.max(1 / 60, raw);
  const power = 10 ** Math.floor(Math.log10(safe));
  const normalized = safe / power;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * power;
}

/**
 * Resolve the ids a pointer-down gesture owns. This mirrors Shift toggling,
 * while preserving an existing multi-selection when one member is dragged.
 */
export function timelinePointerSelection(currentIds: string[], targetIds: string[], additive: boolean) {
  const current = [...new Set(currentIds)];
  const targets = [...new Set(targetIds)].filter(Boolean);
  if (!targets.length) return additive ? current : [];
  if (additive) {
    const allSelected = targets.every((id) => current.includes(id));
    return allSelected ? current.filter((id) => !targets.includes(id)) : [...new Set([...current, ...targets])];
  }
  if (current.length > targets.length && targets.every((id) => current.includes(id))) return current;
  return targets;
}

export function timelineReleaseIntent(moved: boolean): "marquee" | "clear" {
  return moved ? "marquee" : "clear";
}

function clampTimelineValue(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

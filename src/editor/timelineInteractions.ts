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

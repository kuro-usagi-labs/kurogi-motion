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

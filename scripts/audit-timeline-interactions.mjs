import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { hmr: false, middlewareMode: true, watch: null },
});

try {
  const interactions = await server.ssrLoadModule("/src/editor/timelineInteractions.ts");
  const marquee = await server.ssrLoadModule("/src/core/marqueeSelection.ts");

  // Scrolling moves the lanes' viewport rect. Pointer and item rects must be
  // projected into that same local coordinate space (including ruler offset).
  const scrolledLanesRect = { left: -320, top: 37, right: 1668, bottom: 637 };
  assert.deepEqual(
    interactions.timelineLocalPoint({ x: 188, y: 93 }, scrolledLanesRect),
    { x: 508, y: 56 },
  );
  const itemRect = interactions.timelineLocalRect(
    { left: 160, top: 80, right: 260, bottom: 110 },
    scrolledLanesRect,
  );
  assert.deepEqual(itemRect, { left: 480, top: 43, right: 580, bottom: 73 });
  const dragArea = marquee.selectionRect({ x: 470, y: 40 }, { x: 530, y: 80 });
  assert.equal(marquee.selectionRectsIntersect(dragArea, itemRect), true);

  assert.equal(interactions.timelineDragThresholdPassed({ x: 10, y: 10 }, { x: 13, y: 12 }), false);
  assert.equal(interactions.timelineDragThresholdPassed({ x: 10, y: 10 }, { x: 14, y: 10 }), true);

  // laneWidth carries the current zoom, while scrollLeft anchors the pointer.
  const timeAtOneHundredPercent = interactions.timelineTimeAtClientX({
    clientX: 500,
    viewportLeft: 100,
    scrollLeft: 300,
    labelWidth: 188,
    laneWidth: 1200,
    duration: 12,
  });
  const timeAtTwoHundredPercent = interactions.timelineTimeAtClientX({
    clientX: 500,
    viewportLeft: 100,
    scrollLeft: 300,
    labelWidth: 188,
    laneWidth: 2400,
    duration: 12,
  });
  assert.equal(timeAtOneHundredPercent, 5.12);
  assert.equal(timeAtTwoHundredPercent, 2.56);

  // Shift toggles exactly once and a drag on an already selected member keeps
  // the existing multi-selection intact.
  assert.deepEqual(interactions.timelinePointerSelection(["a"], ["b"], true), ["a", "b"]);
  assert.deepEqual(interactions.timelinePointerSelection(["a", "b"], ["b"], true), ["a"]);
  assert.deepEqual(interactions.timelinePointerSelection(["a", "b"], ["b"], false), ["a", "b"]);
  assert.deepEqual(interactions.timelinePointerSelection(["a", "b"], ["c"], false), ["c"]);

  assert.equal(interactions.timelineReleaseIntent(false), "clear", "A blank click must clear selection, not start a marquee.");
  assert.equal(interactions.timelineReleaseIntent(true), "marquee");

  const source = await readFile(new URL("../src/editor/TimelineV3.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("closest(TIMELINE_MARQUEE_BLOCKER_SELECTOR)"), "Interactive rows and clips must not be swallowed by marquee pointer-down.");
  assert.ok(source.includes("onMarqueeSelect([], [], false);"), "Blank timeline click and Escape must clear layer/action selection.");
  assert.ok(source.includes('window.addEventListener("keydown", handleEscape)'), "Escape deselection must be registered.");
  assert.ok(source.includes("timelineLocalRect(element.getBoundingClientRect(), lanesRect)"), "Marquee hit testing must share the rendered local coordinate system.");
  assert.ok(source.includes("setPointerCaptureSafely"), "Timeline drags must capture their pointer.");
  assert.ok(source.includes("onPointerCancel={(event) => cancelTimelineMarquee(event.pointerId)}"), "Cancelled marquee gestures must be discarded.");
  assert.ok(!source.includes("onClick={(event) => { event.stopPropagation(); onSelectAction"), "Action selection must not toggle twice on pointer-down plus click.");
  assert.ok(!source.includes("Math.max(.6, (activePreview.duration / scene.duration)"), "Long projects must not inflate short actions with percentage-based minimum widths.");
  assert.ok(!source.includes("Math.max(.3, (timing.duration / scene.duration)"), "Long projects must not inflate short layer spans with percentage-based minimum widths.");

  console.log("Timeline interaction audit passed: scrolled/zoomed coordinates, drag thresholds, Shift selection, blank-click/Escape deselection, pointer capture, and cancellation are wired.");
} finally {
  await server.close();
}

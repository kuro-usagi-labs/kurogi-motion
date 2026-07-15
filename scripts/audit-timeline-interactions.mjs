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

  const layerRows = [
    { id: "front", top: 100, bottom: 144 },
    { id: "middle", top: 144, bottom: 188 },
    { id: "back", top: 188, bottom: 232 },
  ];
  assert.equal(interactions.timelineLayerDropTargetAtY(layerRows, "front", 120), null, "A small grip move must not reorder the source row.");
  assert.deepEqual(interactions.timelineLayerDropTargetAtY(layerRows, "front", 172), { targetId: "middle", edge: "after" });
  assert.deepEqual(interactions.timelineLayerDropTargetAtY(layerRows, "back", 122), { targetId: "front", edge: "before" });
  assert.ok(interactions.timelineLayerReorderAutoScrollVelocity(105, 100, 500) < 0, "Reordering near the top must autoscroll upward.");
  assert.equal(interactions.timelineLayerReorderAutoScrollVelocity(300, 100, 500), 0);
  assert.ok(interactions.timelineLayerReorderAutoScrollVelocity(495, 100, 500) > 0, "Reordering near the bottom must autoscroll downward.");

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

  // A 17-minute project at 8x zoom has more than ten thousand logical ruler
  // ticks. Only the visible labels plus overscan should reach the DOM.
  const longDuration = 17 * 60;
  const longLaneWidth = longDuration * 150 * 8;
  const visibleMarks = interactions.visibleTimelineRulerMarks({
    duration: longDuration,
    laneWidth: longLaneWidth,
    scrollLeft: longLaneWidth * .5,
    viewportWidth: 1560,
    labelWidth: 188,
  });
  assert.ok(visibleMarks.length > 2 && visibleMarks.length < 40, `Visible ruler virtualization mounted ${visibleMarks.length} labels.`);
  assert.ok(visibleMarks[0] > longDuration * .45 && visibleMarks.at(-1) < longDuration * .55, "Ruler labels must stay near the visible scroll range.");

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
  assert.ok(source.includes("onReorderLayer: (draggedLayerId: string, targetLayerId: string) => void"), "Timeline must expose a layer reorder commit callback.");
  assert.ok(source.includes('className="timeline-layer-reorder-grip"'), "Timeline labels must expose a visible reorder grip.");
  assert.ok(source.includes('aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"'), "Focused timeline rows need an accessible keyboard reorder alternative.");
  assert.ok(source.includes("timelineLayerDropTargetAtY(rows, active.layerId, clientY)"), "Layer reorder must resolve insertion targets from rendered visual rows.");
  assert.ok(source.includes('(project.layers[row.id]?.parentId ?? "") === draggedParentId'), "Timeline drag targets must stay within the layer's current group.");
  assert.ok(source.includes("const siblings = timelineLayers.filter"), "Keyboard reorder must move among sibling layers only.");
  assert.ok(source.includes("timelineLayerReorderAutoScrollVelocity"), "Layer reorder must autoscroll near viewport edges.");
  assert.ok(source.includes("event.shiftKey || event.ctrlKey || event.metaKey"), "Timeline selection must accept Shift, Ctrl, and Command additive intent.");
  assert.ok(source.includes("onPointerCancel={(event) => cleanupLayerReorder(event.pointerId)}"), "Cancelled layer reorder gestures must clean up pointer capture and indicators.");
  assert.ok(source.includes("onUpdateSceneDuration: (duration: number) => void"), "Timeline must expose a scene duration update callback.");
  assert.ok(source.includes('label="Duration"') && source.includes(">Fit</button>"), "Timeline header must expose an editable Duration field and Fit-to-content workflow.");
  assert.ok(source.includes("timelineContentEnd(project, scene.id)") && source.includes("timeline-content-end-marker"), "Timeline must show content end affordances.");
  const editorSource = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");
  assert.ok(editorSource.includes("updateAnimationActions(current, patches)") && editorSource.includes("extendSceneForAction(next, patch.layerId, patch.actionId)"), "Dragging animation blocks past the end must extend scene duration in the same commit.");
  assert.ok(editorSource.includes("startTime + duration > scene.duration") && editorSource.includes("return updateLayer(prepared, layerId"), "Dragging or trimming layer spans past the end must extend scene duration in the same commit.");
  assert.ok(editorSource.includes("requestedStart + requestedDuration > targetScene.duration"), "Dragging or trimming audio clips past the end must extend scene duration before audio normalization.");
  assert.ok(!source.includes("onClick={(event) => { event.stopPropagation(); onSelectAction"), "Action selection must not toggle twice on pointer-down plus click.");
  assert.ok(!source.includes("Math.max(.6, (activePreview.duration / scene.duration)"), "Long projects must not inflate short actions with percentage-based minimum widths.");
  assert.ok(!source.includes("Math.max(.3, (timing.duration / scene.duration)"), "Long projects must not inflate short layer spans with percentage-based minimum widths.");

  console.log("Timeline interaction audit passed: scrolled/zoomed coordinates, virtualized ruler labels, drag thresholds, modifier selection, row reorder insertion/autoscroll/keyboard controls, blank-click/Escape deselection, pointer capture, and cancellation are wired.");
} finally {
  await server.close();
}

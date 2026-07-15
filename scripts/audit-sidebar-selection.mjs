import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "vite";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const editorSource = read("src/app/Editor.tsx");
const menuSource = read("src/editor/LayerContextMenu.tsx");
const cssSource = read("src/releaseCandidate.css");
let vite;

try {
  vite = await createServer({
    appType: "custom",
    configFile: false,
    envFile: false,
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  const selection = await vite.ssrLoadModule("/src/core/sidebarSelection.ts");
  const visibleLayerIds = ["top", "upper", "middle", "bottom"];

  const regular = selection.resolveSidebarSelection({
    visibleLayerIds,
    selectedLayerIds: ["top", "middle"],
    clickedLayerId: "upper",
    anchorLayerId: "middle",
    toggle: false,
    range: false,
  });
  assert.deepEqual(regular, { selectedLayerIds: ["upper"], primaryLayerId: "upper", anchorLayerId: "upper" });

  const toggledOn = selection.resolveSidebarSelection({
    visibleLayerIds,
    selectedLayerIds: ["middle"],
    clickedLayerId: "top",
    anchorLayerId: "middle",
    toggle: true,
    range: false,
  });
  assert.deepEqual(toggledOn.selectedLayerIds, ["middle", "top"], "Ctrl/Cmd click must preserve the existing selection and toggle the clicked row on.");
  const toggledOff = selection.resolveSidebarSelection({
    visibleLayerIds,
    selectedLayerIds: toggledOn.selectedLayerIds,
    clickedLayerId: "middle",
    anchorLayerId: toggledOn.anchorLayerId,
    toggle: true,
    range: false,
  });
  assert.deepEqual(toggledOff.selectedLayerIds, ["top"], "Ctrl/Cmd click must toggle a selected row off.");

  const range = selection.resolveSidebarSelection({
    visibleLayerIds,
    selectedLayerIds: ["upper"],
    clickedLayerId: "bottom",
    anchorLayerId: "upper",
    toggle: false,
    range: true,
  });
  assert.deepEqual(range.selectedLayerIds, ["upper", "middle", "bottom"], "Shift click must select the contiguous visible range.");
  assert.equal(range.anchorLayerId, "upper", "Shift extensions must retain the original anchor.");

  const additiveRange = selection.resolveSidebarSelection({
    visibleLayerIds,
    selectedLayerIds: ["top"],
    clickedLayerId: "bottom",
    anchorLayerId: "middle",
    toggle: true,
    range: true,
    additiveRange: true,
  });
  assert.deepEqual(additiveRange.selectedLayerIds, ["top", "middle", "bottom"], "Ctrl/Cmd+Shift must add the range in visible order.");

  assert.deepEqual(
    selection.selectionAfterMarquee(visibleLayerIds, ["upper", "middle"], ["bottom"], false),
    ["upper", "middle"],
    "A fresh sidebar marquee must replace selection.",
  );
  assert.deepEqual(
    selection.selectionAfterMarquee(visibleLayerIds, ["upper", "middle"], ["bottom"], true),
    ["upper", "middle", "bottom"],
    "A modified sidebar marquee must add to its pointer-down baseline.",
  );

  assert.match(editorSource, /toggle: event\.ctrlKey \|\| event\.metaKey/, "Sidebar selection must recognize both Ctrl and Command.");
  assert.match(editorSource, /range: event\.shiftKey/, "Sidebar selection must route Shift to contiguous-range selection.");
  assert.match(editorSource, /onPointerDown=\{beginSidebarMarquee\}[\s\S]*layer-list-selection-marquee/, "The Layers panel must expose pointer marquee selection and its visible box.");
  assert.match(editorSource, /if \(selectedLayerIds\.includes\(layerId\)\)[\s\S]*setPrimaryLayerId\(layerId\)/, "Right click on an already-selected row must preserve the multi-selection.");
  assert.match(editorSource, /function selectOnly\(layerId: string\) \{[\s\S]*setSelectedAudioClipId\(""\);[\s\S]*setOnlyAction\(""\)/, "Canvas/layer selection must clear stale timeline action and audio ownership.");
  assert.match(editorSource, /if \(selectedActionIds\.length\) deleteActions[\s\S]*else if \(selectedAudioClipId\) deleteAudioClipById[\s\S]*else deleteSelectedLayer/, "Delete routing must respect focused action, audio, then canvas-layer selection.");
  assert.match(editorSource, /commitProject\(\(current\) => ids\.reduce\(\(next, id\) => removeLayer/, "Multi-layer deletion must be committed as one undoable project mutation.");
  assert.match(editorSource, /const sidebarPanelVisible = inspectorTab === "Design" && uiPreferences\.sidebarVisible/, "Animation mode must hide the sidebar without mutating the saved Design preference.");
  assert.match(menuSource, />Group Selection</, "The layer context menu must expose Group Selection.");
  assert.match(menuSource, />Ungroup</, "The layer context menu must expose Ungroup for a selected group.");
  assert.match(menuSource, /!candidate\.parentId && !candidate\.maskSource/, "Context grouping must reject nested and mask-source layers.");
  assert.match(cssSource, /\.workspace-mode-animation \{[\s\S]*--editor-sidebar-slot: 0px/, "Animation layout must reclaim the layer-sidebar slot.");
  assert.match(cssSource, /\.layer-list-selection-marquee \{/, "Sidebar marquee must have a professional visible selection treatment.");
  assert.match(cssSource, /\.layer-row\.is-group-child::before/, "Grouped children must be visibly nested in the Layers panel.");

  console.log("Sidebar selection audit passed: Ctrl/Cmd toggle, Shift ranges, drag marquee, selection ownership, atomic deletion, grouping context, hierarchy, and Animation sidebar policy verified.");
} finally {
  if (vite) await vite.close().catch(() => undefined);
}

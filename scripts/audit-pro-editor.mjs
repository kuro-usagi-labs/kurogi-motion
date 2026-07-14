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
  const projectCore = await server.ssrLoadModule("/src/core/project.ts");
  const audioCore = await server.ssrLoadModule("/src/core/audio.ts");
  const timeline = await server.ssrLoadModule("/src/core/timelineEditing.ts");
  const marquee = await server.ssrLoadModule("/src/core/marqueeSelection.ts");

  let project = projectCore.createProject({ name: "Pro editor audit", format: "landscape", duration: 10, fps: 30 });
  const scene = projectCore.getActiveScene(project);
  const first = projectCore.createTextLayer(scene, { text: "First" });
  const second = projectCore.createShapeLayer(scene, "rectangle");
  first.animationActions.push(projectCore.createAnimationAction(first.id, "in", "fadeIn", { duration: .6 }));
  project = projectCore.addLayers(project, [first, second]);

  const trimmedIn = timeline.trimTimelineSelection(project, [first.id, second.id], "", 2, "start");
  assert.equal(trimmedIn.changed, true);
  assert.equal(trimmedIn.project.layers[first.id].startTime, 2);
  assert.equal(trimmedIn.project.layers[first.id].duration, 8);
  assert.equal(project.layers[first.id].startTime, 0, "Trimming must not mutate the source project.");

  const trimmedOut = timeline.trimTimelineSelection(project, [first.id], "", 7, "end");
  assert.equal(trimmedOut.project.layers[first.id].duration, 7);

  const cut = timeline.cutTimelineSelection(project, [first.id, second.id], "", 4);
  assert.equal(cut.changed, true);
  assert.equal(cut.createdLayerIds.length, 2);
  assert.equal(cut.project.layers[first.id].duration, 4);
  const firstRight = cut.project.layers[cut.createdLayerIds[0]];
  assert.equal(firstRight.startTime, 4);
  assert.equal(firstRight.duration, 6);
  assert.notEqual(firstRight.animationActions[0].id, first.animationActions[0].id);
  assert.equal(firstRight.animationActions[0].layerId, firstRight.id);
  assert.ok(cut.project.scenes[scene.id].layerIds.indexOf(firstRight.id) > cut.project.scenes[scene.id].layerIds.indexOf(first.id));

  const invalidCut = timeline.cutTimelineSelection(project, [first.id], "", 0);
  assert.equal(invalidCut.changed, false);
  assert.equal(invalidCut.project, project);

  const audioAssetId = projectCore.createId("asset");
  project = projectCore.cloneProject(project);
  project.assets[audioAssetId] = {
    id: audioAssetId,
    projectId: project.id,
    name: "Voiceover",
    type: "audio",
    mimeType: "audio/wav",
    duration: 20,
    sourceUrl: "data:audio/wav;base64,AA==",
  };
  const audioCreated = audioCore.createAudioClip(project, scene.id, audioAssetId, { duration: 10 });
  project = audioCreated.project;
  const audioCut = timeline.cutTimelineSelection(project, [], audioCreated.clipId, 3);
  assert.equal(audioCut.createdAudioClipIds.length, 1);
  assert.equal(audioCut.project.audioClips[audioCreated.clipId].duration, 3);
  const audioRight = audioCut.project.audioClips[audioCut.createdAudioClipIds[0]];
  assert.equal(audioRight.startTime, 3);
  assert.equal(audioRight.trimStart, 3);
  assert.equal(audioRight.duration, 7);

  const rect = marquee.selectionRect({ x: 220, y: 160 }, { x: 80, y: 40 });
  assert.deepEqual(rect, { left: 80, top: 40, right: 220, bottom: 160 });
  const layerRect = marquee.layerSelectionRect({ position: { x: 100, y: 50 }, size: { width: 200, height: 100 }, scale: { x: 1, y: 1 }, anchor: { x: .5, y: .5 }, rotation: 90 });
  assert.deepEqual(roundRect(layerRect), { left: 150, top: 0, right: 250, bottom: 200 });
  assert.equal(marquee.selectionRectsIntersect(rect, layerRect), true);

  const editor = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");
  const motion = await readFile(new URL("../src/MotionComposition.tsx", import.meta.url), "utf8");
  const timelineSource = await readFile(new URL("../src/editor/TimelineV3.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/editorPro.css", import.meta.url), "utf8");
  assert.ok(editor.includes('event.code === "KeyQ"') && editor.includes('event.code === "KeyW"') && editor.includes('event.code === "KeyB"'), "Professional trim and cut shortcuts must be registered.");
  assert.ok(timelineSource.includes('addEventListener("wheel", handleWheel, { passive: false })'), "Timeline Ctrl/Cmd wheel zoom must use a non-passive listener.");
  assert.ok(timelineSource.includes("data-timeline-layer-span") && timelineSource.includes("timeline-selection-marquee"), "Timeline marquee selection hooks must exist.");
  assert.ok(motion.includes("beginCanvasMarquee") && motion.includes("onMarqueeSelect"), "Canvas marquee selection must be wired through the composition.");
  assert.match(css, /user-select:\s*none/);
  assert.match(css, /\[contenteditable="true"\][\s\S]*user-select:\s*text/);

  console.log("Pro editor audit passed: trim/cut operations, anchored timeline zoom, canvas/timeline marquee selection, and desktop text-selection behavior are wired.");
} finally {
  await server.close();
}

function roundRect(rect) {
  return Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, Math.round(value)]));
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const types = await readFile("src/types.ts", "utf8");
const composition = await readFile("src/MotionComposition.tsx", "utf8");
const timeline = await readFile("src/editor/TimelineV3.tsx", "utf8");
const audioTimeline = await readFile("src/editor/AudioTimeline.tsx", "utf8");
const editor = await readFile("src/app/Editor.tsx", "utf8");
const serverSource = await readFile("mcp/server.mjs", "utf8");
const main = await readFile("electron/main.cjs", "utf8");
const preload = await readFile("electron/preload.cjs", "utf8");

assert.match(types, /PROJECT_VERSION = 8/);
assert.match(types, /export interface AudioClip/);
assert.match(types, /audioClips: Record<string, AudioClip>/);
assert.match(types, /audioClipIds: string\[\]/);
assert.match(composition, /<AudioTracks project=\{project\}/);
assert.match(composition, /<Audio/);
assert.match(composition, /audioClipVolumeAt/);
assert.match(timeline, /AudioTimelineTracks/);
assert.match(audioTimeline, /trim-start/);
assert.match(audioTimeline, /playbackRate/);
assert.match(editor, /audio\/mpeg/);
assert.match(editor, /readAudioDuration/);
assert.match(editor, /readMcpMediaFile/);
assert.match(main, /read-mcp-media-file/);
assert.match(main, /outputPath/);
assert.match(preload, /readMcpMediaFile/);
assert.ok((serverSource.match(/bridgeTool\("kurogi_/g) ?? []).length >= 50, "MCP V4 should expose at least 50 focused tools.");
assert.match(serverSource, /kurogi_apply_edit_plan/);
assert.match(serverSource, /kurogi_import_asset/);
assert.match(serverSource, /kurogi_create_audio_clip/);
assert.match(serverSource, /outputPath/);

const vite = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { hmr: false, middlewareMode: true, watch: null },
});

try {
  const projectCore = await vite.ssrLoadModule("/src/core/project.ts");
  const audioCore = await vite.ssrLoadModule("/src/core/audio.ts");
  const mcp = await vite.ssrLoadModule("/src/core/mcpCommands.ts");

  let project = projectCore.createProject({ name: "Audio audit", format: "landscape", duration: 8, fps: 30 });
  const scene = projectCore.getActiveScene(project);
  const assetId = projectCore.createId("asset");
  project.assets[assetId] = {
    id: assetId,
    projectId: project.id,
    name: "Voice over",
    type: "audio",
    mimeType: "audio/mpeg",
    sourceUrl: "blob:audit",
    duration: 12,
  };

  const created = audioCore.createAudioClip(project, scene.id, assetId, {
    startTime: 1,
    trimStart: 2,
    duration: 4,
    volume: .8,
    fadeIn: .4,
    fadeOut: .5,
  });
  project = created.project;
  const clip = project.audioClips[created.clipId];
  assert.equal(scene.id, clip.sceneId);
  assert.equal(clip.trimStart, 2);
  assert.equal(project.scenes[scene.id].audioClipIds[0], clip.id);
  assert.equal(audioCore.audioClipVolumeAt(clip, 0), 0);
  assert.ok(audioCore.audioClipVolumeAt(clip, 1) > .7);

  project = audioCore.updateAudioClip(project, clip.id, { volume: 1.5, playbackRate: 1.25 });
  assert.equal(project.audioClips[clip.id].volume, 1.5);
  assert.equal(project.audioClips[clip.id].playbackRate, 1.25);

  const duplicated = audioCore.duplicateAudioClip(project, clip.id);
  project = duplicated.project;
  assert.notEqual(duplicated.clipId, clip.id);
  assert.equal(project.scenes[scene.id].audioClipIds.length, 2);

  const context = mcp.getMcpProjectContext(project, true);
  assert.equal(context.project.audioClipCount, 2);
  assert.equal(context.assets[0].type, "audio");
  assert.equal(context.document.assets[assetId].sourceUrl, "");

  const heading = mcp.executeMcpProjectCommand(project, "project.create_layer", {
    type: "text",
    text: "MCP EDITED",
    x: 120,
    y: 140,
  });
  project = heading.project;
  assert.ok(heading.selectedLayerId);

  const animated = mcp.executeMcpProjectCommand(project, "project.add_animation", {
    layerId: heading.selectedLayerId,
    category: "in",
    type: "moveIn",
    duration: .8,
    parameters: { direction: "up", distance: 80 },
  });
  project = animated.project;
  assert.equal(project.layers[heading.selectedLayerId].animationActions.length, 1);

  const plan = mcp.executeMcpProjectCommand(project, "project.apply_edit_plan", {
    operations: [
      { method: "project.update_layer", params: { layerId: heading.selectedLayerId, opacity: .7 } },
      { method: "project.update_audio_clip", params: { clipId: clip.id, fadeOut: 1 } },
      { method: "project.create_scene", params: { name: "Vertical", width: 1080, height: 1920, duration: 6 } },
    ],
  });
  assert.equal(plan.result.applied, 3);
  assert.equal(Object.keys(plan.project.scenes).length, 2);
  assert.equal(plan.project.layers[heading.selectedLayerId].opacity, .7);

  const removed = audioCore.removeAudioClip(plan.project, clip.id);
  assert.equal(removed.audioClips[clip.id], undefined);
  assert.ok(!removed.scenes[scene.id].audioClipIds.includes(clip.id));
} finally {
  await vite.close();
}

console.log("Audio media and MCP V4 audit passed.");

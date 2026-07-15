import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getVideoMetadata } from "@remotion/renderer";

const executable = process.env.KUROGI_MCP_COMMAND || path.join(process.env.LOCALAPPDATA || "", "Programs", "kurogi-motion", "Kurogi Motion.exe");
const serverEntry = process.env.KUROGI_MCP_SERVER_ENTRY || path.join(path.dirname(executable), "resources", "app", "mcp", "server.mjs");
const bridgeFile = process.env.KUROGI_MCP_BRIDGE_FILE || path.join(process.env.APPDATA || "", "kurogi-motion", "mcp-bridge.json");
const projectName = `MCP V4 Live Audit ${new Date().toISOString().replace(/[:.]/g, "-")}`;
const startedAt = Date.now();

await Promise.all([fs.access(executable), fs.access(serverEntry), fs.access(bridgeFile)]);
const transport = new StdioClientTransport({ command: executable, args: [serverEntry, `--bridge-file=${bridgeFile}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stderr: "inherit" });
const client = new Client({ name: "kurogi-v4-installed-live-audit", version: "4.0.0" }, { capabilities: {} });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const toolNames = new Set(listed.tools.map((tool) => tool.name));
  const requiredTools = [
    "kurogi_list_projects", "kurogi_list_templates", "kurogi_inspect_project", "kurogi_render_preview_frame", "kurogi_render_preview_strip", "kurogi_validate_project", "kurogi_preflight_export", "kurogi_start_render", "kurogi_get_render_progress", "kurogi_cancel_render", "kurogi_apply_workflow",
    "kurogi_group_layers", "kurogi_ungroup_layer", "kurogi_align_layers", "kurogi_distribute_layers", "kurogi_set_gradient", "kurogi_set_blend_mode",
    "kurogi_create_clipping_mask", "kurogi_release_clipping_mask", "kurogi_add_effect", "kurogi_set_layer_timing", "kurogi_update_layers", "kurogi_reorder_scene", "kurogi_set_scene_transition",
    "kurogi_search_assets", "kurogi_get_asset_metadata", "kurogi_replace_layer_asset", "kurogi_delete_unused_assets", "kurogi_undo", "kurogi_redo", "kurogi_create_checkpoint", "kurogi_list_checkpoints", "kurogi_restore_checkpoint",
  ];
  for (const name of requiredTools) assert.ok(toolNames.has(name), `Installed MCP is missing ${name}.`);

  const status = await call("kurogi_status", {});
  assert.equal(status.appRunning, true);
  assert.equal(status.windowReady, true);

  const created = await call("kurogi_create_project", { name: projectName, format: "custom", width: 480, height: 270, duration: 2, fps: 24, background: "#10131a" });
  assert.equal(created.created, true);
  const beforeCheckpoint = await call("kurogi_create_checkpoint", { name: "Before V4 workflow" });
  assert.ok(beforeCheckpoint.checkpoint?.id);

  const workflow = await call("kurogi_apply_workflow", { steps: [
    { method: "project.create_layer", assign: "card", params: { type: "shape", shape: "rectangle", name: "Gradient card", x: 30, y: 25, width: 420, height: 220, fill: "#5b3fd4", borderRadius: 28 } },
    { method: "project.set_gradient", params: { layerIds: [{ $ref: "card.layer.id" }], gradient: { type: "linear", startColor: "#382276", endColor: "#177e89", angle: 32 } } },
    { method: "project.set_blend_mode", params: { layerIds: [{ $ref: "card.layer.id" }], blendMode: "screen" } },
    { method: "project.add_effect", assign: "cardGlow", params: { layerId: { $ref: "card.layer.id" }, type: "glow", intensity: 38, radius: 22, color: "#66e3d1" } },
    { method: "project.create_layer", assign: "heading", params: { type: "text", name: "V4 heading", text: "MCP V4 AUTO", x: 55, y: 90, width: 370, height: 78, fontSize: 54, fontWeight: 800, color: "#ffffff", align: "center" } },
    { method: "project.update_layer", params: { layerId: { $ref: "heading.layer.id" }, lineHeight: 1.05, letterSpacing: 1.5, textStroke: "#151225", textStrokeWidth: 2, autoFit: true } },
    { method: "project.set_layer_timing", params: { layerId: { $ref: "heading.layer.id" }, startTime: .15, duration: 1.7 } },
    { method: "project.add_animation", params: { layerId: { $ref: "heading.layer.id" }, category: "in", type: "moveIn", duration: .55, easing: "backOut", parameters: { direction: "up", distance: 35 } } },
    { method: "project.create_layer", assign: "dot1", params: { type: "shape", shape: "circle", x: 145, y: 188, width: 22, height: 22, fill: "#ffffff" } },
    { method: "project.create_layer", assign: "dot2", params: { type: "shape", shape: "circle", x: 225, y: 198, width: 22, height: 22, fill: "#ffffff" } },
    { method: "project.create_layer", assign: "dot3", params: { type: "shape", shape: "circle", x: 315, y: 184, width: 22, height: 22, fill: "#ffffff" } },
    { method: "project.align_layers", params: { layerIds: [{ $ref: "dot1.layer.id" }, { $ref: "dot2.layer.id" }, { $ref: "dot3.layer.id" }], mode: "middle" } },
    { method: "project.distribute_layers", params: { layerIds: [{ $ref: "dot1.layer.id" }, { $ref: "dot2.layer.id" }, { $ref: "dot3.layer.id" }], mode: "horizontal" } },
    { method: "project.update_layers", params: { layerIds: [{ $ref: "dot1.layer.id" }, { $ref: "dot2.layer.id" }, { $ref: "dot3.layer.id" }], deltaY: 5 } },
    { method: "project.group_layers", assign: "dots", params: { layerIds: [{ $ref: "dot1.layer.id" }, { $ref: "dot2.layer.id" }, { $ref: "dot3.layer.id" }], name: "Dot group" } },
    { method: "project.ungroup_layer", params: { groupId: { $ref: "dots.group.id" } } },
    { method: "project.create_layer", assign: "maskSource", params: { type: "shape", shape: "circle", x: 15, y: 15, width: 42, height: 42, fill: "#ffffff" } },
    { method: "project.create_layer", assign: "maskTarget", params: { type: "shape", shape: "rectangle", x: 15, y: 15, width: 42, height: 42, fill: "#ff8a65" } },
    { method: "project.create_clipping_mask", params: { targetLayerId: { $ref: "maskTarget.layer.id" } } },
    { method: "project.release_clipping_mask", params: { targetLayerId: { $ref: "maskTarget.layer.id" } } },
    { method: "project.create_scene", assign: "outro", params: { name: "Outro", width: 480, height: 270, duration: 1, fps: 24, background: "#291c52" } },
    { method: "project.set_scene_transition", params: { sceneId: { $ref: "outro.scene.id" }, type: "fade", duration: .2 } },
    { method: "project.create_layer", params: { type: "text", sceneId: { $ref: "outro.scene.id" }, name: "Outro title", text: "RENDERED", x: 60, y: 100, width: 360, height: 70, fontSize: 48, fontWeight: 800, color: "#ffffff", align: "center" } },
  ] });
  assert.equal(workflow.applied, 23);
  assert.equal(workflow.rolledBackOnError, true);

  const contextAfterWorkflow = await call("kurogi_get_project_context", { includeDocument: false });
  assert.equal(contextAfterWorkflow.project.sceneCount, 2);
  assert.ok(contextAfterWorkflow.project.layerCount >= 8);

  await call("kurogi_undo", {});
  const contextAfterWorkflowUndo = await call("kurogi_get_project_context", { includeDocument: false });
  assert.equal(contextAfterWorkflowUndo.project.sceneCount, 1, "One undo did not revert the complete atomic workflow.");
  assert.equal(contextAfterWorkflowUndo.project.layerCount, 0, "Atomic workflow left layers behind after one undo.");
  await call("kurogi_redo", {});
  const contextAfterWorkflowRedo = await call("kurogi_get_project_context", { includeDocument: false });
  assert.equal(contextAfterWorkflowRedo.project.sceneCount, contextAfterWorkflow.project.sceneCount);
  assert.equal(contextAfterWorkflowRedo.project.layerCount, contextAfterWorkflow.project.layerCount);

  const rollbackBefore = await call("kurogi_get_project_context", { includeDocument: false });
  const failedWorkflow = await client.callTool({ name: "kurogi_apply_workflow", arguments: { steps: [
    { method: "project.create_layer", params: { type: "shape", shape: "rectangle", name: "Must roll back", x: 0, y: 0, width: 20, height: 20 } },
    { method: "project.update_layer", params: { layerId: "missing-layer", opacity: .5 } },
  ] } });
  assert.equal(failedWorkflow.isError, true, "A failing workflow unexpectedly reported success.");
  const rollbackAfter = await call("kurogi_get_project_context", { includeDocument: false });
  assert.equal(rollbackAfter.project.sceneCount, rollbackBefore.project.sceneCount);
  assert.equal(rollbackAfter.project.layerCount, rollbackBefore.project.layerCount, "A failing workflow changed the active project.");
  assert.deepEqual(
    rollbackAfter.scenes.map((scene) => scene.layers.map((layer) => layer.id)),
    rollbackBefore.scenes.map((scene) => scene.layers.map((layer) => layer.id)),
    "A failing workflow leaked partial layer changes.",
  );

  const mainSceneId = contextAfterWorkflow.scenes.find((scene) => scene.name === "Scene 01")?.id;
  assert.ok(mainSceneId);
  await call("kurogi_reorder_scene", { sceneId: mainSceneId, targetIndex: 0 });

  const validation = await call("kurogi_validate_project", {});
  assert.equal(typeof validation.valid, "boolean");
  assert.equal(validation.sceneCount, 2);
  assert.ok(Array.isArray(validation.issues));

  const previewResult = await client.callTool({ name: "kurogi_render_preview_frame", arguments: { time: .55, scale: .5 } }, undefined, { timeout: 5 * 60_000, maxTotalTimeout: 5 * 60_000 });
  assert.equal(previewResult.isError, undefined, textResult(previewResult));
  const preview = previewResult.structuredContent;
  const previewImage = previewResult.content?.find((item) => item.type === "image");
  assert.equal(preview?.mimeType, "image/png");
  assert.ok(path.isAbsolute(preview.path));
  assert.ok(previewImage?.data?.length > 1_000, "Preview tool did not return usable MCP image content.");
  assert.ok((await fs.stat(preview.path)).size > 1_000);

  const readyCheckpoint = await call("kurogi_create_checkpoint", { name: "Ready to render" });
  const headingId = contextAfterWorkflow.scenes.flatMap((scene) => scene.layers).find((layer) => layer.name === "V4 heading")?.id;
  assert.ok(headingId);
  await call("kurogi_update_layer", { layerId: headingId, opacity: .35 });
  await call("kurogi_restore_checkpoint", { checkpointId: readyCheckpoint.checkpoint.id });
  const restoredContext = await call("kurogi_get_project_context", { includeDocument: false });
  const restoredHeading = restoredContext.scenes.flatMap((scene) => scene.layers).find((layer) => layer.id === headingId);
  assert.equal(restoredHeading.opacity, 1, "Checkpoint restore did not recover fully opaque layer state.");
  const checkpoints = await call("kurogi_list_checkpoints", {});
  assert.ok(checkpoints.count >= 2);

  await call("kurogi_undo", {});
  await call("kurogi_redo", {});

  const importedOne = await call("kurogi_import_asset", { path: preview.path, addToTimeline: true });
  const importedTwo = await call("kurogi_import_asset", { path: preview.path, addToTimeline: true });
  assert.ok(importedOne.assetId && importedOne.layerId && importedTwo.assetId && importedTwo.layerId);
  const assetSearch = await call("kurogi_search_assets", { query: "preview", type: "image", limit: 20, offset: 0 });
  assert.ok(assetSearch.total >= 2);
  const metadata = await call("kurogi_get_asset_metadata", { assetId: importedOne.assetId });
  assert.equal(metadata.asset.mimeType, "image/png");
  assert.ok(metadata.asset.width > 0 && metadata.asset.height > 0);
  await call("kurogi_replace_layer_asset", { layerId: importedOne.layerId, assetId: importedTwo.assetId });
  await call("kurogi_delete_layer", { layerId: importedTwo.layerId });
  const cleanup = await call("kurogi_delete_unused_assets", {});
  assert.ok(cleanup.deleted >= 1);
  await call("kurogi_delete_layer", { layerId: importedOne.layerId });
  const finalCleanup = await call("kurogi_delete_unused_assets", {});
  assert.ok(finalCleanup.deleted >= 1);

  await call("kurogi_save_project", {});
  const startedRender = await call("kurogi_start_render", { format: "mp4", quality: "medium", fps: 24, scale: 1, allScenes: true, automatic: true });
  assert.ok(startedRender.id);
  const completedRender = await waitForRender(startedRender.id, 10 * 60_000);
  assert.equal(completedRender.status, "completed", completedRender.error || JSON.stringify(completedRender));
  assert.ok(path.isAbsolute(completedRender.outputPath));
  const outputStats = await fs.stat(completedRender.outputPath);
  assert.ok(outputStats.size > 10_000);
  const video = await getVideoMetadata(completedRender.outputPath, { logLevel: "error" });
  assert.equal(video.width, 480);
  assert.equal(video.height, 270);
  assert.ok(video.durationInSeconds >= 2.7 && video.durationInSeconds <= 2.95, `Unexpected multi-scene duration: ${video.durationInSeconds}`);

  await new Promise((resolve) => setTimeout(resolve, 500));
  await call("kurogi_update_scene", { duration: 30 });
  const cancelCandidate = await call("kurogi_start_render", { format: "mp4", quality: "high", fps: 60, scale: 1, allScenes: true, automatic: true });
  const cancelResponse = await call("kurogi_cancel_render", { jobId: cancelCandidate.id });
  assert.ok(["canceling", "canceled"].includes(cancelResponse.status));
  const canceledRender = await waitForRender(cancelCandidate.id, 2 * 60_000);
  assert.equal(canceledRender.status, "canceled", `Render cancellation ended as ${canceledRender.status}: ${canceledRender.error || ""}`);

  console.log(JSON.stringify({
    passed: true,
    serverVersion: 4,
    tools: listed.tools.length,
    projectId: created.projectId,
    projectName,
    workflowSteps: workflow.applied,
    atomicWorkflow: { undoRedo: true, rollbackOnFailure: true },
    validation: { valid: validation.valid, errors: validation.errors, warnings: validation.warnings, infos: validation.infos },
    preview: { path: preview.path, width: preview.width, height: preview.height, bytes: (await fs.stat(preview.path)).size },
    checkpoints: checkpoints.count,
    assetsFound: assetSearch.total,
    cleanedAssets: cleanup.deleted + finalCleanup.deleted,
    render: { jobId: completedRender.id, path: completedRender.outputPath, bytes: outputStats.size, width: video.width, height: video.height, durationSeconds: video.durationInSeconds },
    cancellation: { jobId: canceledRender.id, status: canceledRender.status },
    elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
  }, null, 2));
} finally {
  await client.close().catch(() => undefined);
}

async function call(name, argumentsValue, timeout = 120_000) {
  const response = await client.callTool({ name, arguments: argumentsValue }, undefined, { timeout, maxTotalTimeout: timeout });
  assert.equal(response.isError, undefined, `${name}: ${textResult(response)}`);
  return response.structuredContent;
}

async function waitForRender(jobId, timeout) {
  const deadline = Date.now() + timeout;
  let latest;
  while (Date.now() < deadline) {
    latest = await call("kurogi_get_render_progress", { jobId });
    if (["completed", "failed", "canceled"].includes(latest.status)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Render job ${jobId} did not finish within ${timeout}ms. Last state: ${JSON.stringify(latest)}`);
}

function textResult(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "MCP tool failed without text content.";
}

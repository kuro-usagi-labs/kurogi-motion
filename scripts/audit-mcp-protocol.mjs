import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const token = "audit-token-0123456789";
const requests = [];
const previewPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAF/gL+3j8pGQAAAABJRU5ErkJggg==", "base64");
let previewSequence = 0;
let validationBlocked = false;
let activeProject = { id: "project-audit", name: "Protocol audit", activeSceneId: "scene-audit", audioClipCount: 1 };

const bridge = http.createServer(async (request, response) => {
  try {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/rpc");
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    requests.push(payload);

    let result;
    if (payload.method === "bridge.status") {
      result = { appRunning: true, windowReady: true, pid: process.pid };
    } else if (payload.method === "library.list_projects") {
      result = { projects: [
        { id: activeProject.id, name: activeProject.name, createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-15T10:00:00.000Z", width: 1920, height: 1080, duration: 4, background: "#10131a" },
        { id: "project-alpha", name: "Alpha Launch", createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z", width: 1080, height: 1080, duration: 6, background: "#ffffff" },
        { id: "project-campaign", name: "Campaign Archive", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z", width: 1080, height: 1920, duration: 12, background: "#201744" },
      ] };
    } else if (payload.method === "library.create_project") {
      activeProject = { id: "project-auto", name: payload.params.name, activeSceneId: "scene-auto", audioClipCount: 0 };
      result = { created: true, projectId: activeProject.id, activeSceneId: activeProject.activeSceneId, name: activeProject.name, templateId: payload.params.templateId };
    } else if (payload.method === "library.open_project") {
      activeProject = { id: payload.params.projectId, name: "Opened project", activeSceneId: "scene-opened", audioClipCount: 0 };
      result = { opened: true, projectId: activeProject.id, activeSceneId: activeProject.activeSceneId, name: activeProject.name };
    } else if (payload.method === "project.get_context") {
      result = {
        project: activeProject,
        scenes: [{
          id: activeProject.activeSceneId,
          name: "Scene 01",
          width: 1920,
          height: 1080,
          duration: 4,
          fps: 30,
          background: { type: "solid", color: "#10131a" },
          active: true,
          layers: [
            { id: "layer-title", sceneId: activeProject.activeSceneId, name: "Hero title", type: "text", text: "AUTONOMOUS LAUNCH", visible: true, animationActions: [{ id: "action-title", type: "moveIn" }] },
            { id: "layer-card", sceneId: activeProject.activeSceneId, name: "Backdrop card", type: "shape", shape: "rectangle", visible: true, animationActions: [] },
          ],
          audioClips: activeProject.audioClipCount ? [{ id: "audio-audit", name: "Voice over" }] : [],
        }],
        assets: activeProject.audioClipCount ? [{ id: "asset-audio", name: "Voice over", type: "audio", duration: 4 }] : [],
      };
    } else if (payload.method === "project.validate") {
      result = {
        valid: !validationBlocked,
        errors: validationBlocked ? 1 : 0,
        warnings: validationBlocked ? 0 : 1,
        infos: 0,
        sceneCount: 1,
        layerCount: 2,
        issues: validationBlocked
          ? [{ severity: "error", code: "ASSET_SOURCE_MISSING", message: "A project asset has no readable source.", sceneId: activeProject.activeSceneId, assetId: "asset-missing", suggestion: "Re-import the missing asset." }]
          : [{ severity: "warning", code: "FONT_UNVERIFIED", message: "A project font is not embedded.", sceneId: activeProject.activeSceneId, layerId: "layer-title", suggestion: "Embed the font before final delivery." }],
      };
    } else if (payload.method === "project.preview_frame") {
      const previewPath = path.join(directory, `preview-${++previewSequence}.png`);
      await fs.writeFile(previewPath, previewPng);
      result = { path: previewPath, mimeType: "image/png", width: 1920, height: 1080, time: payload.params.time, scale: payload.params.scale };
    } else if (payload.method === "project.apply_edit_plan") {
      result = { applied: payload.params.operations.length, operations: payload.params.operations };
    } else if (payload.method === "project.apply_workflow") {
      assert.equal(payload.params.steps[1].params.layerId.$ref, "heading.layer.id", "Atomic workflow references must reach the Editor for transactional resolution.");
      result = {
        applied: payload.params.steps.length,
        rolledBackOnError: true,
        steps: [
          { index: 0, method: "project.create_layer", assign: "heading", result: { created: true, layer: { id: "layer-auto", type: "text" } } },
          { index: 1, method: "project.add_animation", assign: "headingIn", result: { created: true, action: { id: "action-auto", layerId: "layer-auto" } } },
        ],
        aliases: { project: activeProject, heading: { layer: { id: "layer-auto" } }, headingIn: { action: { id: "action-auto" } } },
      };
    } else if (payload.method === "project.create_layer") {
      result = { created: true, layer: { id: "layer-auto", type: payload.params.type, text: payload.params.text } };
    } else if (payload.method === "project.add_animation") {
      assert.equal(payload.params.layerId, "layer-auto", "Workflow $ref must resolve the assigned layer ID.");
      result = { created: true, action: { id: "action-auto", layerId: payload.params.layerId, type: payload.params.type } };
    } else if (payload.method === "project.save") {
      result = { saved: true, projectId: activeProject.id };
    } else if (payload.method === "project.export") {
      result = { exported: true, path: payload.params.outputPath ?? path.join("Videos", "Kurogi Motion", "protocol-audit.mp4") };
    } else {
      throw new Error(`Unexpected bridge method: ${payload.method}`);
    }

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, result }));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  }
});

await new Promise((resolve, reject) => {
  bridge.once("error", reject);
  bridge.listen(0, "127.0.0.1", () => {
    bridge.off("error", reject);
    resolve();
  });
});

const address = bridge.address();
assert.ok(address && typeof address !== "string");
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "kurogi-mcp-audit-"));
const bridgeFile = path.join(directory, "mcp-bridge.json");
await fs.writeFile(bridgeFile, JSON.stringify({
  version: 1,
  host: "127.0.0.1",
  port: address.port,
  token,
  pid: process.pid,
}), "utf8");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve("mcp/server.mjs"), `--bridge-file=${bridgeFile}`],
  stderr: "pipe",
});
const client = new Client({ name: "kurogi-mcp-audit", version: "4.0.0" }, { capabilities: {} });

try {
  await client.connect(transport);

  const tools = await client.listTools();
  assert.ok(tools.tools.length >= 62);
  for (const name of [
    "kurogi_status",
    "kurogi_list_projects",
    "kurogi_list_templates",
    "kurogi_inspect_project",
    "kurogi_create_project",
    "kurogi_open_project",
    "kurogi_create_layer",
    "kurogi_add_animation",
    "kurogi_import_asset",
    "kurogi_create_audio_clip",
    "kurogi_apply_edit_plan",
    "kurogi_apply_workflow",
    "kurogi_render_preview_frame",
    "kurogi_render_preview_strip",
    "kurogi_validate_project",
    "kurogi_preflight_export",
    "kurogi_start_render",
    "kurogi_get_render_progress",
    "kurogi_cancel_render",
    "kurogi_export_active_project",
    "kurogi_create_video",
  ]) assert.ok(tools.tools.some((tool) => tool.name === name), `Missing MCP tool ${name}`);

  for (const tool of tools.tools) {
    for (const annotation of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) {
      assert.equal(typeof tool.annotations?.[annotation], "boolean", `${tool.name} is missing ${annotation}`);
    }
  }
  const autonomousTool = tools.tools.find((tool) => tool.name === "kurogi_create_video");
  assert.equal(autonomousTool.annotations.destructiveHint, false);
  assert.equal(autonomousTool.annotations.readOnlyHint, false);

  const status = await client.callTool({ name: "kurogi_status", arguments: {} });
  assert.equal(status.isError, undefined);
  assert.equal(status.structuredContent.appRunning, true);

  const projectIndex = await client.callTool({
    name: "kurogi_list_projects",
    arguments: { sortBy: "name", order: "asc", limit: 1, offset: 0 },
  });
  assert.equal(projectIndex.isError, undefined);
  assert.equal(projectIndex.structuredContent.total, 3);
  assert.equal(projectIndex.structuredContent.count, 1);
  assert.equal(projectIndex.structuredContent.projects[0].name, "Alpha Launch");
  assert.equal(projectIndex.structuredContent.hasMore, true);
  assert.equal(projectIndex.structuredContent.nextOffset, 1);

  const templates = await client.callTool({ name: "kurogi_list_templates", arguments: { query: "podcast" } });
  assert.equal(templates.isError, undefined);
  assert.equal(templates.structuredContent.total, 1);
  assert.equal(templates.structuredContent.templates[0].id, "podcast-cover");

  const inspection = await client.callTool({
    name: "kurogi_inspect_project",
    arguments: { query: "hero", layerTypes: ["text"], includeValidation: true, includeAssets: false, limit: 5 },
  });
  assert.equal(inspection.isError, undefined);
  assert.equal(inspection.structuredContent.count, 1);
  assert.equal(inspection.structuredContent.layers[0].id, "layer-title");
  assert.equal(inspection.structuredContent.validation.warnings, 1);

  const previewStrip = await client.callTool({
    name: "kurogi_render_preview_strip",
    arguments: { count: 3, scale: .2 },
  });
  assert.equal(previewStrip.isError, undefined);
  assert.equal(previewStrip.structuredContent.complete, true);
  assert.equal(previewStrip.structuredContent.frames.length, 3);
  assert.equal(previewStrip.content.filter((item) => item.type === "image").length, 3);
  assert.deepEqual(previewStrip.structuredContent.frames.map((frame) => frame.time), [.4, 2, 3.6]);

  const preflight = await client.callTool({
    name: "kurogi_preflight_export",
    arguments: { format: "mov", transparent: true, allScenes: true, includePreview: true, previewScale: .2 },
  });
  assert.equal(preflight.isError, undefined);
  assert.equal(preflight.structuredContent.ready, true);
  assert.equal(preflight.structuredContent.status, "review");
  assert.equal(preflight.structuredContent.export.alphaChannelExpected, true);
  assert.match(preflight.structuredContent.export.outputVerification, /ProRes 4444/);
  assert.equal(preflight.content.filter((item) => item.type === "image").length, 1);

  const blockedPreflight = await client.callTool({
    name: "kurogi_preflight_export",
    arguments: { format: "mp4", transparent: true, includePreview: false },
  });
  assert.equal(blockedPreflight.isError, undefined);
  assert.equal(blockedPreflight.structuredContent.ready, false);
  assert.equal(blockedPreflight.structuredContent.status, "blocked");
  assert.equal(blockedPreflight.structuredContent.blockingIssues[0].code, "ALPHA_FORMAT_UNSUPPORTED");

  validationBlocked = true;
  const validationPreflight = await client.callTool({
    name: "kurogi_preflight_export",
    arguments: { format: "mp4", transparent: false, includePreview: false },
  });
  validationBlocked = false;
  assert.equal(validationPreflight.isError, undefined);
  assert.equal(validationPreflight.structuredContent.ready, false);
  assert.equal(validationPreflight.structuredContent.status, "blocked");
  assert.deepEqual(validationPreflight.structuredContent.blockingIssues[0], {
    severity: "error",
    code: "ASSET_SOURCE_MISSING",
    message: "A project asset has no readable source.",
    sceneId: activeProject.activeSceneId,
    assetId: "asset-missing",
    suggestion: "Re-import the missing asset.",
  });

  const plan = await client.callTool({
    name: "kurogi_apply_edit_plan",
    arguments: {
      operations: [
        { method: "project.create_layer", params: { type: "text", text: "AI EDIT" } },
        { method: "project.add_animation", params: { layerId: "layer-audit", category: "in", type: "fadeIn" } },
      ],
    },
  });
  assert.equal(plan.isError, undefined);
  assert.equal(plan.structuredContent.applied, 2);

  const exported = await client.callTool({
    name: "kurogi_export_active_project",
    arguments: { format: "mp4", outputPath: path.join(directory, "result.mp4") },
  });
  assert.equal(exported.isError, undefined);
  assert.match(exported.structuredContent.path, /result\.mp4/);

  const autonomous = await client.callTool({
    name: "kurogi_create_video",
    arguments: {
      project: { name: "Autonomous protocol audit", format: "landscape", duration: 4, fps: 30, templateId: "button-micro" },
      steps: [
        { method: "project.create_layer", assign: "heading", params: { type: "text", text: "FULL AUTO" } },
        { method: "project.add_animation", assign: "headingIn", params: { layerId: { $ref: "heading.layer.id" }, category: "in", type: "moveIn" } },
      ],
      export: { format: "mp4", quality: "high", fps: 30, scale: 1 },
    },
  });
  assert.equal(autonomous.isError, undefined);
  assert.equal(autonomous.structuredContent.created, true);
  assert.equal(autonomous.structuredContent.project.id, "project-auto");
  assert.equal(autonomous.structuredContent.steps.length, 2);
  assert.equal(autonomous.structuredContent.saved.saved, true);
  assert.match(autonomous.structuredContent.export.path, /protocol-audit\.mp4/);

  const automaticExportRequest = requests.findLast((request) => request.method === "project.export");
  assert.equal(automaticExportRequest.params.automatic, true, "The one-call workflow must bypass destination dialogs.");

  const resources = await client.listResources();
  assert.deepEqual(resources.resources.map((resource) => resource.uri).sort(), [
    "kurogi://active-project",
    "kurogi://active-project/validation",
    "kurogi://capabilities",
    "kurogi://projects",
    "kurogi://templates",
  ]);

  const active = await client.readResource({ uri: "kurogi://active-project" });
  assert.equal(active.contents[0].mimeType, "application/json");
  assert.match(active.contents[0].text, /Autonomous protocol audit/);

  const projects = await client.readResource({ uri: "kurogi://projects" });
  assert.match(projects.contents[0].text, /project-auto/);

  const templateCatalog = await client.readResource({ uri: "kurogi://templates" });
  assert.match(templateCatalog.contents[0].text, /podcast-cover/);
  assert.match(templateCatalog.contents[0].text, /After Hours podcast/);

  const projectValidation = await client.readResource({ uri: "kurogi://active-project/validation" });
  assert.match(projectValidation.contents[0].text, /FONT_UNVERIFIED/);

  const capabilities = await client.readResource({ uri: "kurogi://capabilities" });
  assert.match(capabilities.contents[0].text, /single-call create-save-render/);
  assert.match(capabilities.contents[0].text, /no in-app confirmation/);
  assert.match(capabilities.contents[0].text, /verified ProRes 4444 alpha/);

  assert.ok(requests.some((request) => request.method === "bridge.status"));
  assert.ok(requests.some((request) => request.method === "library.create_project"));
  assert.ok(requests.some((request) => request.method === "project.apply_edit_plan"));
  assert.ok(requests.some((request) => request.method === "project.validate"));
  assert.ok(requests.some((request) => request.method === "project.preview_frame"));
  assert.ok(requests.some((request) => request.method === "project.save"));
  assert.ok(requests.some((request) => request.method === "project.export"));
} finally {
  await client.close().catch(() => undefined);
  await new Promise((resolve) => bridge.close(() => resolve()));
  await fs.rm(directory, { recursive: true, force: true });
}

console.log("MCP V4 autonomous protocol audit passed.");

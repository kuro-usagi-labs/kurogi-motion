import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "vite";

const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => { if (!condition) throw new Error(message); };

const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");
const bridge = read("electron/mcpBridge.cjs");
const serverSource = read("mcp/server.mjs");
const commandsSource = read("src/core/mcpCommands.ts");
const editor = read("src/app/Editor.tsx");
const app = read("src/App.tsx");
const menu = read("src/editor/EditorMenuBar.tsx");
const dialog = read("src/editor/McpIntegrationDialog.tsx");
const types = read("src/vite-env.d.ts");
const packageJson = JSON.parse(read("package.json"));

expect(main.includes('process.argv.includes("--mcp")'), "Electron must support a dedicated --mcp stdio mode.");
expect(main.includes("createMcpBridge"), "Electron main must start the local MCP bridge.");
expect(main.includes('ipcMain.handle("mcp-info"'), "Electron must expose MCP setup information to the UI.");
expect(main.includes('ELECTRON_RUN_AS_NODE: "1"'), "Packaged MCP config must run the Electron executable as a stdio-capable Node process.");
expect(main.includes('path.join(app.getAppPath(), "mcp", "server.mjs")'), "Packaged MCP config must launch the bundled server entry directly.");
expect(main.includes('ipcMain.handle("read-mcp-media-file"'), "Electron must expose local media import.");
expect(main.includes("createAutomaticExportTarget"), "Electron must provide unique automatic MCP export destinations.");
expect(main.includes('app.getPath("videos")'), "Automatic MCP exports must use the user's Videos folder.");
expect(bridge.includes('server.listen(0, "127.0.0.1"'), "MCP bridge must bind only to loopback.");
expect(bridge.includes("crypto.randomBytes(32)"), "MCP bridge must generate a 256-bit session token.");
expect(bridge.includes("MAX_BODY_BYTES"), "MCP bridge must limit request bodies.");
expect(bridge.includes('authorization !== `Bearer ${token}`'), "MCP bridge must authenticate every RPC request.");
expect(bridge.includes("EXPORT_TIMEOUT_MS = 30 * 60_000"), "MCP exports must support long-running renders.");
expect(preload.includes("onMcpRequest"), "Preload must expose MCP request subscriptions.");
expect(preload.includes("respondMcpRequest"), "Preload must expose MCP responses.");
expect(preload.includes("getMcpInfo"), "Preload must expose safe MCP setup metadata.");
expect(preload.includes("readMcpMediaFile"), "Preload must expose controlled local media reads.");
expect(preload.includes("renderPreviewFrame") && preload.includes("startRenderJob") && preload.includes("cancelRenderJob"), "Preload must expose preview and async render jobs.");
expect(serverSource.includes("StdioServerTransport"), "MCP server must use the local stdio transport.");
expect(serverSource.includes("McpServer") && serverSource.includes("server.registerTool"), "MCP server must use the modern high-level registration API.");
expect(serverSource.includes('"kurogi://active-project"'), "MCP server must expose the active project resource.");
expect(serverSource.includes('"kurogi://capabilities"'), "MCP server must expose machine-readable capabilities.");
expect((serverSource.match(/bridgeTool\("kurogi_/g) ?? []).length >= 50, "MCP V4 should expose at least 50 focused tools.");
for (const tool of ["kurogi_apply_edit_plan", "kurogi_apply_workflow", "kurogi_render_preview_frame", "kurogi_validate_project", "kurogi_start_render", "kurogi_get_render_progress", "kurogi_cancel_render", "kurogi_group_layers", "kurogi_set_gradient", "kurogi_set_layer_timing", "kurogi_search_assets", "kurogi_create_checkpoint", "kurogi_create_video"]) {
  expect(serverSource.includes(tool), `MCP V4 must expose ${tool}.`);
}
expect(serverSource.includes("structuredContent"), "MCP tools must return structured content.");
expect(serverSource.includes("readOnlyHint") && serverSource.includes("destructiveHint") && serverSource.includes("idempotentHint") && serverSource.includes("openWorldHint"), "MCP tools must provide complete risk annotations.");
expect(serverSource.includes("resolveReferences") && serverSource.includes('entries[0][0] === "$ref"'), "Autonomous workflow steps must support result references.");
expect(commandsSource.includes("sanitizeProjectDocument"), "MCP project documents must sanitize asset URLs.");
expect(commandsSource.includes('asset.sourceUrl = ""'), "MCP context must not leak embedded asset data.");
expect(commandsSource.includes("project.apply_edit_plan"), "MCP command adapter must support transactional edits.");
expect(!editor.includes("An MCP client wants to"), "MCP mutations, imports, and exports must not show Kurogi confirmation dialogs.");
expect(editor.includes("automatic: Boolean(params.automatic) || !outputPath"), "MCP exports without paths must select an automatic destination.");
expect(editor.includes("onMcpRequest") && editor.includes("respondMcpRequest"), "Editor must execute and answer MCP requests.");
expect(editor.includes("onMcpReady();"), "Editor must signal that its MCP listener is actually registered.");
expect(editor.includes("readMcpMediaFile"), "Editor must route local media imports through Electron.");
expect(app.includes("library.create_project") && app.includes("library.open_project"), "The app must let MCP create and open projects autonomously.");
expect(app.includes("waitForMcpEditorReady") && app.includes("markMcpEditorReady"), "Project create/open must wait for an explicit Editor MCP readiness handshake.");
expect(!app.includes("waitForMcpEditorMount"), "MCP project readiness must not rely on a fixed timing delay.");
expect(menu.includes("MCP Integration…"), "Help menu must expose MCP setup.");
expect(dialog.includes("Copy configuration"), "MCP setup dialog must provide a copyable client configuration.");
expect(dialog.includes("Autonomous mode is enabled"), "MCP setup dialog must explain immediate autonomous execution.");
expect(dialog.includes("env: info.env"), "The copied MCP configuration must include the Node-mode environment.");
expect(types.includes("McpBridgeRequest") && types.includes("getMcpInfo"), "Renderer API types must cover MCP bridge methods.");
expect(packageJson.scripts?.mcp === "electron . --mcp", "package.json must provide npm run mcp.");
expect(packageJson.scripts?.["audit:mcp"] === "node scripts/audit-mcp.mjs", "package.json must expose the MCP audit.");
expect(packageJson.dependencies?.["@modelcontextprotocol/sdk"], "Official MCP TypeScript SDK dependency is required.");
expect(packageJson.dependencies?.zod, "MCP SDK schema peer dependency is required.");
expect(packageJson.build?.files?.includes("mcp/**/*"), "Packaged builds must include the MCP server.");
expect(packageJson.build?.asar === false, "Packaged render sources must remain on a physical filesystem for Remotion bundling.");

const vite = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { hmr: false, middlewareMode: true, watch: null },
});

try {
  const core = await vite.ssrLoadModule("/src/core/project.ts");
  const mcp = await vite.ssrLoadModule("/src/core/mcpCommands.ts");

  let project = core.createProject({
    name: "MCP audit",
    format: "square",
    duration: 5,
    fps: 30,
    background: "#ffffff",
  });
  project.assets["asset-secret"] = {
    id: "asset-secret",
    projectId: project.id,
    name: "Private asset",
    type: "image",
    mimeType: "image/png",
    sourceUrl: "data:image/png;base64,SECRET",
    thumbnailUrl: "blob:private-thumbnail",
  };

  const initialContext = mcp.executeMcpProjectCommand(project, "project.get_context", { includeDocument: true });
  assert.equal(initialContext.changed, false);
  assert.equal(initialContext.result.project.sceneCount, 1);
  assert.equal(initialContext.result.document.assets["asset-secret"].sourceUrl, "");
  assert.equal(initialContext.result.document.assets["asset-secret"].thumbnailUrl, undefined);
  assert.equal(project.assets["asset-secret"].sourceUrl, "data:image/png;base64,SECRET", "Context sanitization must not mutate the live project.");

  const sceneResult = mcp.executeMcpProjectCommand(project, "project.create_scene", {
    name: "AI variation",
    width: 1080,
    height: 1920,
    duration: 8,
    fps: 60,
    background: "#121212",
  });
  project = sceneResult.project;
  const sceneId = sceneResult.activeSceneId;
  assert.ok(sceneId);
  assert.equal(project.scenes[sceneId].name, "AI variation");
  assert.equal(project.scenes[sceneId].height, 1920);
  assert.equal(project.scenes[sceneId].fps, 60);
  assert.deepEqual(project.scenes[sceneId].background, { type: "solid", color: "#121212" });

  const layerResult = mcp.executeMcpProjectCommand(project, "project.create_layer", {
    type: "text",
    sceneId,
    name: "MCP title",
    text: "HELLO MCP",
    x: 120,
    y: 240,
    width: 720,
    height: 180,
    fontSize: 96,
    color: "#8b5cf6",
  });
  project = layerResult.project;
  const layerId = layerResult.selectedLayerId;
  assert.ok(layerId);
  assert.equal(project.layers[layerId].text, "HELLO MCP");
  assert.equal(project.layers[layerId].style.fontSize, 96);
  assert.deepEqual(project.layers[layerId].position, { x: 120, y: 240 });

  const animated = mcp.executeMcpProjectCommand(project, "project.add_animation", {
    layerId,
    category: "in",
    type: "moveIn",
    duration: .8,
    parameters: { direction: "up", distance: 80 },
  });
  project = animated.project;
  assert.equal(project.layers[layerId].animationActions.length, 1);

  const updateResult = mcp.executeMcpProjectCommand(project, "project.update_layer", {
    layerId,
    text: "UPDATED BY MCP",
    opacity: 0.6,
    rotation: 12,
    visible: false,
  });
  project = updateResult.project;
  assert.equal(project.layers[layerId].text, "UPDATED BY MCP");
  assert.equal(project.layers[layerId].opacity, 0.6);
  assert.equal(project.layers[layerId].rotation, 12);
  assert.equal(project.layers[layerId].visible, false);

  const shapeResult = mcp.executeMcpProjectCommand(project, "project.create_layer", {
    type: "shape",
    sceneId,
    shape: "circle",
    color: "#00ffaa",
  });
  project = shapeResult.project;
  assert.equal(project.layers[shapeResult.selectedLayerId].type, "shape");
  assert.equal(project.layers[shapeResult.selectedLayerId].style.fill, "#00ffaa");

  const secondShape = mcp.executeMcpProjectCommand(project, "project.create_layer", { type: "shape", sceneId, shape: "rectangle", x: 500, y: 600, color: "#ff8800" });
  project = secondShape.project;
  const thirdShape = mcp.executeMcpProjectCommand(project, "project.create_layer", { type: "shape", sceneId, shape: "rectangle", x: 700, y: 600, color: "#4488ff" });
  project = thirdShape.project;
  const shapeIds = [shapeResult.selectedLayerId, secondShape.selectedLayerId, thirdShape.selectedLayerId];
  project = mcp.executeMcpProjectCommand(project, "project.align_layers", { layerIds: shapeIds, mode: "top" }).project;
  project = mcp.executeMcpProjectCommand(project, "project.distribute_layers", { layerIds: shapeIds, mode: "horizontal" }).project;
  project = mcp.executeMcpProjectCommand(project, "project.set_gradient", { layerIds: shapeIds, gradient: { type: "linear", startColor: "#111111", endColor: "#eeeeee", angle: 45 } }).project;
  project = mcp.executeMcpProjectCommand(project, "project.set_blend_mode", { layerIds: shapeIds, blendMode: "screen" }).project;
  project = mcp.executeMcpProjectCommand(project, "project.add_effect", { layerId: shapeIds[0], type: "glow", intensity: 42, radius: 18, color: "#8b5cf6" }).project;
  assert.equal(project.layers[shapeIds[0]].effects[0].type, "glow");
  const grouped = mcp.executeMcpProjectCommand(project, "project.group_layers", { layerIds: shapeIds, name: "Audit group" });
  project = grouped.project;
  assert.equal(project.layers[grouped.selectedLayerId].type, "group");
  project = mcp.executeMcpProjectCommand(project, "project.ungroup_layer", { groupId: grouped.selectedLayerId }).project;

  project = mcp.executeMcpProjectCommand(project, "project.set_layer_timing", { layerId, startTime: 1.25, duration: 2.5 }).project;
  assert.equal(project.layers[layerId].startTime, 1.25);
  assert.equal(project.layers[layerId].duration, 2.5);
  project = mcp.executeMcpProjectCommand(project, "project.set_scene_transition", { sceneId, type: "fade", duration: .45 }).project;
  assert.deepEqual(project.scenes[sceneId].transition, { type: "fade", duration: .45 });

  const atomic = mcp.executeMcpProjectCommand(project, "project.apply_workflow", { steps: [
    { method: "project.create_layer", assign: "caption", params: { type: "text", sceneId, text: "Atomic caption" } },
    { method: "project.update_layer", params: { layerId: { $ref: "caption.layer.id" }, opacity: .75, autoFit: true, textStroke: "#000000", textStrokeWidth: 2 } },
  ] });
  project = atomic.project;
  assert.equal(atomic.result.applied, 2);
  assert.equal(atomic.result.rolledBackOnError, true);
  const beforeFailedWorkflow = JSON.stringify(project);
  assert.throws(() => mcp.executeMcpProjectCommand(project, "project.apply_workflow", { steps: [
    { method: "project.create_layer", params: { type: "text", text: "Must roll back" } },
    { method: "project.update_layer", params: { layerId: "missing-layer", opacity: .5 } },
  ] }), /does not exist/);
  assert.equal(JSON.stringify(project), beforeFailedWorkflow, "Failed atomic workflows must not mutate the input project.");
  const autoFit = mcp.executeMcpProjectCommand(project, "project.create_layer", { type: "text", sceneId, text: "MCP V4 AUTO", width: 370, height: 78, fontSize: 54, fontWeight: 800, letterSpacing: 1.5, textStroke: "#151225", textStrokeWidth: 2, autoFit: true });
  project = autoFit.project;
  assert.ok(project.layers[autoFit.selectedLayerId].style.fontSize < 54, "Auto-fit must shrink bold uppercase text that would wrap in its box.");
  const validation = mcp.executeMcpProjectCommand(project, "project.validate", {});
  assert.equal(validation.changed, false);
  assert.equal(typeof validation.result.valid, "boolean");
  assert.equal(validation.result.issues.some((issue) => issue.layerId === autoFit.selectedLayerId && issue.code === "TEXT_OVERFLOW"), false, "Auto-fitted text must pass overflow validation.");

  const plan = mcp.executeMcpProjectCommand(project, "project.apply_edit_plan", {
    operations: [
      { method: "project.update_layer", params: { layerId, opacity: .9 } },
      { method: "project.update_scene", params: { sceneId, duration: 10 } },
    ],
  });
  project = plan.project;
  assert.equal(plan.result.applied, 2);
  assert.equal(project.layers[layerId].opacity, .9);
  assert.equal(project.scenes[sceneId].duration, 10);

  const switchResult = mcp.executeMcpProjectCommand(project, "project.set_active_scene", { sceneId: Object.keys(project.scenes)[0] });
  project = switchResult.project;
  assert.equal(project.activeSceneId, switchResult.activeSceneId);

  const deleteResult = mcp.executeMcpProjectCommand(project, "project.delete_layer", { layerId });
  project = deleteResult.project;
  assert.equal(project.layers[layerId], undefined);
  assert.equal(project.scenes[sceneId].layerIds.includes(layerId), false);

  assert.throws(
    () => mcp.executeMcpProjectCommand(project, "project.create_layer", { type: "shape", color: "red" }),
    /Invalid color/,
  );
  assert.throws(
    () => mcp.executeMcpProjectCommand(project, "project.update_layer", { layerId: "missing-layer" }),
    /does not exist/,
  );
} finally {
  await vite.close();
}

console.log("MCP V4 autonomous integration audit passed.");

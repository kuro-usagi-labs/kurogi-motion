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
expect(main.includes('ipcMain.handle("read-mcp-media-file"'), "Electron must expose user-approved local media import.");
expect(bridge.includes('server.listen(0, "127.0.0.1"'), "MCP bridge must bind only to loopback.");
expect(bridge.includes("crypto.randomBytes(32)"), "MCP bridge must generate a 256-bit session token.");
expect(bridge.includes("MAX_BODY_BYTES"), "MCP bridge must limit request bodies.");
expect(bridge.includes('authorization !== `Bearer ${token}`'), "MCP bridge must authenticate every RPC request.");
expect(preload.includes("onMcpRequest"), "Preload must expose MCP request subscriptions.");
expect(preload.includes("respondMcpRequest"), "Preload must expose MCP responses.");
expect(preload.includes("getMcpInfo"), "Preload must expose safe MCP setup metadata.");
expect(preload.includes("readMcpMediaFile"), "Preload must expose controlled local media reads.");
expect(serverSource.includes("StdioServerTransport"), "MCP server must use the local stdio transport.");
expect(serverSource.includes("ListToolsRequestSchema") && serverSource.includes("CallToolRequestSchema"), "MCP server must expose discoverable tools.");
expect(serverSource.includes('uri: "kurogi://active-project"'), "MCP server must expose the active project resource.");
expect(serverSource.includes('uri: "kurogi://capabilities"'), "MCP server must expose machine-readable capabilities.");
expect((serverSource.match(/tool\("kurogi_/g) ?? []).length >= 25, "MCP V2 should expose at least 25 focused tools.");
expect(serverSource.includes("kurogi_apply_edit_plan"), "MCP V2 must provide transactional edit plans.");
expect(serverSource.includes("kurogi_import_asset"), "MCP V2 must provide controlled media import.");
expect(serverSource.includes("kurogi_create_audio_clip"), "MCP V2 must provide audio timeline authoring.");
expect(commandsSource.includes("sanitizeProjectDocument"), "MCP project documents must sanitize asset URLs.");
expect(commandsSource.includes('asset.sourceUrl = ""'), "MCP context must not leak embedded asset data.");
expect(commandsSource.includes("project.apply_edit_plan"), "MCP command adapter must support transactional edits.");
expect(editor.includes("isMcpMutationMethod") && editor.includes("window.confirm"), "Editor must require visible approval for MCP mutations.");
expect(editor.includes("onMcpRequest") && editor.includes("respondMcpRequest"), "Editor must execute and answer MCP requests.");
expect(editor.includes("readMcpMediaFile"), "Editor must route approved local media imports through Electron.");
expect(app.includes("onMcpRequest"), "Dashboard must answer library MCP requests when no project is open.");
expect(menu.includes("MCP Integration…"), "Help menu must expose MCP setup.");
expect(dialog.includes("Copy configuration"), "MCP setup dialog must provide a copyable client configuration.");
expect(types.includes("McpBridgeRequest") && types.includes("getMcpInfo"), "Renderer API types must cover MCP bridge methods.");
expect(packageJson.scripts?.mcp === "electron . --mcp", "package.json must provide npm run mcp.");
expect(packageJson.scripts?.["audit:mcp"] === "node scripts/audit-mcp.mjs", "package.json must expose the MCP audit.");
expect(packageJson.dependencies?.["@modelcontextprotocol/sdk"], "Official MCP TypeScript SDK dependency is required.");
expect(packageJson.dependencies?.zod, "MCP SDK schema peer dependency is required.");
expect(packageJson.build?.files?.includes("mcp/**/*"), "Packaged builds must include the MCP server.");

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

console.log("MCP V2 integration audit passed.");

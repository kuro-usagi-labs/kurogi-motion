import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const sceneProperties = {
  sceneId: { type: "string" },
  name: { type: "string" },
  width: { type: "number", minimum: 64, maximum: 7680 },
  height: { type: "number", minimum: 64, maximum: 7680 },
  duration: { type: "number", minimum: .1, maximum: 3600 },
  fps: { type: "number", enum: [24, 30, 60] },
  background: { type: "string", description: "Hex color such as #ffffff." },
  transparent: { type: "boolean" },
};

const layerProperties = {
  layerId: { type: "string" },
  type: { type: "string", enum: ["text", "shape", "asset"] },
  assetId: { type: "string" },
  sceneId: { type: "string" },
  name: { type: "string" },
  text: { type: "string" },
  shape: { type: "string" },
  x: { type: "number" },
  y: { type: "number" },
  width: { type: "number", minimum: 1 },
  height: { type: "number", minimum: 1 },
  rotation: { type: "number" },
  opacity: { type: "number", minimum: 0, maximum: 1 },
  scaleX: { type: "number" },
  scaleY: { type: "number" },
  visible: { type: "boolean" },
  locked: { type: "boolean" },
  color: { type: "string" },
  fill: { type: "string" },
  stroke: { type: "string" },
  strokeWidth: { type: "number", minimum: 0 },
  borderRadius: { type: "number", minimum: 0 },
  fontSize: { type: "number", minimum: 1 },
  fontFamily: { type: "string" },
  fontWeight: { type: "number", minimum: 100, maximum: 900 },
  align: { type: "string", enum: ["left", "center", "right"] },
};

const animationProperties = {
  actionId: { type: "string" },
  layerId: { type: "string" },
  category: { type: "string", enum: ["in", "loop", "out"] },
  type: { type: "string", description: "Kurogi action type such as fadeIn, moveIn, scaleIn, counter, motionPath, pulse, or fadeOut." },
  startTime: { type: "number", minimum: 0 },
  duration: { type: "number", minimum: .05 },
  delay: { type: "number", minimum: 0 },
  easing: { type: "string", enum: ["linear", "easeIn", "easeOut", "easeInOut", "backIn", "backOut", "overshoot", "bounce", "elastic", "custom"] },
  easingCurve: { type: "array", minItems: 4, maxItems: 4, items: { type: "number" } },
  parameters: { type: "object", additionalProperties: { type: ["number", "string", "boolean"] } },
  repeatCount: { oneOf: [{ type: "number", minimum: 1 }, { type: "string", enum: ["infinite"] }] },
  repeatDelay: { type: "number", minimum: 0 },
  motionPath: { type: "object", additionalProperties: true },
};

const audioProperties = {
  clipId: { type: "string" },
  assetId: { type: "string" },
  sceneId: { type: "string" },
  name: { type: "string" },
  startTime: { type: "number", minimum: 0 },
  trimStart: { type: "number", minimum: 0 },
  duration: { type: "number", minimum: .05 },
  volume: { type: "number", minimum: 0, maximum: 2 },
  muted: { type: "boolean" },
  fadeIn: { type: "number", minimum: 0 },
  fadeOut: { type: "number", minimum: 0 },
  playbackRate: { type: "number", minimum: .25, maximum: 4 },
};

const TOOL_DEFINITIONS = [
  tool("kurogi_status", "Check whether the Kurogi Motion desktop app and local MCP bridge are running.", objectSchema({})),
  tool("kurogi_list_projects", "List projects saved locally in Kurogi Motion.", objectSchema({})),
  tool("kurogi_get_project_context", "Read the active project, scenes, visual layers, animation actions, audio clips, assets, and optionally a sanitized project document.", objectSchema({ includeDocument: { type: "boolean" } })),
  tool("kurogi_rename_project", "Rename the active project.", objectSchema({ name: { type: "string" } }, ["name"])),

  tool("kurogi_create_scene", "Create a scene. The desktop app asks for confirmation.", objectSchema(sceneProperties)),
  tool("kurogi_update_scene", "Update scene dimensions, duration, fps, name, or background.", objectSchema(sceneProperties)),
  tool("kurogi_duplicate_scene", "Duplicate a scene including layers, animations, and audio clips.", objectSchema({ sceneId: { type: "string" } })),
  tool("kurogi_delete_scene", "Delete a scene. At least one scene must remain.", objectSchema({ sceneId: { type: "string" } }, ["sceneId"])),
  tool("kurogi_set_active_scene", "Switch the active scene by ID.", objectSchema({ sceneId: { type: "string" } }, ["sceneId"])),

  tool("kurogi_create_layer", "Create a text, shape, or existing-asset visual layer.", objectSchema(layerProperties, ["type"])),
  tool("kurogi_update_layer", "Update common and type-specific layer properties.", objectSchema(layerProperties, ["layerId"])),
  tool("kurogi_duplicate_layer", "Duplicate a layer and its animation actions.", objectSchema({ layerId: { type: "string" } }, ["layerId"])),
  tool("kurogi_delete_layer", "Delete a layer.", objectSchema({ layerId: { type: "string" } }, ["layerId"])),
  tool("kurogi_reorder_layer", "Move a layer one position forward or backward.", objectSchema({ layerId: { type: "string" }, direction: { type: "string", enum: ["up", "down"] } }, ["layerId", "direction"])),

  tool("kurogi_add_animation", "Add an action-based animation to a layer.", objectSchema(animationProperties, ["layerId", "category", "type"])),
  tool("kurogi_update_animation", "Update timing, easing, parameters, repeat behavior, or motion path of an animation action.", objectSchema(animationProperties, ["actionId"])),
  tool("kurogi_delete_animation", "Delete an animation action.", objectSchema({ actionId: { type: "string" } }, ["actionId"])),

  tool("kurogi_import_asset", "Import an image or audio file from an absolute local path. Audio can be placed on the active timeline automatically.", objectSchema({
    path: { type: "string", description: "Absolute path accessible to the local Kurogi Motion desktop app." },
    sceneId: { type: "string" },
    addToTimeline: { type: "boolean", default: true },
  }, ["path"])),
  tool("kurogi_create_audio_clip", "Place an existing audio asset on a scene timeline.", objectSchema(audioProperties, ["assetId"])),
  tool("kurogi_update_audio_clip", "Update audio timing, trim, volume, fades, mute, or playback rate.", objectSchema(audioProperties, ["clipId"])),
  tool("kurogi_duplicate_audio_clip", "Duplicate an audio clip.", objectSchema({ clipId: { type: "string" } }, ["clipId"])),
  tool("kurogi_delete_audio_clip", "Delete an audio clip from the timeline without deleting its reusable asset.", objectSchema({ clipId: { type: "string" } }, ["clipId"])),

  tool("kurogi_apply_edit_plan", "Apply up to 200 scene, layer, animation, and audio operations as one transactional undo step.", objectSchema({
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        properties: { method: { type: "string" }, params: { type: "object", additionalProperties: true } },
        required: ["method"],
      },
    },
  }, ["operations"])),
  tool("kurogi_save_project", "Save the active project to the local project library.", objectSchema({})),
  tool("kurogi_export_active_project", "Export the active scene. With outputPath, the app asks for approval and exports directly; otherwise it opens the native destination dialog.", objectSchema({
    format: { type: "string", enum: ["mp4", "webm", "mov", "gif", "png-sequence"] },
    fps: { type: "number", enum: [24, 30, 60] },
    scale: { type: "number", minimum: .1, maximum: 2 },
    quality: { type: "string", enum: ["low", "medium", "high"] },
    transparent: { type: "boolean" },
    outputPath: { type: "string", description: "Optional absolute destination path. For PNG sequence, provide a directory." },
  })),
];

const TOOL_METHODS = {
  kurogi_status: "bridge.status",
  kurogi_list_projects: "library.list_projects",
  kurogi_get_project_context: "project.get_context",
  kurogi_rename_project: "project.rename",
  kurogi_create_scene: "project.create_scene",
  kurogi_update_scene: "project.update_scene",
  kurogi_duplicate_scene: "project.duplicate_scene",
  kurogi_delete_scene: "project.delete_scene",
  kurogi_set_active_scene: "project.set_active_scene",
  kurogi_create_layer: "project.create_layer",
  kurogi_update_layer: "project.update_layer",
  kurogi_duplicate_layer: "project.duplicate_layer",
  kurogi_delete_layer: "project.delete_layer",
  kurogi_reorder_layer: "project.reorder_layer",
  kurogi_add_animation: "project.add_animation",
  kurogi_update_animation: "project.update_animation",
  kurogi_delete_animation: "project.delete_animation",
  kurogi_import_asset: "asset.import_file",
  kurogi_create_audio_clip: "project.create_audio_clip",
  kurogi_update_audio_clip: "project.update_audio_clip",
  kurogi_duplicate_audio_clip: "project.duplicate_audio_clip",
  kurogi_delete_audio_clip: "project.delete_audio_clip",
  kurogi_apply_edit_plan: "project.apply_edit_plan",
  kurogi_save_project: "project.save",
  kurogi_export_active_project: "project.export",
};

const CAPABILITIES = {
  version: 2,
  model: "action-based motion design",
  authoring: ["multi-scene", "text", "vector shapes", "image assets", "animation actions", "audio assets", "audio timeline", "transactional edit plans"],
  audio: ["import", "reuse", "trim", "move", "duration", "volume", "mute", "fade-in", "fade-out", "playback-rate", "preview", "export mixing"],
  delivery: ["save", "mp4", "webm", "mov", "gif", "png-sequence", "direct approved output path"],
  safety: ["visible mutation approval", "visible direct-export approval", "authenticated loopback bridge", "sanitized project resources"],
};

export async function startKurogiMcpServer(options = {}) {
  const bridgeFile = options.bridgeFile || process.env.KUROGI_MCP_BRIDGE_FILE || findBridgeFileArgument();
  if (!bridgeFile) throw new Error("Kurogi MCP needs a bridge file. Launch the Kurogi Motion executable with --mcp.");

  const server = new Server(
    { name: "kurogi-motion", version: "2.0.0" },
    { capabilities: { tools: {}, resources: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const method = TOOL_METHODS[request.params.name];
    if (!method) return toolError(`Unknown Kurogi Motion tool: ${request.params.name}`);
    try {
      const result = await callBridge(bridgeFile, method, request.params.arguments ?? {});
      return toolResult(result);
    } catch (error) {
      return toolError(error instanceof Error ? error.message : String(error));
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      { uri: "kurogi://projects", name: "Kurogi Motion projects", description: "Saved projects in the local project library.", mimeType: "application/json" },
      { uri: "kurogi://active-project", name: "Active Kurogi Motion project", description: "Current scenes, layers, animation actions, audio clips, and assets.", mimeType: "application/json" },
      { uri: "kurogi://capabilities", name: "Kurogi Motion MCP capabilities", description: "Supported authoring, audio, export, and safety features.", mimeType: "application/json" },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    if (uri === "kurogi://capabilities") return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(CAPABILITIES, null, 2) }] };
    const method = uri === "kurogi://projects" ? "library.list_projects" : uri === "kurogi://active-project" ? "project.get_context" : null;
    if (!method) throw new Error(`Unknown Kurogi Motion resource: ${uri}`);
    const result = await callBridge(bridgeFile, method, uri === "kurogi://active-project" ? { includeDocument: false } : {});
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(result, null, 2) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

async function callBridge(bridgeFile, method, params) {
  const bridge = await readBridgeInfo(bridgeFile);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`http://${bridge.host}:${bridge.port}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bridge.token}` },
      body: JSON.stringify({ method, params }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Kurogi MCP bridge returned HTTP ${response.status}.`);
    return payload.result;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Kurogi Motion did not answer the MCP request in time.");
    if (error instanceof TypeError) throw new Error("Kurogi Motion is not running or its MCP bridge is unavailable.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readBridgeInfo(bridgeFile) {
  let raw;
  try { raw = await fs.promises.readFile(bridgeFile, "utf8"); }
  catch { throw new Error("Kurogi Motion is not running. Open the desktop app before using its MCP tools."); }
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error("Kurogi Motion MCP bridge metadata is invalid."); }
  if (value?.version !== 1 || value.host !== "127.0.0.1" || !Number.isInteger(value.port) || typeof value.token !== "string") throw new Error("Kurogi Motion MCP bridge metadata is incomplete.");
  return value;
}

function tool(name, description, inputSchema) { return { name, description, inputSchema }; }
function objectSchema(properties, required = []) { return { type: "object", additionalProperties: false, properties, required }; }
function toolResult(result) { return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; }
function toolError(message) { return { isError: true, content: [{ type: "text", text: message }] }; }
function findBridgeFileArgument() { const argument = process.argv.find((value) => value.startsWith("--bridge-file=")); return argument ? path.resolve(argument.slice("--bridge-file=".length)) : ""; }

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile && pathToFileURL(invokedFile).href === pathToFileURL(currentFile).href) {
  startKurogiMcpServer().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

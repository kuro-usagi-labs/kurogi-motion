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

const TOOL_DEFINITIONS = [
  {
    name: "kurogi_status",
    description: "Check whether the Kurogi Motion desktop app and its local MCP bridge are running.",
    inputSchema: objectSchema({}),
  },
  {
    name: "kurogi_list_projects",
    description: "List projects saved locally in Kurogi Motion.",
    inputSchema: objectSchema({}),
  },
  {
    name: "kurogi_get_project_context",
    description: "Read the active project, scenes, layers, and optionally a sanitized project document.",
    inputSchema: objectSchema({
      includeDocument: { type: "boolean", description: "Include the sanitized project JSON without embedded asset data." },
    }),
  },
  {
    name: "kurogi_create_scene",
    description: "Create a scene in the active Kurogi Motion project. The desktop app asks for confirmation.",
    inputSchema: objectSchema({
      name: { type: "string" },
      width: { type: "number", minimum: 64, maximum: 7680 },
      height: { type: "number", minimum: 64, maximum: 7680 },
      duration: { type: "number", minimum: 0.1, maximum: 3600 },
      fps: { type: "number", enum: [24, 30, 60] },
      background: { type: "string", description: "CSS hex color such as #ffffff." },
      transparent: { type: "boolean" },
    }),
  },
  {
    name: "kurogi_set_active_scene",
    description: "Switch the active scene by scene ID. The desktop app asks for confirmation.",
    inputSchema: objectSchema({ sceneId: { type: "string" } }, ["sceneId"]),
  },
  {
    name: "kurogi_create_layer",
    description: "Create a text or shape layer in a scene. The desktop app asks for confirmation.",
    inputSchema: objectSchema({
      type: { type: "string", enum: ["text", "shape"] },
      sceneId: { type: "string" },
      name: { type: "string" },
      text: { type: "string" },
      shape: { type: "string", description: "Shape type such as rectangle, circle, line, polygon, or arrow." },
      x: { type: "number" },
      y: { type: "number" },
      width: { type: "number", minimum: 1 },
      height: { type: "number", minimum: 1 },
      fontSize: { type: "number", minimum: 1 },
      color: { type: "string" },
    }, ["type"]),
  },
  {
    name: "kurogi_update_layer",
    description: "Update common properties of an existing layer. The desktop app asks for confirmation.",
    inputSchema: objectSchema({
      layerId: { type: "string" },
      name: { type: "string" },
      text: { type: "string" },
      x: { type: "number" },
      y: { type: "number" },
      width: { type: "number", minimum: 1 },
      height: { type: "number", minimum: 1 },
      rotation: { type: "number" },
      opacity: { type: "number", minimum: 0, maximum: 1 },
      visible: { type: "boolean" },
      locked: { type: "boolean" },
      color: { type: "string" },
      fill: { type: "string" },
      fontSize: { type: "number", minimum: 1 },
    }, ["layerId"]),
  },
  {
    name: "kurogi_delete_layer",
    description: "Delete a layer from the active project. The desktop app asks for confirmation.",
    inputSchema: objectSchema({ layerId: { type: "string" } }, ["layerId"]),
  },
  {
    name: "kurogi_save_project",
    description: "Save the active Kurogi Motion project to its local project library.",
    inputSchema: objectSchema({}),
  },
  {
    name: "kurogi_export_active_project",
    description: "Export the active scene. Kurogi Motion always opens its native destination dialog.",
    inputSchema: objectSchema({
      format: { type: "string", enum: ["mp4", "webm", "mov", "gif", "png-sequence"] },
      fps: { type: "number", enum: [24, 30, 60] },
      scale: { type: "number", minimum: 0.1, maximum: 2 },
      quality: { type: "string", enum: ["low", "medium", "high"] },
      transparent: { type: "boolean" },
    }),
  },
];

const TOOL_METHODS = {
  kurogi_status: "bridge.status",
  kurogi_list_projects: "library.list_projects",
  kurogi_get_project_context: "project.get_context",
  kurogi_create_scene: "project.create_scene",
  kurogi_set_active_scene: "project.set_active_scene",
  kurogi_create_layer: "project.create_layer",
  kurogi_update_layer: "project.update_layer",
  kurogi_delete_layer: "project.delete_layer",
  kurogi_save_project: "project.save",
  kurogi_export_active_project: "project.export",
};

export async function startKurogiMcpServer(options = {}) {
  const bridgeFile = options.bridgeFile || process.env.KUROGI_MCP_BRIDGE_FILE || findBridgeFileArgument();
  if (!bridgeFile) throw new Error("Kurogi MCP needs a bridge file. Launch the Kurogi Motion executable with --mcp.");

  const server = new Server(
    { name: "kurogi-motion", version: "1.0.0" },
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
      {
        uri: "kurogi://projects",
        name: "Kurogi Motion projects",
        description: "Saved projects in the local Kurogi Motion library.",
        mimeType: "application/json",
      },
      {
        uri: "kurogi://active-project",
        name: "Active Kurogi Motion project",
        description: "Current project context, scenes, and layers.",
        mimeType: "application/json",
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const method = uri === "kurogi://projects"
      ? "library.list_projects"
      : uri === "kurogi://active-project"
        ? "project.get_context"
        : null;
    if (!method) throw new Error(`Unknown Kurogi Motion resource: ${uri}`);
    const result = await callBridge(bridgeFile, method, uri === "kurogi://active-project" ? { includeDocument: false } : {});
    return {
      contents: [{ uri, mimeType: "application/json", text: JSON.stringify(result, null, 2) }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

async function callBridge(bridgeFile, method, params) {
  const bridge = await readBridgeInfo(bridgeFile);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65_000);
  try {
    const response = await fetch(`http://${bridge.host}:${bridge.port}/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bridge.token}`,
      },
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
  try {
    raw = await fs.promises.readFile(bridgeFile, "utf8");
  } catch {
    throw new Error("Kurogi Motion is not running. Open the desktop app before using its MCP tools.");
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("Kurogi Motion MCP bridge metadata is invalid."); }
  if (value?.version !== 1 || value.host !== "127.0.0.1" || !Number.isInteger(value.port) || typeof value.token !== "string") {
    throw new Error("Kurogi Motion MCP bridge metadata is incomplete.");
  }
  return value;
}

function objectSchema(properties, required = []) {
  return { type: "object", additionalProperties: false, properties, required };
}

function toolResult(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

function toolError(message) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

function findBridgeFileArgument() {
  const argument = process.argv.find((value) => value.startsWith("--bridge-file="));
  return argument ? path.resolve(argument.slice("--bridge-file=".length)) : "";
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile && pathToFileURL(invokedFile).href === pathToFileURL(currentFile).href) {
  startKurogiMcpServer().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

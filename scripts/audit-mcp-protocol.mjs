import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const token = "audit-token-0123456789";
const requests = [];
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
      result = { projects: [{ id: "project-audit", name: "Protocol audit" }] };
    } else if (payload.method === "project.get_context") {
      result = {
        project: { id: "project-audit", name: "Protocol audit", activeSceneId: "scene-audit" },
        scenes: [{ id: "scene-audit", name: "Scene 01", layers: [] }],
      };
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
const client = new Client({ name: "kurogi-mcp-audit", version: "1.0.0" }, { capabilities: {} });

try {
  await client.connect(transport);

  const tools = await client.listTools();
  assert.equal(tools.tools.length, 10);
  assert.ok(tools.tools.some((tool) => tool.name === "kurogi_status"));
  assert.ok(tools.tools.some((tool) => tool.name === "kurogi_create_layer"));

  const status = await client.callTool({ name: "kurogi_status", arguments: {} });
  assert.equal(status.isError, undefined);
  assert.match(status.content[0].text, /"appRunning": true/);

  const resources = await client.listResources();
  assert.deepEqual(resources.resources.map((resource) => resource.uri).sort(), [
    "kurogi://active-project",
    "kurogi://projects",
  ]);

  const active = await client.readResource({ uri: "kurogi://active-project" });
  assert.equal(active.contents[0].mimeType, "application/json");
  assert.match(active.contents[0].text, /Protocol audit/);

  const projects = await client.readResource({ uri: "kurogi://projects" });
  assert.match(projects.contents[0].text, /project-audit/);

  assert.ok(requests.some((request) => request.method === "bridge.status"));
  assert.ok(requests.some((request) => request.method === "project.get_context"));
  assert.ok(requests.some((request) => request.method === "library.list_projects"));
} finally {
  await client.close().catch(() => undefined);
  await new Promise((resolve) => bridge.close(() => resolve()));
  await fs.rm(directory, { recursive: true, force: true });
}

console.log("MCP protocol smoke audit passed.");

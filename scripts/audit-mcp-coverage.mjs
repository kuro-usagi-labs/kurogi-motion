import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";

const serverSource = await fs.readFile("mcp/server.mjs", "utf8");
const mainSource = await fs.readFile("electron/main.cjs", "utf8");
const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
const mcpModule = await import(pathToFileURL(path.resolve("mcp/server.mjs")).href);
const vite = await createServer({
  appType: "custom",
  configFile: false,
  envFile: false,
  logLevel: "silent",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
});

try {
  const catalog = await vite.ssrLoadModule("/src/core/templateCatalog.ts");
  const fields = ({ id, name, category, format, duration, description }) => ({ id, name, category, format, duration, description });
  assert.deepEqual(
    mcpModule.MCP_TEMPLATE_CATALOG.map(fields),
    catalog.MOTION_TEMPLATES.map(fields),
    "MCP template discovery and project.create templateId must cover the exact production catalog.",
  );
  assert.deepEqual(
    mcpModule.MCP_CAPABILITIES.templates,
    catalog.MOTION_TEMPLATES.map((template) => template.id),
    "Machine-readable MCP capabilities must advertise every production template.",
  );

  const toolNames = new Set([...serverSource.matchAll(/"(kurogi_[a-z0-9_]+)"/g)].map((match) => match[1]));
  const reportedToolCount = Number(mainSource.match(/const MCP_TOOL_COUNT = (\d+)/)?.[1]);
  assert.equal(toolNames.size, 62, "The focused production MCP surface should expose 62 tools.");
  assert.equal(reportedToolCount, toolNames.size, "Desktop MCP metadata must report the exact production tool count.");
  for (const tool of ["kurogi_list_projects", "kurogi_list_templates", "kurogi_inspect_project", "kurogi_render_preview_strip", "kurogi_preflight_export"]) {
    assert.ok(toolNames.has(tool), `MCP coverage is missing ${tool}.`);
  }

  for (const uri of ["kurogi://projects", "kurogi://templates", "kurogi://active-project", "kurogi://active-project/validation", "kurogi://capabilities"]) {
    assert.ok(serverSource.includes(`"${uri}"`), `MCP resource coverage is missing ${uri}.`);
  }
  assert.ok(serverSource.includes("paginatedResult") && serverSource.includes("nextOffset"), "Large project and template indexes must stay bounded and pageable.");
  assert.ok(serverSource.includes("representativePreviewTimes") && serverSource.includes("max(6)"), "Multiframe inspection must remain representative and capped at six images.");
  assert.ok(serverSource.includes("PROJECT_VALIDATION_FAILED") && serverSource.includes("ALPHA_FORMAT_UNSUPPORTED") && serverSource.includes("ProRes 4444 + yuva444p alpha verification"), "Export preflight must surface project blockers and model verified MOV alpha delivery.");
  assert.ok(serverSource.includes("StdioServerTransport"), "The production MCP transport must remain stdio.");
  assert.doesNotMatch(String(packageJson.dependencies?.["@modelcontextprotocol/sdk"] ?? ""), /beta|alpha|next|canary/i, "Production MCP must use a stable SDK release line.");

  console.log(`MCP coverage audit passed: ${toolNames.size} tools, 5 resources, ${mcpModule.MCP_TEMPLATE_CATALOG.length} templates, paginated inspection, preview strips, and export preflight.`);
} finally {
  await vite.close();
}

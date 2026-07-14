import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => { if (!condition) throw new Error(message); };

const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");
const bridge = read("electron/mcpBridge.cjs");
const server = read("mcp/server.mjs");
const commands = read("src/core/mcpCommands.ts");
const editor = read("src/app/Editor.tsx");
const app = read("src/App.tsx");
const menu = read("src/editor/EditorMenuBar.tsx");
const dialog = read("src/editor/McpIntegrationDialog.tsx");
const types = read("src/vite-env.d.ts");
const packageJson = JSON.parse(read("package.json"));

expect(main.includes('process.argv.includes("--mcp")'), "Electron must support a dedicated --mcp stdio mode.");
expect(main.includes("createMcpBridge"), "Electron main must start the local MCP bridge.");
expect(main.includes('ipcMain.handle("mcp-info"'), "Electron must expose MCP setup information to the UI.");
expect(bridge.includes('server.listen(0, "127.0.0.1"'), "MCP bridge must bind only to loopback.");
expect(bridge.includes("crypto.randomBytes(32)"), "MCP bridge must generate a 256-bit session token.");
expect(bridge.includes("MAX_BODY_BYTES"), "MCP bridge must limit request bodies.");
expect(bridge.includes('authorization !== `Bearer ${token}`'), "MCP bridge must authenticate every RPC request.");
expect(preload.includes("onMcpRequest"), "Preload must expose MCP request subscriptions.");
expect(preload.includes("respondMcpRequest"), "Preload must expose MCP responses.");
expect(preload.includes("getMcpInfo"), "Preload must expose safe MCP setup metadata.");
expect(server.includes("StdioServerTransport"), "MCP server must use the local stdio transport.");
expect(server.includes("ListToolsRequestSchema") && server.includes("CallToolRequestSchema"), "MCP server must expose discoverable tools.");
expect(server.includes('uri: "kurogi://active-project"'), "MCP server must expose the active project resource.");
expect((server.match(/name: "kurogi_/g) ?? []).length === 10, "MCP V1 should expose exactly ten focused tools.");
expect(commands.includes("sanitizeProjectDocument"), "MCP project documents must sanitize asset URLs.");
expect(commands.includes('asset.sourceUrl = ""'), "MCP context must not leak embedded asset data.");
expect(editor.includes("isMcpMutationMethod") && editor.includes("window.confirm"), "Editor must require visible approval for MCP mutations.");
expect(editor.includes("onMcpRequest") && editor.includes("respondMcpRequest"), "Editor must execute and answer MCP requests.");
expect(app.includes("onMcpRequest"), "Dashboard must answer library MCP requests when no project is open.");
expect(menu.includes("MCP Integration…"), "Help menu must expose MCP setup.");
expect(dialog.includes("Copy configuration"), "MCP setup dialog must provide a copyable client configuration.");
expect(types.includes("McpBridgeRequest") && types.includes("getMcpInfo"), "Renderer API types must cover MCP bridge methods.");
expect(packageJson.scripts?.mcp === "electron . --mcp", "package.json must provide npm run mcp.");
expect(packageJson.scripts?.["audit:mcp"] === "node scripts/audit-mcp.mjs", "package.json must expose the MCP audit.");
expect(packageJson.dependencies?.["@modelcontextprotocol/sdk"], "Official MCP TypeScript SDK dependency is required.");
expect(packageJson.dependencies?.zod, "MCP SDK schema peer dependency is required.");
expect(packageJson.build?.files?.includes("mcp/**/*"), "Packaged builds must include the MCP server.");

console.log("MCP integration audit passed.");

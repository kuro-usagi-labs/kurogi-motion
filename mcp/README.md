# Kurogi Motion MCP V4

Kurogi Motion ships a local Model Context Protocol server for autonomous video authoring. It can create or open projects, edit scenes and layers, add animations and audio, save, and render without a confirmation or destination dialog inside Kurogi.

## Required runtime

Keep the Kurogi Motion desktop application open. The visible app owns the project state, authenticated loopback bridge, and Remotion renderer. The MCP stdio subprocess connects to that bridge.

Use the exact configuration shown by **Help → MCP Integration…**. A packaged Windows installation uses the same Electron executable as a Node-compatible stdio runtime:

```json
{
  "mcpServers": {
    "kurogi-motion": {
      "command": "C:\\Users\\you\\AppData\\Local\\Programs\\kurogi-motion\\Kurogi Motion.exe",
      "args": [
        "C:\\Users\\you\\AppData\\Local\\Programs\\kurogi-motion\\resources\\app\\mcp\\server.mjs",
        "--bridge-file=C:\\Users\\you\\AppData\\Roaming\\kurogi-motion\\mcp-bridge.json"
      ],
      "env": {
        "ELECTRON_RUN_AS_NODE": "1"
      }
    }
  }
}
```

Do not configure the packaged GUI executable with only `args: ["--mcp"]` on Windows. A GUI-subsystem process does not provide the reliable stdio channel required by MCP clients.

## Recommended workflow

Use `kurogi_create_video` for a complete create, edit, save, and render operation. It creates a new project and a unique output under `Videos/Kurogi Motion`.

For an existing project, prefer `kurogi_apply_workflow`. It applies up to 200 ordered steps as one undo entry, supports `assign` and `{"$ref":"alias.path"}`, and commits nothing when a step fails.

Before a final render, use `kurogi_preflight_export`. It combines project validation, alpha-format compatibility, the intended export settings, and an optional midpoint preview into one structured `ready`, `review`, or `blocked` result. For broader visual QA, `kurogi_render_preview_strip` returns up to six representative frames from the active scene as MCP image content.

Discovery calls are intentionally bounded:

- `kurogi_list_projects` supports query, sorting, limit, and offset without opening a project.
- `kurogi_list_templates` exposes every production template, including `podcast-cover`, with stable IDs and creation metadata.
- `kurogi_inspect_project` filters and paginates layers while optionally attaching audio, assets, and validation findings.

The V4 tool set also includes:

- `kurogi_get_project_context`
- `kurogi_create_project` and `kurogi_open_project`
- `kurogi_render_preview_frame`, `kurogi_render_preview_strip`, `kurogi_validate_project`, and `kurogi_preflight_export`
- `kurogi_start_render`, `kurogi_get_render_progress`, and `kurogi_cancel_render`
- scene ordering, transitions, layer timing, and multi-layer movement
- grouping, alignment, distribution, gradients, blend modes, clipping masks, and effects
- text stroke, line height, letter spacing, and auto-fit
- asset search, metadata, replacement, reuse, and unused-asset cleanup
- `kurogi_undo`, `kurogi_redo`, and session checkpoints
- scene, layer, animation, asset, and audio tools
- `kurogi_save_project`
- `kurogi_export_active_project`

The server exposes `kurogi://projects`, `kurogi://templates`, `kurogi://active-project`, `kurogi://active-project/validation`, and `kurogi://capabilities` resources. Tools return both text and `structuredContent` and include complete MCP risk annotations.

## Inspection limits

- The desktop application must be open because it owns IndexedDB project data and the renderer.
- Focused inspection and preview tools operate on the active project. Reading another saved project in full requires opening it, which intentionally changes the editor state.
- Preview frames inspect only the active scene; they do not render scene transitions or prove that a long full-video encode will finish.
- Preflight reports problems and suggested recovery steps but does not silently change the project.

## Security and automation

- The bridge listens only on `127.0.0.1`.
- A random 256-bit bearer token is regenerated on every desktop launch.
- Local media reads are validated, type-limited, and capped at 250 MB.
- Automatic exports use unique destinations and do not overwrite prior autonomous renders.
- Kurogi does not show confirmation dialogs for MCP actions. The MCP host may still enforce its own approval policy.

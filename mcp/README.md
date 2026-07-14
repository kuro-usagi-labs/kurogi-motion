# Kurogi Motion MCP

Kurogi Motion ships a local Model Context Protocol server that lets MCP-compatible AI clients inspect and edit the project currently open in the desktop app.

## Development setup

1. Start the desktop app:

   ```bash
   npm run dev
   ```

2. Configure the MCP client with the command shown in **Help → MCP Integration…**.

The generated configuration launches the same Electron application in `--mcp` mode. That process speaks MCP over stdio and connects to the already-running Kurogi Motion window through a loopback-only authenticated bridge.

## Packaged app

A packaged client configuration uses the installed executable:

```json
{
  "mcpServers": {
    "kurogi-motion": {
      "command": "C:\\Program Files\\Kurogi Motion\\Kurogi Motion.exe",
      "args": ["--mcp"]
    }
  }
}
```

## Security model

- Bridge listens only on `127.0.0.1`.
- A random 256-bit bearer token is regenerated on every app launch.
- Bridge metadata is stored in the Electron user-data directory with owner-only permissions where supported.
- Project-changing tools require confirmation in the visible Kurogi Motion window.
- Export always opens the native destination dialog.
- Asset data URLs and Blob URLs are removed from MCP project documents.

## V1 tools

- `kurogi_status`
- `kurogi_list_projects`
- `kurogi_get_project_context`
- `kurogi_create_scene`
- `kurogi_set_active_scene`
- `kurogi_create_layer`
- `kurogi_update_layer`
- `kurogi_delete_layer`
- `kurogi_save_project`
- `kurogi_export_active_project`

## Resources

- `kurogi://projects`
- `kurogi://active-project`

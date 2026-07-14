# Kurogi Motion MCP

Kurogi Motion ships a local Model Context Protocol server that lets MCP-compatible AI clients inspect, edit, mix, save, and export the project currently open in the desktop app.

## Development setup

1. Start the desktop app:

   ```bash
   npm run dev
   ```

2. Open a project.
3. Configure the MCP client with the command shown in **Help → MCP Integration…**.

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

## Agent workflow

An MCP client can now:

1. Read `kurogi://capabilities` and `kurogi://active-project`.
2. Import local image or audio files with visible user approval.
3. Build scenes, visual layers, animation actions, and audio clips.
4. Submit up to 200 edits through `kurogi_apply_edit_plan` as one undoable transaction.
5. Save the project.
6. Export using the native destination dialog, or request an absolute output path that the user explicitly approves.

The transactional edit-plan tool is the preferred route for Codex, Claude Code, and other coding agents because a complete composition can be applied as one project history step.

## Audio workflow

Audio files are reusable project assets. Supported import formats are MP3, WAV, M4A, AAC, OGG, and WebM audio. An audio asset can be added to one or more scene timelines and edited independently with:

- timeline start
- source trim start
- clip duration
- volume up to 200%
- mute
- fade in and fade out
- playback rate from 0.25× to 4×
- duplicate and delete

The same Remotion composition is used for editor preview and final export, so audio timing and fades remain consistent.

## Security model

- Bridge listens only on `127.0.0.1`.
- A random 256-bit bearer token is regenerated on every app launch.
- Bridge metadata is stored in the Electron user-data directory with owner-only permissions where supported.
- Project-changing tools require confirmation in the visible Kurogi Motion window.
- Local-path media imports require a visible approval prompt before the file is read.
- Direct output paths require a visible approval prompt before export begins.
- Asset data URLs and Blob URLs are removed from MCP project documents.
- A media file imported by MCP is limited to 250 MB at the Electron boundary.

## MCP V2 tools

### Status and context

- `kurogi_status`
- `kurogi_list_projects`
- `kurogi_get_project_context`
- `kurogi_rename_project`

### Scene authoring

- `kurogi_create_scene`
- `kurogi_update_scene`
- `kurogi_duplicate_scene`
- `kurogi_delete_scene`
- `kurogi_set_active_scene`

### Visual layers

- `kurogi_create_layer`
- `kurogi_update_layer`
- `kurogi_duplicate_layer`
- `kurogi_delete_layer`
- `kurogi_reorder_layer`

### Animation

- `kurogi_add_animation`
- `kurogi_update_animation`
- `kurogi_delete_animation`

### Media and audio

- `kurogi_import_asset`
- `kurogi_create_audio_clip`
- `kurogi_update_audio_clip`
- `kurogi_duplicate_audio_clip`
- `kurogi_delete_audio_clip`

### Automation and delivery

- `kurogi_apply_edit_plan`
- `kurogi_save_project`
- `kurogi_export_active_project`

## Resources

- `kurogi://projects`
- `kurogi://active-project`
- `kurogi://capabilities`

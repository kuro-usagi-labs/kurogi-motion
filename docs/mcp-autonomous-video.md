# Autonomous MCP video workflow

Kurogi Motion MCP V4 can create, edit, validate, preview, save, and render a video without any confirmation or destination dialog inside Kurogi Motion.

## Windows client configuration

Keep the Kurogi Motion desktop application open, then copy the current configuration from **Help → MCP Integration…**. Packaged Windows builds launch the bundled server entry through Electron's Node mode and include `ELECTRON_RUN_AS_NODE=1`. A configuration that only passes `--mcp` to the GUI executable does not provide reliable stdio on Windows.

## Recommended tool

Use `kurogi_create_video` for end-to-end generation. It always creates a new project and writes a uniquely named output under the user's `Videos/Kurogi Motion` directory, so the autonomous workflow does not overwrite an existing video.

The MCP client or host can still apply its own approval policy. Kurogi Motion cannot disable prompts owned by another application; it only guarantees that Kurogi itself does not ask for confirmation.

## Edit an active project atomically

Use `kurogi_apply_workflow` when an existing project is already open. All steps are evaluated against a private project snapshot and committed as one undo entry. If any step or reference fails, the active project is left unchanged.

```json
{
  "steps": [
    {
      "method": "project.create_layer",
      "assign": "title",
      "params": { "type": "text", "text": "AUTOMATED", "x": 120, "y": 180, "width": 840, "height": 160 }
    },
    {
      "method": "project.add_animation",
      "params": { "layerId": { "$ref": "title.layer.id" }, "category": "in", "type": "moveIn", "duration": 0.7 }
    }
  ]
}
```

Use `kurogi_create_checkpoint` before a longer automation when you also want a named recovery point. `kurogi_undo`, `kurogi_redo`, `kurogi_list_checkpoints`, and `kurogi_restore_checkpoint` are available without UI dialogs.

## Preview, validate, and render asynchronously

Call `kurogi_render_preview_frame` to receive a PNG as MCP image content, then call `kurogi_validate_project` before delivery. Validation reports missing assets, off-canvas content, invalid timing, overflowing text, blank scenes, and related issues.

For non-blocking delivery:

1. Call `kurogi_start_render` and retain its `id`.
2. Poll `kurogi_get_render_progress` with that `jobId`.
3. Stop it with `kurogi_cancel_render` when needed.
4. A completed job returns its absolute output path. Omitting `outputPath` chooses a unique path automatically.

## Result references

Each workflow step can set `assign`. A later step can reference a nested value from that result with an object containing only `$ref`:

```json
{ "$ref": "heading.layer.id" }
```

The reserved `project` alias is created automatically and exposes values such as `project.projectId` and `project.activeSceneId`.

## Example: render a template

```json
{
  "project": {
    "name": "Launch countdown",
    "format": "square",
    "duration": 5,
    "fps": 30,
    "templateId": "countdown"
  },
  "steps": [],
  "export": {
    "format": "mp4",
    "quality": "high",
    "fps": 30,
    "scale": 1
  }
}
```

## Example: custom text with animation

```json
{
  "project": {
    "name": "Autonomous title",
    "format": "landscape",
    "duration": 6,
    "fps": 30,
    "background": "#11121a"
  },
  "steps": [
    {
      "method": "project.create_layer",
      "assign": "heading",
      "params": {
        "type": "text",
        "text": "BUILT BY MCP",
        "x": 220,
        "y": 390,
        "width": 1480,
        "height": 220,
        "fontSize": 128,
        "fontWeight": 800,
        "color": "#ffffff",
        "align": "center"
      }
    },
    {
      "method": "project.add_animation",
      "assign": "headingIn",
      "params": {
        "layerId": { "$ref": "heading.layer.id" },
        "category": "in",
        "type": "moveIn",
        "duration": 0.8,
        "easing": "backOut",
        "parameters": { "direction": "up", "distance": 90 }
      }
    }
  ],
  "export": { "format": "mp4", "quality": "high", "fps": 30, "scale": 1 }
}
```

## Example: import local media and edit its generated layer

```json
{
  "project": {
    "name": "Media promo",
    "format": "vertical",
    "duration": 7,
    "fps": 30,
    "background": "#0f1018"
  },
  "steps": [
    {
      "method": "asset.import_file",
      "assign": "photo",
      "params": { "path": "C:\\Media\\product.png" }
    },
    {
      "method": "project.update_layer",
      "params": {
        "layerId": { "$ref": "photo.layerId" },
        "x": 140,
        "y": 300,
        "width": 800,
        "height": 1000,
        "borderRadius": 48
      }
    }
  ],
  "export": { "format": "mp4", "quality": "high", "fps": 30, "scale": 1 }
}
```

## Supported templates

`chatbox`, `comment`, `notification`, `product`, `quote`, `logo`, `announcement`, `lower-third`, `app-promo`, `countdown`, `testimonial`, `stat-card`, `gradient-orbit`, `card-stack`, `kinetic-type`, `liquid-title`, `gallery-swipe`, `sale-poster`, `button-micro`, and `chart-reveal`.

## Runtime behavior

- Project changes and local media reads execute immediately.
- `kurogi_apply_workflow` is atomic and rolls back on failure.
- Preview frames are returned as PNG image content plus structured metadata.
- Async render jobs expose progress and cancellation.
- `kurogi_export_active_project` automatically chooses a unique destination when `outputPath` is omitted.
- `kurogi_create_video` always uses an automatic unique destination.
- Export bridge requests can run for up to 30 minutes.
- Tools return both text and MCP `structuredContent`.
- The bridge remains authenticated, loopback-only, and request-size limited.

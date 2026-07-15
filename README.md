# Kurogi Motion

Kurogi Motion is a local-first desktop motion-design editor for Windows. It combines a focused design canvas, a precision animation timeline, reusable motion presets, and autonomous MCP workflows in one Electron application.

## Highlights

- Separate **Design** and **Animation** workspaces
- Multi-scene projects with editable text, vector shapes, images, and audio
- Timeline marquee selection, trim/cut shortcuts, grouped actions, and Ctrl/Cmd + wheel zoom
- Live project and motion-preset previews with bounded, resource-aware playback
- MP4, WebM, GIF, PNG sequence, and MOV ProRes 4444 export
- Verified transparent MOV output with an alpha-capable `yuva444p` stream
- Local autosave, recovery drafts, project templates, and `.kuromotion` import/export
- Autonomous MCP tools for project creation, editing, saving, and rendering

## Install

Download the current Windows x64 installer or portable ZIP from [GitHub Releases](https://github.com/kuro-usagi-labs/kurogi-motion/releases). Kurogi Motion is currently unsigned, so Windows SmartScreen may show a warning on first launch.

## MCP configuration

Keep Kurogi Motion open with a project loaded, then add the configuration shown by **Help → MCP Integration** to your MCP client. The packaged application uses Electron's Node runtime for the stdio server:

```json
{
  "mcpServers": {
    "kurogi-motion": {
      "command": "C:\\Users\\YOU\\AppData\\Local\\Programs\\kurogi-motion\\Kurogi Motion.exe",
      "args": [
        "C:\\Users\\YOU\\AppData\\Local\\Programs\\kurogi-motion\\resources\\app\\mcp\\server.mjs",
        "--bridge-file=C:\\Users\\YOU\\AppData\\Roaming\\kurogi-motion\\mcp-bridge.json"
      ],
      "env": {
        "ELECTRON_RUN_AS_NODE": "1"
      }
    }
  }
}
```

Kurogi-owned edits and exports run without confirmation dialogs. An MCP host can still apply its own approval policy.

## Development

Requires Node.js 22 and Windows for desktop packaging.

```powershell
npm ci
npm run dev
```

Quality gates:

```powershell
npm run audit
npm run build
npm run package
```

The MOV-alpha audit performs a real short render, probes the ProRes stream, decodes RGBA pixels, and verifies transparent, semitransparent, and opaque samples.

## Privacy

Projects and imported media remain local unless you explicitly export or share them. The MCP bridge is authenticated, loopback-only, and request-size limited.

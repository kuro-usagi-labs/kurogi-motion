# Infinite Canvas + Multi-Scene Workspace V1

This milestone introduces persistent artboard positions, scene CRUD, active-scene switching, multi-artboard rendering, pan/zoom/focus navigation, scene duplication, cross-scene layer copy, history support, migration of existing single-scene projects, and runtime regression auditing.

The existing Remotion composition remains the source of truth for the active artboard, so direct manipulation, timeline playback, inspector editing, and desktop export continue to share the same renderer. Inactive artboards render as non-editable previews until selected.

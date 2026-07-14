# Animation Workflow V1

Animation Workflow V1 keeps Kurogi Motion action-based while adding multi-action editing and reusable motion systems.

- Shift-click animation blocks to multi-select them.
- Move or resize a selected block set together from the timeline.
- Stagger selected layers with forward, reverse, center, edges, or deterministic random order.
- Copy selected actions, switch layer or scene, and paste at the current playhead.
- Group actions so selecting and dragging one selects the complete animation group.
- Use custom cubic-bezier curves from the Animation inspector.
- Add Counter actions to text layers and Motion path actions with editable cubic Bezier handles.
- Preset cards render through the same Remotion composition used by preview and export.
- Save any selected action set as a reusable project-level custom preset.

V1 boundaries:

- Multi-action resize applies the same duration delta to each selected block.
- Motion paths use one cubic segment per action.
- Custom presets are stored inside the current project, not a shared cloud library.
- Pasting a counter action skips non-text target layers.

# Design Tools V1

This milestone adds Shift multi-selection, smart snapping and live alignment guides, alignment and distribution commands, text/shape gradients, blend modes, background blur, vector and alpha masks, Blob-backed custom font import, and group/ungroup operations. All document mutations use the existing project patch history so undo, redo, autosave, recovery, project transfer, preview, and Remotion export share the same state.

## Interaction notes

- Shift-click layers on the canvas or in the layer panel to build a selection.
- Alignment uses the selection bounds when multiple layers are selected and the active scene when one layer is selected.
- The first layer in a two-layer selection is the mask source; the Shift-selected second layer is the mask target.
- Hold Alt while dragging to bypass snapping.
- Ctrl/Cmd+G groups the selection. Ctrl/Cmd+Shift+G ungroups the selected group.

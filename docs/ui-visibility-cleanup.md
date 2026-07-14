# UI visibility and duplicate-control cleanup

## Design toolbar visibility

The floating Design Toolbar can be shown or hidden from **View → Design Toolbar**.

This preference is stored in `localStorage` under `kurogi-editor-ui-v1`. It is an application preference, not project content, so it does not change `.kuromotion` files or project history.

## Duplicate-control policy

Kurogi Motion keeps one visible home for persistent layer state:

- visibility and lock controls live in the Layers sidebar,
- the duplicate Layer state section was removed from the Design Inspector,
- the duplicate Duplicate/Delete footer was removed from the Layers sidebar,
- Scene Settings lives in the Scene menu and no longer has a second icon beside the scene name.

Command menus and keyboard shortcuts may still expose the same action for discoverability and accessibility. Canvas navigation controls such as Fit All, Focus, and Zoom remain in the workspace because they are direct manipulation controls.

## Electron titlebar safety

The dashboard topbar now reserves a right-side safe area for native minimize, maximize, and close controls. Interactive dashboard controls are marked as non-draggable regions.

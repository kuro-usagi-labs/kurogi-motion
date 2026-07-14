import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AnimationCategory } from "../types";
import type { AlignMode, DistributeMode } from "../core/designTools";

interface EditorMenuBarProps {
  canUndo: boolean;
  canRedo: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  canGroup: boolean;
  canDistribute: boolean;
  canUngroup: boolean;
  canDeleteScene: boolean;
  canCopyAnimation: boolean;
  canPasteAnimation: boolean;
  canGroupAnimation: boolean;
  safeAreaEnabled: boolean;
  snapEnabled: boolean;
  onNewProject: () => void;
  onOpenProject: () => void;
  onSave: () => void;
  onImportAsset: () => void;
  onCopyProject: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (mode: DistributeMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitAll: () => void;
  onFocusScene: () => void;
  onToggleSafeArea: () => void;
  onToggleSnap: () => void;
  onCreateScene: () => void;
  onDuplicateScene: () => void;
  onDeleteScene: () => void;
  onSceneSettings: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onOpenAnimationCategory: (category: AnimationCategory) => void;
  onCopyAnimation: () => void;
  onPasteAnimation: () => void;
  onStaggerAnimation: () => void;
  onGroupAnimation: () => void;
  onUngroupAnimation: () => void;
  onSaveAnimationPreset: () => void;
  onShowShortcuts: () => void;
  onShowAbout: () => void;
}

type MenuName = "File" | "Edit" | "View" | "Scene" | "Layer" | "Animation" | "Help";

export function EditorMenuBar(props: EditorMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const closeFromPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const insideMenuBar = Boolean(rootRef.current?.contains(target));
      const insidePopover = target instanceof Element && Boolean(target.closest('[data-editor-menu-popover="true"]'));
      if (!insideMenuBar && !insidePopover) setOpenMenu(null);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    window.addEventListener("pointerdown", closeFromPointer);
    window.addEventListener("keydown", closeFromKeyboard);
    return () => {
      window.removeEventListener("pointerdown", closeFromPointer);
      window.removeEventListener("keydown", closeFromKeyboard);
    };
  }, []);

  const run = (action: () => void) => {
    setOpenMenu(null);
    action();
  };

  return (
    <nav className="editor-menu-bar" ref={rootRef} aria-label="Application menu">
      <Menu label="File" open={openMenu === "File"} onToggle={() => setOpenMenu(openMenu === "File" ? null : "File")}>
        <MenuItem label="New Project…" shortcut="Ctrl+N" onSelect={() => run(props.onNewProject)} />
        <MenuItem label="Open Project…" shortcut="Ctrl+O" onSelect={() => run(props.onOpenProject)} />
        <MenuSeparator />
        <MenuItem label="Save" shortcut="Ctrl+S" onSelect={() => run(props.onSave)} />
        <MenuItem label="Import Asset…" onSelect={() => run(props.onImportAsset)} />
        <MenuSeparator />
        <MenuItem label="Copy Project JSON" onSelect={() => run(props.onCopyProject)} />
        <MenuItem label="Export…" shortcut="Ctrl+E" onSelect={() => run(props.onExport)} />
      </Menu>

      <Menu label="Edit" open={openMenu === "Edit"} onToggle={() => setOpenMenu(openMenu === "Edit" ? null : "Edit")}>
        <MenuItem label="Undo" shortcut="Ctrl+Z" disabled={!props.canUndo} onSelect={() => run(props.onUndo)} />
        <MenuItem label="Redo" shortcut="Ctrl+Shift+Z" disabled={!props.canRedo} onSelect={() => run(props.onRedo)} />
        <MenuSeparator />
        <MenuItem label="Duplicate" shortcut="Ctrl+D" disabled={!props.canDuplicate} onSelect={() => run(props.onDuplicate)} />
        <MenuItem label="Delete" shortcut="Del" disabled={!props.canDelete} danger onSelect={() => run(props.onDelete)} />
        <MenuItem label="Select All Layers" shortcut="Ctrl+A" onSelect={() => run(props.onSelectAll)} />
        <MenuItem label="Deselect All" shortcut="Esc" onSelect={() => run(props.onDeselectAll)} />
        <MenuSection label="Align" />
        <MenuItem label="Align Left" disabled={!props.canDuplicate} onSelect={() => run(() => props.onAlign("left"))} />
        <MenuItem label="Align Horizontal Center" disabled={!props.canDuplicate} onSelect={() => run(() => props.onAlign("center"))} />
        <MenuItem label="Align Right" disabled={!props.canDuplicate} onSelect={() => run(() => props.onAlign("right"))} />
        <MenuItem label="Align Top" disabled={!props.canDuplicate} onSelect={() => run(() => props.onAlign("top"))} />
        <MenuItem label="Align Vertical Center" disabled={!props.canDuplicate} onSelect={() => run(() => props.onAlign("middle"))} />
        <MenuItem label="Align Bottom" disabled={!props.canDuplicate} onSelect={() => run(() => props.onAlign("bottom"))} />
        <MenuItem label="Distribute Horizontally" disabled={!props.canDistribute} onSelect={() => run(() => props.onDistribute("horizontal"))} />
        <MenuItem label="Distribute Vertically" disabled={!props.canDistribute} onSelect={() => run(() => props.onDistribute("vertical"))} />
      </Menu>

      <Menu label="View" open={openMenu === "View"} onToggle={() => setOpenMenu(openMenu === "View" ? null : "View")}>
        <MenuItem label="Zoom In" shortcut="Ctrl++" onSelect={() => run(props.onZoomIn)} />
        <MenuItem label="Zoom Out" shortcut="Ctrl+-" onSelect={() => run(props.onZoomOut)} />
        <MenuItem label="Reset Zoom to 100%" shortcut="Ctrl+0" onSelect={() => run(props.onResetZoom)} />
        <MenuSeparator />
        <MenuItem label="Fit All Scenes" onSelect={() => run(props.onFitAll)} />
        <MenuItem label="Focus Active Scene" onSelect={() => run(props.onFocusScene)} />
        <MenuSeparator />
        <MenuItem label="Safe Area" checked={props.safeAreaEnabled} onSelect={() => run(props.onToggleSafeArea)} />
        <MenuItem label="Smart Snap" checked={props.snapEnabled} onSelect={() => run(props.onToggleSnap)} />
      </Menu>

      <Menu label="Scene" open={openMenu === "Scene"} onToggle={() => setOpenMenu(openMenu === "Scene" ? null : "Scene")}>
        <MenuItem label="New Scene" onSelect={() => run(props.onCreateScene)} />
        <MenuItem label="Duplicate Scene" onSelect={() => run(props.onDuplicateScene)} />
        <MenuItem label="Delete Scene" disabled={!props.canDeleteScene} danger onSelect={() => run(props.onDeleteScene)} />
        <MenuSeparator />
        <MenuItem label="Scene Settings…" onSelect={() => run(props.onSceneSettings)} />
      </Menu>

      <Menu label="Layer" open={openMenu === "Layer"} onToggle={() => setOpenMenu(openMenu === "Layer" ? null : "Layer")}>
        <MenuItem label="Bring Forward" disabled={!props.canDuplicate} onSelect={() => run(props.onBringForward)} />
        <MenuItem label="Send Backward" disabled={!props.canDuplicate} onSelect={() => run(props.onSendBackward)} />
        <MenuSeparator />
        <MenuItem label="Group" shortcut="Ctrl+G" disabled={!props.canGroup} onSelect={() => run(props.onGroup)} />
        <MenuItem label="Ungroup" shortcut="Ctrl+Shift+G" disabled={!props.canUngroup} onSelect={() => run(props.onUngroup)} />
        <MenuSeparator />
        <MenuItem label="Toggle Visibility" disabled={!props.canDuplicate} onSelect={() => run(props.onToggleVisibility)} />
        <MenuItem label="Toggle Lock" disabled={!props.canDuplicate} onSelect={() => run(props.onToggleLock)} />
      </Menu>

      <Menu label="Animation" open={openMenu === "Animation"} onToggle={() => setOpenMenu(openMenu === "Animation" ? null : "Animation")}>
        <MenuItem label="Add In Animation…" disabled={!props.canDuplicate} onSelect={() => run(() => props.onOpenAnimationCategory("in"))} />
        <MenuItem label="Add Loop Animation…" disabled={!props.canDuplicate} onSelect={() => run(() => props.onOpenAnimationCategory("loop"))} />
        <MenuItem label="Add Out Animation…" disabled={!props.canDuplicate} onSelect={() => run(() => props.onOpenAnimationCategory("out"))} />
        <MenuSeparator />
        <MenuItem label="Copy Animation" shortcut="Ctrl+C" disabled={!props.canCopyAnimation} onSelect={() => run(props.onCopyAnimation)} />
        <MenuItem label="Paste Animation" shortcut="Ctrl+V" disabled={!props.canPasteAnimation} onSelect={() => run(props.onPasteAnimation)} />
        <MenuItem label="Stagger Selected…" disabled={!props.canCopyAnimation} onSelect={() => run(props.onStaggerAnimation)} />
        <MenuSeparator />
        <MenuItem label="Group Animation Blocks" disabled={!props.canGroupAnimation} onSelect={() => run(props.onGroupAnimation)} />
        <MenuItem label="Ungroup Animation Blocks" disabled={!props.canCopyAnimation} onSelect={() => run(props.onUngroupAnimation)} />
        <MenuItem label="Save as Custom Preset…" disabled={!props.canCopyAnimation} onSelect={() => run(props.onSaveAnimationPreset)} />
      </Menu>

      <Menu label="Help" open={openMenu === "Help"} onToggle={() => setOpenMenu(openMenu === "Help" ? null : "Help")}>
        <MenuItem label="Keyboard Shortcuts" onSelect={() => run(props.onShowShortcuts)} />
        <MenuItem label="About Kurogi Motion" onSelect={() => run(props.onShowAbout)} />
      </Menu>
    </nav>
  );
}

function Menu({ label, open, onToggle, children }: { label: MenuName; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const menuId = `editor-menu-${label.toLowerCase()}`;

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dropdownWidth = window.innerWidth <= 900 ? 240 : 260;
      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, window.innerWidth - dropdownWidth - 8),
      );
      setPosition({ top: rect.bottom + 8, left });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <div className={`editor-menu ${open ? "is-open" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="editor-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={onToggle}
      >
        {label}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="editor-menu-portal-layer" aria-hidden="false">
              <div
                id={menuId}
                className="editor-menu-dropdown editor-menu-dropdown-portal"
                data-editor-menu-popover="true"
                role="menu"
                style={{ top: position.top, left: position.left }}
              >
                {children}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function MenuItem({ label, shortcut, checked, disabled, danger, onSelect }: { label: string; shortcut?: string; checked?: boolean; disabled?: boolean; danger?: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="menuitem" className={`editor-menu-item ${danger ? "is-danger" : ""}`} disabled={disabled} onClick={onSelect}>
      <span className="editor-menu-check" aria-hidden="true">{checked ? "✓" : ""}</span>
      <span>{label}</span>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </button>
  );
}

function MenuSeparator() { return <div className="editor-menu-separator" role="separator" />; }
function MenuSection({ label }: { label: string }) { return <div className="editor-menu-section-label">{label}</div>; }

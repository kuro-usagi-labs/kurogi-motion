import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  AnimationActionDocument,
  AnimationActionType,
  AnimationCategory,
  KurogiProject,
  LayerDocument,
  LayerId,
} from "../domain/project";
import {
  cloneProject,
  createBlankProject,
  createEllipseLayer,
  createId,
  createRectangleLayer,
  createTextLayer,
} from "../domain/project";
import { PixiCanvas } from "../canvas/PixiCanvas";
import { commandManager, useCommandHistory } from "../core/history/CommandManager";
import {
  createAnimationPatchCommand,
  createLayerPatchCommand,
  createProjectSnapshotCommand,
} from "../core/history/projectCommands";
import { playbackController } from "../engine/playbackController";
import { frameToTime, timeToFrame } from "../engine/time";
import { loadMostRecentProject, saveProject } from "../persistence/database";
import { migrateLegacyLocalProject } from "../persistence/migrations";
import { useAutosave } from "../persistence/useAutosave";
import { useDocumentStore } from "../stores/documentStore";
import { useEditorStore, type InspectorTab, type SidebarTab } from "../stores/editorStore";
import { usePlaybackStore } from "../stores/playbackStore";
import "./editor.css";

const panels: Array<{ id: SidebarTab; icon: string }> = [
  { id: "layers", icon: "▱" },
  { id: "assets", icon: "◈" },
  { id: "text", icon: "T" },
  { id: "shapes", icon: "◇" },
  { id: "templates", icon: "✦" },
];

const presets: Array<{
  label: string;
  category: AnimationCategory;
  type: AnimationActionType;
  parameters: AnimationActionDocument["parameters"];
  durationMs: number;
}> = [
  { label: "Move in", category: "in", type: "move", parameters: { direction: "up", distance: 90 }, durationMs: 650 },
  { label: "Fade in", category: "in", type: "fade", parameters: { fromOpacity: 0, toOpacity: 1 }, durationMs: 500 },
  { label: "Scale in", category: "in", type: "scale", parameters: { fromScale: 0.75, toScale: 1 }, durationMs: 650 },
  { label: "Float", category: "loop", type: "float", parameters: { direction: "up", distance: 18 }, durationMs: 1600 },
  { label: "Pulse", category: "loop", type: "pulse", parameters: { intensity: 0.06 }, durationMs: 1200 },
  { label: "Fade out", category: "out", type: "fade", parameters: { fromOpacity: 0, toOpacity: 1 }, durationMs: 500 },
];

const withHistory = (label: string, mutate: (project: KurogiProject) => void): void => {
  const before = cloneProject(useDocumentStore.getState().project);
  const after = cloneProject(before);
  mutate(after);
  commandManager.execute(createProjectSnapshotCommand(label, before, after));
};

const selectedLayer = (): LayerDocument | undefined => {
  const id = useEditorStore.getState().selectedLayerIds.at(-1);
  return id ? useDocumentStore.getState().project.layers[id] : undefined;
};

function Toolbar(): JSX.Element {
  const project = useDocumentStore((state) => state.project);
  const saveStatus = useDocumentStore((state) => state.saveStatus);
  const updateProject = useDocumentStore((state) => state.updateProject);
  const setSaveStatus = useDocumentStore((state) => state.setSaveStatus);
  const zoom = useEditorStore((state) => state.zoom);
  const setZoom = useEditorStore((state) => state.setZoom);
  const setInspectorTab = useEditorStore((state) => state.setInspectorTab);
  const playbackStatus = usePlaybackStore((state) => state.status);
  const history = useCommandHistory();

  const save = async (): Promise<void> => {
    setSaveStatus("saving");
    try {
      await saveProject(useDocumentStore.getState().project);
      setSaveStatus("saved");
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
    }
  };

  const createNew = (): void => {
    const next = createBlankProject("Untitled motion");
    useDocumentStore.getState().replaceProject(next);
    useEditorStore.getState().selectLayer(next.scenes[next.activeSceneId].rootLayerIds[0] ?? null);
    useDocumentStore.getState().updateProject((current) => current);
    commandManager.clear();
    playbackController.stop();
  };

  return (
    <header className="topbar">
      <div className="brand"><span>K</span><b>kurogi<em>motion</em></b><button onClick={createNew}>New</button></div>
      <div className="project-name">
        <input aria-label="Project name" value={project.name} onChange={(event) => updateProject((current) => ({ ...current, name: event.target.value || "Untitled motion" }))} />
        <button className={`save-status ${saveStatus}`} onClick={() => void save()}>{saveStatus === "saving" ? "Saving…" : saveStatus === "dirty" ? "Unsaved" : saveStatus === "error" ? "Save failed" : "Saved"}</button>
      </div>
      <div className="top-actions">
        <button disabled={!history.canUndo} onClick={() => commandManager.undo()}>↶</button>
        <button disabled={!history.canRedo} onClick={() => commandManager.redo()}>↷</button>
        <button onClick={() => setZoom(zoom / 1.1)}>−</button><small>{Math.round(zoom * 100)}%</small><button onClick={() => setZoom(zoom * 1.1)}>+</button>
        <button className="preview" onClick={() => playbackController.toggle()}>{playbackStatus === "playing" ? "❚❚ Pause" : "▶ Preview"}</button>
        <button className="export" onClick={() => setInspectorTab("export")}>Export ↗</button>
      </div>
    </header>
  );
}

function LeftPanel(): JSX.Element {
  const project = useDocumentStore((state) => state.project);
  const sidebar = useEditorStore((state) => state.sidebarTab);
  const setSidebar = useEditorStore((state) => state.setSidebarTab);
  const selected = useEditorStore((state) => state.selectedLayerIds);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const scene = project.scenes[project.activeSceneId];

  const addLayer = (type: "text" | "rectangle" | "ellipse"): void => {
    const layer = type === "text" ? createTextLayer(scene.id, { name: "New headline", content: "YOUR IDEA" }) : type === "rectangle" ? createRectangleLayer(scene.id) : createEllipseLayer(scene.id);
    withHistory("Add layer", (next) => {
      next.layers[layer.id] = layer;
      next.scenes[scene.id].rootLayerIds.push(layer.id);
    });
    selectLayer(layer.id);
    setSidebar("layers");
  };

  const toggle = (layer: LayerDocument, key: "visible" | "locked"): void => {
    commandManager.execute(createLayerPatchCommand(layer.id, { [key]: layer[key] } as Partial<LayerDocument>, { [key]: !layer[key] } as Partial<LayerDocument>, key === "visible" ? "Toggle visibility" : "Toggle lock"));
  };

  const reorder = (layerId: LayerId, offset: number): void => withHistory("Reorder layer", (next) => {
    const order = next.scenes[next.activeSceneId].rootLayerIds;
    const from = order.indexOf(layerId);
    const to = Math.max(0, Math.min(order.length - 1, from + offset));
    order.splice(to, 0, order.splice(from, 1)[0]);
  });

  return (
    <>
      <nav className="rail">{panels.map((item) => <button key={item.id} className={sidebar === item.id ? "active" : ""} onClick={() => setSidebar(item.id)}><b>{item.icon}</b><span>{item.id}</span></button>)}</nav>
      <aside className="left-panel">
        <header><b>{sidebar[0].toUpperCase() + sidebar.slice(1)}</b>{sidebar === "layers" && <button onClick={() => addLayer("text")}>＋</button>}</header>
        {sidebar === "layers" && <div className="layer-panel">
          <div className="scene-row"><b>Scene 01</b><small>{scene.width} × {scene.height}</small></div>
          {[...scene.rootLayerIds].reverse().map((id) => {
            const layer = project.layers[id];
            if (!layer) return null;
            return <div key={id} className={`layer-row ${selected.includes(id) ? "selected" : ""}`} onClick={() => selectLayer(id)}>
              <span>{layer.type === "text" ? "T" : layer.type === "ellipse" ? "●" : "■"}</span><b>{layer.name}</b>
              <button title="Visibility" onClick={(event) => { event.stopPropagation(); toggle(layer, "visible"); }}>{layer.visible ? "◉" : "○"}</button>
              <button title="Lock" onClick={(event) => { event.stopPropagation(); toggle(layer, "locked"); }}>{layer.locked ? "▣" : "▢"}</button>
              <button title="Move up" onClick={(event) => { event.stopPropagation(); reorder(id, 1); }}>↑</button>
              <button title="Move down" onClick={(event) => { event.stopPropagation(); reorder(id, -1); }}>↓</button>
            </div>;
          })}
        </div>}
        {sidebar === "text" && <div className="add-grid"><button onClick={() => addLayer("text")}><b>H</b><span>Heading</span></button></div>}
        {sidebar === "shapes" && <div className="add-grid"><button onClick={() => addLayer("rectangle")}><b>■</b><span>Rectangle</span></button><button onClick={() => addLayer("ellipse")}><b>●</b><span>Ellipse</span></button></div>}
        {sidebar === "assets" && <div className="empty-panel"><b>Asset pipeline ready</b><p>Blob persistence exists in IndexedDB. Image and SVG rendering will be connected in the next export-focused iteration.</p></div>}
        {sidebar === "templates" && <div className="empty-panel"><b>Starter composition</b><p>The active document is generated from the same typed project model used by playback.</p></div>}
      </aside>
    </>
  );
}

function Stage(): JSX.Element {
  const project = useDocumentStore((state) => state.project);
  const activeTool = useEditorStore((state) => state.activeTool);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const resetViewport = useEditorStore((state) => state.resetViewport);
  const scene = project.scenes[project.activeSceneId];
  return <section className="stage">
    <div className="stage-meta"><span>{scene.name}</span><span>{scene.width} × {scene.height} · {scene.fps} FPS</span></div>
    <div className="stage-tools"><button className={activeTool === "select" ? "active" : ""} onClick={() => setActiveTool("select")}>↖ Select</button><button className={activeTool === "hand" ? "active" : ""} onClick={() => setActiveTool("hand")}>✋ Hand</button><button onClick={resetViewport}>Fit</button></div>
    <PixiCanvas />
    <div className="stage-help">Drag, resize, and rotate directly. Hold Shift for 15° rotation snapping.</div>
  </section>;
}

function Field({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }): JSX.Element {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  useEffect(() => setDraft(String(Math.round(value * 100) / 100)), [value]);
  return <label><span>{label}</span><input type="number" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { const next = Number(draft); if (Number.isFinite(next)) onCommit(next); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

function Inspector(): JSX.Element {
  const project = useDocumentStore((state) => state.project);
  const selectedIds = useEditorStore((state) => state.selectedLayerIds);
  const tab = useEditorStore((state) => state.inspectorTab);
  const setTab = useEditorStore((state) => state.setInspectorTab);
  const selected = project.layers[selectedIds.at(-1) ?? ""];
  const scene = project.scenes[project.activeSceneId];

  const patch = (after: Partial<LayerDocument>, label: string): void => {
    if (!selected) return;
    commandManager.execute(createLayerPatchCommand(selected.id, {}, after, label));
  };
  const patchTransform = (key: "x" | "y" | "width" | "height" | "rotation", value: number): void => {
    if (!selected) return;
    const before = structuredClone(selected.transform);
    const after = structuredClone(before);
    if (key === "x" || key === "y") after.position[key] = value;
    else if (key === "width" || key === "height") after.size[key] = Math.max(1, value);
    else after.rotation = value;
    commandManager.execute(createLayerPatchCommand(selected.id, { transform: before } as Partial<LayerDocument>, { transform: after } as Partial<LayerDocument>, `Change ${key}`));
  };
  const addAnimation = (preset: (typeof presets)[number]): void => {
    if (!selected) return;
    const id = createId("action");
    const startTimeMs = preset.category === "out" ? Math.max(0, scene.durationMs - preset.durationMs) : 0;
    const action: AnimationActionDocument = { id, sceneId: scene.id, layerId: selected.id, category: preset.category, type: preset.type, startTimeMs, durationMs: preset.durationMs, easing: preset.category === "loop" ? "easeInOut" : "overshoot", parameters: preset.parameters, repeat: preset.category === "loop" ? { count: "infinite", delayMs: 0, alternate: true } : undefined, enabled: true };
    withHistory("Add animation", (next) => { next.animationActions[id] = action; next.layers[selected.id].animationActionIds.push(id); });
    useEditorStore.getState().selectAnimation(id);
  };

  return <aside className="inspector">
    <nav>{(["design", "animation", "export"] as InspectorTab[]).map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}</button>)}</nav>
    {!selected && tab !== "export" && <div className="empty-panel"><b>Select a layer</b><p>Choose a layer on the canvas or in the layer panel.</p></div>}
    {tab === "design" && selected && <div className="inspector-body">
      <h3>{selected.name}</h3>
      {selected.type === "text" && <><label><span>Content</span><textarea value={selected.content} onChange={(event) => patch({ content: event.target.value } as Partial<LayerDocument>, "Edit text")} /></label><Field label="Font size" value={selected.textStyle.fontSize} onCommit={(fontSize) => patch({ textStyle: { ...selected.textStyle, fontSize } } as Partial<LayerDocument>, "Change font size")} /></>}
      <div className="field-grid"><Field label="X" value={selected.transform.position.x} onCommit={(value) => patchTransform("x", value)} /><Field label="Y" value={selected.transform.position.y} onCommit={(value) => patchTransform("y", value)} /><Field label="Width" value={selected.transform.size.width} onCommit={(value) => patchTransform("width", value)} /><Field label="Height" value={selected.transform.size.height} onCommit={(value) => patchTransform("height", value)} /><Field label="Rotation" value={selected.transform.rotation} onCommit={(value) => patchTransform("rotation", value)} /><Field label="Opacity" value={selected.appearance.opacity} onCommit={(opacity) => patch({ appearance: { ...selected.appearance, opacity: Math.max(0, Math.min(1, opacity)) } } as Partial<LayerDocument>, "Change opacity")} /></div>
      <label><span>Fill</span><input type="color" value={selected.appearance.fill?.color ?? "#7c5cff"} onChange={(event) => patch({ appearance: { ...selected.appearance, fill: { color: event.target.value } } } as Partial<LayerDocument>, "Change fill")} /></label>
    </div>}
    {tab === "animation" && selected && <div className="inspector-body"><h3>Animation actions</h3><p className="muted-copy">Choose behavior instead of manually authoring keyframes.</p><div className="preset-list">{presets.map((preset) => <button key={preset.label} onClick={() => addAnimation(preset)}><b>{preset.label}</b><span>{preset.category}</span></button>)}</div><div className="action-list">{selected.animationActionIds.map((id) => { const action = project.animationActions[id]; return action ? <button key={id} onClick={() => useEditorStore.getState().selectAnimation(id)}>{action.type}<small>{action.startTimeMs}ms · {action.durationMs}ms</small></button> : null; })}</div></div>}
    {tab === "export" && <div className="inspector-body"><h3>Export pipeline</h3><div className="export-card"><b>Shared evaluator ready</b><p>Preview already runs through the deterministic frame evaluator. WebM/GIF/PNG worker encoding is the next milestone; the legacy Electron/Remotion exporter remains in the repository meanwhile.</p></div><button className="disabled-export" disabled>Render from shared evaluator</button></div>}
  </aside>;
}

interface DragState { actionId: string; mode: "move" | "resize"; startX: number; pixelsPerMs: number; before: AnimationActionDocument; }

function Timeline(): JSX.Element {
  const project = useDocumentStore((state) => state.project);
  const currentTimeMs = usePlaybackStore((state) => state.currentTimeMs);
  const status = usePlaybackStore((state) => state.status);
  const selectedAction = useEditorStore((state) => state.selectedAnimationId);
  const selectedLayers = useEditorStore((state) => state.selectedLayerIds);
  const selectAnimation = useEditorStore((state) => state.selectAnimation);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const scene = project.scenes[project.activeSceneId];
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent): void => {
      const delta = (event.clientX - drag.startX) / drag.pixelsPerMs;
      const frameMs = 1000 / scene.fps;
      const action = useDocumentStore.getState().project.animationActions[drag.actionId];
      if (!action) return;
      if (drag.mode === "move") {
        const startTimeMs = Math.round(Math.max(0, Math.min(scene.durationMs - action.durationMs, drag.before.startTimeMs + delta)) / frameMs) * frameMs;
        useDocumentStore.getState().patchAnimationAction(action.id, { startTimeMs });
      } else {
        const durationMs = Math.round(Math.max(frameMs, Math.min(scene.durationMs - action.startTimeMs, drag.before.durationMs + delta)) / frameMs) * frameMs;
        useDocumentStore.getState().patchAnimationAction(action.id, { durationMs });
      }
    };
    const up = (): void => {
      const action = useDocumentStore.getState().project.animationActions[drag.actionId];
      if (action) commandManager.commitExecuted(createAnimationPatchCommand(drag.actionId, drag.mode === "move" ? { startTimeMs: drag.before.startTimeMs } : { durationMs: drag.before.durationMs }, drag.mode === "move" ? { startTimeMs: action.startTimeMs } : { durationMs: action.durationMs }, drag.mode === "move" ? "Move animation" : "Resize animation"));
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, scene.durationMs, scene.fps]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>, action: AnimationActionDocument, mode: DragState["mode"]): void => {
    event.stopPropagation();
    const lane = event.currentTarget.closest(".timeline-lane");
    if (!(lane instanceof HTMLElement)) return;
    setDrag({ actionId: action.id, mode, startX: event.clientX, pixelsPerMs: lane.getBoundingClientRect().width / scene.durationMs, before: structuredClone(action) });
    selectAnimation(action.id);
    selectLayer(action.layerId);
  };

  return <section className="timeline">
    <header><div><button onClick={() => playbackController.toggle()}>{status === "playing" ? "❚❚" : "▶"}</button><button onClick={() => playbackController.stop()}>■</button><button onClick={() => playbackController.step(-1)}>‹</button><button onClick={() => playbackController.step(1)}>›</button><span>{(currentTimeMs / 1000).toFixed(2)} / {(scene.durationMs / 1000).toFixed(2)}s</span><small>Frame {timeToFrame(currentTimeMs, scene.fps)}</small></div><button disabled={!selectedAction} onClick={() => { if (!selectedAction) return; withHistory("Delete animation", (next) => { const action = next.animationActions[selectedAction]; if (!action) return; next.layers[action.layerId].animationActionIds = next.layers[action.layerId].animationActionIds.filter((id) => id !== selectedAction); delete next.animationActions[selectedAction]; }); selectAnimation(null); }}>Delete action</button></header>
    <div className="timeline-scroll">
      {[...scene.rootLayerIds].reverse().map((layerId) => { const layer = project.layers[layerId]; if (!layer) return null; return <div className="timeline-track" key={layerId}><button className={selectedLayers.includes(layerId) ? "selected" : ""} onClick={() => selectLayer(layerId)}>{layer.name}</button><div className="timeline-lane" onPointerDown={(event) => { if (event.target !== event.currentTarget) return; const rect = event.currentTarget.getBoundingClientRect(); playbackController.seek(((event.clientX - rect.left) / rect.width) * scene.durationMs); }}>{layer.animationActionIds.map((id) => { const action = project.animationActions[id]; if (!action) return null; return <div key={id} className={`timeline-action ${action.category} ${selectedAction === id ? "selected" : ""}`} style={{ left: `${(action.startTimeMs / scene.durationMs) * 100}%`, width: `${Math.max(1.5, (action.durationMs / scene.durationMs) * 100)}%` }} onPointerDown={(event) => startDrag(event, action, "move")}><span>{action.type}</span><i onPointerDown={(event) => startDrag(event, action, "resize")} /></div>; })}<div className="playhead" style={{ left: `${(currentTimeMs / scene.durationMs) * 100}%` }} /></div></div>; })}
    </div>
  </section>;
}

export function App(): JSX.Element {
  const project = useDocumentStore((state) => state.project);
  const replaceProject = useDocumentStore((state) => state.replaceProject);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const [ready, setReady] = useState(false);
  useAutosave();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await loadMostRecentProject();
        const restored = stored ?? migrateLegacyLocalProject();
        if (restored && !cancelled) replaceProject(restored);
        const active = restored ?? useDocumentStore.getState().project;
        if (!cancelled) selectLayer(active.scenes[active.activeSceneId].rootLayerIds[0] ?? null);
      } catch (error) {
        console.error("Unable to restore project", error);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [replaceProject, selectLayer]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      const editing = (event.target as HTMLElement | null)?.matches("input,textarea,select,[contenteditable='true']");
      if (event.code === "Space" && !editing) { event.preventDefault(); playbackController.toggle(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? commandManager.redo() : commandManager.undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); commandManager.redo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveProject(useDocumentStore.getState().project); }
      if ((event.key === "Delete" || event.key === "Backspace") && !editing) {
        const ids = useEditorStore.getState().selectedLayerIds;
        if (!ids.length) return;
        event.preventDefault();
        withHistory("Delete layers", (next) => ids.forEach((id) => { const layer = next.layers[id]; if (!layer) return; layer.animationActionIds.forEach((actionId) => delete next.animationActions[actionId]); next.scenes[layer.sceneId].rootLayerIds = next.scenes[layer.sceneId].rootLayerIds.filter((candidate) => candidate !== id); delete next.layers[id]; }));
        selectLayer(null);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [selectLayer]);

  const scene = project.scenes[project.activeSceneId];
  const title = useMemo(() => `${project.name} · ${scene.width}×${scene.height}`, [project.name, scene.height, scene.width]);
  if (!ready) return <main className="boot"><span>K</span><b>Loading Kurogi Motion</b><small>Preparing local project database…</small></main>;
  return <main className="editor-app" aria-label={title}><Toolbar /><section className="workspace"><LeftPanel /><Stage /><Inspector /></section><Timeline /></main>;
}

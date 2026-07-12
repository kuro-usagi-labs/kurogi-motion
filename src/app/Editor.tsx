import React, { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { MotionComposition } from "../MotionComposition";
import {
  addLayers,
  cloneProject,
  createAnimationAction,
  createAssetLayer,
  createId,
  createShapeLayer,
  createTextLayer,
  duplicateLayer,
  getActiveScene,
  getSceneLayers,
  removeLayer,
  reorderLayer,
  touchProject,
  updateAction,
  updateLayer,
} from "../core/project";
import { saveProject } from "../core/persistence";
import { useProjectHistory } from "../core/useProjectHistory";
import { Inspector, type InspectorTab } from "../editor/Inspector";
import { Timeline } from "../editor/Timeline";
import type {
  AnimationAction,
  AnimationCategory,
  AnimationType,
  ExportOptions,
  ExportProgress,
  KurogiProject,
  Layer,
  ProjectAsset,
  ShapeType,
} from "../types";

interface EditorProps {
  initialProject: KurogiProject;
  onExit: (project: KurogiProject) => void;
}

type SidebarTab = "layers" | "assets" | "text" | "shapes" | "templates";

const SIDEBAR_TABS: Array<{ id: SidebarTab; icon: string; label: string }> = [
  { id: "layers", icon: "▱", label: "Layers" },
  { id: "assets", icon: "◈", label: "Assets" },
  { id: "text", icon: "T", label: "Text" },
  { id: "shapes", icon: "◇", label: "Shapes" },
  { id: "templates", icon: "✦", label: "Templates" },
];

export function Editor({ initialProject, onExit }: EditorProps) {
  const history = useProjectHistory(initialProject);
  const { project } = history;
  const scene = getActiveScene(project);
  const layers = getSceneLayers(project);
  const [selectedLayerId, setSelectedLayerId] = useState(scene.layerIds.at(-1) ?? "");
  const [selectedActionId, setSelectedActionId] = useState("");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("layers");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("Design");
  const [zoom, setZoom] = useState(64);
  const [playing, setPlaying] = useState(false);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"Saving…" | "Saved" | "Offline" | "Save failed" | "Copied">("Saved");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: "mp4",
    fps: scene.fps as 24 | 30 | 60,
    scale: 1,
    quality: "high",
    transparent: scene.background.type === "transparent",
    gifLoops: null,
  });
  const playerRef = useRef<PlayerRef>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);

  const selectedLayer = selectedLayerId ? project.layers[selectedLayerId] ?? null : null;
  const selectedAction = useMemo(() => {
    if (!selectedActionId) return null;
    for (const layer of Object.values(project.layers)) {
      const action = layer.animationActions.find((candidate) => candidate.id === selectedActionId);
      if (action) return action;
    }
    return null;
  }, [project.layers, selectedActionId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
    };
  }, [project.id]);

  useEffect(() => {
    if (!project.settings.autoSave) return;
    setSaveStatus("Saving…");
    const timer = window.setTimeout(async () => {
      try {
        await saveProject(project);
        setSaveStatus(navigator.onLine ? "Saved" : "Offline");
      } catch {
        setSaveStatus("Save failed");
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    const handleOnline = () => setSaveStatus("Saved");
    const handleOffline = () => setSaveStatus("Offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const editable = isEditableTarget(event.target);
      const modifier = event.ctrlKey || event.metaKey;
      if (!editable && event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
      if (!editable && event.key === "ArrowLeft") {
        event.preventDefault();
        const current = playerRef.current?.getCurrentFrame() ?? 0;
        playerRef.current?.seekTo(Math.max(0, current - 1));
      }
      if (!editable && event.key === "ArrowRight") {
        event.preventDefault();
        const current = playerRef.current?.getCurrentFrame() ?? 0;
        playerRef.current?.seekTo(Math.min(scene.duration * scene.fps - 1, current + 1));
      }
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow();
      }
      if (!editable && modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
      }
      if (!editable && modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        history.redo();
      }
      if (!editable && modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        if (selectedActionId) duplicateAction(selectedActionId);
        else duplicateSelectedLayer();
      }
      if (!editable && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        if (selectedActionId) deleteAction(selectedActionId);
        else deleteSelectedLayer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    const unsubscribe = window.kurogi?.onExportProgress?.((progress) => setExportProgress(progress));
    return () => unsubscribe?.();
  }, []);

  function selectLayer(layerId: string) {
    setSelectedLayerId(layerId);
    if (!layerId || project.layers[layerId]?.animationActions.every((action) => action.id !== selectedActionId)) {
      setSelectedActionId("");
    }
  }

  function selectAction(layerId: string, actionId: string) {
    setSelectedLayerId(layerId);
    setSelectedActionId(actionId);
    setInspectorTab("Animation");
  }

  function commitProject(updater: (current: KurogiProject) => KurogiProject) {
    history.commit(updater);
  }

  function previewLayer(layerId: string, updater: (layer: Layer) => Layer) {
    history.preview((current) => updateLayer(current, layerId, updater));
  }

  function commitLayer(layerId: string, updater: (layer: Layer) => Layer) {
    commitProject((current) => updateLayer(current, layerId, updater));
  }

  function previewAction(
    layerId: string,
    actionId: string,
    updater: (action: AnimationAction) => AnimationAction,
  ) {
    history.preview((current) => updateAction(current, layerId, actionId, updater));
  }

  function commitAction(
    layerId: string,
    actionId: string,
    updater: (action: AnimationAction) => AnimationAction,
  ) {
    commitProject((current) => updateAction(current, layerId, actionId, updater));
  }

  function addText(preset: "heading" | "subheading" | "body" = "heading") {
    const currentScene = getActiveScene(project);
    const layer = createTextLayer(currentScene, {
      name: preset === "heading" ? "Heading" : preset === "subheading" ? "Subheading" : "Body text",
      text: preset === "heading" ? "YOUR IDEA" : preset === "subheading" ? "Add a supporting line" : "Write something worth moving.",
      size: preset === "heading" ? { width: 700, height: 150 } : { width: 620, height: 100 },
      fontSize: preset === "heading" ? 82 : preset === "subheading" ? 46 : 30,
    });
    layer.animationActions.push(
      createAnimationAction(layer.id, "in", preset === "heading" ? "moveIn" : "fadeIn", {
        duration: 0.6,
        easing: "easeOut",
      }),
    );
    commitProject((current) => addLayers(current, [layer]));
    setSelectedLayerId(layer.id);
    setSelectedActionId(layer.animationActions[0]?.id ?? "");
    setSidebarTab("layers");
    setInspectorTab("Design");
  }

  function addShape(shape: ShapeType) {
    const layer = createShapeLayer(getActiveScene(project), shape);
    layer.animationActions.push(
      createAnimationAction(layer.id, "in", "scaleIn", {
        duration: 0.6,
        easing: "backOut",
      }),
    );
    commitProject((current) => addLayers(current, [layer]));
    setSelectedLayerId(layer.id);
    setSelectedActionId(layer.animationActions[0]?.id ?? "");
    setSidebarTab("layers");
    setInspectorTab("Design");
  }

  async function importAsset(file?: File) {
    if (!file) return;
    const accepted = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!accepted.includes(file.type)) {
      window.alert("Use PNG, JPG, WebP, or SVG files.");
      return;
    }
    const maximum = file.type === "image/svg+xml" ? 10 : 20;
    if (file.size > maximum * 1024 * 1024) {
      window.alert(`This file is larger than ${maximum} MB.`);
      return;
    }

    try {
      const sourceUrl = file.type === "image/svg+xml"
        ? svgToDataUrl(sanitizeSvg(await file.text()))
        : await readFileAsDataUrl(file);
      const dimensions = await readImageDimensions(sourceUrl);
      const asset: ProjectAsset = {
        id: createId("asset"),
        projectId: project.id,
        name: file.name.replace(/\.[^.]+$/, ""),
        type: file.type === "image/svg+xml" ? "svg" : "image",
        mimeType: file.type,
        width: dimensions.width,
        height: dimensions.height,
        sourceUrl,
      };
      const layer = createAssetLayer(getActiveScene(project), asset);
      layer.animationActions.push(
        createAnimationAction(layer.id, "in", "scaleIn", {
          duration: 0.65,
          easing: "backOut",
        }),
      );
      commitProject((current) => {
        const next = cloneProject(current);
        next.assets[asset.id] = asset;
        return addLayers(next, [layer]);
      });
      setSelectedLayerId(layer.id);
      setSelectedActionId(layer.animationActions[0]?.id ?? "");
      setSidebarTab("layers");
    } catch {
      window.alert("The asset could not be imported.");
    }
  }

  function addExistingAsset(assetId: string) {
    const asset = project.assets[assetId];
    if (!asset) return;
    const layer = createAssetLayer(scene, asset);
    commitProject((current) => addLayers(current, [layer]));
    setSelectedLayerId(layer.id);
    setSidebarTab("layers");
  }

  function deleteSelectedLayer() {
    if (!selectedLayerId) return;
    const ids = scene.layerIds.filter((id) => id !== selectedLayerId);
    commitProject((current) => removeLayer(current, selectedLayerId));
    setSelectedLayerId(ids.at(-1) ?? "");
    setSelectedActionId("");
  }

  function duplicateSelectedLayer() {
    if (!selectedLayerId) return;
    commitProject((current) => {
      const result = duplicateLayer(current, selectedLayerId);
      window.queueMicrotask(() => setSelectedLayerId(result.layerId));
      return result.project;
    });
    setSelectedActionId("");
  }

  function renameLayer(layerId: string, name: string) {
    const clean = name.trim();
    if (!clean) return;
    commitLayer(layerId, (layer) => ({ ...layer, name: clean }));
  }

  function addAction(category: AnimationCategory, type: AnimationType) {
    if (!selectedLayer) return;
    const defaultStart = category === "out"
      ? Math.max(0, scene.duration - 0.65)
      : category === "loop"
        ? Math.min(0.8, scene.duration * 0.2)
        : 0;
    const action = createAnimationAction(selectedLayer.id, category, type, {
      startTime: defaultStart,
      duration: category === "loop" ? Math.min(1.5, scene.duration) : 0.65,
    });
    commitLayer(selectedLayer.id, (layer) => ({
      ...layer,
      animationActions: [...layer.animationActions, action],
    }));
    setSelectedActionId(action.id);
    setInspectorTab("Animation");
  }

  function deleteAction(actionId: string) {
    const owner = findActionOwner(project, actionId);
    if (!owner) return;
    commitLayer(owner.id, (layer) => ({
      ...layer,
      animationActions: layer.animationActions.filter((action) => action.id !== actionId),
    }));
    setSelectedActionId("");
  }

  function duplicateAction(actionId: string) {
    const owner = findActionOwner(project, actionId);
    const action = owner?.animationActions.find((candidate) => candidate.id === actionId);
    if (!owner || !action) return;
    const copy: AnimationAction = {
      ...cloneProject(action),
      id: createId("action"),
      startTime: clamp(action.startTime + 0.12, 0, Math.max(0, scene.duration - action.duration)),
    };
    commitLayer(owner.id, (layer) => ({
      ...layer,
      animationActions: [...layer.animationActions, copy],
    }));
    setSelectedLayerId(owner.id);
    setSelectedActionId(copy.id);
  }

  function commitTimelineAction(
    layerId: string,
    actionId: string,
    patch: Partial<Pick<AnimationAction, "startTime" | "duration">>,
  ) {
    commitAction(layerId, actionId, (action) => ({ ...action, ...patch }));
  }

  function commitTransform(layerId: string, patch: Partial<Layer>) {
    commitLayer(layerId, (layer) => ({ ...layer, ...patch } as Layer));
  }

  function commitText(layerId: string, text: string) {
    commitLayer(layerId, (layer) => layer.type === "text" ? { ...layer, text } : layer);
  }

  function togglePlay() {
    if (playing) playerRef.current?.pause();
    else playerRef.current?.play();
  }

  async function saveNow() {
    setSaveStatus("Saving…");
    try {
      await saveProject(project);
      setSaveStatus(navigator.onLine ? "Saved" : "Offline");
    } catch {
      setSaveStatus("Save failed");
    }
  }

  async function leaveEditor() {
    await saveNow();
    onExit(history.projectRef.current);
  }

  async function copyProjectSnapshot() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(project, null, 2));
      setSaveStatus("Copied");
      window.setTimeout(() => setSaveStatus("Saved"), 1200);
    } catch {
      window.alert("Project data could not be copied.");
    }
  }

  async function exportVideo() {
    if (!window.kurogi) {
      window.alert("Open the Electron app to export video files.");
      return;
    }
    const snapshot = cloneProject(project);
    const snapshotScene = getActiveScene(snapshot);
    snapshotScene.fps = exportOptions.fps;
    if (exportOptions.transparent) snapshotScene.background = { type: "transparent" };
    setExporting(true);
    setExportProgress({ phase: "preparing", progress: 0, message: "Preparing export" });
    try {
      const result = await window.kurogi.exportVideo(snapshot, exportOptions);
      if (!result.canceled && result.path) {
        setExportProgress({ phase: "completed", progress: 1, message: result.path });
      } else {
        setExportProgress(null);
      }
    } catch (error) {
      setExportProgress({
        phase: "failed",
        progress: 0,
        message: error instanceof Error ? error.message : "Export failed",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="app editor-app">
      <input
        ref={assetInputRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(event) => {
          void importAsset(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <header className="toolbar editor-toolbar">
        <button type="button" className="toolbar-brand-button" onClick={() => void leaveEditor()} title="Back to projects">
          <div className="brand"><span className="brand-mark">K</span><span>kurogi<span className="muted">motion</span></span></div>
        </button>
        <div className="project-name">
          <strong>{project.name}</strong>
          <span className={`save-dot status-${saveStatus.toLowerCase().replace(/\W/g, "-")}`}>● {saveStatus}</span>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="icon-btn" disabled={!history.canUndo} onClick={history.undo} title="Undo">↶</button>
          <button type="button" className="icon-btn" disabled={!history.canRedo} onClick={history.redo} title="Redo">↷</button>
          <span className="toolbar-divider" />
          <button type="button" className="icon-btn" onClick={() => setZoom((value) => Math.max(25, value - 10))}>−</button>
          <span className="zoom">{zoom}%</span>
          <button type="button" className="icon-btn" onClick={() => setZoom((value) => Math.min(150, value + 10))}>+</button>
          <button type="button" className={showSafeArea ? "icon-btn active" : "icon-btn"} onClick={() => setShowSafeArea((value) => !value)} title="Toggle safe area">▣</button>
          <button type="button" className="preview" onClick={togglePlay}>{playing ? "❚❚ Pause" : "▶ Preview"}</button>
          <button type="button" className="share-button" onClick={() => void copyProjectSnapshot()}>Share</button>
          <button type="button" className="export" onClick={() => setInspectorTab("Export")}>Export <span>↗</span></button>
        </div>
      </header>

      <section className="workspace editor-workspace">
        <aside className="rail">
          {SIDEBAR_TABS.map((item) => (
            <button type="button" key={item.id} className={sidebarTab === item.id ? "rail-active" : ""} onClick={() => setSidebarTab(item.id)}>
              <b>{item.icon}</b><span>{item.label}</span>
            </button>
          ))}
          <div className="rail-bottom"><button type="button"><b>?</b><span>Help</span></button><div className="avatar">KM</div></div>
        </aside>

        <aside className="sidebar editor-sidebar">
          <div className="panel-title"><span>{SIDEBAR_TABS.find((item) => item.id === sidebarTab)?.label}</span>{sidebarTab === "assets" ? <button type="button" onClick={() => assetInputRef.current?.click()}>＋</button> : null}</div>
          {sidebarTab === "layers" ? (
            <div className="sidebar-scroll">
              <div className="scene-row"><span>⌄</span><b>{scene.name}</b><small>{scene.width} × {scene.height}</small></div>
              <div className="layer-list">
                {[...layers].reverse().map((layer) => (
                  <div key={layer.id} className={`layer-row ${selectedLayerId === layer.id ? "selected" : ""}`} onClick={() => selectLayer(layer.id)}>
                    <span className={`layer-thumb ${layer.type}`}>{layer.type === "text" ? "T" : layer.type === "shape" ? "●" : "◇"}</span>
                    <input
                      className="layer-name-editor"
                      value={layer.name}
                      onClick={(event) => event.stopPropagation()}
                      onFocus={() => {
                        selectLayer(layer.id);
                        history.beginGesture();
                      }}
                      onChange={(event) => history.preview((current) => updateLayer(current, layer.id, (candidate) => ({ ...candidate, name: event.currentTarget.value })))}
                      onBlur={(event) => {
                        const cleanName = event.currentTarget.value.trim();
                        if (!cleanName) {
                          history.cancelGesture();
                          return;
                        }
                        if (cleanName !== event.currentTarget.value) {
                          history.preview((current) => updateLayer(current, layer.id, (candidate) => ({ ...candidate, name: cleanName })));
                        }
                        history.finishGesture();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") {
                          event.preventDefault();
                          history.cancelGesture();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <button type="button" className="layer-state" onClick={(event) => { event.stopPropagation(); commitLayer(layer.id, (candidate) => ({ ...candidate, visible: !candidate.visible })); }} title={layer.visible ? "Hide" : "Show"}>{layer.visible ? "◉" : "◌"}</button>
                    <button type="button" className="layer-state" onClick={(event) => { event.stopPropagation(); commitLayer(layer.id, (candidate) => ({ ...candidate, locked: !candidate.locked })); }} title={layer.locked ? "Unlock" : "Lock"}>{layer.locked ? "▣" : "▢"}</button>
                    <div className="layer-order-actions">
                      <button type="button" onClick={(event) => { event.stopPropagation(); commitProject((current) => reorderLayer(current, layer.id, "up")); }} title="Move up">↑</button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); commitProject((current) => reorderLayer(current, layer.id, "down")); }} title="Move down">↓</button>
                    </div>
                  </div>
                ))}
              </div>
              {selectedLayer ? (
                <div className="sidebar-selection-actions">
                  <button type="button" onClick={duplicateSelectedLayer}>Duplicate</button>
                  <button type="button" className="danger-text" onClick={deleteSelectedLayer}>Delete</button>
                </div>
              ) : null}
            </div>
          ) : null}
          {sidebarTab === "text" ? (
            <div className="add-grid text-presets">
              <button type="button" onClick={() => addText("heading")}><strong>H</strong><span>Heading</span></button>
              <button type="button" onClick={() => addText("subheading")}><strong>Aa</strong><span>Subheading</span></button>
              <button type="button" onClick={() => addText("body")}><strong>¶</strong><span>Body text</span></button>
            </div>
          ) : null}
          {sidebarTab === "shapes" ? (
            <div className="add-grid shape-presets">
              {(["rectangle", "circle", "line", "polygon", "arrow"] as const).map((shape) => (
                <button type="button" key={shape} onClick={() => addShape(shape)}><strong>{shape === "rectangle" ? "■" : shape === "circle" ? "●" : shape === "line" ? "━" : shape === "polygon" ? "⬟" : "➜"}</strong><span>{shape.charAt(0).toUpperCase() + shape.slice(1)}</span></button>
              ))}
            </div>
          ) : null}
          {sidebarTab === "assets" ? (
            <div className="assets-panel sidebar-scroll">
              <button type="button" className="asset-dropzone" onClick={() => assetInputRef.current?.click()}><span>↑</span><strong>Import an asset</strong><small>PNG, JPG, WebP, or sanitized SVG</small></button>
              <div className="asset-grid">
                {Object.values(project.assets).map((asset) => (
                  <button type="button" key={asset.id} onClick={() => addExistingAsset(asset.id)}><img src={asset.thumbnailUrl ?? asset.sourceUrl} alt="" /><span>{asset.name}</span></button>
                ))}
              </div>
            </div>
          ) : null}
          {sidebarTab === "templates" ? (
            <div className="template-sidebar sidebar-scroll">
              <div className="template-card"><div className="mini-canvas">MOVE</div><b>Editable templates</b><span>Create templates from the project dashboard to preserve your current work.</span></div>
            </div>
          ) : null}
        </aside>

        <section className="stage editor-stage">
          <div className="stage-top"><span>{scene.name}</span><span>{scene.width} × {scene.height} · {scene.fps} FPS</span></div>
          <div className="canvas-wrap" style={{ width: `${zoom}%`, aspectRatio: `${scene.width}/${scene.height}` }}>
            <Player
              ref={playerRef}
              component={MotionComposition}
              inputProps={{
                project,
                selectedId: selectedLayerId,
                onSelect: selectLayer,
                onTransformCommit: commitTransform,
                onTextCommit: commitText,
                editable: true,
                showSelection: !playing,
                showSafeArea,
              }}
              durationInFrames={Math.max(1, Math.round(scene.duration * scene.fps))}
              compositionWidth={scene.width}
              compositionHeight={scene.height}
              fps={scene.fps}
              controls={false}
              autoPlay={false}
              loop
              style={{ width: "100%", height: "100%" }}
            />
          </div>
          <div className="stage-hint">Double-click text to edit · Drag handles to resize or rotate · <kbd>Space</kbd> to play</div>
        </section>

        <Inspector
          project={project}
          selectedLayer={selectedLayer}
          selectedAction={selectedAction}
          tab={inspectorTab}
          onTabChange={setInspectorTab}
          onBeginPropertyEdit={history.beginGesture}
          onFinishPropertyEdit={history.finishGesture}
          onCancelPropertyEdit={history.cancelGesture}
          onPreviewLayer={previewLayer}
          onCommitLayer={commitLayer}
          onPreviewAction={previewAction}
          onCommitAction={commitAction}
          onAddAction={addAction}
          onSelectAction={setSelectedActionId}
          onDeleteAction={deleteAction}
          onDuplicateAction={duplicateAction}
          exportOptions={exportOptions}
          onExportOptionsChange={setExportOptions}
          exporting={exporting}
          exportProgress={exportProgress}
          onExport={() => void exportVideo()}
        />
      </section>

      <Timeline
        project={project}
        playerRef={playerRef}
        selectedLayerId={selectedLayerId}
        selectedActionId={selectedActionId}
        onSelectLayer={selectLayer}
        onSelectAction={selectAction}
        onCommitAction={commitTimelineAction}
        onDeleteAction={deleteAction}
        onDuplicateAction={duplicateAction}
      />
    </main>
  );
}

function findActionOwner(project: KurogiProject, actionId: string) {
  return Object.values(project.layers).find((layer) =>
    layer.animationActions.some((action) => action.id === actionId),
  );
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(sourceUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 600, height: image.naturalHeight || 400 });
    image.onerror = () => reject(new Error("Asset dimensions could not be read."));
    image.src = sourceUrl;
  });
}

function sanitizeSvg(source: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror")) throw new Error("Invalid SVG file.");
  document.querySelectorAll("script, foreignObject, iframe, object, embed").forEach((node) => node.remove());
  document.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) node.removeAttribute(attribute.name);
      if ((name === "href" || name.endsWith(":href")) && /^(https?:|file:)/.test(value)) node.removeAttribute(attribute.name);
    }
  });
  return new XMLSerializer().serializeToString(document.documentElement);
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

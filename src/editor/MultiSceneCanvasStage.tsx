import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { MotionComposition } from "../MotionComposition";
import {
  getSceneWorkspaceBounds,
  getSceneWorkspacePosition,
  type SceneUpdatePatch,
  type SceneWorkspacePosition,
} from "../core/sceneWorkspace";
import type { KurogiProject, Layer } from "../types";
import { Icon } from "../ui/Icon";
import { normalizeWheelDelta, panForZoomAnchor, zoomFromWheel } from "./canvasMath";

interface MultiSceneCanvasStageProps {
  project: KurogiProject;
  playerRef: React.RefObject<PlayerRef>;
  selectedLayerId: string;
  zoom: number;
  playing: boolean;
  showSafeArea: boolean;
  onSelect: (id: string) => void;
  onTransformCommit: (id: string, patch: Partial<Layer>) => void;
  onTextCommit: (id: string, text: string) => void;
  onZoomChange?: (zoom: number) => void;
  onReplaceAsset?: (layerId: string, file: File) => void;
  onDuplicateLayer?: (layerId: string) => void;
  onDeleteLayer?: (layerId: string) => void;
  onActivateScene: (sceneId: string) => void;
  onCreateScene: () => void;
  onDuplicateScene: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onRenameScene: (sceneId: string, name: string) => void;
  onUpdateScene: (sceneId: string, patch: SceneUpdatePatch) => void;
  onMoveScene: (sceneId: string, position: SceneWorkspacePosition) => void;
  onCopyLayerToScene: (layerId: string, sceneId: string) => void;
}

type PanGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type SceneMoveGesture = {
  pointerId: number;
  sceneId: string;
  startX: number;
  startY: number;
  origin: SceneWorkspacePosition;
};

type SceneSettingsDraft = {
  name: string;
  width: string;
  height: string;
  duration: string;
  fps: "24" | "30" | "60";
  transparent: boolean;
  color: string;
};

export function MultiSceneCanvasStage({
  project,
  playerRef,
  selectedLayerId,
  zoom,
  playing: _playing,
  showSafeArea,
  onSelect,
  onTransformCommit,
  onTextCommit,
  onZoomChange,
  onReplaceAsset,
  onDuplicateLayer,
  onDeleteLayer,
  onActivateScene,
  onCreateScene,
  onDuplicateScene,
  onDeleteScene,
  onRenameScene,
  onUpdateScene,
  onMoveScene,
  onCopyLayerToScene,
}: MultiSceneCanvasStageProps) {
  const activeScene = project.scenes[project.activeSceneId] ?? Object.values(project.scenes)[0];
  const scenes = Object.values(project.scenes);
  const selectedLayer = selectedLayerId ? project.layers[selectedLayerId] ?? null : null;
  const stageRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const panGestureRef = useRef<PanGesture | null>(null);
  const sceneMoveRef = useRef<SceneMoveGesture | null>(null);
  const spacePressedRef = useRef(false);
  const callbacksRef = useRef({ onSelect, onTransformCommit, onTextCommit });
  const zoomChangeRef = useRef(onZoomChange);
  const zoomRef = useRef(zoom);
  const panRef = useRef({ x: 0, y: 0 });
  const initialFitRef = useRef("");
  callbacksRef.current = { onSelect, onTransformCommit, onTextCommit };
  zoomChangeRef.current = onZoomChange;

  const [available, setAvailable] = useState({ width: 900, height: 600 });
  const [viewZoom, setViewZoom] = useState(zoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [draftPositions, setDraftPositions] = useState<Record<string, SceneWorkspacePosition>>({});
  const [copyTarget, setCopyTarget] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<SceneSettingsDraft>(() => sceneSettingsFrom(activeScene));

  useEffect(() => {
    zoomRef.current = zoom;
    setViewZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    setSettingsDraft(sceneSettingsFrom(activeScene));
    setSettingsOpen(false);
    const nextTarget = scenes.find((scene) => scene.id !== activeScene?.id)?.id ?? "";
    setCopyTarget((current) => current && current !== activeScene?.id && project.scenes[current] ? current : nextTarget);
  }, [activeScene?.id, project.scenes]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      setAvailable({
        width: Math.max(320, rect.width),
        height: Math.max(240, rect.height - 48),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isEditableTarget(event.target)) return;
      spacePressedRef.current = true;
      setSpacePressed(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spacePressedRef.current = false;
      setSpacePressed(false);
    };
    const onBlur = () => {
      spacePressedRef.current = false;
      setSpacePressed(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setContextMenu(null);
      if (event.ctrlKey || event.metaKey) {
        const rect = viewport.getBoundingClientRect();
        const currentZoom = zoomRef.current;
        const delta = normalizeWheelDelta(event.deltaY, event.deltaMode);
        const nextZoom = clamp(zoomFromWheel(currentZoom, delta), 5, 250);
        if (Math.abs(nextZoom - currentZoom) < 0.01) return;
        const pointerFromViewportCenter = {
          x: event.clientX - rect.left - rect.width / 2,
          y: event.clientY - rect.top - rect.height / 2,
        };
        const nextPan = panForZoomAnchor(
          panRef.current,
          pointerFromViewportCenter,
          currentZoom,
          nextZoom,
        );
        setView(nextZoom, nextPan);
        return;
      }
      updatePan({
        x: panRef.current.x - event.deltaX,
        y: panRef.current.y - event.deltaY,
      });
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const signature = `${project.id}:${scenes.map((scene) => scene.id).join("|")}:${available.width}x${available.height}`;
    if (initialFitRef.current === signature) return;
    initialFitRef.current = signature;
    const frame = window.requestAnimationFrame(() => fitAllScenes());
    return () => window.cancelAnimationFrame(frame);
  }, [available.height, available.width, project.id, scenes.length]);

  const stableSelect = useCallback((id: string) => callbacksRef.current.onSelect(id), []);
  const stableTransformCommit = useCallback(
    (id: string, patch: Partial<Layer>) => callbacksRef.current.onTransformCommit(id, patch),
    [],
  );
  const stableTextCommit = useCallback(
    (id: string, text: string) => callbacksRef.current.onTextCommit(id, text),
    [],
  );

  const activePlayerInputProps = useMemo(
    () => ({
      project,
      selectedId: selectedLayerId,
      onSelect: stableSelect,
      onTransformCommit: stableTransformCommit,
      onTextCommit: stableTextCommit,
      editable: true,
      showSelection: true,
      showSafeArea,
    }),
    [project, selectedLayerId, showSafeArea, stableSelect, stableTextCommit, stableTransformCommit],
  );

  if (!activeScene) return null;

  const viewScale = clamp(viewZoom / 100, 0.05, 2.5);
  const imageLayer = selectedLayer?.type === "image" ? selectedLayer : null;

  function updatePan(next: { x: number; y: number }) {
    panRef.current = next;
    setPan(next);
  }

  function setView(nextZoom: number, nextPan: { x: number; y: number }) {
    zoomRef.current = nextZoom;
    panRef.current = nextPan;
    setViewZoom(nextZoom);
    setPan(nextPan);
    zoomChangeRef.current?.(nextZoom);
  }

  function beginPan(event: React.PointerEvent<HTMLElement>) {
    const panWithMouse = event.button === 1 || (event.button === 0 && spacePressedRef.current);
    if (!panWithMouse || sceneMoveRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const currentPan = panRef.current;
    panGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: currentPan.x,
      originY: currentPan.y,
    };
    setPanning(true);
    setContextMenu(null);
  }

  function movePointer(event: React.PointerEvent<HTMLElement>) {
    const sceneGesture = sceneMoveRef.current;
    if (sceneGesture?.pointerId === event.pointerId) {
      const scale = clamp(zoomRef.current / 100, 0.05, 2.5);
      const position = {
        x: sceneGesture.origin.x + (event.clientX - sceneGesture.startX) / scale,
        y: sceneGesture.origin.y + (event.clientY - sceneGesture.startY) / scale,
      };
      setDraftPositions((current) => ({ ...current, [sceneGesture.sceneId]: position }));
      return;
    }
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    updatePan({
      x: gesture.originX + event.clientX - gesture.startX,
      y: gesture.originY + event.clientY - gesture.startY,
    });
  }

  function finishPointer(event: React.PointerEvent<HTMLElement>) {
    const sceneGesture = sceneMoveRef.current;
    if (sceneGesture?.pointerId === event.pointerId) {
      sceneMoveRef.current = null;
      const final = draftPositions[sceneGesture.sceneId] ?? sceneGesture.origin;
      setDraftPositions((current) => {
        const next = { ...current };
        delete next[sceneGesture.sceneId];
        return next;
      });
      onMoveScene(sceneGesture.sceneId, final);
    }
    const gesture = panGestureRef.current;
    if (gesture?.pointerId === event.pointerId) {
      panGestureRef.current = null;
      setPanning(false);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function beginSceneMove(event: React.PointerEvent<HTMLDivElement>, sceneId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onActivateScene(sceneId);
    event.currentTarget.setPointerCapture(event.pointerId);
    const scene = project.scenes[sceneId];
    const origin = draftPositions[sceneId] ?? getSceneWorkspacePosition(scene);
    sceneMoveRef.current = {
      pointerId: event.pointerId,
      sceneId,
      startX: event.clientX,
      startY: event.clientY,
      origin,
    };
  }

  function fitAllScenes() {
    const bounds = getSceneWorkspaceBounds(project);
    const horizontalPadding = 160;
    const verticalPadding = 180;
    const scale = clamp(
      Math.min(
        (available.width - horizontalPadding) / Math.max(1, bounds.width),
        (available.height - verticalPadding) / Math.max(1, bounds.height),
      ),
      0.05,
      2.5,
    );
    const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    setView(scale * 100, { x: -center.x * scale, y: -center.y * scale });
  }

  function focusScene(sceneId: string) {
    const scene = project.scenes[sceneId];
    if (!scene) return;
    const position = draftPositions[sceneId] ?? getSceneWorkspacePosition(scene);
    const scale = clamp(
      Math.min(
        (available.width - 180) / Math.max(1, scene.width),
        (available.height - 180) / Math.max(1, scene.height),
      ),
      0.05,
      2.5,
    );
    const center = { x: position.x + scene.width / 2, y: position.y + scene.height / 2 };
    setView(scale * 100, { x: -center.x * scale, y: -center.y * scale });
  }

  function openContextMenu(event: React.MouseEvent<HTMLElement>) {
    if (!selectedLayer || (selectedLayer.type !== "image" && selectedLayer.type !== "svg")) return;
    event.preventDefault();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setContextMenu({
      x: Math.max(8, Math.min(rect.width - 220, event.clientX - rect.left)),
      y: Math.max(56, Math.min(rect.height - 250, event.clientY - rect.top)),
    });
  }

  function saveSceneSettings(event: React.FormEvent) {
    event.preventDefault();
    onUpdateScene(activeScene.id, {
      name: settingsDraft.name,
      width: Number(settingsDraft.width),
      height: Number(settingsDraft.height),
      duration: Number(settingsDraft.duration),
      fps: Number(settingsDraft.fps),
      background: settingsDraft.transparent
        ? { type: "transparent" }
        : { type: "solid", color: settingsDraft.color || "#ffffff" },
    });
    setSettingsOpen(false);
  }

  return (
    <section
      className={`stage editor-stage multi-scene-stage ${panning || spacePressed ? "is-panning" : ""}`}
      ref={stageRef}
      onPointerDownCapture={beginPan}
      onPointerMove={movePointer}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onContextMenu={openContextMenu}
      onAuxClick={(event) => event.preventDefault()}
      onMouseDown={() => contextMenu && setContextMenu(null)}
    >
      <input
        ref={replaceInputRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file && selectedLayerId) onReplaceAsset?.(selectedLayerId, file);
          event.currentTarget.value = "";
          setContextMenu(null);
        }}
      />

      <div className="multi-scene-toolbar">
        <div className="scene-toolbar-primary">
          <button type="button" onClick={onCreateScene} title="Create scene"><Icon name="plus" size={15} />Scene</button>
          <button type="button" onClick={() => onDuplicateScene(activeScene.id)} title="Duplicate active scene"><Icon name="copy" size={15} />Duplicate</button>
          <button type="button" disabled={scenes.length <= 1} onClick={() => onDeleteScene(activeScene.id)} title="Delete active scene"><Icon name="trash" size={15} /></button>
          <span className="scene-toolbar-divider" />
          <input
            className="scene-name-input"
            value={settingsDraft.name}
            aria-label="Scene name"
            onChange={(event) => setSettingsDraft((current) => ({ ...current, name: event.target.value }))}
            onBlur={() => onRenameScene(activeScene.id, settingsDraft.name)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <button type="button" className={settingsOpen ? "active" : ""} onClick={() => setSettingsOpen((value) => !value)} title="Scene settings"><Icon name="settings" size={15} /></button>
        </div>

        <div className="scene-toolbar-secondary">
          {selectedLayerId && scenes.length > 1 ? (
            <div className="copy-scene-control">
              <span>Copy selected to</span>
              <select value={copyTarget} onChange={(event) => setCopyTarget(event.target.value)}>
                {scenes.filter((scene) => scene.id !== activeScene.id).map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
              </select>
              <button type="button" disabled={!copyTarget} onClick={() => copyTarget && onCopyLayerToScene(selectedLayerId, copyTarget)}><Icon name="copy" size={14} />Copy</button>
            </div>
          ) : null}
          <button type="button" onClick={fitAllScenes} title="Fit all scenes"><Icon name="frame" size={15} />Fit all</button>
          <button type="button" onClick={() => focusScene(activeScene.id)} title="Focus active scene">Focus</button>
          <button type="button" onClick={() => setView(clamp(viewZoom - 10, 5, 250), panRef.current)} title="Zoom out"><Icon name="minus" size={14} /></button>
          <span className="workspace-zoom-label">{Math.round(viewZoom)}%</span>
          <button type="button" onClick={() => setView(clamp(viewZoom + 10, 5, 250), panRef.current)} title="Zoom in"><Icon name="plus" size={14} /></button>
        </div>
      </div>

      {settingsOpen ? (
        <form className="scene-settings-popover" onSubmit={saveSceneSettings} onPointerDown={(event) => event.stopPropagation()}>
          <strong>Scene settings</strong>
          <label>Name<input value={settingsDraft.name} onChange={(event) => setSettingsDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <div className="scene-settings-grid">
            <label>Width<input type="number" min="64" max="7680" value={settingsDraft.width} onChange={(event) => setSettingsDraft((current) => ({ ...current, width: event.target.value }))} /></label>
            <label>Height<input type="number" min="64" max="7680" value={settingsDraft.height} onChange={(event) => setSettingsDraft((current) => ({ ...current, height: event.target.value }))} /></label>
            <label>Duration<input type="number" min="0.1" max="3600" step="0.1" value={settingsDraft.duration} onChange={(event) => setSettingsDraft((current) => ({ ...current, duration: event.target.value }))} /></label>
            <label>FPS<select value={settingsDraft.fps} onChange={(event) => setSettingsDraft((current) => ({ ...current, fps: event.target.value as SceneSettingsDraft["fps"] }))}><option value="24">24</option><option value="30">30</option><option value="60">60</option></select></label>
          </div>
          <label className="scene-transparency-toggle"><input type="checkbox" checked={settingsDraft.transparent} onChange={(event) => setSettingsDraft((current) => ({ ...current, transparent: event.target.checked }))} />Transparent background</label>
          {!settingsDraft.transparent ? <label>Background<input type="color" value={settingsDraft.color} onChange={(event) => setSettingsDraft((current) => ({ ...current, color: event.target.value }))} /></label> : null}
          <div className="scene-settings-actions"><button type="button" onClick={() => setSettingsOpen(false)}>Cancel</button><button type="submit" className="primary">Apply</button></div>
        </form>
      ) : null}

      <div className="multi-scene-viewport" ref={viewportRef} data-canvas-viewport="true">
        <div className="workspace-pan-shell" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0)` }}>
          <div className="workspace-scale-shell" style={{ transform: `scale(${viewScale})` }}>
            {scenes.map((scene) => {
              const active = scene.id === activeScene.id;
              const position = draftPositions[scene.id] ?? getSceneWorkspacePosition(scene);
              const previewProject = active ? project : { ...project, activeSceneId: scene.id };
              const previewInputProps = active
                ? activePlayerInputProps
                : { project: previewProject, editable: false, showSelection: false, showSafeArea: false };
              return (
                <article
                  key={scene.id}
                  className={`workspace-artboard ${active ? "is-active" : ""}`}
                  style={{ left: position.x, top: position.y, width: scene.width, height: scene.height }}
                  onPointerDown={() => { if (!active) onActivateScene(scene.id); }}
                >
                  <div className="workspace-artboard-label" onPointerDown={(event) => beginSceneMove(event, scene.id)}>
                    <span><strong>{scene.name}</strong><small>{scene.width} × {scene.height} · {scene.duration}s</small></span>
                    <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); focusScene(scene.id); }} title="Focus scene"><Icon name="frame" size={13} /></button>
                  </div>
                  <div className="workspace-artboard-canvas">
                    <Player
                      key={`${scene.id}:${active ? "active" : "preview"}`}
                      ref={active ? playerRef : undefined}
                      component={MotionComposition}
                      inputProps={previewInputProps}
                      durationInFrames={Math.max(1, Math.round(scene.duration * scene.fps))}
                      compositionWidth={scene.width}
                      compositionHeight={scene.height}
                      fps={scene.fps}
                      controls={false}
                      autoPlay={false}
                      loop
                      style={{ width: scene.width, height: scene.height }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <div className="workspace-help">Middle-drag or hold Space to pan · Ctrl/Cmd + wheel to zoom · Drag a scene label to rearrange</div>

      {contextMenu ? (
        <div className="asset-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={(event) => event.stopPropagation()}>
          <strong>{selectedLayer?.name}</strong>
          <button type="button" onClick={() => replaceInputRef.current?.click()}><Icon name="upload" size={15} />Replace asset</button>
          {imageLayer ? (
            <>
              <button type="button" onClick={() => { onTransformCommit(imageLayer.id, { fit: "cover" } as Partial<Layer>); setContextMenu(null); }}><Icon name="frame" size={15} />Crop to fill</button>
              <button type="button" onClick={() => { onTransformCommit(imageLayer.id, { fit: "contain" } as Partial<Layer>); setContextMenu(null); }}><Icon name="assets" size={15} />Fit inside</button>
              <button type="button" onClick={() => { onTransformCommit(imageLayer.id, { fit: "fill" } as Partial<Layer>); setContextMenu(null); }}><Icon name="shapes" size={15} />Stretch to frame</button>
            </>
          ) : null}
          <span />
          <button type="button" onClick={() => { onDuplicateLayer?.(selectedLayerId); setContextMenu(null); }}><Icon name="copy" size={15} />Duplicate</button>
          <button type="button" className="danger-text" onClick={() => { onDeleteLayer?.(selectedLayerId); setContextMenu(null); }}><Icon name="trash" size={15} />Delete</button>
        </div>
      ) : null}
    </section>
  );
}

function sceneSettingsFrom(scene: KurogiProject["scenes"][string] | undefined): SceneSettingsDraft {
  return {
    name: scene?.name ?? "Scene",
    width: String(scene?.width ?? 1080),
    height: String(scene?.height ?? 1080),
    duration: String(scene?.duration ?? 5),
    fps: String(scene?.fps ?? 30) as SceneSettingsDraft["fps"],
    transparent: scene?.background.type === "transparent",
    color: scene?.background.color ?? "#ffffff",
  };
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT"
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { MotionComposition } from "../MotionComposition";
import {
  getSceneWorkspaceBounds,
  getSceneWorkspacePosition,
  type SceneUpdatePatch,
  type SceneWorkspacePosition,
} from "../core/sceneWorkspace";
import type { KurogiProject, Layer, MotionPathDefinition } from "../types";
import { Icon } from "../ui/Icon";
import { normalizeWheelDelta, panForZoomAnchor, zoomFromWheel } from "./canvasMath";

export interface WorkspaceCommand {
  type: "fit-all" | "focus-scene" | "scene-settings";
  nonce: number;
}

interface MultiSceneCanvasStageProps {
  project: KurogiProject;
  playerRef: React.RefObject<PlayerRef>;
  selectedLayerId: string;
  selectedLayerIds: string[];
  selectedActionId: string;
  zoom: number;
  playing: boolean;
  showSafeArea: boolean;
  focusActiveScene?: boolean;
  command?: WorkspaceCommand | null;
  onSelect: (id: string, additive?: boolean) => void;
  onMarqueeSelect: (ids: string[], additive?: boolean) => void;
  onTransformCommit: (id: string, patch: Partial<Layer>) => void;
  onTextCommit: (id: string, text: string) => void;
  onActionCommit: (layerId: string, actionId: string, motionPath: MotionPathDefinition) => void;
  onLayerContextMenu: (layerId: string, clientX: number, clientY: number) => void;
  onZoomChange?: (zoom: number) => void;
  onActivateScene: (sceneId: string) => void;
  onRenameScene: (sceneId: string, name: string) => void;
  onUpdateScene: (sceneId: string, patch: SceneUpdatePatch) => void;
  onMoveScene: (sceneId: string, position: SceneWorkspacePosition) => void;
  onReorderScene: (sceneId: string, targetIndex: number) => void;
  onSetSceneTransition: (sceneId: string, transition: NonNullable<KurogiProject["scenes"][string]["transition"]>) => void;
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
  selectedLayerIds,
  selectedActionId,
  zoom,
  playing: _playing,
  showSafeArea,
  focusActiveScene = false,
  command,
  onSelect,
  onMarqueeSelect,
  onTransformCommit,
  onTextCommit,
  onActionCommit,
  onLayerContextMenu,
  onZoomChange,
  onActivateScene,
  onRenameScene,
  onUpdateScene,
  onMoveScene,
  onReorderScene,
  onSetSceneTransition,
  onCopyLayerToScene,
}: MultiSceneCanvasStageProps) {
  const activeScene = project.scenes[project.activeSceneId] ?? Object.values(project.scenes)[0];
  const scenes = Object.values(project.scenes);
  const visibleScenes = focusActiveScene && activeScene ? [activeScene] : scenes;
  const activePosition = activeScene ? getSceneWorkspacePosition(activeScene) : { x: 0, y: 0 };
  const workspaceBounds = focusActiveScene && activeScene
    ? { left: activePosition.x, top: activePosition.y, width: activeScene.width, height: activeScene.height }
    : getSceneWorkspaceBounds(project);
  const workspacePadding = 240;
  const workspaceOrigin = {
    x: workspaceBounds.left - workspacePadding,
    y: workspaceBounds.top - workspacePadding,
  };
  const workspaceSize = {
    width: Math.max(1, workspaceBounds.width + workspacePadding * 2),
    height: Math.max(1, workspaceBounds.height + workspacePadding * 2),
  };
  const selectedLayer = selectedLayerId ? project.layers[selectedLayerId] ?? null : null;
  const stageRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const panGestureRef = useRef<PanGesture | null>(null);
  const sceneMoveRef = useRef<SceneMoveGesture | null>(null);
  const spacePressedRef = useRef(false);
  const callbacksRef = useRef({ onSelect, onMarqueeSelect, onTransformCommit, onTextCommit, onActionCommit, onLayerContextMenu });
  const zoomChangeRef = useRef(onZoomChange);
  const zoomRef = useRef(zoom);
  const panRef = useRef({ x: 0, y: 0 });
  const initialFitRef = useRef("");
  callbacksRef.current = { onSelect, onMarqueeSelect, onTransformCommit, onTextCommit, onActionCommit, onLayerContextMenu };
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
    const signature = `${project.id}:${focusActiveScene ? `focus:${activeScene?.id}` : scenes.map((scene) => scene.id).join("|")}:${available.width}x${available.height}`;
    if (initialFitRef.current === signature) return;
    initialFitRef.current = signature;
    const frame = window.requestAnimationFrame(() => focusActiveScene && activeScene ? focusScene(activeScene.id) : fitAllScenes());
    return () => window.cancelAnimationFrame(frame);
  }, [activeScene?.id, available.height, available.width, focusActiveScene, project.id, scenes.length]);

  useEffect(() => {
    if (!command) return;
    const frame = window.requestAnimationFrame(() => {
      if (command.type === "fit-all") fitAllScenes();
      if (command.type === "focus-scene") focusScene(activeScene.id);
      if (command.type === "scene-settings") setSettingsOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [command?.nonce]);

  useEffect(() => {
    if (!focusActiveScene || !activeScene) return;
    const frame = designSurfaceFrame(project, activeScene.id);
    const request = window.requestAnimationFrame(() => playerRef.current?.seekTo(frame));
    return () => window.cancelAnimationFrame(request);
  }, [activeScene?.id, focusActiveScene, playerRef, project]);

  const stableSelect = useCallback((id: string, additive = false) => callbacksRef.current.onSelect(id, additive), []);
  const stableMarqueeSelect = useCallback((ids: string[], additive = false) => callbacksRef.current.onMarqueeSelect(ids, additive), []);
  const stableTransformCommit = useCallback(
    (id: string, patch: Partial<Layer>) => callbacksRef.current.onTransformCommit(id, patch),
    [],
  );
  const stableTextCommit = useCallback(
    (id: string, text: string) => callbacksRef.current.onTextCommit(id, text),
    [],
  );
  const stableActionCommit = useCallback(
    (layerId: string, actionId: string, motionPath: MotionPathDefinition) => callbacksRef.current.onActionCommit(layerId, actionId, motionPath),
    [],
  );
  const stableLayerContextMenu = useCallback(
    (layerId: string, clientX: number, clientY: number) => callbacksRef.current.onLayerContextMenu(layerId, clientX, clientY),
    [],
  );

  const activePlayerInputProps = useMemo(
    () => ({
      project,
      selectedId: selectedLayerId,
      selectedIds: selectedLayerIds,
      selectedActionId,
      onSelect: stableSelect,
      onMarqueeSelect: stableMarqueeSelect,
      onTransformCommit: stableTransformCommit,
      onTextCommit: stableTextCommit,
      onActionCommit: stableActionCommit,
      onLayerContextMenu: stableLayerContextMenu,
      editable: true,
      showSelection: true,
      showSafeArea,
    }),
    [project, selectedActionId, selectedLayerId, selectedLayerIds, showSafeArea, stableActionCommit, stableLayerContextMenu, stableMarqueeSelect, stableSelect, stableTextCommit, stableTransformCommit],
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
      const scale = clamp(zoomRef.current / 100, 0.05, 2.5);
      const final = {
        x: sceneGesture.origin.x + (event.clientX - sceneGesture.startX) / scale,
        y: sceneGesture.origin.y + (event.clientY - sceneGesture.startY) / scale,
      };
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
    if (focusActiveScene) return;
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
    const horizontalPadding = 160;
    const verticalPadding = 180;
    const scale = clamp(
      Math.min(
        (available.width - horizontalPadding) / Math.max(1, workspaceBounds.width),
        (available.height - verticalPadding) / Math.max(1, workspaceBounds.height),
      ),
      0.05,
      2.5,
    );
    const center = {
      x: workspaceBounds.left + workspaceBounds.width / 2 - workspaceOrigin.x,
      y: workspaceBounds.top + workspaceBounds.height / 2 - workspaceOrigin.y,
    };
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
    const center = {
      x: position.x + scene.width / 2 - workspaceOrigin.x,
      y: position.y + scene.height / 2 - workspaceOrigin.y,
    };
    setView(scale * 100, { x: -center.x * scale, y: -center.y * scale });
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
      className={`stage editor-stage multi-scene-stage ${focusActiveScene ? "is-focus-mode" : "is-sequence-mode"} ${panning || spacePressed ? "is-panning" : ""}`}
      ref={stageRef}
      onPointerDownCapture={beginPan}
      onPointerMove={movePointer}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onContextMenu={(event) => event.preventDefault()}
      onAuxClick={(event) => event.preventDefault()}
    >
      <div className="multi-scene-toolbar is-compact">
        <div className="scene-toolbar-primary">
          {focusActiveScene ? <span className="scene-mode-label"><Icon name="frame" size={13} />Design canvas</span> : <>
            <span className="scene-sequence-count">Scene {scenes.findIndex((scene) => scene.id === activeScene.id) + 1}/{scenes.length}</span>
            <button type="button" disabled={scenes.findIndex((scene) => scene.id === activeScene.id) <= 0} onClick={() => onReorderScene(activeScene.id, scenes.findIndex((scene) => scene.id === activeScene.id) - 1)} title="Move scene earlier" aria-label="Move scene earlier"><Icon name="previous" size={13} /></button>
            <button type="button" disabled={scenes.findIndex((scene) => scene.id === activeScene.id) >= scenes.length - 1} onClick={() => onReorderScene(activeScene.id, scenes.findIndex((scene) => scene.id === activeScene.id) + 1)} title="Move scene later" aria-label="Move scene later"><Icon name="next" size={13} /></button>
          </>}
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
          {!focusActiveScene ? <label className="scene-transition-control" title="Transition entering this scene">
            <span>Transition</span>
            <select value={activeScene.transition?.type ?? "cut"} onChange={(event) => onSetSceneTransition(activeScene.id, { type: event.currentTarget.value as NonNullable<KurogiProject["scenes"][string]["transition"]>["type"], duration: event.currentTarget.value === "cut" ? 0 : activeScene.transition?.duration || .4 })}>
              <option value="cut">Cut</option><option value="fade">Fade</option><option value="slide-left">Slide left</option><option value="slide-right">Slide right</option><option value="zoom">Zoom</option>
            </select>
            {(activeScene.transition?.type ?? "cut") !== "cut" ? <input type="number" min="0.05" max="10" step="0.05" value={activeScene.transition?.duration ?? .4} onChange={(event) => onSetSceneTransition(activeScene.id, { type: activeScene.transition?.type ?? "fade", duration: Math.max(.05, Number(event.currentTarget.value) || .4) })} aria-label="Transition duration" /> : null}
          </label> : null}
          <button type="button" className="scene-settings-trigger" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} aria-controls="scene-settings-popover">Scene settings</button>
        </div>

        {!focusActiveScene && selectedLayerId && scenes.length > 1 ? (
          <div className="copy-scene-control">
            <span>Copy to</span>
            <select value={copyTarget} onChange={(event) => setCopyTarget(event.target.value)} aria-label="Copy selected layer to scene">
              {scenes.filter((scene) => scene.id !== activeScene.id).map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
            </select>
            <button type="button" disabled={!copyTarget} onClick={() => copyTarget && onCopyLayerToScene(selectedLayerId, copyTarget)}><Icon name="copy" size={14} />Copy</button>
          </div>
        ) : <span className="scene-toolbar-status">{focusActiveScene ? "Edit surface" : "Canvas workspace"}</span>}
      </div>

      <div className="canvas-view-controls" aria-label="Canvas view controls">
        <button type="button" onClick={fitAllScenes} title="Fit all scenes"><Icon name="frame" size={15} /><span>Fit</span></button>
        <button type="button" onClick={() => focusScene(activeScene.id)} title="Focus active scene">Focus</button>
        <i />
        <button type="button" onClick={() => setView(clamp(viewZoom - 10, 5, 250), panRef.current)} title="Zoom out" aria-label="Zoom out"><Icon name="minus" size={14} /></button>
        <span className="workspace-zoom-label">{Math.round(viewZoom)}%</span>
        <button type="button" onClick={() => setView(clamp(viewZoom + 10, 5, 250), panRef.current)} title="Zoom in" aria-label="Zoom in"><Icon name="plus" size={14} /></button>
      </div>

      {settingsOpen ? (
        <form id="scene-settings-popover" className="scene-settings-popover" onSubmit={saveSceneSettings} onPointerDown={(event) => event.stopPropagation()}>
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
        <div
          className="workspace-world"
          data-workspace-world="true"
          style={{
            width: workspaceSize.width,
            height: workspaceSize.height,
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${viewScale})`,
          }}
        >
            {visibleScenes.map((scene) => {
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
                  style={{
                    left: position.x - workspaceOrigin.x,
                    top: position.y - workspaceOrigin.y,
                    width: scene.width,
                    height: scene.height,
                  }}
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
                      style={{ width: "100%", height: "100%" }}
                    />
                  </div>
                </article>
              );
            })}
        </div>
      </div>

      <div className="workspace-help">{focusActiveScene ? "Drag empty canvas to select · Shift-drag to add · Space-drag to pan · Ctrl/Cmd + wheel to zoom" : "Drag scene labels to arrange · Space-drag to pan · Ctrl/Cmd + wheel to zoom"}</div>

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

export function designSurfaceFrame(project: KurogiProject, sceneId: string) {
  const scene = project.scenes[sceneId];
  if (!scene) return 0;
  let revealTime = 0;
  let firstExitTime = scene.duration;
  for (const layerId of scene.layerIds) {
    const layer = project.layers[layerId];
    if (!layer) continue;
    for (const action of layer.animationActions) {
      const start = Math.max(0, action.startTime + action.delay);
      if (action.category === "in") revealTime = Math.max(revealTime, start + action.duration);
      if (action.category === "out") firstExitTime = Math.min(firstExitTime, start);
    }
  }
  const latestVisibleTime = Math.max(0, Math.min(scene.duration - 1 / scene.fps, firstExitTime - 1 / scene.fps));
  const targetTime = Math.min(Math.max(0, revealTime + 1 / scene.fps), latestVisibleTime);
  return Math.max(0, Math.min(Math.round(scene.duration * scene.fps) - 1, Math.round(targetTime * scene.fps)));
}

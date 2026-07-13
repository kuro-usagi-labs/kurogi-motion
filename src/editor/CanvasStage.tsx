import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { MotionComposition } from "../MotionComposition";
import { getActiveScene } from "../core/project";
import type { KurogiProject, Layer } from "../types";
import { Icon } from "../ui/Icon";
import { normalizeWheelDelta, panForZoomAnchor, zoomFromWheel } from "./canvasMath";

interface CanvasStageProps {
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
}

type PanGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

export function CanvasStage({
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
}: CanvasStageProps) {
  const scene = getActiveScene(project);
  const selectedLayer = selectedLayerId ? project.layers[selectedLayerId] ?? null : null;
  const stageRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const panGestureRef = useRef<PanGesture | null>(null);
  const callbacksRef = useRef({ onSelect, onTransformCommit, onTextCommit });
  const zoomChangeRef = useRef(onZoomChange);
  const zoomRef = useRef(zoom);
  const panRef = useRef({ x: 0, y: 0 });
  callbacksRef.current = { onSelect, onTransformCommit, onTextCommit };
  zoomChangeRef.current = onZoomChange;

  const [available, setAvailable] = useState({ width: 900, height: 600 });
  const [viewZoom, setViewZoom] = useState(zoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    zoomRef.current = zoom;
    setViewZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      setAvailable({
        width: Math.max(240, rect.width - 72),
        height: Math.max(180, rect.height - 88),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
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
        const nextZoom = zoomFromWheel(currentZoom, delta);
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

        zoomRef.current = nextZoom;
        panRef.current = nextPan;
        setViewZoom(nextZoom);
        setPan(nextPan);
        zoomChangeRef.current?.(nextZoom);
        return;
      }

      const nextPan = {
        x: panRef.current.x - event.deltaX,
        y: panRef.current.y - event.deltaY,
      };
      panRef.current = nextPan;
      setPan(nextPan);
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);

  const fitScale = Math.min(available.width / scene.width, available.height / scene.height);
  const baseWidth = Math.max(1, scene.width * fitScale);
  const baseHeight = Math.max(1, scene.height * fitScale);
  const viewScale = Math.max(0.2, Math.min(4, viewZoom / 100));

  const stableSelect = useCallback((id: string) => callbacksRef.current.onSelect(id), []);
  const stableTransformCommit = useCallback(
    (id: string, patch: Partial<Layer>) => callbacksRef.current.onTransformCommit(id, patch),
    [],
  );
  const stableTextCommit = useCallback(
    (id: string, text: string) => callbacksRef.current.onTextCommit(id, text),
    [],
  );

  const playerInputProps = useMemo(
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

  function updatePan(next: { x: number; y: number }) {
    panRef.current = next;
    setPan(next);
  }

  function beginPan(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 1) return;
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

  function movePan(event: React.PointerEvent<HTMLElement>) {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    updatePan({
      x: gesture.originX + event.clientX - gesture.startX,
      y: gesture.originY + event.clientY - gesture.startY,
    });
  }

  function finishPan(event: React.PointerEvent<HTMLElement>) {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    panGestureRef.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function fitView() {
    updatePan({ x: 0, y: 0 });
    zoomRef.current = 100;
    setViewZoom(100);
    zoomChangeRef.current?.(100);
  }

  function openContextMenu(event: React.MouseEvent<HTMLElement>) {
    if (!selectedLayer || (selectedLayer.type !== "image" && selectedLayer.type !== "svg")) return;
    event.preventDefault();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setContextMenu({
      x: Math.max(8, Math.min(rect.width - 220, event.clientX - rect.left)),
      y: Math.max(48, Math.min(rect.height - 250, event.clientY - rect.top)),
    });
  }

  const imageLayer = selectedLayer?.type === "image" ? selectedLayer : null;

  return (
    <section
      className={`stage editor-stage navigable-stage ${panning ? "is-panning" : ""}`}
      ref={stageRef}
      onPointerDownCapture={beginPan}
      onPointerMove={movePan}
      onPointerUp={finishPan}
      onPointerCancel={finishPan}
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
      <div className="stage-top">
        <span>{scene.name}</span>
        <span>{scene.width} × {scene.height} · {scene.fps} FPS</span>
      </div>
      <div className="canvas-viewport" ref={viewportRef} data-canvas-viewport="true">
        <div
          className="canvas-pan-shell"
          data-canvas-pan-shell="true"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: baseWidth,
            height: baseHeight,
            marginLeft: -baseWidth / 2,
            marginTop: -baseHeight / 2,
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`,
            willChange: panning ? "transform" : undefined,
          }}
        >
          <div
            className="canvas-scale-shell"
            data-canvas-scale-shell="true"
            style={{
              width: "100%",
              height: "100%",
              transform: `scale(${viewScale})`,
              transformOrigin: "50% 50%",
              boxShadow: "0 28px 80px rgba(2,3,8,.66)",
              willChange: "transform",
            }}
          >
            <Player
              ref={playerRef}
              component={MotionComposition}
              inputProps={playerInputProps}
              durationInFrames={Math.max(1, Math.round(scene.duration * scene.fps))}
              compositionWidth={scene.width}
              compositionHeight={scene.height}
              fps={scene.fps}
              controls={false}
              autoPlay={false}
              loop
              style={{ width: baseWidth, height: baseHeight }}
            />
          </div>
        </div>
      </div>
      <div className="canvas-view-controls">
        <button type="button" title="Fit canvas" onClick={fitView}>
          <Icon name="frame" size={15} />
        </button>
        <span>{Math.round(viewZoom)}%</span>
      </div>
      {contextMenu ? (
        <div
          className="asset-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <strong>{selectedLayer?.name}</strong>
          <button type="button" onClick={() => replaceInputRef.current?.click()}>
            <Icon name="upload" size={15} />Replace asset
          </button>
          {imageLayer ? (
            <>
              <button type="button" onClick={() => { onTransformCommit(imageLayer.id, { fit: "cover" } as Partial<Layer>); setContextMenu(null); }}>
                <Icon name="frame" size={15} />Crop to fill
              </button>
              <button type="button" onClick={() => { onTransformCommit(imageLayer.id, { fit: "contain" } as Partial<Layer>); setContextMenu(null); }}>
                <Icon name="assets" size={15} />Fit inside
              </button>
              <button type="button" onClick={() => { onTransformCommit(imageLayer.id, { fit: "fill" } as Partial<Layer>); setContextMenu(null); }}>
                <Icon name="shapes" size={15} />Stretch to frame
              </button>
            </>
          ) : null}
          <span />
          <button type="button" onClick={() => { onDuplicateLayer?.(selectedLayerId); setContextMenu(null); }}>
            <Icon name="copy" size={15} />Duplicate
          </button>
          <button type="button" className="danger-text" onClick={() => { onDeleteLayer?.(selectedLayerId); setContextMenu(null); }}>
            <Icon name="trash" size={15} />Delete
          </button>
        </div>
      ) : null}
    </section>
  );
}

import React, { useLayoutEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { MotionComposition } from "../MotionComposition";
import { getActiveScene } from "../core/project";
import type { KurogiProject, Layer } from "../types";
import { Icon } from "../ui/Icon";

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
  playing,
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
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const panGestureRef = useRef<PanGesture | null>(null);
  const [available, setAvailable] = useState({ width: 900, height: 600 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      setAvailable({ width: Math.max(240, rect.width - 72), height: Math.max(180, rect.height - 88) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const fitScale = Math.min(available.width / scene.width, available.height / scene.height);
  const scale = Math.max(fitScale * .2, Math.min(fitScale * 4, fitScale * (zoom / 100)));
  const width = Math.max(1, Math.round(scene.width * scale));
  const height = Math.max(1, Math.round(scene.height * scale));

  function beginPan(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    panGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    setPanning(true);
    setContextMenu(null);
  }

  function movePan(event: React.PointerEvent<HTMLElement>) {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    setPan({
      x: gesture.originX + event.clientX - gesture.startX,
      y: gesture.originY + event.clientY - gesture.startY,
    });
  }

  function finishPan(event: React.PointerEvent<HTMLElement>) {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    panGestureRef.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: React.WheelEvent<HTMLElement>) {
    setContextMenu(null);
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      onZoomChange?.(Math.max(20, Math.min(400, zoom + direction * Math.max(4, Math.round(Math.abs(event.deltaY) / 18)))));
      return;
    }
    event.preventDefault();
    setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
  }

  function fitView() {
    setPan({ x: 0, y: 0 });
    onZoomChange?.(100);
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
      onWheel={handleWheel}
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
      <div className="stage-top"><span>{scene.name}</span><span>{scene.width} × {scene.height} · {scene.fps} FPS</span></div>
      <div className="canvas-viewport">
        <div
          className="canvas-wrap stable-canvas-wrap"
          style={{
            width,
            height,
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
          }}
        >
          <Player
            ref={playerRef}
            component={MotionComposition}
            inputProps={{ project, selectedId: selectedLayerId, onSelect, onTransformCommit, onTextCommit, editable: true, showSelection: !playing, showSafeArea }}
            durationInFrames={Math.max(1, Math.round(scene.duration * scene.fps))}
            compositionWidth={scene.width}
            compositionHeight={scene.height}
            fps={scene.fps}
            controls={false}
            autoPlay={false}
            loop
            style={{ width, height }}
          />
        </div>
      </div>
      <div className="canvas-view-controls">
        <button type="button" title="Fit canvas" onClick={fitView}><Icon name="frame" size={15} /></button>
        <span>{zoom}%</span>
      </div>
      {contextMenu ? (
        <div className="asset-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={(event) => event.stopPropagation()}>
          <strong>{selectedLayer?.name}</strong>
          <button type="button" onClick={() => replaceInputRef.current?.click()}><Icon name="upload" size={15} />Replace asset</button>
          {imageLayer ? <>
            <button type="button" onClick={() => { onTransformCommit(imageLayer.id, { fit: "cover" } as Partial<Layer>); setContextMenu(null); }}><Icon name="frame" size={15} />Crop to fill</button>
            <button type="button" onClick={() => { onTransformCommit(imageLayer.id, { fit: "contain" } as Partial<Layer>); setContextMenu(null); }}><Icon name="assets" size={15} />Fit inside</button>
            <button type="button" onClick={() => { onTransformCommit(imageLayer.id, { fit: "fill" } as Partial<Layer>); setContextMenu(null); }}><Icon name="shapes" size={15} />Stretch to frame</button>
          </> : null}
          <span />
          <button type="button" onClick={() => { onDuplicateLayer?.(selectedLayerId); setContextMenu(null); }}><Icon name="copy" size={15} />Duplicate</button>
          <button type="button" className="danger-text" onClick={() => { onDeleteLayer?.(selectedLayerId); setContextMenu(null); }}><Icon name="trash" size={15} />Delete</button>
        </div>
      ) : null}
    </section>
  );
}

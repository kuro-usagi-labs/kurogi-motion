import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { getActiveScene, getSceneLayers } from "../core/project";
import type { AnimationAction, KurogiProject } from "../types";
import { Icon } from "../ui/Icon";
import { presetFor } from "./animationPresets";

interface TimelineProps {
  project: KurogiProject;
  playerRef: React.RefObject<PlayerRef>;
  selectedLayerId: string;
  selectedActionId: string;
  onSelectLayer: (layerId: string) => void;
  onSelectAction: (layerId: string, actionId: string) => void;
  onCommitAction: (layerId: string, actionId: string, patch: Partial<Pick<AnimationAction, "startTime" | "duration">>) => void;
  onDeleteAction: (actionId: string) => void;
  onDuplicateAction: (actionId: string) => void;
}

type ActionGesture = {
  layerId: string;
  actionId: string;
  mode: "move" | "resize";
  clientX: number;
  laneWidth: number;
  initialStart: number;
  initialDuration: number;
  delay: number;
};

type ActionPreview = { startTime: number; duration: number };

const LABEL_WIDTH = 188;
const MIN_HEIGHT = 170;
const MAX_HEIGHT = 520;
const DEFAULT_HEIGHT = 258;
const HEIGHT_KEY = "kurogi.timeline.height";

export function Timeline({ project, playerRef, selectedLayerId, selectedActionId, onSelectLayer, onSelectAction, onCommitAction, onDeleteAction, onDuplicateAction }: TimelineProps) {
  const scene = getActiveScene(project);
  const layers = getSceneLayers(project);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [height, setHeight] = useState(() => clamp(Number(localStorage.getItem(HEIGHT_KEY)) || DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT));
  const [gesture, setGesture] = useState<ActionGesture | null>(null);
  const [preview, setPreview] = useState<ActionPreview | null>(null);
  const previewRef = useRef<ActionPreview | null>(null);
  const resizeRef = useRef<{ pointerId: number; startY: number; height: number } | null>(null);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (event: { detail: { frame: number } }) => setFrame(event.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
    };
  }, [playerRef, project.id]);

  useEffect(() => {
    const editor = document.querySelector<HTMLElement>(".editor-app");
    editor?.style.setProperty("--timeline-height", `${height}px`);
    localStorage.setItem(HEIGHT_KEY, String(height));
    return () => editor?.style.removeProperty("--timeline-height");
  }, [height]);

  useEffect(() => {
    if (!gesture) return;
    const active = gesture;
    const updatePreview = (next: ActionPreview) => {
      previewRef.current = next;
      setPreview(next);
    };
    const move = (event: PointerEvent) => {
      const delta = ((event.clientX - active.clientX) / Math.max(1, active.laneWidth)) * scene.duration;
      if (active.mode === "move") {
        const rawEffectiveStart = active.initialStart + active.delay + delta;
        const effectiveStart = event.altKey ? rawEffectiveStart : snapTime(rawEffectiveStart, project, frame / scene.fps, active.actionId, active.laneWidth);
        updatePreview({
          startTime: clamp(effectiveStart - active.delay, 0, Math.max(0, scene.duration - active.initialDuration - active.delay)),
          duration: active.initialDuration,
        });
      } else {
        const rawEnd = active.initialStart + active.delay + active.initialDuration + delta;
        const snappedEnd = event.altKey ? rawEnd : snapTime(rawEnd, project, frame / scene.fps, active.actionId, active.laneWidth);
        updatePreview({
          startTime: active.initialStart,
          duration: clamp(snappedEnd - active.initialStart - active.delay, .05, Math.max(.05, scene.duration - active.initialStart - active.delay)),
        });
      }
    };
    const finish = () => {
      if (previewRef.current) onCommitAction(active.layerId, active.actionId, previewRef.current);
      previewRef.current = null;
      setGesture(null);
      setPreview(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [frame, gesture, onCommitAction, project, scene.duration, scene.fps]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = resizeRef.current;
      if (!active) return;
      setHeight(clamp(active.height + active.startY - event.clientY, MIN_HEIGHT, MAX_HEIGHT));
    };
    const finish = () => { resizeRef.current = null; document.body.classList.remove("timeline-resizing"); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, []);

  const rulerMarks = useMemo(() => {
    const divisions = Math.max(2, Math.min(10, Math.ceil(scene.duration)));
    return Array.from({ length: divisions + 1 }, (_, index) => (scene.duration * index) / divisions);
  }, [scene.duration]);
  const laneWidth = Math.max(760, scene.duration * 150 * zoom);
  const selectedAction = findAction(project, selectedActionId);

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;
    if (playing) player.pause(); else player.play();
  }

  function seekFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".timeline-action")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const time = clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * scene.duration, 0, scene.duration);
    const targetFrame = Math.min(Math.max(0, Math.round(time * scene.fps)), Math.max(0, Math.round(scene.duration * scene.fps) - 1));
    playerRef.current?.seekTo(targetFrame);
    setFrame(targetFrame);
  }

  function beginActionGesture(event: React.PointerEvent<HTMLElement>, layerId: string, action: AnimationAction, mode: ActionGesture["mode"]) {
    event.preventDefault();
    event.stopPropagation();
    const lane = event.currentTarget.closest(".track-lane") as HTMLElement | null;
    if (!lane) return;
    onSelectAction(layerId, action.id);
    const initial = { startTime: action.startTime, duration: action.duration };
    previewRef.current = initial;
    setPreview(initial);
    setGesture({ layerId, actionId: action.id, mode, clientX: event.clientX, laneWidth: lane.getBoundingClientRect().width, initialStart: action.startTime, initialDuration: action.duration, delay: action.delay });
  }

  return (
    <section className="timeline behavior-timeline timeline-v3" style={{ height }}>
      <div
        className="timeline-resize-handle"
        title="Drag to resize timeline"
        onPointerDown={(event) => {
          event.preventDefault();
          resizeRef.current = { pointerId: event.pointerId, startY: event.clientY, height };
          document.body.classList.add("timeline-resizing");
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
      ><i /></div>
      <div className="timeline-head">
        <div className="timeline-transport">
          <button type="button" onClick={() => playerRef.current?.seekTo(0)} title="Restart"><Icon name="restart" size={15} /></button>
          <button type="button" onClick={togglePlay} className="play-btn" title="Play or pause"><Icon name={playing ? "pause" : "play"} size={15} /></button>
          <button type="button" onClick={() => playerRef.current?.seekTo(Math.max(0, frame - 1))} title="Previous frame"><Icon name="previous" size={14} /></button>
          <button type="button" onClick={() => playerRef.current?.seekTo(Math.min(scene.duration * scene.fps - 1, frame + 1))} title="Next frame"><Icon name="next" size={14} /></button>
          <span>{formatTime(frame / scene.fps)} / {formatTime(scene.duration)}</span>
        </div>
        <div className="timeline-selection-actions">
          {selectedAction ? <><span>{presetFor(selectedAction.action.type).label}</span><button type="button" className="timeline-icon-action" onClick={() => onDuplicateAction(selectedAction.action.id)} title="Duplicate action"><Icon name="copy" size={14} /></button><button type="button" className="timeline-icon-action danger-text" onClick={() => onDeleteAction(selectedAction.action.id)} title="Delete action"><Icon name="trash" size={14} /></button></> : null}
        </div>
        <div className="timeline-zoom"><button type="button" onClick={() => setZoom((value) => Math.max(.6, value - .2))}><Icon name="minus" size={14} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(3, value + .2))}><Icon name="plus" size={14} /></button></div>
      </div>

      <div className="tracks clean-timeline-tracks">
        <div className="timeline-lanes" style={{ width: LABEL_WIDTH + laneWidth }}>
          <div className="ruler clean-ruler" style={{ left: LABEL_WIDTH, width: laneWidth }}>{rulerMarks.map((mark) => <span key={mark} style={{ left: `${(mark / scene.duration) * 100}%` }}>{formatRuler(mark)}</span>)}</div>
          <div className="playhead" style={{ left: LABEL_WIDTH + (frame / Math.max(1, scene.duration * scene.fps)) * laneWidth }}><i /></div>
          {[...layers].reverse().map((layer) => <div className="track" key={layer.id} style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${laneWidth}px` }}>
            <button type="button" onClick={() => onSelectLayer(layer.id)} className={selectedLayerId === layer.id ? "track-selected" : ""}><span className={`layer-thumb ${layer.type}`}><Icon name={layer.type === "text" ? "text" : layer.type === "shape" ? "shapes" : "assets"} size={13} /></span><span className="track-name">{layer.name}</span></button>
            <div className="track-lane clean-track-lane" onPointerDown={(event) => { if (!(event.target as HTMLElement).closest(".timeline-action")) { event.currentTarget.setPointerCapture(event.pointerId); seekFromPointer(event); } }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
              {layer.animationActions.map((action) => {
                const activePreview = gesture?.actionId === action.id && preview ? preview : action;
                const effectiveStart = activePreview.startTime + action.delay;
                const preset = presetFor(action.type);
                return <div key={action.id} className={`timeline-action action-${action.category} ${selectedActionId === action.id ? "selected" : ""}`} onPointerDown={(event) => beginActionGesture(event, layer.id, action, "move")} onClick={(event) => { event.stopPropagation(); onSelectAction(layer.id, action.id); }} style={{ left: `${(effectiveStart / scene.duration) * 100}%`, width: `${Math.max(.6, (activePreview.duration / scene.duration) * 100)}%` }} title={`${preset.label} · ${activePreview.duration.toFixed(2)}s`}><span className="action-category">{action.category}</span><span className="action-name">{preset.label}</span><span className="action-resize" onPointerDown={(event) => beginActionGesture(event, layer.id, action, "resize")} /></div>;
              })}
            </div>
          </div>)}
        </div>
      </div>
    </section>
  );
}

function snapTime(time: number, project: KurogiProject, playheadTime: number, ignoredActionId: string, laneWidth: number) {
  const scene = getActiveScene(project);
  const threshold = Math.max(.02, (8 / Math.max(1, laneWidth)) * scene.duration);
  const candidates = [0, scene.duration, playheadTime];
  for (const layer of getSceneLayers(project)) for (const action of layer.animationActions) if (action.id !== ignoredActionId) { const start = action.startTime + action.delay; candidates.push(start, start + action.duration); }
  let closest = time;
  let distance = threshold;
  for (const candidate of candidates) { const next = Math.abs(candidate - time); if (next <= distance) { closest = candidate; distance = next; } }
  return closest;
}

function findAction(project: KurogiProject, actionId: string) { if (!actionId) return null; for (const layer of Object.values(project.layers)) { const action = layer.animationActions.find((candidate) => candidate.id === actionId); if (action) return { layerId: layer.id, action }; } return null; }
function formatTime(seconds: number) { const minutes = Math.floor(seconds / 60); const remainder = Math.max(0, seconds - minutes * 60); return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`; }
function formatRuler(seconds: number) { return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(seconds % 1 ? 1 : 0)}s`; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

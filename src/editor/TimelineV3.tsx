import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { getActiveScene, getSceneLayers } from "../core/project";
import type { AnimationAction, AudioClip, KurogiProject, StaggerOrder } from "../types";
import { AudioClipToolbar, AudioTimelineTracks } from "./AudioTimeline";
import { Icon } from "../ui/Icon";
import { presetFor } from "./animationPresets";

export interface TimelineActionPatch {
  layerId: string;
  actionId: string;
  startTime?: number;
  duration?: number;
}

interface TimelineProps {
  project: KurogiProject;
  playerRef: React.RefObject<PlayerRef>;
  selectedLayerId: string;
  selectedLayerIds: string[];
  selectedActionIds: string[];
  selectedAudioClipId: string;
  onSelectLayer: (layerId: string, additive?: boolean) => void;
  onSelectAction: (layerId: string, actionId: string, additive?: boolean) => void;
  onCommitActions: (patches: TimelineActionPatch[]) => void;
  onDeleteActions: (actionIds: string[]) => void;
  onDuplicateActions: (actionIds: string[]) => void;
  onCopyActions: (actionIds: string[]) => void;
  onPasteActions: () => void;
  onStaggerActions: (step: number, order: StaggerOrder) => void;
  onGroupActions: () => void;
  onUngroupActions: () => void;
  onSavePreset: () => void;
  onSelectAudioClip: (clipId: string) => void;
  onUpdateAudioClip: (clipId: string, patch: Partial<AudioClip>) => void;
  onDeleteAudioClip: (clipId: string) => void;
  onDuplicateAudioClip: (clipId: string) => void;
  canPaste: boolean;
}

type ActionSnapshot = {
  layerId: string;
  actionId: string;
  startTime: number;
  duration: number;
  delay: number;
};

type ActionGesture = {
  mode: "move" | "resize";
  clientX: number;
  laneWidth: number;
  primaryActionId: string;
  snapshots: ActionSnapshot[];
};

type ActionPreviewMap = Record<string, { startTime: number; duration: number }>;

const LABEL_WIDTH = 188;
const MIN_HEIGHT = 190;
const MAX_HEIGHT = 620;
const DEFAULT_HEIGHT = 300;
const HEIGHT_KEY = "kurogi.timeline.height";

export function Timeline({
  project,
  playerRef,
  selectedLayerId,
  selectedLayerIds,
  selectedActionIds,
  selectedAudioClipId,
  onSelectLayer,
  onSelectAction,
  onCommitActions,
  onDeleteActions,
  onDuplicateActions,
  onCopyActions,
  onPasteActions,
  onStaggerActions,
  onGroupActions,
  onUngroupActions,
  onSavePreset,
  onSelectAudioClip,
  onUpdateAudioClip,
  onDeleteAudioClip,
  onDuplicateAudioClip,
  canPaste,
}: TimelineProps) {
  const scene = getActiveScene(project);
  const layers = getSceneLayers(project);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [height, setHeight] = useState(() => clamp(Number(localStorage.getItem(HEIGHT_KEY)) || DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT));
  const [gesture, setGesture] = useState<ActionGesture | null>(null);
  const [preview, setPreview] = useState<ActionPreviewMap>({});
  const previewRef = useRef<ActionPreviewMap>({});
  const resizeRef = useRef<{ pointerId: number; startY: number; height: number } | null>(null);
  const [staggerStep, setStaggerStep] = useState(.08);
  const [staggerOrder, setStaggerOrder] = useState<StaggerOrder>("normal");

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
    return () => { editor?.style.removeProperty("--timeline-height"); };
  }, [height]);

  useEffect(() => {
    if (!gesture) return;
    const active = gesture;
    const updatePreview = (next: ActionPreviewMap) => {
      previewRef.current = next;
      setPreview(next);
    };
    const move = (event: PointerEvent) => {
      const delta = ((event.clientX - active.clientX) / Math.max(1, active.laneWidth)) * scene.duration;
      const primary = active.snapshots.find((snapshot) => snapshot.actionId === active.primaryActionId) ?? active.snapshots[0];
      if (!primary) return;
      if (active.mode === "move") {
        const rawPrimaryStart = primary.startTime + primary.delay + delta;
        const effectivePrimaryStart = event.altKey
          ? rawPrimaryStart
          : snapTime(rawPrimaryStart, project, frame / scene.fps, new Set(active.snapshots.map((snapshot) => snapshot.actionId)), active.laneWidth);
        const snappedDelta = effectivePrimaryStart - primary.delay - primary.startTime;
        const next: ActionPreviewMap = {};
        for (const snapshot of active.snapshots) {
          next[snapshot.actionId] = {
            startTime: clamp(snapshot.startTime + snappedDelta, 0, Math.max(0, scene.duration - snapshot.duration - snapshot.delay)),
            duration: snapshot.duration,
          };
        }
        updatePreview(next);
      } else {
        const rawDuration = primary.duration + delta;
        const primaryEnd = primary.startTime + primary.delay + rawDuration;
        const snappedEnd = event.altKey
          ? primaryEnd
          : snapTime(primaryEnd, project, frame / scene.fps, new Set(active.snapshots.map((snapshot) => snapshot.actionId)), active.laneWidth);
        const durationDelta = clamp(snappedEnd - primary.startTime - primary.delay, .05, Math.max(.05, scene.duration - primary.startTime - primary.delay)) - primary.duration;
        const next: ActionPreviewMap = {};
        for (const snapshot of active.snapshots) {
          next[snapshot.actionId] = {
            startTime: snapshot.startTime,
            duration: clamp(snapshot.duration + durationDelta, .05, Math.max(.05, scene.duration - snapshot.startTime - snapshot.delay)),
          };
        }
        updatePreview(next);
      }
    };
    const finish = () => {
      const patches = active.snapshots.map((snapshot) => ({
        layerId: snapshot.layerId,
        actionId: snapshot.actionId,
        startTime: previewRef.current[snapshot.actionId]?.startTime ?? snapshot.startTime,
        duration: previewRef.current[snapshot.actionId]?.duration ?? snapshot.duration,
      }));
      if (patches.length) onCommitActions(patches);
      previewRef.current = {};
      setGesture(null);
      setPreview({});
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [frame, gesture, onCommitActions, project, scene.duration, scene.fps]);

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
  const primaryActionId = selectedActionIds.at(-1) ?? "";
  const selectedAction = findAction(project, primaryActionId);
  const selectedAudioClip = selectedAudioClipId ? project.audioClips[selectedAudioClipId] ?? null : null;
  const selectedGroups = new Set(selectedActionIds.map((id) => findAction(project, id)?.action.groupId).filter(Boolean));

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;
    if (playing) player.pause(); else player.play();
  }

  function seekToTime(time: number) {
    seekToTime(time);
  }

  function seekToTime(time: number) {
    const targetFrame = Math.min(Math.max(0, Math.round(time * scene.fps)), Math.max(0, Math.round(scene.duration * scene.fps) - 1));
    playerRef.current?.seekTo(targetFrame);
    setFrame(targetFrame);
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
    onSelectAction(layerId, action.id, event.shiftKey);
    const ids = gestureSelection(project, action, selectedActionIds, event.shiftKey);
    const snapshots = actionSnapshots(project, ids);
    const initialPreview = Object.fromEntries(snapshots.map((snapshot) => [snapshot.actionId, { startTime: snapshot.startTime, duration: snapshot.duration }]));
    previewRef.current = initialPreview;
    setPreview(initialPreview);
    setGesture({ mode, clientX: event.clientX, laneWidth: lane.getBoundingClientRect().width, primaryActionId: action.id, snapshots });
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
        <div className="timeline-selection-actions animation-selection-expanded">
          {selectedAudioClip ? <AudioClipToolbar project={project} selectedClipId={selectedAudioClipId} onUpdate={onUpdateAudioClip} onDelete={onDeleteAudioClip} onDuplicate={onDuplicateAudioClip} /> : <AnimationWorkflowBar
            count={selectedActionIds.length}
            groupSelected={selectedGroups.size > 0}
            canPaste={canPaste && selectedLayerIds.length > 0}
            staggerStep={staggerStep}
            staggerOrder={staggerOrder}
            onStaggerStep={setStaggerStep}
            onStaggerOrder={setStaggerOrder}
            onDuplicate={() => onDuplicateActions(selectedActionIds)}
            onDelete={() => onDeleteActions(selectedActionIds)}
            onCopy={() => onCopyActions(selectedActionIds)}
            onPaste={onPasteActions}
            onStagger={() => onStaggerActions(staggerStep, staggerOrder)}
            onGroup={onGroupActions}
            onUngroup={onUngroupActions}
            onSavePreset={onSavePreset}
          />}
          {!selectedAudioClip && selectedAction ? <span className="action-group-name">{presetFor(selectedAction.action.type).label}{selectedAction.action.groupId ? ` · ${project.animationGroups[selectedAction.action.groupId]?.name ?? "Group"}` : ""}</span> : null}
        </div>
        <div className="timeline-zoom"><button type="button" onClick={() => setZoom((value) => Math.max(.6, value - .2))}><Icon name="minus" size={14} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(3, value + .2))}><Icon name="plus" size={14} /></button></div>
      </div>

      <div className="tracks clean-timeline-tracks">
        <div className="timeline-lanes" style={{ width: LABEL_WIDTH + laneWidth }}>
          <div className="ruler clean-ruler" style={{ left: LABEL_WIDTH, width: laneWidth }}>{rulerMarks.map((mark) => <span key={mark} style={{ left: `${(mark / scene.duration) * 100}%` }}>{formatRuler(mark)}</span>)}</div>
          <div className="playhead" style={{ left: LABEL_WIDTH + (frame / Math.max(1, scene.duration * scene.fps)) * laneWidth }}><i /></div>
          <AudioTimelineTracks project={project} laneWidth={laneWidth} labelWidth={LABEL_WIDTH} selectedClipId={selectedAudioClipId} onSelect={onSelectAudioClip} onUpdate={onUpdateAudioClip} onDelete={onDeleteAudioClip} onDuplicate={onDuplicateAudioClip} onSeek={seekToTime} />
          {[...layers].reverse().map((layer) => <div className="track" key={layer.id} style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${laneWidth}px` }}>
            <button type="button" onClick={(event) => onSelectLayer(layer.id, event.shiftKey)} className={selectedLayerIds.includes(layer.id) ? "track-selected" : ""}><span className={`layer-thumb ${layer.type}`}><Icon name={layer.type === "text" ? "text" : layer.type === "shape" ? "shapes" : "assets"} size={13} /></span><span className="track-name">{layer.name}</span></button>
            <div className="track-lane clean-track-lane" onPointerDown={(event) => { if (!(event.target as HTMLElement).closest(".timeline-action")) { event.currentTarget.setPointerCapture(event.pointerId); seekFromPointer(event); } }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
              {layer.animationActions.map((action) => {
                const activePreview = preview[action.id] ?? action;
                const effectiveStart = activePreview.startTime + action.delay;
                const preset = presetFor(action.type);
                const selected = selectedActionIds.includes(action.id);
                return <div key={action.id} className={`timeline-action action-${action.category} action-${action.type} ${selected ? "selected multi-selected" : ""}`} onPointerDown={(event) => beginActionGesture(event, layer.id, action, "move")} onClick={(event) => { event.stopPropagation(); onSelectAction(layer.id, action.id, event.shiftKey); }} style={{ left: `${(effectiveStart / scene.duration) * 100}%`, width: `${Math.max(.6, (activePreview.duration / scene.duration) * 100)}%` }} title={`${preset.label} · ${activePreview.duration.toFixed(2)}s`}><span className="action-category">{action.category}</span>{action.groupId ? <span className="action-group-badge">G</span> : null}<span className="action-name">{preset.label}</span><span className="action-resize" onPointerDown={(event) => beginActionGesture(event, layer.id, action, "resize")} /></div>;
              })}
            </div>
          </div>)}
        </div>
      </div>
    </section>
  );
}

function AnimationWorkflowBar({ count, groupSelected, canPaste, staggerStep, staggerOrder, onStaggerStep, onStaggerOrder, onDuplicate, onDelete, onCopy, onPaste, onStagger, onGroup, onUngroup, onSavePreset }: {
  count: number;
  groupSelected: boolean;
  canPaste: boolean;
  staggerStep: number;
  staggerOrder: StaggerOrder;
  onStaggerStep: (value: number) => void;
  onStaggerOrder: (value: StaggerOrder) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onStagger: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onSavePreset: () => void;
}) {
  return <div className="animation-workflow-bar">
    <span>{count ? `${count} block${count === 1 ? "" : "s"}` : "Select animation blocks"}</span>
    <button type="button" disabled={!count} onClick={onCopy}>Copy</button>
    <button type="button" disabled={!canPaste} onClick={onPaste}>Paste</button>
    <button type="button" disabled={!count} onClick={onDuplicate}>Duplicate</button>
    <button type="button" disabled={count < 2} onClick={onGroup}>Group</button>
    <button type="button" disabled={!groupSelected} onClick={onUngroup}>Ungroup</button>
    <label>Stagger <input type="number" min="0" max="5" step=".01" value={staggerStep} onChange={(event) => onStaggerStep(Math.max(0, Number(event.currentTarget.value)))} /></label>
    <select value={staggerOrder} onChange={(event) => onStaggerOrder(event.currentTarget.value as StaggerOrder)}><option value="normal">Forward</option><option value="reverse">Reverse</option><option value="center">Center</option><option value="edges">Edges</option><option value="random">Random</option></select>
    <button type="button" disabled={count < 2} onClick={onStagger}>Apply</button>
    <button type="button" disabled={!count} onClick={onSavePreset}>Save preset</button>
    <button type="button" disabled={!count} className="danger-text" onClick={onDelete}>Delete</button>
  </div>;
}

function gestureSelection(project: KurogiProject, action: AnimationAction, selectedIds: string[], additive: boolean) {
  if (additive) return selectedIds.includes(action.id) ? selectedIds.filter((id) => id !== action.id) : [...selectedIds, action.id];
  if (selectedIds.includes(action.id) && selectedIds.length > 1) return selectedIds;
  if (action.groupId) {
    const ids: string[] = [];
    for (const layer of Object.values(project.layers)) for (const candidate of layer.animationActions) if (candidate.groupId === action.groupId) ids.push(candidate.id);
    if (ids.length) return ids;
  }
  return [action.id];
}

function actionSnapshots(project: KurogiProject, actionIds: string[]) {
  const wanted = new Set(actionIds);
  const snapshots: ActionSnapshot[] = [];
  for (const layer of Object.values(project.layers)) {
    for (const action of layer.animationActions) if (wanted.has(action.id)) snapshots.push({ layerId: layer.id, actionId: action.id, startTime: action.startTime, duration: action.duration, delay: action.delay });
  }
  return snapshots;
}

function snapTime(time: number, project: KurogiProject, playheadTime: number, ignoredActionIds: Set<string>, laneWidth: number) {
  const scene = getActiveScene(project);
  const threshold = Math.max(.02, (8 / Math.max(1, laneWidth)) * scene.duration);
  const candidates = [0, scene.duration, playheadTime];
  for (const layer of getSceneLayers(project)) for (const action of layer.animationActions) if (!ignoredActionIds.has(action.id)) { const start = action.startTime + action.delay; candidates.push(start, start + action.duration); }
  let closest = time;
  let distance = threshold;
  for (const candidate of candidates) { const next = Math.abs(candidate - time); if (next <= distance) { closest = candidate; distance = next; } }
  return closest;
}

function findAction(project: KurogiProject, actionId: string) { if (!actionId) return null; for (const layer of Object.values(project.layers)) { const action = layer.animationActions.find((candidate) => candidate.id === actionId); if (action) return { layerId: layer.id, action }; } return null; }
function formatTime(seconds: number) { const minutes = Math.floor(seconds / 60); const remainder = Math.max(0, seconds - minutes * 60); return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`; }
function formatRuler(seconds: number) { return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(seconds % 1 ? 1 : 0)}s`; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

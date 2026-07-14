import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { getActiveScene, getSceneLayers } from "../core/project";
import type { AnimationAction, AudioClip, KurogiProject, Layer, StaggerOrder } from "../types";
import { AudioClipToolbar, AudioTimelineTracks } from "./AudioTimeline";
import { Icon } from "../ui/Icon";
import { presetFor } from "./animationPresets";
import { normalizeWheelDelta } from "./canvasMath";
import { selectionRect, selectionRectsIntersect, type SelectionRect } from "../core/marqueeSelection";

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
  onMarqueeSelect: (layerIds: string[], actionRefs: Array<{ layerId: string; actionId: string }>, additive?: boolean) => void;
  onCommitActions: (patches: TimelineActionPatch[]) => void;
  onUpdateLayerTiming: (layerId: string, startTime: number, duration: number) => void;
  onTrimStart: () => void;
  onTrimEnd: () => void;
  onCut: () => void;
  editNotice: string;
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
type LayerTimingGesture = { mode: "move" | "trim-start" | "trim-end"; layerId: string; clientX: number; laneWidth: number; startTime: number; duration: number };
type TimelineMarqueeGesture = {
  pointerId: number;
  startClient: { x: number; y: number };
  currentClient: { x: number; y: number };
  startContent: { x: number; y: number };
  currentContent: { x: number; y: number };
  additive: boolean;
  moved: boolean;
};

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
  onMarqueeSelect,
  onCommitActions,
  onUpdateLayerTiming,
  onTrimStart,
  onTrimEnd,
  onCut,
  editNotice,
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
  const [layerTimingGesture, setLayerTimingGesture] = useState<LayerTimingGesture | null>(null);
  const [layerTimingPreview, setLayerTimingPreview] = useState<{ startTime: number; duration: number } | null>(null);
  const [timelineMarquee, setTimelineMarquee] = useState<SelectionRect | null>(null);
  const layerTimingPreviewRef = useRef<{ startTime: number; duration: number } | null>(null);
  const timelineMarqueeRef = useRef<TimelineMarqueeGesture | null>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
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
    if (!layerTimingGesture) return;
    const active = layerTimingGesture;
    const move = (event: PointerEvent) => {
      const delta = ((event.clientX - active.clientX) / Math.max(1, active.laneWidth)) * scene.duration;
      let startTime = active.startTime;
      let duration = active.duration;
      if (active.mode === "move") startTime = clamp(active.startTime + delta, 0, Math.max(0, scene.duration - active.duration));
      if (active.mode === "trim-start") {
        const end = active.startTime + active.duration;
        startTime = clamp(active.startTime + delta, 0, end - .01);
        duration = end - startTime;
      }
      if (active.mode === "trim-end") duration = clamp(active.duration + delta, .01, Math.max(.01, scene.duration - active.startTime));
      const next = { startTime, duration };
      layerTimingPreviewRef.current = next;
      setLayerTimingPreview(next);
    };
    const finish = () => {
      const value = layerTimingPreviewRef.current ?? { startTime: active.startTime, duration: active.duration };
      onUpdateLayerTiming(active.layerId, value.startTime, value.duration);
      layerTimingPreviewRef.current = null;
      setLayerTimingPreview(null);
      setLayerTimingGesture(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [layerTimingGesture, onUpdateLayerTiming, scene.duration]);

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

  useEffect(() => {
    const tracks = tracksRef.current;
    if (!tracks) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = tracks.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const oldWidth = timelineLaneWidth(scene.duration, zoom);
      const delta = normalizeWheelDelta(event.deltaY, event.deltaMode);
      const nextZoom = clamp(Math.round(zoom * Math.exp(-delta * .00145) * 1000) / 1000, .25, 8);
      if (Math.abs(nextZoom - zoom) < .001) return;
      const timeRatio = clamp((tracks.scrollLeft + pointerX - LABEL_WIDTH) / Math.max(1, oldWidth), 0, 1);
      setZoom(nextZoom);
      window.requestAnimationFrame(() => {
        tracks.scrollLeft = Math.max(0, LABEL_WIDTH + timeRatio * timelineLaneWidth(scene.duration, nextZoom) - pointerX);
      });
    };
    tracks.addEventListener("wheel", handleWheel, { passive: false });
    return () => tracks.removeEventListener("wheel", handleWheel);
  }, [scene.duration, zoom]);

  const laneWidth = timelineLaneWidth(scene.duration, zoom);
  const rulerMarks = useMemo(() => {
    const step = niceRulerStep(scene.duration / Math.max(2, Math.floor(laneWidth / 110)));
    const marks: number[] = [];
    for (let time = 0; time < scene.duration; time += step) marks.push(time);
    if (!marks.length || Math.abs(marks.at(-1)! - scene.duration) > .001) marks.push(scene.duration);
    return marks;
  }, [laneWidth, scene.duration]);
  const primaryActionId = selectedActionIds.at(-1) ?? "";
  const selectedAction = findAction(project, primaryActionId);
  const selectedAudioClip = selectedAudioClipId ? project.audioClips[selectedAudioClipId] ?? null : null;
  const selectedGroups = new Set(selectedActionIds.map((id) => findAction(project, id)?.action.groupId).filter(Boolean));
  const canEditTimeline = selectedLayerIds.length > 0 || Boolean(selectedAudioClip);

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;
    if (playing) player.pause(); else player.play();
  }

  function seekToTime(time: number) {
    const targetFrame = Math.min(Math.max(0, Math.round(time * scene.fps)), Math.max(0, Math.round(scene.duration * scene.fps) - 1));
    playerRef.current?.seekTo(targetFrame);
    setFrame(targetFrame);
  }

  function seekFromTimelinePointer(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".timeline-action")) return;
    const tracks = tracksRef.current;
    if (!tracks) return;
    const rect = tracks.getBoundingClientRect();
    const contentX = event.clientX - rect.left + tracks.scrollLeft - LABEL_WIDTH;
    const time = clamp((contentX / Math.max(1, laneWidth)) * scene.duration, 0, scene.duration);
    seekToTime(time);
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

  function beginLayerTimingGesture(event: React.PointerEvent<HTMLElement>, layer: Layer, mode: LayerTimingGesture["mode"]) {
    event.preventDefault();
    event.stopPropagation();
    const lane = event.currentTarget.closest(".track-lane") as HTMLElement | null;
    if (!lane) return;
    onSelectLayer(layer.id, event.shiftKey);
    const startTime = clamp(layer.startTime ?? 0, 0, scene.duration);
    const duration = clamp(layer.duration ?? scene.duration - startTime, .01, Math.max(.01, scene.duration - startTime));
    const initial = { startTime, duration };
    layerTimingPreviewRef.current = initial;
    setLayerTimingPreview(initial);
    setLayerTimingGesture({ mode, layerId: layer.id, clientX: event.clientX, laneWidth: lane.getBoundingClientRect().width, startTime, duration });
  }

  function beginTimelineMarquee(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".timeline-action,.timeline-layer-span,.audio-clip-block")) return;
    const tracks = tracksRef.current;
    if (!tracks) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = tracks.getBoundingClientRect();
    const client = { x: event.clientX, y: event.clientY };
    const content = { x: event.clientX - rect.left + tracks.scrollLeft, y: event.clientY - rect.top + tracks.scrollTop };
    timelineMarqueeRef.current = {
      pointerId: event.pointerId,
      startClient: client,
      currentClient: client,
      startContent: content,
      currentContent: content,
      additive: event.shiftKey,
      moved: false,
    };
    setTimelineMarquee(null);
  }

  function moveTimelineMarquee(event: React.PointerEvent<HTMLDivElement>) {
    const active = timelineMarqueeRef.current;
    const tracks = tracksRef.current;
    if (!active || !tracks || active.pointerId !== event.pointerId) return;
    const rect = tracks.getBoundingClientRect();
    const currentClient = { x: event.clientX, y: event.clientY };
    const currentContent = { x: event.clientX - rect.left + tracks.scrollLeft, y: event.clientY - rect.top + tracks.scrollTop };
    const moved = active.moved || Math.hypot(currentClient.x - active.startClient.x, currentClient.y - active.startClient.y) >= 4;
    const next = { ...active, currentClient, currentContent, moved };
    timelineMarqueeRef.current = next;
    setTimelineMarquee(moved ? selectionRect(next.startContent, next.currentContent) : null);
  }

  function finishTimelineMarquee(event: React.PointerEvent<HTMLDivElement>) {
    const active = timelineMarqueeRef.current;
    const tracks = tracksRef.current;
    if (!active || !tracks || active.pointerId !== event.pointerId) return;
    const tracksRect = tracks.getBoundingClientRect();
    const currentClient = { x: event.clientX, y: event.clientY };
    const currentContent = { x: event.clientX - tracksRect.left + tracks.scrollLeft, y: event.clientY - tracksRect.top + tracks.scrollTop };
    const moved = active.moved || Math.hypot(currentClient.x - active.startClient.x, currentClient.y - active.startClient.y) >= 4;
    timelineMarqueeRef.current = null;
    setTimelineMarquee(null);
    if (moved) {
      const area = selectionRect(active.startClient, currentClient);
      const actionRefs = Array.from(tracks.querySelectorAll<HTMLElement>("[data-timeline-action-id]"))
        .filter((element) => selectionRectsIntersect(area, domRect(element.getBoundingClientRect())))
        .map((element) => ({ layerId: element.dataset.timelineLayerId ?? "", actionId: element.dataset.timelineActionId ?? "" }))
        .filter((ref) => ref.layerId && ref.actionId);
      const layerIds = Array.from(tracks.querySelectorAll<HTMLElement>("[data-timeline-layer-span]"))
        .filter((element) => selectionRectsIntersect(area, domRect(element.getBoundingClientRect())))
        .map((element) => element.dataset.timelineLayerId ?? "")
        .filter(Boolean);
      onMarqueeSelect([...new Set(layerIds)], actionRefs, active.additive);
    } else {
      seekFromTimelinePointer(event);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
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
          <div className="timeline-edit-tools" aria-label="Timeline edit tools">
            <button type="button" disabled={!canEditTimeline} onClick={onTrimStart} title="Trim start to playhead (Q)"><Icon name="trimStart" size={14} /><kbd>Q</kbd></button>
            <button type="button" disabled={!canEditTimeline} onClick={onTrimEnd} title="Trim end to playhead (W)"><Icon name="trimEnd" size={14} /><kbd>W</kbd></button>
            <button type="button" disabled={!canEditTimeline} onClick={onCut} title="Cut at playhead (Ctrl+B)"><Icon name="cut" size={14} /><kbd>Ctrl B</kbd></button>
          </div>
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
        <div className="timeline-zoom" title="Ctrl/Cmd + scroll to zoom around the pointer"><button type="button" onClick={() => setZoom((value) => Math.max(.25, value / 1.2))}><Icon name="minus" size={14} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(8, value * 1.2))}><Icon name="plus" size={14} /></button></div>
      </div>
      {editNotice ? <div className="timeline-edit-notice"><Icon name="check" size={13} />{editNotice}</div> : null}

      <div className="tracks clean-timeline-tracks" ref={tracksRef}>
        <div
          className="timeline-lanes"
          style={{ width: LABEL_WIDTH + laneWidth }}
          onPointerDown={beginTimelineMarquee}
          onPointerMove={moveTimelineMarquee}
          onPointerUp={finishTimelineMarquee}
          onPointerCancel={finishTimelineMarquee}
        >
          <div className="ruler clean-ruler" style={{ left: LABEL_WIDTH, width: laneWidth }}>{rulerMarks.map((mark) => <span key={mark} style={{ left: `${(mark / scene.duration) * 100}%` }}>{formatRuler(mark)}</span>)}</div>
          <div className="playhead" style={{ left: LABEL_WIDTH + (frame / Math.max(1, scene.duration * scene.fps)) * laneWidth }}><i /></div>
          {timelineMarquee ? <div className="timeline-selection-marquee" style={{ left: timelineMarquee.left, top: timelineMarquee.top, width: timelineMarquee.right - timelineMarquee.left, height: timelineMarquee.bottom - timelineMarquee.top }} /> : null}
          <AudioTimelineTracks project={project} laneWidth={laneWidth} labelWidth={LABEL_WIDTH} selectedClipId={selectedAudioClipId} onSelect={onSelectAudioClip} onUpdate={onUpdateAudioClip} onDelete={onDeleteAudioClip} onDuplicate={onDuplicateAudioClip} onSeek={seekToTime} />
          {[...layers].reverse().map((layer) => <div className="track" key={layer.id} style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${laneWidth}px` }}>
            <button type="button" onClick={(event) => onSelectLayer(layer.id, event.shiftKey)} className={selectedLayerIds.includes(layer.id) ? "track-selected" : ""}><span className={`layer-thumb ${layer.type}`}><Icon name={layer.type === "text" ? "text" : layer.type === "shape" ? "shapes" : "assets"} size={13} /></span><span className="track-name">{layer.name}</span></button>
            <div className="track-lane clean-track-lane">
              {(() => {
                const timing = layerTimingGesture?.layerId === layer.id && layerTimingPreview ? layerTimingPreview : { startTime: layer.startTime ?? 0, duration: layer.duration ?? scene.duration - (layer.startTime ?? 0) };
                return <div data-timeline-layer-span="true" data-timeline-layer-id={layer.id} className={`timeline-layer-span ${selectedLayerIds.includes(layer.id) ? "is-selected" : ""}`} style={{ left: `${(timing.startTime / scene.duration) * 100}%`, width: `${Math.max(.3, (timing.duration / scene.duration) * 100)}%` }} onPointerDown={(event) => beginLayerTimingGesture(event, layer, "move")} title={`${layer.name} · ${timing.startTime.toFixed(2)}s–${(timing.startTime + timing.duration).toFixed(2)}s`}>
                  <span className="layer-trim-handle is-start" onPointerDown={(event) => beginLayerTimingGesture(event, layer, "trim-start")} />
                  <span className="layer-span-fill" />
                  <span className="layer-trim-handle is-end" onPointerDown={(event) => beginLayerTimingGesture(event, layer, "trim-end")} />
                </div>;
              })()}
              {layer.animationActions.map((action) => {
                const activePreview = preview[action.id] ?? action;
                const effectiveStart = activePreview.startTime + action.delay;
                const preset = presetFor(action.type);
                const selected = selectedActionIds.includes(action.id);
                return <div key={action.id} data-timeline-action-id={action.id} data-timeline-layer-id={layer.id} className={`timeline-action action-${action.category} action-${action.type} ${selected ? "selected multi-selected" : ""}`} onPointerDown={(event) => beginActionGesture(event, layer.id, action, "move")} onClick={(event) => { event.stopPropagation(); onSelectAction(layer.id, action.id, event.shiftKey); }} style={{ left: `${(effectiveStart / scene.duration) * 100}%`, width: `${Math.max(.6, (activePreview.duration / scene.duration) * 100)}%` }} title={`${preset.label} · ${activePreview.duration.toFixed(2)}s`}><span className="action-category">{action.category}</span>{action.groupId ? <span className="action-group-badge">G</span> : null}<span className="action-name">{preset.label}</span><span className="action-resize" onPointerDown={(event) => beginActionGesture(event, layer.id, action, "resize")} /></div>;
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
function timelineLaneWidth(duration: number, zoom: number) { return Math.max(760, duration * 150) * zoom; }
function niceRulerStep(raw: number) {
  const safe = Math.max(1 / 60, raw);
  const power = 10 ** Math.floor(Math.log10(safe));
  const normalized = safe / power;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * power;
}
function domRect(rect: DOMRect): SelectionRect { return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

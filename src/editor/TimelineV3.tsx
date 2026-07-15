import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { getActiveScene, getSceneLayers } from "../core/project";
import type { AnimationAction, AudioClip, KurogiProject, Layer, StaggerOrder } from "../types";
import { AudioClipToolbar, AudioTimelineTracks } from "./AudioTimeline";
import { Icon } from "../ui/Icon";
import { LayerThumbnail } from "../app/LayerThumbnail";
import { NumberField } from "./NumericField";
import { getLayerRenderTiming } from "../core/layerTiming";
import { textAnimationScope, textAnimationScopeBadge, textAnimationStaggerSpread, textAnimationVisualDuration } from "../core/textAnimation";
import { presetFor } from "./animationPresets";
import { normalizeWheelDelta } from "./canvasMath";
import { selectionRect, selectionRectsIntersect, type SelectionRect } from "../core/marqueeSelection";
import {
  TIMELINE_MARQUEE_BLOCKER_SELECTOR,
  timelineDragThresholdPassed,
  timelineLayerDropTargetAtY,
  timelineLayerReorderAutoScrollVelocity,
  timelineLocalPoint,
  timelineLocalRect,
  timelinePointerSelection,
  timelineReleaseIntent,
  timelineTimeAtClientX,
  type TimelineLayerDropTarget,
  visibleTimelineRulerMarks,
} from "./timelineInteractions";

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
  onReorderLayer: (draggedLayerId: string, targetLayerId: string) => void;
  onSelectAction: (layerId: string, actionId: string, additive?: boolean) => void;
  onMarqueeSelect: (layerIds: string[], actionRefs: Array<{ layerId: string; actionId: string }>, additive?: boolean) => void;
  onCommitActions: (patches: TimelineActionPatch[]) => void;
  onUpdateLayerTiming: (layerId: string, startTime: number, duration: number) => void;
  onUpdateSceneDuration: (duration: number) => void;
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
  onCollapse: () => void;
}

type ActionSnapshot = {
  layerId: string;
  actionId: string;
  startTime: number;
  duration: number;
  delay: number;
  animationOffset: number;
  staggerSpread: number;
};

type ActionGesture = {
  mode: "move" | "resize";
  pointerId: number;
  captureTarget: HTMLElement;
  startClient: { x: number; y: number };
  laneWidth: number;
  primaryActionId: string;
  snapshots: ActionSnapshot[];
};

type ActionPreviewMap = Record<string, { startTime: number; duration: number }>;
type LayerTimingGesture = {
  mode: "move" | "trim-start" | "trim-end";
  pointerId: number;
  captureTarget: HTMLElement;
  layerId: string;
  startClient: { x: number; y: number };
  laneWidth: number;
  startTime: number;
  duration: number;
};
type TimelineMarqueeGesture = {
  pointerId: number;
  captureTarget: HTMLDivElement;
  startClient: { x: number; y: number };
  currentClient: { x: number; y: number };
  startContent: { x: number; y: number };
  currentContent: { x: number; y: number };
  additive: boolean;
  moved: boolean;
};
type TimelineScrubGesture = {
  pointerId: number;
  captureTarget: HTMLDivElement;
  wasPlaying: boolean;
};
type LayerReorderGesture = {
  pointerId: number;
  captureTarget: HTMLElement;
  layerId: string;
  startClient: { x: number; y: number };
  pointerClientY: number;
  dragging: boolean;
  target: TimelineLayerDropTarget | null;
};

const LABEL_WIDTH = 188;
const MIN_HEIGHT = 190;
const MAX_HEIGHT = 620;
const DEFAULT_HEIGHT = 300;
const MIN_WORKSPACE_HEIGHT = 220;
const EDITOR_CHROME_HEIGHT = 90;
const HEIGHT_KEY = "kurogi.timeline.height";

export function Timeline({
  project,
  playerRef,
  selectedLayerId,
  selectedLayerIds,
  selectedActionIds,
  selectedAudioClipId,
  onSelectLayer,
  onReorderLayer,
  onSelectAction,
  onMarqueeSelect,
  onCommitActions,
  onUpdateLayerTiming,
  onUpdateSceneDuration,
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
  onCollapse,
}: TimelineProps) {
  const scene = getActiveScene(project);
  const layers = getSceneLayers(project);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [maximumHeight, setMaximumHeight] = useState(() => timelineMaximumHeight(window.innerHeight));
  const [height, setHeight] = useState(() => clamp(Number(localStorage.getItem(HEIGHT_KEY)) || DEFAULT_HEIGHT, MIN_HEIGHT, timelineMaximumHeight(window.innerHeight)));
  const [gesture, setGesture] = useState<ActionGesture | null>(null);
  const [preview, setPreview] = useState<ActionPreviewMap>({});
  const [layerTimingGesture, setLayerTimingGesture] = useState<LayerTimingGesture | null>(null);
  const [layerTimingPreview, setLayerTimingPreview] = useState<{ startTime: number; duration: number } | null>(null);
  const [timelineMarquee, setTimelineMarquee] = useState<SelectionRect | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [reorderingLayerId, setReorderingLayerId] = useState("");
  const [layerDropTarget, setLayerDropTarget] = useState<TimelineLayerDropTarget | null>(null);
  const [timelineViewport, setTimelineViewport] = useState(() => ({ scrollLeft: 0, width: window.innerWidth }));
  const layerTimingPreviewRef = useRef<{ startTime: number; duration: number } | null>(null);
  const timelineMarqueeRef = useRef<TimelineMarqueeGesture | null>(null);
  const timelineScrubRef = useRef<TimelineScrubGesture | null>(null);
  const layerReorderRef = useRef<LayerReorderGesture | null>(null);
  const layerReorderAutoScrollFrameRef = useRef(0);
  const tracksRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<ActionPreviewMap>({});
  const actionGestureCancelledRef = useRef(false);
  const layerTimingGestureCancelledRef = useRef(false);
  const resizeRef = useRef<{ pointerId: number; startY: number; height: number } | null>(null);
  const maximumHeightRef = useRef(maximumHeight);
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
    const fitTimeline = () => {
      const nextMaximum = timelineMaximumHeight(window.innerHeight);
      maximumHeightRef.current = nextMaximum;
      setMaximumHeight(nextMaximum);
      setHeight((current) => clamp(current, MIN_HEIGHT, nextMaximum));
    };
    fitTimeline();
    window.addEventListener("resize", fitTimeline);
    return () => window.removeEventListener("resize", fitTimeline);
  }, []);

  useEffect(() => {
    const tracks = tracksRef.current;
    if (!tracks) return;
    let animationFrame = 0;
    const syncViewport = () => {
      animationFrame = 0;
      const next = { scrollLeft: tracks.scrollLeft, width: tracks.clientWidth };
      setTimelineViewport((current) => current.scrollLeft === next.scrollLeft && current.width === next.width ? current : next);
    };
    const scheduleViewportSync = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(syncViewport);
    };
    syncViewport();
    tracks.addEventListener("scroll", scheduleViewportSync, { passive: true });
    window.addEventListener("resize", scheduleViewportSync);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleViewportSync);
    resizeObserver?.observe(tracks);
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      tracks.removeEventListener("scroll", scheduleViewportSync);
      window.removeEventListener("resize", scheduleViewportSync);
      resizeObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!gesture) return;
    const active = gesture;
    let didDrag = false;
    const updatePreview = (next: ActionPreviewMap) => {
      previewRef.current = next;
      setPreview(next);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== active.pointerId) return;
      const currentClient = { x: event.clientX, y: event.clientY };
      if (!didDrag && !timelineDragThresholdPassed(active.startClient, currentClient)) return;
      didDrag = true;
      event.preventDefault();
      const delta = ((event.clientX - active.startClient.x) / Math.max(1, active.laneWidth)) * scene.duration;
      const primary = active.snapshots.find((snapshot) => snapshot.actionId === active.primaryActionId) ?? active.snapshots[0];
      if (!primary) return;
      if (active.mode === "move") {
        const rawPrimaryStart = primary.animationOffset + primary.startTime + primary.delay + delta;
        const effectivePrimaryStart = event.altKey
          ? rawPrimaryStart
          : snapTime(rawPrimaryStart, project, frame / scene.fps, new Set(active.snapshots.map((snapshot) => snapshot.actionId)), active.laneWidth);
        const snappedDelta = effectivePrimaryStart - primary.animationOffset - primary.delay - primary.startTime;
        const next: ActionPreviewMap = {};
        for (const snapshot of active.snapshots) {
          next[snapshot.actionId] = {
            startTime: Math.max(0, snapshot.startTime + snappedDelta),
            duration: snapshot.duration,
          };
        }
        updatePreview(next);
      } else {
        const rawDuration = primary.duration + delta;
        const primaryEnd = primary.animationOffset + primary.startTime + primary.delay + rawDuration + primary.staggerSpread;
        const snappedEnd = event.altKey
          ? primaryEnd
          : snapTime(primaryEnd, project, frame / scene.fps, new Set(active.snapshots.map((snapshot) => snapshot.actionId)), active.laneWidth);
        const durationDelta = Math.max(.05, snappedEnd - primary.animationOffset - primary.startTime - primary.delay - primary.staggerSpread) - primary.duration;
        const next: ActionPreviewMap = {};
        for (const snapshot of active.snapshots) {
          next[snapshot.actionId] = {
            startTime: snapshot.startTime,
            duration: Math.max(.05, snapshot.duration + durationDelta),
          };
        }
        updatePreview(next);
      }
    };
    const end = (commit: boolean) => {
      if (commit && didDrag && !actionGestureCancelledRef.current) {
        const patches = active.snapshots.map((snapshot) => ({
          layerId: snapshot.layerId,
          actionId: snapshot.actionId,
          startTime: previewRef.current[snapshot.actionId]?.startTime ?? snapshot.startTime,
          duration: previewRef.current[snapshot.actionId]?.duration ?? snapshot.duration,
        }));
        if (patches.length) onCommitActions(patches);
      }
      previewRef.current = {};
      setPreview({});
      setGesture((current) => current === active ? null : current);
      releasePointerCaptureSafely(active.captureTarget, active.pointerId);
      actionGestureCancelledRef.current = false;
    };
    const finish = (event: PointerEvent) => { if (event.pointerId === active.pointerId) end(true); };
    const cancel = (event: PointerEvent) => {
      if (event.pointerId !== active.pointerId) return;
      actionGestureCancelledRef.current = true;
      end(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [frame, gesture, onCommitActions, project, scene.duration, scene.fps]);

  useEffect(() => {
    if (!layerTimingGesture) return;
    const active = layerTimingGesture;
    let didDrag = false;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== active.pointerId) return;
      const currentClient = { x: event.clientX, y: event.clientY };
      if (!didDrag && !timelineDragThresholdPassed(active.startClient, currentClient)) return;
      didDrag = true;
      event.preventDefault();
      const delta = ((event.clientX - active.startClient.x) / Math.max(1, active.laneWidth)) * scene.duration;
      let startTime = active.startTime;
      let duration = active.duration;
      if (active.mode === "move") startTime = Math.max(0, active.startTime + delta);
      if (active.mode === "trim-start") {
        const end = active.startTime + active.duration;
        startTime = clamp(active.startTime + delta, 0, end - .01);
        duration = end - startTime;
      }
      if (active.mode === "trim-end") duration = Math.max(.01, active.duration + delta);
      const next = { startTime, duration };
      layerTimingPreviewRef.current = next;
      setLayerTimingPreview(next);
    };
    const end = (commit: boolean) => {
      if (commit && didDrag && !layerTimingGestureCancelledRef.current) {
        const value = layerTimingPreviewRef.current ?? { startTime: active.startTime, duration: active.duration };
        onUpdateLayerTiming(active.layerId, value.startTime, value.duration);
      }
      layerTimingPreviewRef.current = null;
      setLayerTimingPreview(null);
      setLayerTimingGesture((current) => current === active ? null : current);
      releasePointerCaptureSafely(active.captureTarget, active.pointerId);
      layerTimingGestureCancelledRef.current = false;
    };
    const finish = (event: PointerEvent) => { if (event.pointerId === active.pointerId) end(true); };
    const cancel = (event: PointerEvent) => {
      if (event.pointerId !== active.pointerId) return;
      layerTimingGestureCancelledRef.current = true;
      end(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [layerTimingGesture, onUpdateLayerTiming, scene.duration]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = resizeRef.current;
      if (!active) return;
      setHeight(clamp(active.height + active.startY - event.clientY, MIN_HEIGHT, maximumHeightRef.current));
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

  useEffect(() => () => {
    if (layerReorderAutoScrollFrameRef.current) window.cancelAnimationFrame(layerReorderAutoScrollFrameRef.current);
    const active = layerReorderRef.current;
    if (active) releasePointerCaptureSafely(active.captureTarget, active.pointerId);
    layerReorderRef.current = null;
    document.body.classList.remove("timeline-layer-reordering");
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

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const hasGesture = Boolean(gesture || layerTimingGesture || timelineMarqueeRef.current || layerReorderRef.current);
      const hasSelection = Boolean(selectedLayerIds.length || selectedActionIds.length || selectedAudioClipId);
      if (!hasGesture && !hasSelection) return;
      event.preventDefault();
      cancelActiveTimelineGestures();
      onMarqueeSelect([], [], false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [gesture, layerTimingGesture, onMarqueeSelect, selectedActionIds.length, selectedAudioClipId, selectedLayerIds.length]);

  const laneWidth = timelineLaneWidth(scene.duration, zoom);
  const timelineLayers = [...layers].reverse();
  const rulerMarks = useMemo(() => visibleTimelineRulerMarks({
    duration: scene.duration,
    laneWidth,
    scrollLeft: timelineViewport.scrollLeft,
    viewportWidth: timelineViewport.width,
    labelWidth: LABEL_WIDTH,
  }), [laneWidth, scene.duration, timelineViewport]);
  const primaryActionId = selectedActionIds.at(-1) ?? "";
  const selectedAction = findAction(project, primaryActionId);
  const selectedAudioClip = selectedAudioClipId ? project.audioClips[selectedAudioClipId] ?? null : null;
  const selectedGroups = new Set(selectedActionIds.map((id) => findAction(project, id)?.action.groupId).filter(Boolean));
  const canEditTimeline = selectedLayerIds.length > 0 || Boolean(selectedAudioClip);
  const contentEnd = useMemo(() => timelineContentEnd(project, scene.id), [project, scene.id]);
  const contentOverflow = contentEnd > scene.duration + .001;

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

  function seekToFrame(nextFrame: number) {
    const targetFrame = clamp(Math.round(nextFrame), 0, Math.max(0, Math.round(scene.duration * scene.fps) - 1));
    playerRef.current?.seekTo(targetFrame);
    setFrame(targetFrame);
  }

  function seekFromRulerPointer(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    seekToTime(ratio * scene.duration);
  }

  function beginRulerScrub(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    const wasPlaying = playing;
    playerRef.current?.pause();
    const captureTarget = event.currentTarget;
    setPointerCaptureSafely(captureTarget, event.pointerId);
    timelineScrubRef.current = { pointerId: event.pointerId, captureTarget, wasPlaying };
    setScrubbing(true);
    seekFromRulerPointer(event);
  }

  function moveRulerScrub(event: React.PointerEvent<HTMLDivElement>) {
    const active = timelineScrubRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    seekFromRulerPointer(event);
  }

  function finishRulerScrub(event: React.PointerEvent<HTMLDivElement>) {
    const active = timelineScrubRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    seekFromRulerPointer(event);
    timelineScrubRef.current = null;
    setScrubbing(false);
    releasePointerCaptureSafely(active.captureTarget, active.pointerId);
    if (active.wasPlaying) playerRef.current?.play();
  }

  function cancelRulerScrub(pointerId?: number) {
    const active = timelineScrubRef.current;
    if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return;
    timelineScrubRef.current = null;
    setScrubbing(false);
    releasePointerCaptureSafely(active.captureTarget, active.pointerId);
    if (active.wasPlaying) playerRef.current?.play();
  }

  function seekFromTimelinePointer(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".timeline-action")) return;
    const tracks = tracksRef.current;
    if (!tracks) return;
    const rect = tracks.getBoundingClientRect();
    const time = timelineTimeAtClientX({
      clientX: event.clientX,
      viewportLeft: rect.left,
      scrollLeft: tracks.scrollLeft,
      labelWidth: LABEL_WIDTH,
      laneWidth,
      duration: scene.duration,
    });
    seekToTime(time);
  }

  function beginActionGesture(event: React.PointerEvent<HTMLElement>, layerId: string, action: AnimationAction, mode: ActionGesture["mode"]) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    const lane = event.currentTarget.closest(".track-lane") as HTMLElement | null;
    if (!lane) return;
    const targets = actionSelectionTargets(project, action);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const ids = timelinePointerSelection(selectedActionIds, targets, additive);
    const preserveExisting = !additive && selectedActionIds.length > targets.length && targets.every((id) => selectedActionIds.includes(id));
    if (!preserveExisting) onSelectAction(layerId, action.id, additive);
    if (!ids.includes(action.id)) return;
    const snapshots = actionSnapshots(project, ids);
    const initialPreview = Object.fromEntries(snapshots.map((snapshot) => [snapshot.actionId, { startTime: snapshot.startTime, duration: snapshot.duration }]));
    previewRef.current = initialPreview;
    setPreview(initialPreview);
    actionGestureCancelledRef.current = false;
    setPointerCaptureSafely(event.currentTarget, event.pointerId);
    setGesture({
      mode,
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      startClient: { x: event.clientX, y: event.clientY },
      laneWidth: lane.getBoundingClientRect().width,
      primaryActionId: action.id,
      snapshots,
    });
  }

  function beginLayerTimingGesture(event: React.PointerEvent<HTMLElement>, layer: Layer, mode: LayerTimingGesture["mode"]) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    const lane = event.currentTarget.closest(".track-lane") as HTMLElement | null;
    if (!lane) return;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const ids = timelinePointerSelection(selectedLayerIds, [layer.id], additive);
    const preserveExisting = !additive && selectedLayerIds.length > 1 && selectedLayerIds.includes(layer.id);
    if (!preserveExisting) onSelectLayer(layer.id, additive);
    if (!ids.includes(layer.id)) return;
    const startTime = clamp(layer.startTime ?? 0, 0, scene.duration);
    const duration = clamp(layer.duration ?? scene.duration - startTime, .01, Math.max(.01, scene.duration - startTime));
    const initial = { startTime, duration };
    layerTimingPreviewRef.current = initial;
    setLayerTimingPreview(initial);
    layerTimingGestureCancelledRef.current = false;
    setPointerCaptureSafely(event.currentTarget, event.pointerId);
    setLayerTimingGesture({
      mode,
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      layerId: layer.id,
      startClient: { x: event.clientX, y: event.clientY },
      laneWidth: lane.getBoundingClientRect().width,
      startTime,
      duration,
    });
  }

  function layerSelectionIsAdditive(event: Pick<React.MouseEvent | React.KeyboardEvent | React.PointerEvent, "shiftKey" | "ctrlKey" | "metaKey">) {
    return event.shiftKey || event.ctrlKey || event.metaKey;
  }

  function updateLayerReorderTarget(clientY: number) {
    const active = layerReorderRef.current;
    const lanes = tracksRef.current?.querySelector<HTMLElement>(".timeline-lanes");
    if (!active || !active.dragging || !lanes) return;
    const draggedParentId = project.layers[active.layerId]?.parentId ?? "";
    const rows = Array.from(lanes.querySelectorAll<HTMLElement>("[data-timeline-layer-row='true']"))
      .map((row) => ({
        id: row.dataset.timelineLayerId ?? "",
        top: row.getBoundingClientRect().top,
        bottom: row.getBoundingClientRect().bottom,
      }))
      .filter((row) => (project.layers[row.id]?.parentId ?? "") === draggedParentId);
    const target = timelineLayerDropTargetAtY(rows, active.layerId, clientY);
    active.target = target;
    setLayerDropTarget((current) => current?.targetId === target?.targetId && current?.edge === target?.edge ? current : target);
  }

  function runLayerReorderAutoScroll() {
    if (layerReorderAutoScrollFrameRef.current) return;
    const tick = () => {
      layerReorderAutoScrollFrameRef.current = 0;
      const active = layerReorderRef.current;
      const tracks = tracksRef.current;
      if (!active || !tracks) return;
      if (active.dragging) {
        const rect = tracks.getBoundingClientRect();
        const velocity = timelineLayerReorderAutoScrollVelocity(active.pointerClientY, rect.top, rect.bottom);
        if (velocity) {
          const previous = tracks.scrollTop;
          tracks.scrollTop += velocity;
          if (tracks.scrollTop !== previous) updateLayerReorderTarget(active.pointerClientY);
        }
      }
      layerReorderAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };
    layerReorderAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
  }

  function beginLayerReorder(event: React.PointerEvent<HTMLElement>, layer: Layer) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    if (!selectedLayerIds.includes(layer.id)) onSelectLayer(layer.id, layerSelectionIsAdditive(event));
    const captureTarget = event.currentTarget;
    setPointerCaptureSafely(captureTarget, event.pointerId);
    layerReorderRef.current = {
      pointerId: event.pointerId,
      captureTarget,
      layerId: layer.id,
      startClient: { x: event.clientX, y: event.clientY },
      pointerClientY: event.clientY,
      dragging: false,
      target: null,
    };
    setLayerDropTarget(null);
    runLayerReorderAutoScroll();
  }

  function moveLayerReorder(event: React.PointerEvent<HTMLElement>) {
    const active = layerReorderRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.pointerClientY = event.clientY;
    if (!active.dragging && !timelineDragThresholdPassed(active.startClient, { x: event.clientX, y: event.clientY })) return;
    event.preventDefault();
    event.stopPropagation();
    if (!active.dragging) {
      active.dragging = true;
      setReorderingLayerId(active.layerId);
      document.body.classList.add("timeline-layer-reordering");
    }
    updateLayerReorderTarget(event.clientY);
  }

  function finishLayerReorder(event: React.PointerEvent<HTMLElement>) {
    const active = layerReorderRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    active.pointerClientY = event.clientY;
    if (active.dragging) updateLayerReorderTarget(event.clientY);
    const targetId = active.target?.targetId ?? "";
    cleanupLayerReorder();
    if (active.dragging && targetId) onReorderLayer(active.layerId, targetId);
  }

  function cleanupLayerReorder(pointerId?: number) {
    const active = layerReorderRef.current;
    if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return;
    layerReorderRef.current = null;
    if (layerReorderAutoScrollFrameRef.current) {
      window.cancelAnimationFrame(layerReorderAutoScrollFrameRef.current);
      layerReorderAutoScrollFrameRef.current = 0;
    }
    document.body.classList.remove("timeline-layer-reordering");
    setReorderingLayerId("");
    setLayerDropTarget(null);
    releasePointerCaptureSafely(active.captureTarget, active.pointerId);
  }

  function handleLayerRowKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, layer: Layer) {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const parentId = layer.parentId ?? "";
      const siblings = timelineLayers.filter((candidate) => (candidate.parentId ?? "") === parentId);
      const siblingIndex = siblings.findIndex((candidate) => candidate.id === layer.id);
      const target = siblings[siblingIndex + (event.key === "ArrowUp" ? -1 : 1)];
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      if (!selectedLayerIds.includes(layer.id)) onSelectLayer(layer.id, false);
      onReorderLayer(layer.id, target.id);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onSelectLayer(layer.id, layerSelectionIsAdditive(event));
    }
  }

  function beginTimelineMarquee(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || (event.target as HTMLElement).closest(TIMELINE_MARQUEE_BLOCKER_SELECTOR)) return;
    event.preventDefault();
    const captureTarget = event.currentTarget;
    setPointerCaptureSafely(captureTarget, event.pointerId);
    const lanesRect = captureTarget.getBoundingClientRect();
    const client = { x: event.clientX, y: event.clientY };
    const content = timelineLocalPoint(client, lanesRect);
    timelineMarqueeRef.current = {
      pointerId: event.pointerId,
      captureTarget,
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
    if (!active || active.pointerId !== event.pointerId) return;
    const lanesRect = active.captureTarget.getBoundingClientRect();
    const currentClient = { x: event.clientX, y: event.clientY };
    const currentContent = timelineLocalPoint(currentClient, lanesRect);
    const moved = active.moved || timelineDragThresholdPassed(active.startClient, currentClient);
    const next = { ...active, currentClient, currentContent, moved };
    timelineMarqueeRef.current = next;
    setTimelineMarquee(moved ? selectionRect(next.startContent, next.currentContent) : null);
  }

  function finishTimelineMarquee(event: React.PointerEvent<HTMLDivElement>) {
    const active = timelineMarqueeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const lanes = active.captureTarget;
    const lanesRect = lanes.getBoundingClientRect();
    const currentClient = { x: event.clientX, y: event.clientY };
    const currentContent = timelineLocalPoint(currentClient, lanesRect);
    const moved = active.moved || timelineDragThresholdPassed(active.startClient, currentClient);
    timelineMarqueeRef.current = null;
    setTimelineMarquee(null);
    if (timelineReleaseIntent(moved) === "marquee") {
      const area = selectionRect(active.startContent, currentContent);
      const actionRefs = Array.from(lanes.querySelectorAll<HTMLElement>("[data-timeline-action-id]"))
        .filter((element) => selectionRectsIntersect(area, timelineLocalRect(element.getBoundingClientRect(), lanesRect)))
        .map((element) => ({ layerId: element.dataset.timelineLayerId ?? "", actionId: element.dataset.timelineActionId ?? "" }))
        .filter((ref) => ref.layerId && ref.actionId);
      const layerIds = Array.from(lanes.querySelectorAll<HTMLElement>("[data-timeline-layer-span]"))
        .filter((element) => selectionRectsIntersect(area, timelineLocalRect(element.getBoundingClientRect(), lanesRect)))
        .map((element) => element.dataset.timelineLayerId ?? "")
        .filter(Boolean);
      onMarqueeSelect([...new Set(layerIds)], actionRefs, active.additive);
    } else {
      onMarqueeSelect([], [], false);
      seekFromTimelinePointer(event);
    }
    releasePointerCaptureSafely(lanes, event.pointerId);
  }

  function cancelTimelineMarquee(pointerId?: number) {
    const active = timelineMarqueeRef.current;
    if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return;
    timelineMarqueeRef.current = null;
    setTimelineMarquee(null);
    releasePointerCaptureSafely(active.captureTarget, active.pointerId);
  }

  function cancelActiveTimelineGestures() {
    actionGestureCancelledRef.current = true;
    layerTimingGestureCancelledRef.current = true;
    if (gesture) releasePointerCaptureSafely(gesture.captureTarget, gesture.pointerId);
    if (layerTimingGesture) releasePointerCaptureSafely(layerTimingGesture.captureTarget, layerTimingGesture.pointerId);
    previewRef.current = {};
    layerTimingPreviewRef.current = null;
    setGesture(null);
    setPreview({});
    setLayerTimingGesture(null);
    setLayerTimingPreview(null);
    cleanupLayerReorder();
    cancelTimelineMarquee();
    cancelRulerScrub();
  }

  return (
    <section className="timeline behavior-timeline timeline-v3" style={{ height }}>
      <div
        className="timeline-resize-handle"
        role="separator"
        aria-label="Resize timeline"
        aria-orientation="horizontal"
        aria-valuemin={MIN_HEIGHT}
        aria-valuemax={maximumHeight}
        aria-valuenow={height}
        tabIndex={0}
        title="Drag to resize timeline. Double-click to reset."
        onDoubleClick={() => setHeight(DEFAULT_HEIGHT)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 36 : 12;
          if (event.key === "ArrowUp") { event.preventDefault(); setHeight((current) => clamp(current + step, MIN_HEIGHT, maximumHeight)); }
          else if (event.key === "ArrowDown") { event.preventDefault(); setHeight((current) => clamp(current - step, MIN_HEIGHT, MAX_HEIGHT)); }
          else if (event.key === "Home") { event.preventDefault(); setHeight(MIN_HEIGHT); }
          else if (event.key === "End") { event.preventDefault(); setHeight(maximumHeight); }
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          resizeRef.current = { pointerId: event.pointerId, startY: event.clientY, height };
          document.body.classList.add("timeline-resizing");
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
      ><i /></div>
      <div className="timeline-head">
        <div className="timeline-transport">
          <button type="button" onClick={() => playerRef.current?.seekTo(0)} title="Restart" aria-label="Restart playback"><Icon name="restart" size={15} /></button>
          <button type="button" onClick={togglePlay} className="play-btn" title="Play or pause" aria-label={playing ? "Pause playback" : "Play timeline"}><Icon name={playing ? "pause" : "play"} size={15} /></button>
          <button type="button" onClick={() => playerRef.current?.seekTo(Math.max(0, frame - 1))} title="Previous frame" aria-label="Previous frame"><Icon name="previous" size={14} /></button>
          <button type="button" onClick={() => playerRef.current?.seekTo(Math.min(scene.duration * scene.fps - 1, frame + 1))} title="Next frame" aria-label="Next frame"><Icon name="next" size={14} /></button>
          <span>{formatTime(frame / scene.fps)} / {formatTime(scene.duration)}</span>
          <div className="timeline-edit-tools" aria-label="Timeline edit tools">
            <button type="button" disabled={!canEditTimeline} onClick={onTrimStart} title="Trim start to playhead (Q)"><Icon name="trimStart" size={14} /><kbd>Q</kbd></button>
            <button type="button" disabled={!canEditTimeline} onClick={onTrimEnd} title="Trim end to playhead (W)"><Icon name="trimEnd" size={14} /><kbd>W</kbd></button>
            <button type="button" disabled={!canEditTimeline} onClick={onCut} title="Cut at playhead (Ctrl+B)"><Icon name="cut" size={14} /><kbd>Ctrl B</kbd></button>
          </div>
        </div>
        <div className={`timeline-duration-control ${contentOverflow ? "has-overflow" : ""}`} title={contentOverflow ? `Content ends at ${formatTime(contentEnd)}` : "Set scene duration"}>
          <NumberField
            label="Duration"
            value={scene.duration}
            min={.1}
            max={3600}
            step={.1}
            precision={2}
            suffix="s"
            onChange={() => undefined}
            onCommit={(duration) => onUpdateSceneDuration(duration)}
          />
          <button type="button" onClick={() => onUpdateSceneDuration(timelineRoundedDuration(Math.max(.1, contentEnd)))} title="Fit scene duration to the last layer, animation, or audio clip">Fit</button>
          <small>{contentOverflow ? `Content ${formatTime(contentEnd)}` : "Scene end"}</small>
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
        <div className="timeline-view-controls">
          <div className="timeline-zoom" title="Ctrl/Cmd + scroll to zoom around the pointer"><button type="button" aria-label="Zoom timeline out" onClick={() => setZoom((value) => Math.max(.25, value / 1.2))}><Icon name="minus" size={14} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" aria-label="Zoom timeline in" onClick={() => setZoom((value) => Math.min(8, value * 1.2))}><Icon name="plus" size={14} /></button></div>
          <button type="button" className="panel-collapse-button timeline-collapse-button" onClick={onCollapse} title="Hide timeline" aria-label="Hide timeline"><Icon name="chevronDown" size={14} /></button>
        </div>
      </div>
      {editNotice ? <div className="timeline-edit-notice"><Icon name="check" size={13} />{editNotice}</div> : null}

      <div className="tracks clean-timeline-tracks" ref={tracksRef}>
        <div
          className="timeline-lanes"
          style={{ width: LABEL_WIDTH + laneWidth }}
          onPointerDown={beginTimelineMarquee}
          onPointerMove={moveTimelineMarquee}
          onPointerUp={finishTimelineMarquee}
          onPointerCancel={(event) => cancelTimelineMarquee(event.pointerId)}
          onLostPointerCapture={(event) => cancelTimelineMarquee(event.pointerId)}
        >
          <div className="timeline-ruler-row" data-timeline-no-marquee="true" style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${laneWidth}px` }}>
            <div className="timeline-ruler-corner" aria-hidden="true"><span>Time</span><strong>{formatTime(frame / scene.fps)}</strong></div>
            <div
              className={`ruler clean-ruler timeline-scrub-ruler ${scrubbing ? "is-scrubbing" : ""}`}
              data-timeline-ruler="true"
              data-scrubbing={scrubbing ? "true" : "false"}
              role="slider"
              tabIndex={0}
              aria-label="Timeline playhead"
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={Number(scene.duration.toFixed(3))}
              aria-valuenow={Number((frame / scene.fps).toFixed(3))}
              aria-valuetext={formatTime(frame / scene.fps)}
              title="Click or drag to scrub the playhead"
              style={{ width: laneWidth }}
              onPointerDown={beginRulerScrub}
              onPointerMove={moveRulerScrub}
              onPointerUp={finishRulerScrub}
              onPointerCancel={(event) => cancelRulerScrub(event.pointerId)}
              onLostPointerCapture={(event) => cancelRulerScrub(event.pointerId)}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 10 : 1;
                if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); seekToFrame(frame - step); }
                else if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); seekToFrame(frame + step); }
                else if (event.key === "PageDown") { event.preventDefault(); seekToFrame(frame - scene.fps); }
                else if (event.key === "PageUp") { event.preventDefault(); seekToFrame(frame + scene.fps); }
                else if (event.key === "Home") { event.preventDefault(); seekToFrame(0); }
                else if (event.key === "End") { event.preventDefault(); seekToFrame(scene.duration * scene.fps - 1); }
              }}
            >{rulerMarks.map((mark) => <span key={mark} aria-hidden="true" data-ruler-time={mark} style={{ left: `${(mark / scene.duration) * 100}%` }}>{formatRuler(mark)}</span>)}</div>
          </div>
          {contentEnd > .001 && contentEnd <= scene.duration + .001 ? <div className="timeline-content-end-marker" aria-hidden="true" style={{ left: LABEL_WIDTH + (contentEnd / Math.max(.001, scene.duration)) * laneWidth }}><span>{formatTime(contentEnd)}</span></div> : null}
          <div className={`playhead ${scrubbing ? "is-scrubbing" : ""}`} data-timeline-playhead="true" data-playhead-time={Number((frame / scene.fps).toFixed(3))} style={{ left: LABEL_WIDTH + (frame / Math.max(1, scene.duration * scene.fps)) * laneWidth }}><i />{scrubbing ? <span className="playhead-time-badge">{formatTime(frame / scene.fps)}</span> : null}</div>
          {timelineMarquee ? <div className="timeline-selection-marquee" style={{ left: timelineMarquee.left, top: timelineMarquee.top, width: timelineMarquee.right - timelineMarquee.left, height: timelineMarquee.bottom - timelineMarquee.top }} /> : null}
          <AudioTimelineTracks project={project} laneWidth={laneWidth} labelWidth={LABEL_WIDTH} selectedClipId={selectedAudioClipId} onSelect={onSelectAudioClip} onUpdate={onUpdateAudioClip} onDelete={onDeleteAudioClip} onDuplicate={onDuplicateAudioClip} onSeek={seekToTime} />
          {timelineLayers.map((layer) => <div
            className={`track timeline-layer-row ${layer.type === "group" ? "is-group" : ""} ${layer.parentId ? "is-group-child" : ""} ${reorderingLayerId === layer.id ? "is-reordering" : ""}`}
            key={layer.id}
            data-timeline-layer-row="true"
            data-timeline-layer-id={layer.id}
            data-timeline-parent-id={layer.parentId || undefined}
            style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${laneWidth}px` }}
          >
            {layerDropTarget?.targetId === layer.id ? <span className={`timeline-layer-drop-indicator is-${layerDropTarget.edge}`} aria-hidden="true" /> : null}
            <button
              type="button"
              aria-pressed={selectedLayerIds.includes(layer.id)}
              aria-label={`${layer.name} layer. Alt+Arrow Up or Alt+Arrow Down to reorder.`}
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
              onClick={(event) => onSelectLayer(layer.id, layerSelectionIsAdditive(event))}
              onKeyDown={(event) => handleLayerRowKeyDown(event, layer)}
              className={`timeline-layer-row-label ${selectedLayerIds.includes(layer.id) ? "track-selected" : ""}`}
              title={`${layer.name} · Drag the grip to reorder · Alt+↑/↓ also moves this layer`}
            >
              <span
                className="timeline-layer-reorder-grip"
                data-timeline-no-marquee="true"
                aria-hidden="true"
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
                onPointerDown={(event) => beginLayerReorder(event, layer)}
                onPointerMove={moveLayerReorder}
                onPointerUp={finishLayerReorder}
                onPointerCancel={(event) => cleanupLayerReorder(event.pointerId)}
                onLostPointerCapture={(event) => cleanupLayerReorder(event.pointerId)}
              ><Icon name="grip" size={14} /></span>
              <LayerThumbnail project={project} layer={layer} size={22} decorative />
              <span className="track-name">{layer.name}</span>
            </button>
            <div className="track-lane clean-track-lane">
              {(() => {
                const timing = layerTimingGesture?.layerId === layer.id && layerTimingPreview ? layerTimingPreview : { startTime: layer.startTime ?? 0, duration: layer.duration ?? scene.duration - (layer.startTime ?? 0) };
                return <div role="button" tabIndex={0} aria-pressed={selectedLayerIds.includes(layer.id)} aria-label={`Select ${layer.name} layer`} data-timeline-layer-span="true" data-timeline-layer-id={layer.id} className={`timeline-layer-span ${selectedLayerIds.includes(layer.id) ? "is-selected" : ""}`} style={{ left: `${(timing.startTime / scene.duration) * 100}%`, width: `${Math.max(0, (timing.duration / scene.duration) * 100)}%` }} onPointerDown={(event) => beginLayerTimingGesture(event, layer, "move")} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectLayer(layer.id, event.shiftKey); } }} title={`${layer.name} · ${timing.startTime.toFixed(2)}s–${(timing.startTime + timing.duration).toFixed(2)}s`}>
                  <span className="layer-trim-handle is-start" onPointerDown={(event) => beginLayerTimingGesture(event, layer, "trim-start")} />
                  <span className="layer-span-fill" />
                  <span className="layer-trim-handle is-end" onPointerDown={(event) => beginLayerTimingGesture(event, layer, "trim-end")} />
                </div>;
              })()}
              {layer.animationActions.map((action) => {
                const activePreview = preview[action.id] ?? action;
                const animationOffset = getLayerRenderTiming(layer, scene).animationOffset;
                const effectiveStart = animationOffset + activePreview.startTime + action.delay;
                const text = layer.type === "text" ? layer.text : "";
                const spread = textAnimationStaggerSpread(action, text);
                const visualDuration = activePreview.duration + spread;
                const coreWidth = Math.min(100, (activePreview.duration / Math.max(.001, visualDuration)) * 100);
                const preset = presetFor(action.type);
                const selected = selectedActionIds.includes(action.id);
                return <div role="button" tabIndex={0} aria-pressed={selected} aria-label={`Select ${preset.label} animation`} key={action.id} data-timeline-action-id={action.id} data-timeline-layer-id={layer.id} className={`timeline-action action-${action.category} action-${action.type} ${spread > 0 ? "has-text-stagger" : ""} ${selected ? "selected multi-selected" : ""}`} onPointerDown={(event) => beginActionGesture(event, layer.id, action, "move")} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectAction(layer.id, action.id, event.shiftKey); } }} style={{ left: `${(effectiveStart / scene.duration) * 100}%`, width: `${Math.max(0, (visualDuration / scene.duration) * 100)}%` }} title={`${preset.label} · motion ${activePreview.duration.toFixed(2)}s · total ${visualDuration.toFixed(2)}s`}><span className="action-category">{action.category}</span>{action.groupId ? <span className="action-group-badge">G</span> : null}{layer.type === "text" ? <span className="timeline-action-scope">{textAnimationScopeBadge(textAnimationScope(action))}</span> : null}<span className="action-name">{preset.label}</span>{spread > 0 ? <span className="timeline-action-stagger-tail" aria-hidden="true" style={{ left: `${coreWidth}%` }} /> : null}<span className="action-resize" onPointerDown={(event) => beginActionGesture(event, layer.id, action, "resize")} /></div>;
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
  if (!count) {
    return <div className="timeline-selection-empty">
      <span>Drag across clips to edit animation blocks together</span>
      {canPaste ? <button type="button" onClick={onPaste}>Paste animation</button> : null}
    </div>;
  }

  return <div className="animation-workflow-bar">
    <span><strong>{count}</strong> block{count === 1 ? "" : "s"}</span>
    <button type="button" onClick={onCopy}>Copy</button>
    {canPaste ? <button type="button" onClick={onPaste}>Paste</button> : null}
    <button type="button" onClick={onDuplicate}>Duplicate</button>
    {count >= 2 ? <button type="button" onClick={onGroup}>Group</button> : null}
    {groupSelected ? <button type="button" onClick={onUngroup}>Ungroup</button> : null}
    {count >= 2 ? <div className="timeline-stagger-tools"><label>Sequence <input aria-label="Sequence block gap" type="number" min="0" max="5" step=".01" value={staggerStep} onChange={(event) => onStaggerStep(Math.max(0, Number(event.currentTarget.value)))} /></label><select aria-label="Sequence block order" value={staggerOrder} onChange={(event) => onStaggerOrder(event.currentTarget.value as StaggerOrder)}><option value="normal">Forward</option><option value="reverse">Reverse</option><option value="center">Center</option><option value="edges">Edges</option><option value="random">Random</option></select><button type="button" onClick={onStagger}>Apply</button></div> : null}
    <button type="button" onClick={onSavePreset}>Save preset</button>
    <button type="button" className="danger-text" onClick={onDelete}>Delete</button>
  </div>;
}

function actionSelectionTargets(project: KurogiProject, action: AnimationAction) {
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
    const scene = project.scenes[layer.sceneId];
    if (!scene) continue;
    const animationOffset = getLayerRenderTiming(layer, scene).animationOffset;
    const text = layer.type === "text" ? layer.text : "";
    for (const action of layer.animationActions) if (wanted.has(action.id)) snapshots.push({ layerId: layer.id, actionId: action.id, startTime: action.startTime, duration: action.duration, delay: action.delay, animationOffset, staggerSpread: textAnimationStaggerSpread(action, text) });
  }
  return snapshots;
}

function snapTime(time: number, project: KurogiProject, playheadTime: number, ignoredActionIds: Set<string>, laneWidth: number) {
  const scene = getActiveScene(project);
  const threshold = Math.max(.02, (8 / Math.max(1, laneWidth)) * scene.duration);
  const candidates = [0, scene.duration, playheadTime];
  for (const layer of getSceneLayers(project)) {
    const timing = getLayerRenderTiming(layer, scene);
    const text = layer.type === "text" ? layer.text : "";
    for (const action of layer.animationActions) if (!ignoredActionIds.has(action.id)) {
      const start = timing.animationOffset + action.startTime + action.delay;
      candidates.push(start, start + textAnimationVisualDuration(action, text));
    }
  }
  let closest = time;
  let distance = threshold;
  for (const candidate of candidates) { const next = Math.abs(candidate - time); if (next <= distance) { closest = candidate; distance = next; } }
  return closest;
}

function findAction(project: KurogiProject, actionId: string) { if (!actionId) return null; for (const layer of Object.values(project.layers)) { const action = layer.animationActions.find((candidate) => candidate.id === actionId); if (action) return { layerId: layer.id, action }; } return null; }
function timelineContentEnd(project: KurogiProject, sceneId: string) {
  const scene = project.scenes[sceneId];
  if (!scene) return 0;
  let end = 0;
  for (const layerId of scene.layerIds) {
    const layer = project.layers[layerId];
    if (!layer) continue;
    const start = Math.max(0, layer.startTime ?? 0);
    const duration = Math.max(.01, layer.duration ?? 0);
    end = Math.max(end, start + duration);
    const timing = getLayerRenderTiming(layer, scene);
    const text = layer.type === "text" ? layer.text : "";
    for (const action of layer.animationActions) end = Math.max(end, timing.animationOffset + action.startTime + action.delay + textAnimationVisualDuration(action, text));
  }
  for (const clipId of scene.audioClipIds ?? []) {
    const clip = project.audioClips[clipId];
    if (clip) end = Math.max(end, clip.startTime + clip.duration);
  }
  return end;
}
function timelineRoundedDuration(duration: number) { return clamp(Math.ceil(duration * 10) / 10, .1, 3600); }
function formatTime(seconds: number) { const minutes = Math.floor(seconds / 60); const remainder = Math.max(0, seconds - minutes * 60); return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`; }
function formatRuler(seconds: number) { return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(seconds % 1 ? 1 : 0)}s`; }
function timelineLaneWidth(duration: number, zoom: number) { return Math.max(760, duration * 150) * zoom; }
function setPointerCaptureSafely(target: HTMLElement, pointerId: number) {
  try { target.setPointerCapture(pointerId); } catch { /* Pointer may already have ended. */ }
}
function releasePointerCaptureSafely(target: HTMLElement, pointerId: number) {
  try { if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId); } catch { /* Element may have detached. */ }
}
function timelineMaximumHeight(viewportHeight: number) {
  const available = Math.floor(viewportHeight - EDITOR_CHROME_HEIGHT - MIN_WORKSPACE_HEIGHT);
  return clamp(available, MIN_HEIGHT, MAX_HEIGHT);
}

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { getActiveScene, getSceneLayers } from "../core/project";
import type { AnimationAction, KurogiProject } from "../types";
import { presetFor } from "./animationPresets";

interface TimelineProps {
  project: KurogiProject;
  playerRef: React.RefObject<PlayerRef>;
  selectedLayerId: string;
  selectedActionId: string;
  onSelectLayer: (layerId: string) => void;
  onSelectAction: (layerId: string, actionId: string) => void;
  onCommitAction: (
    layerId: string,
    actionId: string,
    patch: Partial<Pick<AnimationAction, "startTime" | "duration">>,
  ) => void;
  onDeleteAction: (layerId: string, actionId: string) => void;
  onDuplicateAction: (layerId: string, actionId: string) => void;
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

const LABEL_WIDTH = 188;

export function Timeline({
  project,
  playerRef,
  selectedLayerId,
  selectedActionId,
  onSelectLayer,
  onSelectAction,
  onCommitAction,
  onDeleteAction,
  onDuplicateAction,
}: TimelineProps) {
  const scene = getActiveScene(project);
  const layers = getSceneLayers(project);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [gesture, setGesture] = useState<ActionGesture | null>(null);
  const [preview, setPreview] = useState<{ startTime: number; duration: number } | null>(null);
  const laneViewportRef = useRef<HTMLDivElement>(null);

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
    if (!gesture) return;
    const activeGesture: ActionGesture = gesture;

    function move(event: PointerEvent) {
      const delta = ((event.clientX - activeGesture.clientX) / activeGesture.laneWidth) * scene.duration;
      if (activeGesture.mode === "move") {
        const rawEffectiveStart = activeGesture.initialStart + activeGesture.delay + delta;
        const effectiveStart = event.altKey
          ? rawEffectiveStart
          : snapTime(rawEffectiveStart, project, frame / scene.fps, activeGesture.actionId, activeGesture.laneWidth);
        const startTime = clamp(
          effectiveStart - activeGesture.delay,
          0,
          Math.max(0, scene.duration - activeGesture.initialDuration - activeGesture.delay),
        );
        setPreview({ startTime, duration: activeGesture.initialDuration });
      } else {
        const rawDuration = activeGesture.initialDuration + delta;
        const rawEnd = activeGesture.initialStart + activeGesture.delay + rawDuration;
        const snappedEnd = event.altKey
          ? rawEnd
          : snapTime(rawEnd, project, frame / scene.fps, activeGesture.actionId, activeGesture.laneWidth);
        const duration = clamp(
          snappedEnd - activeGesture.initialStart - activeGesture.delay,
          0.05,
          Math.max(0.05, scene.duration - activeGesture.initialStart - activeGesture.delay),
        );
        setPreview({ startTime: activeGesture.initialStart, duration });
      }
    }

    function finish() {
      if (preview) onCommitAction(activeGesture.layerId, activeGesture.actionId, preview);
      setGesture(null);
      setPreview(null);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [frame, gesture, onCommitAction, preview, project, scene.duration, scene.fps]);

  const rulerMarks = useMemo(() => {
    const divisions = Math.max(2, Math.min(12, Math.ceil(scene.duration)));
    return Array.from({ length: divisions + 1 }, (_, index) => (scene.duration * index) / divisions);
  }, [scene.duration]);
  const laneWidth = Math.max(760, scene.duration * 165 * zoom);
  const selectedAction = findAction(project, selectedActionId);

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;
    if (playing) player.pause();
    else player.play();
  }

  function seekFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".timeline-action")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const time = clamp(((event.clientX - rect.left) / rect.width) * scene.duration, 0, scene.duration);
    const targetFrame = Math.min(
      Math.max(0, Math.round(time * scene.fps)),
      Math.max(0, Math.round(scene.duration * scene.fps) - 1),
    );
    playerRef.current?.seekTo(targetFrame);
    setFrame(targetFrame);
  }

  function beginScrub(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".timeline-action")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromPointer(event);
  }

  function beginActionGesture(
    event: React.PointerEvent<HTMLElement>,
    layerId: string,
    action: AnimationAction,
    mode: ActionGesture["mode"],
  ) {
    event.preventDefault();
    event.stopPropagation();
    const lane = event.currentTarget.closest(".track-lane") as HTMLElement | null;
    if (!lane) return;
    onSelectAction(layerId, action.id);
    setGesture({
      layerId,
      actionId: action.id,
      mode,
      clientX: event.clientX,
      laneWidth: lane.getBoundingClientRect().width,
      initialStart: action.startTime,
      initialDuration: action.duration,
      delay: action.delay,
    });
    setPreview({ startTime: action.startTime, duration: action.duration });
  }

  return (
    <section className="timeline behavior-timeline">
      <div className="timeline-head">
        <div className="timeline-transport">
          <button type="button" onClick={() => playerRef.current?.seekTo(0)} title="Restart">↺</button>
          <button type="button" onClick={togglePlay} className="play-btn" title="Play or pause">
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            type="button"
            onClick={() => playerRef.current?.seekTo(Math.max(0, frame - 1))}
            title="Previous frame"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => playerRef.current?.seekTo(Math.min(scene.duration * scene.fps - 1, frame + 1))}
            title="Next frame"
          >
            ›
          </button>
          <span>{formatTime(frame / scene.fps)} / {formatTime(scene.duration)}</span>
        </div>
        <div className="timeline-selection-actions">
          {selectedAction ? (
            <>
              <span>{presetFor(selectedAction.action.type).label}</span>
              <button
                type="button"
                onClick={() => onDuplicateAction(selectedAction.layerId, selectedAction.action.id)}
                title="Duplicate action"
              >
                Duplicate
              </button>
              <button
                type="button"
                className="danger-text"
                onClick={() => onDeleteAction(selectedAction.layerId, selectedAction.action.id)}
                title="Delete action"
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
        <div className="timeline-zoom">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.2))}>+</button>
        </div>
      </div>

      <div className="tracks" ref={laneViewportRef}>
        <div className="timeline-lanes" style={{ width: LABEL_WIDTH + laneWidth }}>
          <div className="ruler" style={{ left: LABEL_WIDTH, width: laneWidth }}>
            {rulerMarks.map((mark) => (
              <span key={mark} style={{ left: `${(mark / scene.duration) * 100}%` }}>{formatRuler(mark)}</span>
            ))}
          </div>
          <div
            className="playhead"
            style={{ left: LABEL_WIDTH + (frame / Math.max(1, scene.duration * scene.fps)) * laneWidth }}
          >
            <i />
          </div>
          {[...layers].reverse().map((layer) => (
            <div className="track" key={layer.id} style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${laneWidth}px` }}>
              <button
                type="button"
                onClick={() => onSelectLayer(layer.id)}
                className={selectedLayerId === layer.id ? "track-selected" : ""}
              >
                <span className={`layer-thumb ${layer.type}`}>{layer.type === "text" ? "T" : layer.type === "shape" ? "●" : "◇"}</span>
                <span className="track-name">{layer.name}</span>
              </button>
              <div
                className="track-lane"
                onPointerDown={beginScrub}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event);
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                }}
              >
                {layer.animationActions.map((action) => {
                  const isGesture = gesture?.actionId === action.id;
                  const startTime = isGesture && preview ? preview.startTime : action.startTime;
                  const duration = isGesture && preview ? preview.duration : action.duration;
                  const effectiveStart = startTime + action.delay;
                  const preset = presetFor(action.type);
                  return (
                    <div
                      key={action.id}
                      className={`timeline-action action-${action.category} ${selectedActionId === action.id ? "selected" : ""}`}
                      onPointerDown={(event) => beginActionGesture(event, layer.id, action, "move")}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectAction(layer.id, action.id);
                      }}
                      style={{
                        left: `${(effectiveStart / scene.duration) * 100}%`,
                        width: `${Math.max(0.6, (duration / scene.duration) * 100)}%`,
                      }}
                      title={`${preset.label} · ${duration.toFixed(2)}s`}
                    >
                      <span className="action-category">{action.category}</span>
                      <span className="action-name">{preset.label}</span>
                      <span
                        className="action-resize"
                        onPointerDown={(event) => beginActionGesture(event, layer.id, action, "resize")}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function snapTime(
  time: number,
  project: KurogiProject,
  playheadTime: number,
  ignoredActionId: string,
  laneWidth: number,
): number {
  const scene = getActiveScene(project);
  const threshold = Math.max(0.02, (8 / Math.max(1, laneWidth)) * scene.duration);
  const candidates = [0, scene.duration, playheadTime];
  for (const layer of getSceneLayers(project)) {
    for (const action of layer.animationActions) {
      if (action.id === ignoredActionId) continue;
      const start = action.startTime + action.delay;
      candidates.push(start, start + action.duration);
    }
  }
  let closest = time;
  let distance = threshold;
  for (const candidate of candidates) {
    const nextDistance = Math.abs(candidate - time);
    if (nextDistance <= distance) {
      closest = candidate;
      distance = nextDistance;
    }
  }
  return closest;
}

function findAction(project: KurogiProject, actionId: string) {
  if (!actionId) return null;
  for (const layer of Object.values(project.layers)) {
    const action = layer.animationActions.find((candidate) => candidate.id === actionId);
    if (action) return { layerId: layer.id, action };
  }
  return null;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.max(0, seconds - minutes * 60);
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function formatRuler(seconds: number) {
  return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(seconds % 1 ? 1 : 0)}s`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

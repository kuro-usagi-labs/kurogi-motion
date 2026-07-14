import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSceneAudioClips } from "../core/audio";
import type { AudioClip, KurogiProject } from "../types";
import { Icon } from "../ui/Icon";

interface AudioTimelineProps {
  project: KurogiProject;
  laneWidth: number;
  labelWidth: number;
  selectedClipId: string;
  onSelect: (clipId: string) => void;
  onUpdate: (clipId: string, patch: Partial<AudioClip>) => void;
  onDelete: (clipId: string) => void;
  onDuplicate: (clipId: string) => void;
  onSeek: (time: number) => void;
}

type Gesture = {
  clip: AudioClip;
  mode: "move" | "trim-start" | "trim-end";
  clientX: number;
  laneWidth: number;
};

export function AudioClipToolbar({ project, selectedClipId, onUpdate, onDelete, onDuplicate }: Pick<AudioTimelineProps, "project" | "selectedClipId" | "onUpdate" | "onDelete" | "onDuplicate">) {
  const clip = selectedClipId ? project.audioClips[selectedClipId] : null;
  if (!clip) return null;
  return (
    <div className="audio-clip-toolbar">
      <span className="audio-toolbar-title"><Icon name="audio" size={14} />{clip.name}</span>
      <label>Start <input type="number" min="0" step=".01" value={round(clip.startTime)} onChange={(event) => onUpdate(clip.id, { startTime: Number(event.currentTarget.value) })} /></label>
      <label>Trim <input type="number" min="0" step=".01" value={round(clip.trimStart)} onChange={(event) => onUpdate(clip.id, { trimStart: Number(event.currentTarget.value) })} /></label>
      <label>Duration <input type="number" min=".05" step=".01" value={round(clip.duration)} onChange={(event) => onUpdate(clip.id, { duration: Number(event.currentTarget.value) })} /></label>
      <label>Volume <input type="number" min="0" max="2" step=".05" value={round(clip.volume)} onChange={(event) => onUpdate(clip.id, { volume: Number(event.currentTarget.value) })} /></label>
      <label>Fade in <input type="number" min="0" step=".05" value={round(clip.fadeIn)} onChange={(event) => onUpdate(clip.id, { fadeIn: Number(event.currentTarget.value) })} /></label>
      <label>Fade out <input type="number" min="0" step=".05" value={round(clip.fadeOut)} onChange={(event) => onUpdate(clip.id, { fadeOut: Number(event.currentTarget.value) })} /></label>
      <label>Rate <input type="number" min=".25" max="4" step=".05" value={round(clip.playbackRate)} onChange={(event) => onUpdate(clip.id, { playbackRate: Number(event.currentTarget.value) })} /></label>
      <button type="button" className={clip.muted ? "is-active" : ""} onClick={() => onUpdate(clip.id, { muted: !clip.muted })}>{clip.muted ? "Unmute" : "Mute"}</button>
      <button type="button" onClick={() => onDuplicate(clip.id)}>Duplicate</button>
      <button type="button" className="danger-text" onClick={() => onDelete(clip.id)}>Delete</button>
    </div>
  );
}

export function AudioTimelineTracks({ project, laneWidth, labelWidth, selectedClipId, onSelect, onUpdate, onDelete: _onDelete, onDuplicate: _onDuplicate, onSeek }: AudioTimelineProps) {
  const scene = project.scenes[project.activeSceneId];
  const clips = getSceneAudioClips(project);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [preview, setPreview] = useState<Record<string, Partial<AudioClip>>>({});
  const previewRef = useRef<Record<string, Partial<AudioClip>>>({});

  useEffect(() => {
    if (!gesture || !scene) return;
    const move = (event: PointerEvent) => {
      const delta = ((event.clientX - gesture.clientX) / Math.max(1, gesture.laneWidth)) * scene.duration;
      const clip = gesture.clip;
      let patch: Partial<AudioClip> = {};
      if (gesture.mode === "move") {
        patch = { startTime: clamp(clip.startTime + delta, 0, Math.max(0, scene.duration - clip.duration)) };
      } else if (gesture.mode === "trim-end") {
        patch = { duration: clamp(clip.duration + delta, .05, Math.max(.05, scene.duration - clip.startTime)) };
      } else {
        const nextStart = clamp(clip.startTime + delta, 0, clip.startTime + clip.duration - .05);
        const shift = nextStart - clip.startTime;
        patch = {
          startTime: nextStart,
          trimStart: Math.max(0, clip.trimStart + shift * clip.playbackRate),
          duration: Math.max(.05, clip.duration - shift),
        };
      }
      previewRef.current = { [clip.id]: patch };
      setPreview(previewRef.current);
    };
    const finish = () => {
      const patch = previewRef.current[gesture.clip.id];
      if (patch) onUpdate(gesture.clip.id, patch);
      previewRef.current = {};
      setPreview({});
      setGesture(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [gesture, onUpdate, scene]);

  const waveformCache = useMemo(() => Object.fromEntries(clips.map((clip) => [clip.id, waveform(clip.id)])), [clips]);
  if (!scene) return null;

  return (
    <>
      {clips.map((clip) => {
        const active = { ...clip, ...(preview[clip.id] ?? {}) };
        const asset = project.assets[clip.assetId];
        const selected = clip.id === selectedClipId;
        return (
          <div className="track audio-track" key={clip.id} style={{ gridTemplateColumns: `${labelWidth}px ${laneWidth}px` }}>
            <button type="button" className={selected ? "track-selected" : ""} onClick={() => onSelect(clip.id)}>
              <span className="layer-thumb audio"><Icon name="audio" size={13} /></span>
              <span className="track-name">{clip.name}</span>
              {clip.muted ? <small>Muted</small> : null}
            </button>
            <div className="track-lane clean-track-lane audio-track-lane" onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest(".audio-clip-block")) return;
              const rect = event.currentTarget.getBoundingClientRect();
              onSeek(clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * scene.duration, 0, scene.duration));
            }}>
              <div
                className={`audio-clip-block ${selected ? "selected" : ""} ${clip.muted ? "muted" : ""}`}
                style={{ left: `${(active.startTime / scene.duration) * 100}%`, width: `${Math.max(.8, (active.duration / scene.duration) * 100)}%` }}
                title={`${clip.name} · ${active.duration.toFixed(2)}s${asset?.duration ? ` / ${asset.duration.toFixed(2)}s source` : ""}`}
                onClick={(event) => { event.stopPropagation(); onSelect(clip.id); }}
                onPointerDown={(event) => {
                  if ((event.target as HTMLElement).closest(".audio-trim-handle")) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onSelect(clip.id);
                  setGesture({ clip, mode: "move", clientX: event.clientX, laneWidth: event.currentTarget.parentElement?.getBoundingClientRect().width ?? laneWidth });
                }}
              >
                <span className="audio-trim-handle audio-trim-start" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onSelect(clip.id); setGesture({ clip, mode: "trim-start", clientX: event.clientX, laneWidth: event.currentTarget.parentElement?.parentElement?.getBoundingClientRect().width ?? laneWidth }); }} />
                <span className="audio-waveform" aria-hidden="true">{waveformCache[clip.id].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</span>
                <span className="audio-clip-label">{clip.name}</span>
                <span className="audio-trim-handle audio-trim-end" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onSelect(clip.id); setGesture({ clip, mode: "trim-end", clientX: event.clientX, laneWidth: event.currentTarget.parentElement?.parentElement?.getBoundingClientRect().width ?? laneWidth }); }} />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function waveform(seed: string) {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return Array.from({ length: 56 }, (_, index) => {
    value = Math.imul(value ^ index, 16777619);
    return 18 + Math.abs(value % 78);
  });
}

function round(value: number) { return Number(value.toFixed(3)); }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

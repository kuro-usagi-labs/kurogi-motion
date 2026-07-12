import React, { useLayoutEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { MotionComposition } from "../MotionComposition";
import { getActiveScene } from "../core/project";
import type { KurogiProject, Layer } from "../types";

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
}

export function CanvasStage({ project, playerRef, selectedLayerId, zoom, playing, showSafeArea, onSelect, onTransformCommit, onTextCommit }: CanvasStageProps) {
  const scene = getActiveScene(project);
  const stageRef = useRef<HTMLElement>(null);
  const [available, setAvailable] = useState({ width: 900, height: 600 });

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      setAvailable({ width: Math.max(240, rect.width - 72), height: Math.max(180, rect.height - 96) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const fitScale = Math.min(available.width / scene.width, available.height / scene.height);
  const requestedScale = fitScale * (zoom / 100);
  const scale = Math.min(fitScale, Math.max(fitScale * .25, requestedScale));
  const width = Math.max(1, Math.round(scene.width * scale));
  const height = Math.max(1, Math.round(scene.height * scale));

  return <section className="stage editor-stage" ref={stageRef}>
    <div className="stage-top"><span>{scene.name}</span><span>{scene.width} × {scene.height} · {scene.fps} FPS</span></div>
    <div className="canvas-wrap stable-canvas-wrap" style={{ width, height }}>
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
    <div className="stage-hint">Double-click text to edit · Drag handles to resize or rotate · <kbd>Space</kbd> to play</div>
  </section>;
}

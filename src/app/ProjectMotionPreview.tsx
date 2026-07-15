import { useEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { MotionComposition } from "../MotionComposition";
import { getActiveScene } from "../core/project";
import { loadProject, type ProjectSummary } from "../core/persistence";
import type { KurogiProject } from "../types";
import { Icon } from "../ui/Icon";
import { useMotionPreview } from "../ui/useMotionPreview";
import { previewDurationInFrames, PROJECT_PREVIEW_MAX_SECONDS } from "./previewPolicy";
import "../previewExperience.css";

interface ProjectMotionPreviewProps {
  project: ProjectSummary;
  latest?: boolean;
}

export function ProjectMotionPreview({ project: summary, latest = false }: ProjectMotionPreviewProps) {
  const { hostRef, shouldLoad, shouldPlay, reducedMotion, previewEvents } = useMotionPreview<HTMLDivElement>();
  const playerRef = useRef<PlayerRef>(null);
  const requestedRef = useRef(false);
  const [project, setProject] = useState<KurogiProject | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "missing" | "error">("idle");

  useEffect(() => {
    if (!shouldLoad || requestedRef.current) return;
    requestedRef.current = true;
    setStatus("loading");
    loadProject(summary.id)
      .then((loaded) => {
        if (!loaded) {
          setStatus("missing");
          return;
        }
        setProject(loaded);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [shouldLoad, summary.id]);

  const scene = project ? getActiveScene(project) : null;
  const orientation = summary.height > summary.width ? "portrait" : summary.width > summary.height ? "landscape" : "square";
  const frames = scene ? previewDurationInFrames(scene.duration, scene.fps) : 1;
  const posterFrame = scene ? Math.min(frames - 1, Math.round(Math.min(.8, scene.duration * .3) * scene.fps)) : 0;

  useEffect(() => {
    const player = playerRef.current;
    if (!player || status !== "ready") return;
    if (shouldPlay) player.play();
    else {
      player.pause();
      if (reducedMotion) player.seekTo(posterFrame);
    }
  }, [posterFrame, project, reducedMotion, shouldPlay, status]);

  return (
    <div
      ref={hostRef}
      className={`project-motion-preview project-preview-${orientation} ${status === "ready" ? "is-ready" : "is-pending"}`}
      style={{ "--project-preview-color": summary.background === "transparent" ? "#dad7e2" : summary.background } as React.CSSProperties}
      {...previewEvents}
    >
      <div className="project-preview-workbench" aria-hidden="true">
        <span className="project-preview-ruler project-preview-ruler-x" />
        <span className="project-preview-ruler project-preview-ruler-y" />
        <div className="project-preview-stage" style={{ aspectRatio: `${summary.width} / ${summary.height}` }}>
          {scene && project ? (
            <Player
              ref={playerRef}
              className="project-preview-player"
              component={MotionComposition}
              inputProps={{ project, editable: false, showSelection: false, showSafeArea: false }}
              durationInFrames={frames}
              compositionWidth={scene.width}
              compositionHeight={scene.height}
              fps={scene.fps}
              loop
              controls={false}
              initiallyMuted
              clickToPlay={false}
              spaceKeyToPlayOrPause={false}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <ProjectPreviewFallback status={status} background={summary.background} />
          )}
        </div>
      </div>
      <span className="project-preview-status">
        {latest ? <b>Latest</b> : null}
        <i><Icon name="play" size={10} />{status === "ready" ? `${Math.min(PROJECT_PREVIEW_MAX_SECONDS, summary.duration).toFixed(summary.duration < 10 ? 1 : 0)}s loop` : "Motion preview"}</i>
      </span>
      <span className="project-preview-resolution">{summary.width} × {summary.height}</span>
    </div>
  );
}

function ProjectPreviewFallback({ status, background }: { status: "idle" | "loading" | "ready" | "missing" | "error"; background: string }) {
  if (status === "missing" || status === "error") {
    return <span className="project-preview-unavailable"><Icon name="assets" size={20} /><strong>Preview unavailable</strong><small>Open the project to rebuild it</small></span>;
  }
  return <span className="project-preview-skeleton" style={{ background: background === "transparent" ? undefined : background }}><i /><i /><i /><small>{status === "loading" ? "Preparing preview" : "Preview loads on view"}</small></span>;
}

import { useEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { MotionComposition } from "../MotionComposition";
import { getActiveScene } from "../core/project";
import type { KurogiProject } from "../types";
import { Icon } from "../ui/Icon";

interface TemplateCardProps {
  name: string;
  category: string;
  description: string;
  duration: number;
  project: KurogiProject;
  onUse: () => void;
  onDelete?: () => void;
  featured?: boolean;
  palette?: readonly string[];
}

export function TemplateCard({
  name,
  category,
  description,
  duration,
  project,
  onUse,
  onDelete,
  featured = false,
  palette,
}: TemplateCardProps) {
  const articleRef = useRef<HTMLElement>(null);
  const playerRef = useRef<PlayerRef>(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const scene = getActiveScene(project);
  const orientation = scene.height > scene.width ? "portrait" : scene.width > scene.height ? "landscape" : "square";
  const sceneColor = scene.background.type === "solid" ? scene.background.color ?? "#171821" : "#171821";
  const ratio = describeRatio(scene.width, scene.height);

  useEffect(() => {
    const element = articleRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= .2),
      { threshold: [0, .2, .6] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if ((visible || hovered) && !reducedMotion) playerRef.current?.play();
    else playerRef.current?.pause();
  }, [hovered, visible]);

  return (
    <article
      ref={articleRef}
      className={`library-template-card live-template-card template-card-v4 template-${orientation}${featured ? " is-featured" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button type="button" className="live-template-preview-button" onClick={onUse} aria-label={`Open ${name} template`}>
        <div className="live-template-player" style={{ "--template-scene-color": sceneColor } as React.CSSProperties}>
          <div className="live-template-player-frame" style={{ aspectRatio: `${scene.width} / ${scene.height}` }}>
            <Player
              ref={playerRef}
              component={MotionComposition}
              inputProps={{ project, editable: false, showSelection: false, showSafeArea: false }}
              durationInFrames={Math.max(1, Math.round(scene.duration * scene.fps))}
              compositionWidth={scene.width}
              compositionHeight={scene.height}
              fps={scene.fps}
              loop
              controls={false}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </div>
        <span className="template-live-badge"><i />Live preview</span>
        <span className="template-duration">{duration}s</span>
      </button>
      <div className="library-template-copy">
        <span className="template-card-main-copy">
          <span className="template-card-kicker"><small>{category}</small>{featured ? <b>Featured</b> : null}</span>
          <strong>{name}</strong>
          <p>{description}</p>
          <span className="template-card-metadata"><i>{ratio}</i><i>{scene.layerIds.length} layers</i><i>{scene.fps} FPS</i></span>
        </span>
        <span className="template-card-action-stack">
          {palette?.length ? <span className="template-palette" aria-hidden="true">{palette.slice(0, 3).map((color) => <i key={color} style={{ background: color }} />)}</span> : null}
          <button type="button" className="template-use-action" onClick={onUse}><span>Use template</span><Icon name="arrow" size={15} /></button>
        </span>
      </div>
      {onDelete ? <button type="button" className="custom-template-delete" title="Delete custom template" onClick={onDelete}><Icon name="trash" size={14} /></button> : null}
    </article>
  );
}

function describeRatio(width: number, height: number) {
  const ratio = width / Math.max(1, height);
  if (Math.abs(ratio - 1) < .02) return "1:1";
  if (Math.abs(ratio - 9 / 16) < .02) return "9:16";
  if (Math.abs(ratio - 16 / 9) < .02) return "16:9";
  if (Math.abs(ratio - 4 / 5) < .02) return "4:5";
  return `${width}:${height}`;
}

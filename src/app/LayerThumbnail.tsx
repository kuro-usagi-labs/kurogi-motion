import React, { useEffect, useId, useMemo, useState } from "react";
import { getShapeDefinition } from "../core/shapeLibrary";
import type { AudioClip, BaseLayer, KurogiProject, Layer, ProjectAsset } from "../types";
import { Icon, type IconName } from "../ui/Icon";
import "../layerThumbnail.css";

type ThumbnailProject = Pick<KurogiProject, "assets" | "layers">;

/** Forward-compatible identity for projects that introduce video layers. */
export type VideoLayerIdentity = Omit<BaseLayer, "type"> & {
  type: "video";
  assetId: string;
  fit?: "contain" | "cover" | "fill";
};

type CommonProps = {
  project: ThumbnailProject;
  size?: number;
  className?: string;
  ariaLabel?: string;
  decorative?: boolean;
};

export type LayerThumbnailProps = CommonProps & (
  | { layer: Layer | VideoLayerIdentity; audioClip?: never }
  | { layer?: never; audioClip: AudioClip }
);

type MediaCandidate = {
  kind: "image" | "video";
  source: string;
};

/**
 * A compact, content-aware identity preview shared by layer lists and timelines.
 * It is deliberately non-interactive so the surrounding row remains the single
 * click, keyboard, and drag target.
 */
export function LayerThumbnail({
  project,
  layer,
  audioClip,
  size = 28,
  className = "",
  ariaLabel,
  decorative = false,
}: LayerThumbnailProps) {
  const subjectType = audioClip ? "audio" : layer.type;
  const label = ariaLabel ?? describeSubject(project, layer, audioClip);
  const style = { "--layer-thumbnail-size": `${Math.max(18, size)}px` } as React.CSSProperties;

  return (
    <span
      className={`layer-thumbnail is-${subjectType} ${className}`.trim()}
      style={style}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      data-thumbnail-kind={subjectType}
    >
      {audioClip ? <AudioIdentity clip={audioClip} /> : <LayerIdentity project={project} layer={layer} />}
    </span>
  );
}

function LayerIdentity({ project, layer }: { project: ThumbnailProject; layer: Layer | VideoLayerIdentity }) {
  if (layer.type === "text") return <TextIdentity layer={layer} />;
  if (layer.type === "shape") return <ShapeIdentity layer={layer} />;
  if (layer.type === "group") return <GroupIdentity project={project} layer={layer} />;
  return <MediaIdentity asset={project.assets[layer.assetId]} fit={layer.type === "image" || layer.type === "video" ? layer.fit : "contain"} forceVideo={layer.type === "video"} />;
}

function TextIdentity({ layer }: { layer: Extract<Layer, { type: "text" }> }) {
  const sample = thumbnailText(layer.text);
  const gradient = layer.style.gradient;
  return (
    <span
      className="layer-thumbnail-text"
      aria-hidden="true"
      style={{
        fontFamily: layer.style.fontFamily || "Inter, sans-serif",
        fontWeight: Math.max(400, layer.style.fontWeight || 600),
        color: gradient ? "transparent" : safeColor(layer.style.color, "#f2edf8"),
        backgroundImage: gradient ? `linear-gradient(${gradient.angle}deg, ${gradient.startColor}, ${gradient.endColor})` : undefined,
      }}
    >{sample}</span>
  );
}

function ShapeIdentity({ layer }: { layer: Extract<Layer, { type: "shape" }> }) {
  const definition = getShapeDefinition(layer.shape);
  const generatedId = useId().replace(/:/g, "");
  const gradientId = `layer-shape-gradient-${generatedId}`;
  const gradient = layer.style.gradient ?? parseCssGradient(layer.style.fill);
  const fill = gradient ? `url(#${gradientId})` : safeColor(layer.style.fill, "#a78bfa");
  const stroke = layer.style.strokeWidth > 0 ? safeColor(layer.style.stroke, "transparent") : "none";
  return (
    <svg className="layer-thumbnail-shape" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {gradient ? <defs><linearGradient id={gradientId} x1="0" y1=".5" x2="1" y2=".5" gradientTransform={`rotate(${gradient.angle} .5 .5)`}><stop offset="0" stopColor={gradient.startColor} /><stop offset="1" stopColor={gradient.endColor} /></linearGradient></defs> : null}
      <path
        d={definition.path}
        fill={fill}
        fillRule={definition.fillRule ?? "nonzero"}
        stroke={stroke}
        strokeWidth={Math.min(10, Math.max(0, layer.style.strokeWidth))}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function GroupIdentity({ project, layer }: { project: ThumbnailProject; layer: Extract<Layer, { type: "group" }> }) {
  const children = layer.childIds.map((id) => project.layers[id]).filter((child): child is Layer => Boolean(child)).slice(0, 3);
  const identities = children.length ? children : [null, null];
  return (
    <span className="layer-thumbnail-group" aria-hidden="true">
      {identities.map((child, index) => (
        <i
          key={child?.id ?? `empty-${index}`}
          className={`is-${child?.type ?? "empty"}`}
          style={{ "--group-chip-color": child ? identityColor(project, child) : "#696476" } as React.CSSProperties}
        >{child?.type === "text" ? "T" : null}</i>
      ))}
      <b>{layer.childIds.length}</b>
    </span>
  );
}

function AudioIdentity({ clip }: { clip: AudioClip }) {
  const bars = useMemo(() => waveformBars(clip.id), [clip.id]);
  return (
    <span className={`layer-thumbnail-audio ${clip.muted ? "is-muted" : ""}`} aria-hidden="true">
      <Icon name="audio" size={12} />
      <span>{bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</span>
    </span>
  );
}

function MediaIdentity({ asset, fit = "cover", forceVideo = false }: { asset?: ProjectAsset; fit?: "contain" | "cover" | "fill"; forceVideo?: boolean }) {
  const candidates = useMemo(() => mediaCandidates(asset, forceVideo), [asset, forceVideo]);
  const candidateKey = candidates.map((candidate) => `${candidate.kind}:${candidate.source}`).join("|");
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => setCandidateIndex(0), [candidateKey]);

  const candidate = candidates[candidateIndex];
  const moveToFallback = () => setCandidateIndex((current) => current + 1);
  if (!candidate) return <MediaFallback asset={asset} forceVideo={forceVideo} />;

  if (candidate.kind === "video") {
    return (
      <video
        className="layer-thumbnail-media"
        src={candidate.source}
        muted
        playsInline
        preload="metadata"
        disablePictureInPicture
        controls={false}
        draggable={false}
        aria-hidden="true"
        tabIndex={-1}
        style={{ objectFit: fit }}
        onError={moveToFallback}
      />
    );
  }

  return (
    <img
      className="layer-thumbnail-media"
      src={candidate.source}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      style={{ objectFit: fit }}
      onError={moveToFallback}
    />
  );
}

function MediaFallback({ asset, forceVideo }: { asset?: ProjectAsset; forceVideo: boolean }) {
  const isVideo = forceVideo || asset?.mimeType.startsWith("video/");
  const icon: IconName = isVideo ? "play" : asset?.type === "svg" ? "shapes" : "assets";
  return <span className="layer-thumbnail-fallback" aria-hidden="true"><Icon name={icon} size={14} /></span>;
}

function mediaCandidates(asset: ProjectAsset | undefined, forceVideo: boolean): MediaCandidate[] {
  if (!asset) return [];
  const isVideo = forceVideo || asset.mimeType.startsWith("video/");
  const candidates: MediaCandidate[] = [];
  if (validSource(asset.thumbnailUrl)) candidates.push({ kind: "image", source: asset.thumbnailUrl.trim() });
  if (validSource(asset.sourceUrl)) candidates.push({ kind: isVideo ? "video" : "image", source: asset.sourceUrl.trim() });
  return candidates.filter((candidate, index) => candidates.findIndex((other) => other.kind === candidate.kind && other.source === candidate.source) === index);
}

function describeSubject(project: ThumbnailProject, layer: Layer | VideoLayerIdentity | undefined, audioClip: AudioClip | undefined) {
  if (audioClip) return `Audio clip ${audioClip.name}, ${audioClip.duration.toFixed(2)} seconds${audioClip.muted ? ", muted" : ""}`;
  if (!layer) return "Layer preview";
  if (layer.type === "text") return `Text layer ${layer.name}: ${layer.text.trim() || "empty text"}`;
  if (layer.type === "shape") return `${getShapeDefinition(layer.shape).label} shape layer ${layer.name}`;
  if (layer.type === "group") return `Group layer ${layer.name}, ${layer.childIds.length} child layer${layer.childIds.length === 1 ? "" : "s"}`;
  const asset = project.assets[layer.assetId];
  const type = layer.type === "video" || asset?.mimeType.startsWith("video/") ? "Video" : layer.type === "svg" ? "SVG" : "Image";
  return `${type} layer ${layer.name}${asset ? `, ${asset.name}` : ", missing asset"}`;
}

function thumbnailText(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "T";
  return Array.from(normalized).slice(0, 2).join("");
}

function waveformBars(seed: string) {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return Array.from({ length: 5 }, (_, index) => {
    value = Math.imul(value ^ index, 16777619);
    return 28 + Math.abs(value % 67);
  });
}

function identityColor(project: ThumbnailProject, layer: Layer) {
  if (layer.type === "text") return layer.style.gradient?.startColor ?? safeColor(layer.style.color, "#cbbcff");
  if (layer.type === "shape") return layer.style.gradient?.startColor ?? firstCssColor(layer.style.fill) ?? "#8b6be1";
  if (layer.type === "image" || layer.type === "svg") return project.assets[layer.assetId]?.type === "svg" ? "#73cbb4" : "#6f9fdb";
  return "#9183bd";
}

function validSource(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function safeColor(value: string | undefined, fallback: string) {
  if (!value || /gradient\s*\(/i.test(value)) return firstCssColor(value ?? "") ?? fallback;
  return value;
}

function firstCssColor(value: string) {
  return value.match(/#[\da-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/i)?.[0];
}

function parseCssGradient(value: string) {
  if (!/gradient\s*\(/i.test(value)) return undefined;
  const colors = value.match(/#[\da-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi) ?? [];
  if (colors.length < 2) return undefined;
  const angle = Number(value.match(/(-?[\d.]+)deg/i)?.[1] ?? 135);
  return { startColor: colors[0], endColor: colors.at(-1) ?? colors[1], angle: Number.isFinite(angle) ? angle : 135 };
}

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import {
  evaluateCounterText,
  evaluateLayer,
  evaluateTextUnit,
  getTextAnimationUnit,
  splitTextUnits,
} from "./core/evaluator";
import { getActiveScene, getSceneLayers } from "./core/project";
import { getLayerRenderTiming } from "./core/layerTiming";
import { audioClipVolumeAt, getSceneAudioClips } from "./core/audio";
import { textVerticalJustification } from "./core/textLayout";
import { snapLayerPosition, type AlignmentGuide } from "./core/designTools";
import { getShapeDefinition, getShapeMaskStyle, isBoxShape } from "./core/shapeLibrary";
import { LayerEffects } from "./renderer/LayerEffects";
import { StaticLayerTree } from "./renderer/StaticLayerTree";
import { MotionPathOverlay } from "./editor/MotionPathOverlay";
import { gradientToCss, layerCompositingStyle, projectFontFaceCss, textPaintStyle } from "./renderer/designStyles";
import { clippingMaskSceneStyle } from "./renderer/clippingMask";
import type { KurogiProject, Layer, MotionPathDefinition, TextLayer } from "./types";

type TransformPatch = Partial<
  Pick<Layer, "position" | "size" | "rotation" | "scale" | "anchor">
>;

type Props = {
  project: KurogiProject;
  selectedId?: string;
  selectedIds?: string[];
  selectedActionId?: string;
  onSelect?: (id: string, additive?: boolean) => void;
  onTransformCommit?: (id: string, patch: TransformPatch) => void;
  onTextCommit?: (id: string, text: string) => void;
  onActionCommit?: (layerId: string, actionId: string, motionPath: MotionPathDefinition) => void;
  onLayerContextMenu?: (layerId: string, clientX: number, clientY: number) => void;
  editable?: boolean;
  showSelection?: boolean;
  showSafeArea?: boolean;
};

export type ProjectCompositionProps = {
  project: KurogiProject;
  renderMode?: "active-scene" | "all-scenes";
  exportFps?: 24 | 30 | 60;
};

type Gesture = {
  id: string;
  pointerId: number;
  mode: "move" | "resize" | "rotate";
  start: { x: number; y: number };
  initial: Layer;
  offset?: { x: number; y: number };
  center?: { x: number; y: number };
  startAngle?: number;
};

type TextEdit = {
  layerId: string;
  value: string;
  original: string;
};

export const MotionComposition: React.FC<Props> = ({
  project,
  selectedId,
  selectedIds,
  selectedActionId,
  onSelect,
  onTransformCommit,
  onTextCommit,
  onActionCommit,
  onLayerContextMenu,
  editable = false,
  showSelection = true,
  showSafeArea = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const scene = getActiveScene(project);
  const layers = getSceneLayers(project);
  const canvasRef = useRef<HTMLDivElement>(null);
  const textEditorRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [draftLayer, setDraftLayer] = useState<Layer | null>(null);
  const draftLayerRef = useRef<Layer | null>(null);
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);

  useLayoutEffect(() => {
    const editor = textEditorRef.current;
    if (!editor || !textEdit) return;
    editor.innerText = textEdit.value;
    editor.focus();
    moveCaretToEnd(editor);
  }, [textEdit?.layerId]);

  const renderedLayers = useMemo(
    () => layers.map((layer) => (draftLayer?.id === layer.id ? draftLayer : layer)),
    [draftLayer, layers],
  );

  function projectPoint(event: { clientX: number; clientY: number }) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * scene.width,
      y: ((event.clientY - rect.top) / rect.height) * scene.height,
    };
  }

  function startGesture(
    event: React.PointerEvent<HTMLElement>,
    layer: Layer,
    mode: Gesture["mode"],
  ) {
    if (event.button !== 0) return;
    if (!editable || layer.locked || textEdit) return;
    const point = projectPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(layer.id, event.shiftKey);
    event.currentTarget.setPointerCapture?.(event.pointerId);

    gestureRef.current = {
      id: layer.id,
      pointerId: event.pointerId,
      mode,
      start: point,
      initial: cloneLayer(layer),
      offset:
        mode === "move"
          ? { x: point.x - layer.position.x, y: point.y - layer.position.y }
          : undefined,
      center:
        mode === "rotate"
          ? {
              x: layer.position.x + layer.size.width / 2,
              y: layer.position.y + layer.size.height / 2,
            }
          : undefined,
      startAngle:
        mode === "rotate"
          ? Math.atan2(
              point.y - (layer.position.y + layer.size.height / 2),
              point.x - (layer.position.x + layer.size.width / 2),
            )
          : undefined,
    };
    const initialDraft = cloneLayer(layer);
    draftLayerRef.current = initialDraft;
    setDraftLayer(initialDraft);
  }

  function moveGesture(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = projectPoint(event);
    if (!point) return;

    const next = cloneLayer(gesture.initial);
    if (gesture.mode === "move") {
      const candidate = {
        x: clamp(point.x - (gesture.offset?.x ?? 0), -next.size.width, scene.width),
        y: clamp(point.y - (gesture.offset?.y ?? 0), -next.size.height, scene.height),
      };
      if (project.settings.snapEnabled && !event.altKey) {
        const snapped = snapLayerPosition(next, candidate, scene, layers);
        next.position = snapped.position;
        setAlignmentGuides(snapped.guides);
      } else {
        next.position = candidate;
        setAlignmentGuides([]);
      }
    } else if (gesture.mode === "resize") {
      setAlignmentGuides([]);
      next.size = {
        width: Math.max(24, gesture.initial.size.width + point.x - gesture.start.x),
        height: Math.max(24, gesture.initial.size.height + point.y - gesture.start.y),
      };
    } else {
      const center = gesture.center ?? { x: 0, y: 0 };
      const angle = Math.atan2(point.y - center.y, point.x - center.x);
      const delta = ((angle - (gesture.startAngle ?? 0)) * 180) / Math.PI;
      next.rotation = gesture.initial.rotation + delta;
    }
    draftLayerRef.current = next;
    setDraftLayer(next);
  }

  function finishGesture(event?: React.PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (event && gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setAlignmentGuides([]);
    const finalLayer = draftLayerRef.current;
    draftLayerRef.current = null;
    setDraftLayer(null);
    if (!finalLayer || finalLayer.id !== gesture.id) return;
    onTransformCommit?.(finalLayer.id, {
      position: finalLayer.position,
      size: finalLayer.size,
      rotation: finalLayer.rotation,
      scale: finalLayer.scale,
      anchor: finalLayer.anchor,
    });
  }

  function beginTextEditing(event: React.MouseEvent, layer: TextLayer) {
    if (!editable || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(layer.id, event.shiftKey);
    setTextEdit({ layerId: layer.id, value: layer.text, original: layer.text });
  }

  function commitTextEdit() {
    if (!textEdit) return;
    if (textEdit.value !== textEdit.original) onTextCommit?.(textEdit.layerId, textEdit.value);
    setTextEdit(null);
  }

  return (
    <div
      ref={canvasRef}
      onPointerMove={moveGesture}
      onPointerUp={finishGesture}
      onPointerCancel={finishGesture}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelect?.("", false);
      }}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background:
          scene.background.type === "transparent"
            ? "transparent"
            : scene.background.color ?? "#ffffff",
      }}
    >
      <style>{projectFontFaceCss(project)}</style>
      <AudioTracks project={project} />
      {editable && scene.background.type === "transparent" ? <TransparencyGrid /> : null}
      {showSafeArea ? <SafeArea /> : null}
      {renderedLayers.map((layer) => {
        if (!layer.visible || layer.maskSource || layer.parentId) return null;
        const timing = getLayerRenderTiming(layer, scene);
        if (time < timing.startTime || time >= timing.startTime + timing.duration) return null;
        const layerTime = time - timing.animationOffset;
        const visual = evaluateLayer(layer, scene, layerTime);
        const selected = editable && showSelection && (selectedIds?.includes(layer.id) ?? selectedId === layer.id);
        const isEditing = textEdit?.layerId === layer.id;
        const transformOrigin = `${layer.anchor.x * 100}% ${layer.anchor.y * 100}%`;
        const wrapperStyle: React.CSSProperties = {
          position: "absolute",
          left: `${(visual.x / scene.width) * 100}%`,
          top: `${(visual.y / scene.height) * 100}%`,
          width: `${(visual.width / scene.width) * 100}%`,
          height: `${(visual.height / scene.height) * 100}%`,
          opacity: visual.opacity,
          transform: `perspective(${scene.width * 1.4}px) rotate(${visual.rotation}deg) rotateX(${visual.rotateX}deg) rotateY(${visual.rotateY}deg) skew(${visual.skewX}deg, ${visual.skewY}deg) scale(${visual.scaleX}, ${visual.scaleY})`,
          transformOrigin,
          clipPath: visual.clipPath,
          cursor: editable && !layer.locked ? "move" : "default",
          outline: selected ? `${Math.max(1, scene.width / 540)}px solid #7c5cff` : "none",
          outlineOffset: selected ? Math.max(2, scene.width / 360) : 0,
          boxSizing: "border-box",
          userSelect: "none",
          transformStyle: "preserve-3d",
          pointerEvents: layer.mask?.clipping ? "auto" : undefined,
          ...layerCompositingStyle(project, layer),
        };
        const clippingStyle = clippingMaskSceneStyle(project, layer, scene, layerTime);
        const animatedFilter = [
          visual.blur > 0 ? `blur(${visual.blur}px)` : "",
          visual.brightness !== 1 ? `brightness(${visual.brightness})` : "",
          visual.saturation !== 1 ? `saturate(${visual.saturation})` : "",
          visual.glow > 0
            ? `drop-shadow(0 0 ${visual.glow * .5}px rgba(139,92,246,.65)) drop-shadow(0 0 ${visual.glow}px rgba(98,212,173,.3))`
            : "",
        ].filter(Boolean).join(" ");

        return (
          <ClippedLayerFrame key={layer.id} maskStyle={clippingStyle}>
          <div
            style={wrapperStyle}
            onPointerDown={
              editable && !isEditing
                ? (event) => startGesture(event, layer, "move")
                : undefined
            }
            onContextMenu={editable ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect?.(layer.id, false);
              onLayerContextMenu?.(layer.id, event.clientX, event.clientY);
            } : undefined}
            onDoubleClick={
              layer.type === "text"
                ? (event) => beginTextEditing(event, layer)
                : undefined
            }
          >
            <LayerEffects layer={layer} time={layerTime}>
              <div style={{ width: "100%", height: "100%", filter: animatedFilter || undefined }}>
                {layer.type === "group" ? (
                  layer.childIds.map((childId) => {
                    const child = project.layers[childId];
                    return child ? <StaticLayerTree key={childId} project={project} layer={child} scene={scene} time={layerTime} parentSize={layer.size} /> : null;
                  })
                ) : layer.type === "text" ? (
                  isEditing && textEdit ? (
                    <TextFrame layer={layer}>
                      <div
                        ref={textEditorRef}
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck={false}
                        onInput={(event) => {
                          const value = event.currentTarget.innerText.replace(/\r/g, "");
                          setTextEdit((current) => current ? { ...current, value } : current);
                        }}
                        onBlur={commitTextEdit}
                        onPointerDown={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setTextEdit(null);
                          }
                          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                            event.preventDefault();
                            commitTextEdit();
                          }
                        }}
                        style={{
                          ...textStyle(layer),
                          width: "100%",
                          minHeight: layer.style.fontSize * layer.style.lineHeight,
                          maxHeight: "100%",
                          padding: 0,
                          border: 0,
                          outline: `${Math.max(1, scene.width / 540)}px solid #7c5cff`,
                          overflow: "hidden",
                          background: "transparent",
                          cursor: "text",
                          userSelect: "text",
                        }}
                      />
                    </TextFrame>
                  ) : (
                    <AnimatedText layer={layer} scene={scene} time={layerTime} />
                  )
                ) : layer.type === "shape" ? (
                  <ShapeVisual layer={layer} />
                ) : (
                  <AssetVisual project={project} layer={layer} />
                )}
              </div>
            </LayerEffects>
            {selected && selectedId === layer.id && !isEditing && !layer.locked ? (
              <SelectionHandles
                sceneWidth={scene.width}
                onResize={(event) => startGesture(event, layer, "resize")}
                onRotate={(event) => startGesture(event, layer, "rotate")}
              />
            ) : null}
          </div>
          </ClippedLayerFrame>
        );
      })}
      {alignmentGuides.map((guide, index) => (
        <div key={`${guide.axis}-${guide.position}-${index}`} className={`alignment-guide alignment-guide-${guide.axis}`} style={guide.axis === "x" ? { left: `${(guide.position / scene.width) * 100}%` } : { top: `${(guide.position / scene.height) * 100}%` }} />
      ))}
      {editable && selectedActionId ? (() => { const owner = findActionOwner(project, selectedActionId); return owner?.action.type === "motionPath" && owner.action.motionPath ? <MotionPathOverlay scene={scene} layer={owner.layer} action={owner.action} onCommit={onActionCommit} /> : null; })() : null}
    </div>
  );
};

export const ProjectComposition: React.FC<ProjectCompositionProps> = ({ project, renderMode = "active-scene" }) => {
  const { fps } = useVideoConfig();
  const scenes = renderMode === "all-scenes" ? Object.values(project.scenes) : [getActiveScene(project)];
  let cursor = 0;
  let previousDurationInFrames = 0;
  return <AbsoluteFill style={{ backgroundColor: "transparent" }}>
    {scenes.map((scene, index) => {
      const durationInFrames = Math.max(1, Math.round(scene.duration * fps));
      const entering = index === 0 ? undefined : scene.transition;
      const transitionFrames = entering && entering.type !== "cut" ? Math.min(durationInFrames - 1, Math.max(0, previousDurationInFrames - 1), Math.max(1, Math.round(entering.duration * fps))) : 0;
      if (index > 0) cursor -= transitionFrames;
      const from = cursor;
      cursor += durationInFrames;
      const nextTransition = scenes[index + 1]?.transition;
      const outgoingFrames = nextTransition && nextTransition.type !== "cut" ? Math.min(durationInFrames - 1, Math.max(1, Math.round(nextTransition.duration * fps))) : 0;
      const sceneProject = { ...project, activeSceneId: scene.id };
      previousDurationInFrames = durationInFrames;
      return <Sequence key={scene.id} from={from} durationInFrames={durationInFrames} name={scene.name} premountFor={Math.min(30, transitionFrames)}>
        <SceneTransitionFrame entering={entering} enteringFrames={transitionFrames} outgoing={nextTransition} outgoingFrames={outgoingFrames} durationInFrames={durationInFrames}>
          <MotionComposition project={sceneProject} showSelection={false} />
        </SceneTransitionFrame>
      </Sequence>;
    })}
  </AbsoluteFill>;
};

export function getProjectRenderMetadata({ project, renderMode = "active-scene", exportFps }: ProjectCompositionProps) {
  const scenes = renderMode === "all-scenes" ? Object.values(project.scenes) : [getActiveScene(project)];
  const baseScene = scenes[0] ?? getActiveScene(project);
  const fps = exportFps ?? baseScene.fps;
  let durationInFrames = scenes.reduce((total, scene) => total + Math.max(1, Math.round(scene.duration * fps)), 0);
  if (renderMode === "all-scenes") {
    for (let index = 1; index < scenes.length; index += 1) {
      const transition = scenes[index].transition;
      if (transition && transition.type !== "cut") durationInFrames -= Math.min(
        Math.max(1, Math.round(transition.duration * fps)),
        Math.max(0, Math.round(scenes[index - 1].duration * fps) - 1),
        Math.max(0, Math.round(scenes[index].duration * fps) - 1),
      );
    }
  }
  return { durationInFrames: Math.max(1, durationInFrames), fps, width: baseScene.width, height: baseScene.height };
}

function SceneTransitionFrame({ entering, enteringFrames, outgoing, outgoingFrames, durationInFrames, children }: {
  entering?: KurogiProject["scenes"][string]["transition"];
  enteringFrames: number;
  outgoing?: KurogiProject["scenes"][string]["transition"];
  outgoingFrames: number;
  durationInFrames: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const enterProgress = enteringFrames ? interpolate(frame, [0, enteringFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const exitProgress = outgoingFrames ? interpolate(frame, [durationInFrames - outgoingFrames, durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const enterStyle = transitionStyle(entering?.type, enterProgress, true);
  const exitStyle = transitionStyle(outgoing?.type, exitProgress, false);
  return <AbsoluteFill style={{ opacity: enterStyle.opacity * exitStyle.opacity, transform: `${enterStyle.transform} ${exitStyle.transform}`.trim() || undefined }}>{children}</AbsoluteFill>;
}

function transitionStyle(type: NonNullable<KurogiProject["scenes"][string]["transition"]>["type"] | undefined, progress: number, entering: boolean) {
  if (!type || type === "cut") return { opacity: 1, transform: "" };
  if (type === "slide-left") return { opacity: 1, transform: `translateX(${entering ? (1 - progress) * 100 : -progress * 28}%)` };
  if (type === "slide-right") return { opacity: 1, transform: `translateX(${entering ? -(1 - progress) * 100 : progress * 28}%)` };
  if (type === "zoom") return { opacity: entering ? progress : 1 - progress, transform: `scale(${entering ? .88 + progress * .12 : 1 + progress * .08})` };
  return { opacity: entering ? progress : 1 - progress, transform: "" };
}

function ClippedLayerFrame({ maskStyle, children }: { maskStyle?: React.CSSProperties; children: React.ReactNode }) {
  if (!maskStyle) return <>{children}</>;
  return <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", ...maskStyle }}>{children}</div>;
}

function AudioTracks({ project }: { project: KurogiProject }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <>
    {getSceneAudioClips(project).map((clip) => {
      const asset = project.assets[clip.assetId];
      if (!asset?.sourceUrl || asset.type !== "audio") return null;
      const from = Math.max(0, Math.round(clip.startTime * fps));
      const durationInFrames = Math.max(1, Math.round(clip.duration * fps));
      return <Sequence key={clip.id} from={from} durationInFrames={durationInFrames} name={clip.name}>
        <Audio
          src={asset.sourceUrl}
          startFrom={Math.max(0, Math.round(clip.trimStart * fps))}
          playbackRate={clip.playbackRate}
          volume={audioClipVolumeAt(clip, frame / fps)}
          muted={clip.muted}
        />
      </Sequence>;
    })}
  </>;
}

function AnimatedText({ layer, scene, time }: { layer: TextLayer; scene: ReturnType<typeof getActiveScene>; time: number }) {
  const displayText = evaluateCounterText(layer, time) ?? layer.text;
  const unit = getTextAnimationUnit(layer);
  const units = splitTextUnits(displayText, unit);
  if (unit === "layer") {
    return <TextFrame layer={layer}><div style={{ ...textStyle(layer), width: "100%" }}>{displayText}</div></TextFrame>;
  }

  return (
    <TextFrame layer={layer}>
      <div style={{ ...textStyle(layer), width: "100%" }}>
        {units.map((part, index) => {
          if (part.text === "\n") return <br key={part.key} />;
          const visual = evaluateTextUnit(layer, scene, time, index, units.length);
          return (
            <span
              key={part.key}
              style={{
                display: "inline-block",
                whiteSpace: "pre",
                opacity: visual.opacity,
                transform: `perspective(${scene.width}px) translate(${visual.translateX}px, ${visual.translateY}px) rotate(${visual.rotation}deg) rotateX(${visual.rotateX}deg) rotateY(${visual.rotateY}deg) scale(${visual.scale})`,
                transformOrigin: "center",
                filter: visual.blur > 0 ? `blur(${visual.blur}px)` : undefined,
              }}
            >
              {part.text}
            </span>
          );
        })}
      </div>
    </TextFrame>
  );
}

function TextFrame({ layer, children }: { layer: TextLayer; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: textVerticalJustification(layer.style.verticalAlign),
      width: "100%",
      height: "100%",
      minWidth: 0,
      minHeight: 0,
      overflow: "hidden",
      boxSizing: "border-box",
    }}>
      {children}
    </div>
  );
}

function textStyle(layer: TextLayer): React.CSSProperties {
  return {
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    fontFamily: `${layer.style.fontFamily}, Inter, Arial, sans-serif`,
    fontWeight: layer.style.fontWeight,
    fontSize: layer.style.fontSize,
    lineHeight: layer.style.lineHeight,
    letterSpacing: layer.style.letterSpacing,
    textAlign: layer.style.align,
    ...textPaintStyle(layer),
    boxSizing: "border-box",
    minWidth: 0,
  };
}

function findActionOwner(project: KurogiProject, actionId: string) { for (const layer of Object.values(project.layers)) { const action = layer.animationActions.find((candidate) => candidate.id === actionId); if (action) return { layer, action }; } return null; }

function moveCaretToEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function ShapeVisual({ layer }: { layer: Extract<Layer, { type: "shape" }> }) {
  const shadowFilter = layer.style.shadow > 0
    ? `drop-shadow(0 ${layer.style.shadow * .45}px ${layer.style.shadow * 1.25}px rgba(18,14,35,.28))`
    : undefined;

  if (isBoxShape(layer.shape)) {
    return (
      <div style={{
        width: "100%",
        height: "100%",
        background: gradientToCss(layer.style.gradient) ?? layer.style.fill,
        border: layer.style.strokeWidth > 0 ? `${layer.style.strokeWidth}px solid ${layer.style.stroke}` : undefined,
        borderRadius: layer.shape === "circle" ? "50%" : layer.shape === "line" ? 999 : layer.style.borderRadius,
        filter: shadowFilter,
        boxSizing: "border-box",
      }} />
    );
  }

  const definition = getShapeDefinition(layer.shape);
  const maskStyle = getShapeMaskStyle(layer.shape);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", filter: shadowFilter }}>
      <div style={{ position: "absolute", inset: 0, background: gradientToCss(layer.style.gradient) ?? layer.style.fill, ...maskStyle }} />
      {layer.style.strokeWidth > 0 ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
          <path d={definition.path} fill="none" fillRule={definition.fillRule ?? "nonzero"} stroke={layer.style.stroke} strokeWidth={Math.max(.5, layer.style.strokeWidth / 2)} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      ) : null}
    </div>
  );
}

function AssetVisual({ project, layer }: { project: KurogiProject; layer: Extract<Layer, { type: "image" | "svg" }> }) {
  const asset = project.assets[layer.assetId];
  if (!asset?.sourceUrl) {
    return (
      <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "rgba(255,255,255,.72)", border: "2px dashed rgba(80,70,100,.35)", color: "#756f80", fontFamily: "Inter,sans-serif", fontSize: 20 }}>
        Missing asset
      </div>
    );
  }
  return (
    <img
      src={asset.sourceUrl}
      alt=""
      draggable={false}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: layer.type === "image" ? layer.fit : "contain",
        pointerEvents: "none",
      }}
    />
  );
}

function SelectionHandles({ sceneWidth, onResize, onRotate }: { sceneWidth: number; onResize: (event: React.PointerEvent<HTMLSpanElement>) => void; onRotate: (event: React.PointerEvent<HTMLSpanElement>) => void }) {
  const size = Math.max(12, sceneWidth / 72);
  const border = Math.max(2, sceneWidth / 540);
  return (
    <>
      <span aria-label="Rotate layer" onPointerDown={onRotate} style={{ position: "absolute", left: "50%", top: -size * 2.1, width: size, height: size, marginLeft: -size / 2, borderRadius: "50%", background: "#a78bfa", border: `${border}px solid white`, cursor: "grab", boxSizing: "border-box" }} />
      <span aria-label="Resize layer" onPointerDown={onResize} style={{ position: "absolute", right: -size / 2, bottom: -size / 2, width: size, height: size, borderRadius: Math.max(2, size / 5), background: "white", border: `${border}px solid #7c5cff`, cursor: "nwse-resize", boxSizing: "border-box" }} />
    </>
  );
}

function TransparencyGrid() {
  return <div style={{ position: "absolute", inset: 0, backgroundColor: "#ffffff", backgroundImage: "linear-gradient(45deg,#e7e5eb 25%,transparent 25%),linear-gradient(-45deg,#e7e5eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e7e5eb 75%),linear-gradient(-45deg,transparent 75%,#e7e5eb 75%)", backgroundPosition: "0 0,0 16px,16px -16px,-16px 0", backgroundSize: "32px 32px" }} />;
}

function SafeArea() {
  return <div style={{ position: "absolute", inset: "5%", border: "2px dashed rgba(124,92,255,.45)", pointerEvents: "none", zIndex: 9999 }} />;
}

function cloneLayer<T extends Layer>(layer: T): T {
  return JSON.parse(JSON.stringify(layer)) as T;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

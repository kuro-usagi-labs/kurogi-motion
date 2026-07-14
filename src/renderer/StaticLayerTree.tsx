import React from "react";
import { evaluateLayer, evaluateTextUnit, getTextAnimationUnit, splitTextUnits } from "../core/evaluator";
import { getShapeDefinition, getShapeMaskStyle, isBoxShape } from "../core/shapeLibrary";
import { textVerticalJustification } from "../core/textLayout";
import type { KurogiProject, Layer, Scene, Size, TextLayer } from "../types";
import { LayerEffects } from "./LayerEffects";
import { gradientToCss, layerCompositingStyle, textPaintStyle } from "./designStyles";

export function StaticLayerTree({
  project,
  layer,
  scene,
  time,
  parentSize,
}: {
  project: KurogiProject;
  layer: Layer;
  scene: Scene;
  time: number;
  parentSize: Size;
}) {
  if (!layer.visible || layer.maskSource) return null;
  const visual = evaluateLayer(layer, scene, time);
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${(visual.x / Math.max(1, parentSize.width)) * 100}%`,
    top: `${(visual.y / Math.max(1, parentSize.height)) * 100}%`,
    width: `${(visual.width / Math.max(1, parentSize.width)) * 100}%`,
    height: `${(visual.height / Math.max(1, parentSize.height)) * 100}%`,
    opacity: visual.opacity,
    transform: `perspective(${scene.width * 1.4}px) rotate(${visual.rotation}deg) rotateX(${visual.rotateX}deg) rotateY(${visual.rotateY}deg) skew(${visual.skewX}deg, ${visual.skewY}deg) scale(${visual.scaleX}, ${visual.scaleY})`,
    transformOrigin: `${layer.anchor.x * 100}% ${layer.anchor.y * 100}%`,
    clipPath: visual.clipPath,
    boxSizing: "border-box",
    transformStyle: "preserve-3d",
    pointerEvents: "none",
    ...layerCompositingStyle(project, layer, scene, time, visual),
  };
  const animatedFilter = [
    visual.blur > 0 ? `blur(${visual.blur}px)` : "",
    visual.brightness !== 1 ? `brightness(${visual.brightness})` : "",
    visual.saturation !== 1 ? `saturate(${visual.saturation})` : "",
    visual.glow > 0 ? `drop-shadow(0 0 ${visual.glow}px rgba(139,92,246,.55))` : "",
  ].filter(Boolean).join(" ");

  return (
    <div style={style}>
      <LayerEffects layer={layer} time={time}>
        <div style={{ position: "relative", width: "100%", height: "100%", filter: animatedFilter || undefined }}>
          {layer.type === "group"
            ? layer.childIds.map((childId) => {
                const child = project.layers[childId];
                return child ? <StaticLayerTree key={childId} project={project} layer={child} scene={scene} time={time} parentSize={layer.size} /> : null;
              })
            : layer.type === "text"
              ? <StaticAnimatedText layer={layer} scene={scene} time={time} />
              : layer.type === "shape"
                ? <StaticShape layer={layer} />
                : <StaticAsset project={project} layer={layer} />}
        </div>
      </LayerEffects>
    </div>
  );
}

function StaticAnimatedText({ layer, scene, time }: { layer: TextLayer; scene: Scene; time: number }) {
  const unit = getTextAnimationUnit(layer);
  const units = splitTextUnits(layer.text, unit);
  const baseStyle = staticTextStyle(layer);
  if (unit === "layer") return <TextFrame layer={layer}><div style={{ ...baseStyle, width: "100%" }}>{layer.text}</div></TextFrame>;
  return (
    <TextFrame layer={layer}>
      <div style={{ ...baseStyle, width: "100%" }}>
        {units.map((part, index) => {
          if (part.text === "\n") return <br key={part.key} />;
          const visual = evaluateTextUnit(layer, scene, time, index, units.length);
          return <span key={part.key} style={{ display: "inline-block", whiteSpace: "pre", opacity: visual.opacity, transform: `perspective(${scene.width}px) translate(${visual.translateX}px, ${visual.translateY}px) rotate(${visual.rotation}deg) rotateX(${visual.rotateX}deg) rotateY(${visual.rotateY}deg) scale(${visual.scale})`, transformOrigin: "center", filter: visual.blur > 0 ? `blur(${visual.blur}px)` : undefined }}>{part.text}</span>;
        })}
      </div>
    </TextFrame>
  );
}

function TextFrame({ layer, children }: { layer: TextLayer; children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", justifyContent: textVerticalJustification(layer.style.verticalAlign), width: "100%", height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden", boxSizing: "border-box" }}>{children}</div>;
}

function staticTextStyle(layer: TextLayer): React.CSSProperties {
  return {
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    fontFamily: `${layer.style.fontFamily}, Inter, Arial, sans-serif`,
    fontWeight: layer.style.fontWeight,
    fontSize: layer.style.fontSize,
    lineHeight: layer.style.lineHeight,
    letterSpacing: layer.style.letterSpacing,
    textAlign: layer.style.align,
    boxSizing: "border-box",
    minWidth: 0,
    ...textPaintStyle(layer),
  };
}

function StaticShape({ layer }: { layer: Extract<Layer, { type: "shape" }> }) {
  const shadowFilter = layer.style.shadow > 0 ? `drop-shadow(0 ${layer.style.shadow * .45}px ${layer.style.shadow * 1.25}px rgba(18,14,35,.28))` : undefined;
  const background = gradientToCss(layer.style.gradient) ?? layer.style.fill;
  if (isBoxShape(layer.shape)) return <div style={{ width: "100%", height: "100%", background, border: layer.style.strokeWidth > 0 ? `${layer.style.strokeWidth}px solid ${layer.style.stroke}` : undefined, borderRadius: layer.shape === "circle" ? "50%" : layer.shape === "line" ? 999 : layer.style.borderRadius, filter: shadowFilter, boxSizing: "border-box" }} />;
  const definition = getShapeDefinition(layer.shape);
  const maskStyle = getShapeMaskStyle(layer.shape);
  return <div style={{ position: "relative", width: "100%", height: "100%", filter: shadowFilter }}><div style={{ position: "absolute", inset: 0, background, ...maskStyle }} />{layer.style.strokeWidth > 0 ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}><path d={definition.path} fill="none" fillRule={definition.fillRule ?? "nonzero"} stroke={layer.style.stroke} strokeWidth={Math.max(.5, layer.style.strokeWidth / 2)} vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg> : null}</div>;
}

function StaticAsset({ project, layer }: { project: KurogiProject; layer: Extract<Layer, { type: "image" | "svg" }> }) {
  const asset = project.assets[layer.assetId];
  if (!asset?.sourceUrl) return <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "rgba(255,255,255,.72)", border: "2px dashed rgba(80,70,100,.35)", color: "#756f80" }}>Missing asset</div>;
  return <img src={asset.sourceUrl} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: layer.type === "image" ? layer.fit : "contain", pointerEvents: "none" }} />;
}

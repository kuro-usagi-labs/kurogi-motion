import type { CSSProperties } from "react";
import { evaluateLayer } from "../core/evaluator";
import { getShapeDefinition } from "../core/shapeLibrary";
import { textVerticalJustification } from "../core/textLayout";
import type { KurogiProject, Layer, Scene } from "../types";

export function clippingMaskSceneStyle(
  project: KurogiProject,
  layer: Layer,
  scene: Scene,
  time: number,
): CSSProperties | undefined {
  const definition = layer.mask;
  if (!definition?.clipping) return undefined;
  const source = project.layers[definition.sourceLayerId];
  if (!source || source.sceneId !== scene.id || source.parentId) return emptyMaskStyle(scene);

  const svg = buildSceneMaskSvg(project, source, scene, time);
  const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const value = `url(${JSON.stringify(dataUrl)})`;
  return {
    maskImage: value,
    WebkitMaskImage: value,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "0 0",
    WebkitMaskPosition: "0 0",
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
    maskMode: "alpha",
  } as CSSProperties;
}

function emptyMaskStyle(scene: Scene): CSSProperties {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}"/>`;
  const value = `url(${JSON.stringify(`data:image/svg+xml,${encodeURIComponent(svg)}`)})`;
  return {
    maskImage: value,
    WebkitMaskImage: value,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "0 0",
    WebkitMaskPosition: "0 0",
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
    maskMode: "alpha",
  } as CSSProperties;
}

function buildSceneMaskSvg(project: KurogiProject, source: Layer, scene: Scene, time: number) {
  if (!source.visible) return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}"/>`;
  const visual = evaluateLayer(source, scene, time);
  const pivotX = visual.x + visual.width * source.anchor.x;
  const pivotY = visual.y + visual.height * source.anchor.y;
  const transform = [
    `translate(${number(pivotX)} ${number(pivotY)})`,
    `rotate(${number(visual.rotation)})`,
    `scale(${number(visual.scaleX)} ${number(visual.scaleY)})`,
    `translate(${-number(pivotX)} ${-number(pivotY)})`,
  ].join(" ");
  const opacity = clamp(visual.opacity, 0, 1);
  const body = maskBody(project, source, visual.x, visual.y, visual.width, visual.height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><g opacity="${number(opacity)}" transform="${transform}">${body}</g></svg>`;
}

function maskBody(project: KurogiProject, source: Layer, x: number, y: number, width: number, height: number) {
  const safeWidth = Math.max(0.001, width);
  const safeHeight = Math.max(0.001, height);
  if (source.type === "shape") {
    if (source.shape === "rectangle") {
      return `<rect x="${number(x)}" y="${number(y)}" width="${number(safeWidth)}" height="${number(safeHeight)}" rx="${number(Math.max(0, source.style.borderRadius))}" fill="white"/>`;
    }
    if (source.shape === "circle") {
      return `<ellipse cx="${number(x + safeWidth / 2)}" cy="${number(y + safeHeight / 2)}" rx="${number(safeWidth / 2)}" ry="${number(safeHeight / 2)}" fill="white"/>`;
    }
    if (source.shape === "line") {
      return `<rect x="${number(x)}" y="${number(y)}" width="${number(safeWidth)}" height="${number(safeHeight)}" rx="${number(safeHeight / 2)}" fill="white"/>`;
    }
    const shape = getShapeDefinition(source.shape);
    return `<svg x="${number(x)}" y="${number(y)}" width="${number(safeWidth)}" height="${number(safeHeight)}" viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible"><path d="${escapeAttribute(shape.path)}" fill="white" fill-rule="${shape.fillRule ?? "nonzero"}"/></svg>`;
  }

  if (source.type === "image" || source.type === "svg") {
    const asset = project.assets[source.assetId];
    if (!asset?.sourceUrl) return "";
    const preserveAspectRatio = source.type === "svg"
      ? "xMidYMid meet"
      : source.fit === "cover"
        ? "xMidYMid slice"
        : source.fit === "fill"
          ? "none"
          : "xMidYMid meet";
    return `<image href="${escapeAttribute(asset.sourceUrl)}" x="${number(x)}" y="${number(y)}" width="${number(safeWidth)}" height="${number(safeHeight)}" preserveAspectRatio="${preserveAspectRatio}"/>`;
  }

  if (source.type === "text") {
    const justify = textVerticalJustification(source.style.verticalAlign);
    const family = escapeStyle(source.style.fontFamily || "Inter");
    const align = source.style.align;
    const text = escapeHtml(source.text).replace(/\n/g, "<br/>");
    return `<foreignObject x="${number(x)}" y="${number(y)}" width="${number(safeWidth)}" height="${number(safeHeight)}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:${justify};overflow:hidden;box-sizing:border-box;"><div style="width:100%;white-space:pre-wrap;overflow-wrap:break-word;font-family:${family},Inter,Arial,sans-serif;font-size:${number(source.style.fontSize)}px;font-weight:${number(source.style.fontWeight)};line-height:${number(source.style.lineHeight)};letter-spacing:${number(source.style.letterSpacing)}px;text-align:${align};color:white;">${text}</div></div></foreignObject>`;
  }

  return `<rect x="${number(x)}" y="${number(y)}" width="${number(safeWidth)}" height="${number(safeHeight)}" fill="white"/>`;
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeStyle(value: string) {
  return JSON.stringify(value.replace(/[\n\r;]/g, " "));
}

function number(value: number) {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

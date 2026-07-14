import type { CSSProperties } from "react";
import { evaluateLayer, type EvaluatedLayerVisual } from "../core/evaluator";
import { getShapeDefinition, isBoxShape } from "../core/shapeLibrary";
import type { KurogiProject, Layer, Scene, TextLayer } from "../types";

type Matrix = [number, number, number, number, number, number];

export function clippingMaskStyle(
  project: KurogiProject,
  target: Layer,
  source: Layer,
  scene?: Scene,
  time = 0,
  evaluatedTarget?: EvaluatedLayerVisual,
): CSSProperties {
  if (!scene || source.type === "group") return {};
  const targetVisual = evaluatedTarget ?? evaluateLayer(target, scene, time);
  const sourceVisual = evaluateLayer(source, scene, time);
  const svg = clippingMaskSvg(project, target, source, targetVisual, sourceVisual);
  const image = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return {
    maskImage: image,
    WebkitMaskImage: image,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "0 0",
    WebkitMaskPosition: "0 0",
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
    maskMode: "alpha",
  } as CSSProperties;
}

function clippingMaskSvg(
  project: KurogiProject,
  target: Layer,
  source: Layer,
  targetVisual: EvaluatedLayerVisual,
  sourceVisual: EvaluatedLayerVisual,
) {
  const width = Math.max(1, targetVisual.width);
  const height = Math.max(1, targetVisual.height);
  if (!source.visible || sourceVisual.opacity <= 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"/>`;
  }
  const targetMatrix = layerMatrix(target, targetVisual);
  const sourceMatrix = layerMatrix(source, sourceVisual);
  const relative = multiply(invert(targetMatrix), sourceMatrix);
  const primitive = sourcePrimitive(project, source, sourceVisual);
  const opacity = clamp(sourceVisual.opacity, 0, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><g transform="matrix(${relative.map(formatNumber).join(" ")})" opacity="${formatNumber(opacity)}">${primitive}</g></svg>`;
}

function sourcePrimitive(project: KurogiProject, layer: Layer, visual: EvaluatedLayerVisual) {
  const width = Math.max(1, visual.width);
  const height = Math.max(1, visual.height);
  if (layer.type === "shape") {
    if (layer.shape === "circle") return `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="white"/>`;
    if (layer.shape === "line") return `<rect x="0" y="${height * .42}" width="${width}" height="${Math.max(1, height * .16)}" rx="${Math.max(1, height * .08)}" fill="white"/>`;
    if (isBoxShape(layer.shape)) {
      const radius = Math.max(0, Math.min(layer.style.borderRadius, width / 2, height / 2));
      return `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="white"/>`;
    }
    const definition = getShapeDefinition(layer.shape);
    return `<svg x="0" y="0" width="${width}" height="${height}" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${escapeXml(definition.path)}" fill="white" fill-rule="${definition.fillRule ?? "nonzero"}"/></svg>`;
  }
  if (layer.type === "image" || layer.type === "svg") {
    const asset = project.assets[layer.assetId];
    if (!asset?.sourceUrl) return "";
    const preserve = layer.type === "image"
      ? layer.fit === "cover" ? "xMidYMid slice" : layer.fit === "fill" ? "none" : "xMidYMid meet"
      : "xMidYMid meet";
    return `<image href="${escapeXml(asset.sourceUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="${preserve}"/>`;
  }
  if (layer.type === "text") return textPrimitive(layer, width, height);
  return "";
}

function textPrimitive(layer: TextLayer, width: number, height: number) {
  const lines = layer.text.split("\n");
  const lineHeight = Math.max(.1, layer.style.lineHeight) * layer.style.fontSize;
  const totalHeight = Math.max(lineHeight, lines.length * lineHeight);
  const x = layer.style.align === "center" ? width / 2 : layer.style.align === "right" ? width : 0;
  const anchor = layer.style.align === "center" ? "middle" : layer.style.align === "right" ? "end" : "start";
  const firstBaseline = layer.style.verticalAlign === "middle"
    ? (height - totalHeight) / 2 + layer.style.fontSize
    : layer.style.verticalAlign === "bottom"
      ? height - totalHeight + layer.style.fontSize
      : layer.style.fontSize;
  const spans = lines.map((line, index) => `<tspan x="${formatNumber(x)}" y="${formatNumber(firstBaseline + index * lineHeight)}">${escapeXml(line || " ")}</tspan>`).join("");
  return `<text fill="white" font-family="${escapeXml(layer.style.fontFamily)}" font-size="${formatNumber(layer.style.fontSize)}" font-weight="${layer.style.fontWeight}" letter-spacing="${formatNumber(layer.style.letterSpacing)}" text-anchor="${anchor}">${spans}</text>`;
}

function layerMatrix(layer: Layer, visual: EvaluatedLayerVisual): Matrix {
  const anchorX = visual.width * layer.anchor.x;
  const anchorY = visual.height * layer.anchor.y;
  const rotation = visual.rotation * Math.PI / 180;
  const skewX = Math.tan((visual.skewX || 0) * Math.PI / 180);
  const skewY = Math.tan((visual.skewY || 0) * Math.PI / 180);
  return multiply(
    translate(visual.x + anchorX, visual.y + anchorY),
    multiply(
      rotate(rotation),
      multiply(skew(skewX, skewY), multiply(scale(visual.scaleX, visual.scaleY), translate(-anchorX, -anchorY))),
    ),
  );
}

function translate(x: number, y: number): Matrix { return [1, 0, 0, 1, x, y]; }
function scale(x: number, y: number): Matrix { return [x, 0, 0, y, 0, 0]; }
function rotate(angle: number): Matrix { const c = Math.cos(angle); const s = Math.sin(angle); return [c, s, -s, c, 0, 0]; }
function skew(x: number, y: number): Matrix { return [1, y, x, 1, 0, 0]; }

function multiply(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function invert(matrix: Matrix): Matrix {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  if (Math.abs(determinant) < 1e-8) return [1, 0, 0, 1, 0, 0];
  const inverse = 1 / determinant;
  return [
    matrix[3] * inverse,
    -matrix[1] * inverse,
    -matrix[2] * inverse,
    matrix[0] * inverse,
    (matrix[2] * matrix[5] - matrix[3] * matrix[4]) * inverse,
    (matrix[1] * matrix[4] - matrix[0] * matrix[5]) * inverse,
  ];
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function formatNumber(value: number) { return Number.isFinite(value) ? Number(value.toFixed(5)) : 0; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

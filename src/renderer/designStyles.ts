import type { CSSProperties } from "react";
import { getShapeDefinition, isBoxShape } from "../core/shapeLibrary";
import type { GradientFill, KurogiProject, Layer, ShapeType } from "../types";

export function gradientToCss(gradient?: GradientFill): string | undefined {
  if (!gradient) return undefined;
  if (gradient.type === "radial") return `radial-gradient(circle at center, ${gradient.startColor} 0%, ${gradient.endColor} 100%)`;
  return `linear-gradient(${gradient.angle}deg, ${gradient.startColor} 0%, ${gradient.endColor} 100%)`;
}

export function layerCompositingStyle(project: KurogiProject, layer: Layer): CSSProperties {
  const blur = Math.max(0, layer.backgroundBlur ?? 0);
  return {
    mixBlendMode: layer.blendMode ?? "normal",
    backdropFilter: blur > 0 ? `blur(${blur}px)` : undefined,
    WebkitBackdropFilter: blur > 0 ? `blur(${blur}px)` : undefined,
    ...maskStyle(project, layer),
  };
}

export function textPaintStyle(layer: Extract<Layer, { type: "text" }>): CSSProperties {
  const gradient = gradientToCss(layer.style.gradient);
  if (!gradient) {
    return {
      color: layer.style.color,
      WebkitTextFillColor: layer.style.color,
    };
  }
  return {
    color: "transparent",
    WebkitTextFillColor: "transparent",
    backgroundImage: gradient,
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
  };
}

export function projectFontFaceCss(project: KurogiProject): string {
  return Object.values(project.assets)
    .filter((asset) => asset.type === "font" && asset.sourceUrl && asset.fontFamily)
    .map((asset) => {
      const family = cssString(asset.fontFamily ?? asset.name);
      const source = cssString(asset.sourceUrl);
      const format = fontFormat(asset.mimeType, asset.name);
      return `@font-face{font-family:${family};src:url(${source})${format ? ` format(${cssString(format)})` : ""};font-weight:${asset.fontWeight ?? 400};font-style:${asset.fontStyle ?? "normal"};font-display:swap;}`;
    })
    .join("\n");
}

function maskStyle(project: KurogiProject, layer: Layer): CSSProperties {
  if (!layer.mask || layer.mask.clipping) return {};
  const source = project.layers[layer.mask.sourceLayerId];
  if (!source) return {};
  let image = "";
  if (layer.mask.type === "vector" && source.type === "shape") image = vectorMaskDataUrl(source.shape);
  if (layer.mask.type === "alpha" && (source.type === "image" || source.type === "svg")) image = project.assets[source.assetId]?.sourceUrl ?? "";
  if (!image) return {};
  const value = `url(${JSON.stringify(image)})`;
  return {
    maskImage: value,
    WebkitMaskImage: value,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
    maskMode: layer.mask.type === "alpha" ? "alpha" : "luminance",
  } as CSSProperties;
}

function vectorMaskDataUrl(shape: ShapeType) {
  let body = "";
  if (shape === "circle" || shape === "ring") body = '<circle cx="50" cy="50" r="48" fill="white"/>';
  else if (shape === "line") body = '<rect x="0" y="44" width="100" height="12" rx="6" fill="white"/>';
  else if (isBoxShape(shape)) body = '<rect x="1" y="1" width="98" height="98" rx="8" fill="white"/>';
  else {
    const definition = getShapeDefinition(shape);
    body = `<path d="${definition.path.replace(/"/g, "&quot;")}" fill="white" fill-rule="${definition.fillRule ?? "nonzero"}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function fontFormat(mimeType: string, name: string) {
  const value = `${mimeType} ${name}`.toLowerCase();
  if (value.includes("woff2")) return "woff2";
  if (value.includes("woff")) return "woff";
  if (value.includes("otf") || value.includes("opentype")) return "opentype";
  if (value.includes("ttf") || value.includes("truetype")) return "truetype";
  return "";
}

function cssString(value: string) {
  return JSON.stringify(value.replace(/[\n\r]/g, " "));
}

import type { KurogiProject, Layer, Scene, TextLayer } from "../types";
import { getSceneLayers } from "./project";

export type ValidationSeverity = "error" | "warning" | "info";

export interface ProjectValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  sceneId?: string;
  layerId?: string;
  assetId?: string;
  suggestion?: string;
}

export interface ProjectValidationResult {
  valid: boolean;
  errors: number;
  warnings: number;
  infos: number;
  sceneCount: number;
  layerCount: number;
  issues: ProjectValidationIssue[];
}

const SAFE_FONT_FAMILIES = new Set([
  "arial", "arial black", "calibri", "cambria", "courier new", "georgia", "inter",
  "segoe ui", "tahoma", "times new roman", "trebuchet ms", "verdana", "sans-serif", "serif", "monospace",
]);

export function validateProject(project: KurogiProject): ProjectValidationResult {
  const issues: ProjectValidationIssue[] = [];

  for (const scene of Object.values(project.scenes)) validateScene(project, scene, issues);

  for (const asset of Object.values(project.assets)) {
    if (!asset.sourceUrl && !asset.blobId) {
      issues.push({
        severity: "error",
        code: "ASSET_SOURCE_MISSING",
        message: `Asset “${asset.name}” has no readable source.`,
        assetId: asset.id,
        suggestion: "Re-import or replace the asset before rendering.",
      });
    }
  }

  const counts = issues.reduce((result, issue) => {
    result[issue.severity] += 1;
    return result;
  }, { error: 0, warning: 0, info: 0 });

  return {
    valid: counts.error === 0,
    errors: counts.error,
    warnings: counts.warning,
    infos: counts.info,
    sceneCount: Object.keys(project.scenes).length,
    layerCount: Object.keys(project.layers).length,
    issues,
  };
}

export function estimateAutoFitFontSize(layer: TextLayer, minimum = 8): number {
  const current = Math.max(minimum, layer.style.fontSize);
  const metrics = estimateTextMetrics(layer, current);
  if (!metrics.overflow) return current;
  const widthRatio = layer.size.width / Math.max(1, metrics.width);
  const heightRatio = layer.size.height / Math.max(1, metrics.height);
  return Math.max(minimum, Math.floor(current * Math.min(widthRatio, heightRatio, 1) * .96));
}

function validateScene(project: KurogiProject, scene: Scene, issues: ProjectValidationIssue[]) {
  const layers = getSceneLayers(project, scene.id);
  const visibleCandidates: Layer[] = [];

  for (const layer of layers) {
    const startTime = Math.max(0, layer.startTime ?? 0);
    const duration = Math.max(.01, layer.duration ?? scene.duration);
    const endTime = startTime + duration;
    const width = layer.size.width * Math.abs(layer.scale.x);
    const height = layer.size.height * Math.abs(layer.scale.y);
    const entirelyOutside = layer.position.x + width <= 0 || layer.position.y + height <= 0 || layer.position.x >= scene.width || layer.position.y >= scene.height;

    if (layer.visible && layer.opacity > 0 && !layer.maskSource && !entirelyOutside && endTime > 0 && startTime < scene.duration) visibleCandidates.push(layer);

    if (layer.opacity < 0 || layer.opacity > 1) {
      issues.push({ severity: "error", code: "OPACITY_OUT_OF_RANGE", message: `Layer “${layer.name}” opacity must be between 0 and 1.`, sceneId: scene.id, layerId: layer.id, suggestion: "Set opacity to a value from 0 through 1." });
    } else if (layer.visible && layer.opacity <= .01) {
      issues.push({ severity: "warning", code: "LAYER_EFFECTIVELY_TRANSPARENT", message: `Layer “${layer.name}” is visible but effectively transparent.`, sceneId: scene.id, layerId: layer.id, suggestion: "Increase opacity or hide the layer intentionally." });
    }

    if (entirelyOutside) {
      issues.push({ severity: "warning", code: "LAYER_OUTSIDE_CANVAS", message: `Layer “${layer.name}” is completely outside the canvas.`, sceneId: scene.id, layerId: layer.id, suggestion: "Move it inside the scene or hide it." });
    } else if (layer.position.x < 0 || layer.position.y < 0 || layer.position.x + width > scene.width || layer.position.y + height > scene.height) {
      issues.push({ severity: "info", code: "LAYER_PARTIALLY_OUTSIDE_CANVAS", message: `Layer “${layer.name}” extends beyond the canvas.`, sceneId: scene.id, layerId: layer.id });
    }

    if (startTime >= scene.duration || endTime > scene.duration + .001) {
      issues.push({ severity: startTime >= scene.duration ? "error" : "warning", code: "LAYER_TIMING_OUTSIDE_SCENE", message: `Layer “${layer.name}” timing (${startTime.toFixed(2)}–${endTime.toFixed(2)}s) exceeds scene duration ${scene.duration.toFixed(2)}s.`, sceneId: scene.id, layerId: layer.id, suggestion: "Trim or move the layer timing into the scene." });
    }

    for (const action of layer.animationActions) {
      const actionEnd = startTime + action.startTime + action.delay + action.duration;
      if (actionEnd > scene.duration + .001 && action.repeat?.count !== "infinite") {
        issues.push({ severity: "warning", code: "ANIMATION_EXCEEDS_SCENE", message: `Animation ${action.type} on “${layer.name}” ends at ${actionEnd.toFixed(2)}s, after the scene.`, sceneId: scene.id, layerId: layer.id, suggestion: "Shorten or move the animation." });
      }
    }

    if (layer.type === "text") validateTextLayer(project, scene, layer, issues);
    if (layer.type === "image" || layer.type === "svg") {
      const asset = project.assets[layer.assetId];
      if (!asset) issues.push({ severity: "error", code: "LAYER_ASSET_MISSING", message: `Layer “${layer.name}” references a missing asset.`, sceneId: scene.id, layerId: layer.id, assetId: layer.assetId, suggestion: "Replace the layer asset or remove the layer." });
    }
  }

  if (visibleCandidates.length === 0) {
    issues.push({ severity: "warning", code: "POSSIBLY_BLANK_SCENE", message: `Scene “${scene.name}” has no visible layer inside the canvas.`, sceneId: scene.id, suggestion: "Add a visible layer or verify that a background-only scene is intentional." });
  }
}

function validateTextLayer(project: KurogiProject, scene: Scene, layer: TextLayer, issues: ProjectValidationIssue[]) {
  if (!layer.text.trim()) {
    issues.push({ severity: "warning", code: "EMPTY_TEXT", message: `Text layer “${layer.name}” is empty.`, sceneId: scene.id, layerId: layer.id });
  }
  const metrics = estimateTextMetrics(layer, layer.style.fontSize);
  if (metrics.overflow) {
    issues.push({ severity: "warning", code: "TEXT_OVERFLOW", message: `Text in “${layer.name}” likely overflows its ${Math.round(layer.size.width)}×${Math.round(layer.size.height)} box.`, sceneId: scene.id, layerId: layer.id, suggestion: layer.style.autoFit ? "Increase the box size or shorten the text." : "Enable auto-fit, reduce the font size, or enlarge the text box." });
  }

  const family = layer.style.fontFamily.trim().toLowerCase();
  const hasProjectFont = Object.values(project.assets).some((asset) => asset.type === "font" && (asset.fontFamily || asset.name).trim().toLowerCase() === family && Boolean(asset.sourceUrl || asset.blobId));
  if (family && !SAFE_FONT_FAMILIES.has(family) && !hasProjectFont) {
    issues.push({ severity: "warning", code: "FONT_UNVERIFIED", message: `Font “${layer.style.fontFamily}” used by “${layer.name}” is not embedded in the project.`, sceneId: scene.id, layerId: layer.id, suggestion: "Import the font or switch to an embedded/system font." });
  }
}

function estimateTextMetrics(layer: TextLayer, fontSize: number) {
  const lines = layer.text.replace(/\r/g, "").split("\n");
  const strokeInset = Math.max(0, layer.style.strokeWidth ?? 0) * 2;
  const availableWidth = Math.max(1, layer.size.width - strokeInset);
  const availableHeight = Math.max(1, layer.size.height - strokeInset);
  let visualLines = 0;
  let maxWidth = 0;
  for (const line of lines) {
    const lineWidth = estimateLineWidth(line, fontSize, layer.style.fontWeight, layer.style.letterSpacing);
    maxWidth = Math.max(maxWidth, lineWidth);
    visualLines += Math.max(1, Math.ceil(lineWidth / availableWidth));
  }
  const height = visualLines * fontSize * Math.max(.5, layer.style.lineHeight);
  return { width: maxWidth, height, overflow: maxWidth > availableWidth || height > availableHeight };
}

function estimateLineWidth(text: string, fontSize: number, fontWeight: number, letterSpacing: number) {
  if (!text) return 0;
  const visibleCharacters = [...text].filter((character) => !/\s/.test(character));
  const uppercaseRatio = visibleCharacters.length ? visibleCharacters.filter((character) => /[A-Z0-9]/.test(character)).length / visibleCharacters.length : 0;
  const weightAdjustment = fontWeight >= 700 ? .07 : fontWeight >= 600 ? .04 : fontWeight >= 500 ? .02 : 0;
  const glyphRatio = (uppercaseRatio >= .6 ? .60 : .50) + weightAdjustment;
  return Math.max(fontSize * .28, text.length * fontSize * glyphRatio + Math.max(0, text.length - 1) * letterSpacing);
}

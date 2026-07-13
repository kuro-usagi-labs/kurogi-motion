import { getActiveScene, getSceneLayers } from "./project";
import { estimateTextMetrics, isDecorativeLayer } from "./templateLayout";
import type { KurogiProject, Layer, Scene, ShapeLayer, TextLayer } from "../types";

export type TemplateAuditSeverity = "error" | "warning";

export interface TemplateAuditIssue {
  severity: TemplateAuditSeverity;
  code: "OUT_OF_BOUNDS" | "NON_IDENTITY_SCALE" | "TEXT_OVERFLOW" | "TEXT_COLLISION" | "LOW_CONTRAST";
  layerId: string;
  layerName: string;
  message: string;
  relatedLayerId?: string;
}

export interface TemplateAuditReport {
  templateId?: string;
  errors: TemplateAuditIssue[];
  warnings: TemplateAuditIssue[];
  issues: TemplateAuditIssue[];
}

export function auditTemplateProject(project: KurogiProject, templateId?: string): TemplateAuditReport {
  const scene = getActiveScene(project);
  const layers = getSceneLayers(project);
  const issues: TemplateAuditIssue[] = [];

  for (const layer of layers) {
    if (Math.abs(layer.scale.x - 1) > 0.0001 || Math.abs(layer.scale.y - 1) > 0.0001) {
      issues.push(issue("error", "NON_IDENTITY_SCALE", layer, "Template base layout must use width and height, not scale."));
    }
    if (!isDecorativeLayer(layer) && isOutsideScene(layer, scene)) {
      issues.push(issue("error", "OUT_OF_BOUNDS", layer, "Layer extends outside the artboard."));
    }
    if (layer.type === "text") {
      const metrics = estimateTextMetrics(layer);
      if (metrics.requiredHeight > layer.size.height * 1.02) {
        issues.push(issue("error", "TEXT_OVERFLOW", layer, `Estimated text height ${Math.round(metrics.requiredHeight)}px exceeds its ${Math.round(layer.size.height)}px box.`));
      }
      const backdrop = backdropColorAt(project, scene, layers, layer);
      const foreground = parseSolidColor(layer.style.color);
      if (foreground && backdrop && contrastRatio(foreground, backdrop) < 2.8) {
        issues.push(issue("warning", "LOW_CONTRAST", layer, "Text contrast is low against the visible background."));
      }
    }
  }

  const textLayers = layers.filter((layer): layer is TextLayer => layer.type === "text");
  for (let leftIndex = 0; leftIndex < textLayers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < textLayers.length; rightIndex += 1) {
      const left = textLayers[leftIndex];
      const right = textLayers[rightIndex];
      if (isExpectedOverlay(left, right)) continue;
      const ratio = overlapRatio(left, right);
      if (ratio > 0.42) {
        issues.push({
          ...issue("warning", "TEXT_COLLISION", left, `Text box overlaps ${right.name} by ${Math.round(ratio * 100)}%.`),
          relatedLayerId: right.id,
        });
      }
    }
  }

  return {
    templateId,
    errors: issues.filter((candidate) => candidate.severity === "error"),
    warnings: issues.filter((candidate) => candidate.severity === "warning"),
    issues,
  };
}

export function logTemplateAudit(report: TemplateAuditReport) {
  if (!report.issues.length) return;
  const label = report.templateId ? `Template ${report.templateId}` : "Template";
  console.groupCollapsed(`[Kurogi template audit] ${label}: ${report.errors.length} errors, ${report.warnings.length} warnings`);
  console.table(report.issues.map((candidate) => ({ severity: candidate.severity, code: candidate.code, layer: candidate.layerName, message: candidate.message })));
  console.groupEnd();
}

function issue(severity: TemplateAuditSeverity, code: TemplateAuditIssue["code"], layer: Layer, message: string): TemplateAuditIssue {
  return { severity, code, layerId: layer.id, layerName: layer.name, message };
}

function isOutsideScene(layer: Layer, scene: Scene) {
  const toleranceX = scene.width * 0.004;
  const toleranceY = scene.height * 0.004;
  return layer.position.x < -toleranceX || layer.position.y < -toleranceY || layer.position.x + layer.size.width > scene.width + toleranceX || layer.position.y + layer.size.height > scene.height + toleranceY;
}

function overlapRatio(left: Layer, right: Layer) {
  const x = Math.max(0, Math.min(left.position.x + left.size.width, right.position.x + right.size.width) - Math.max(left.position.x, right.position.x));
  const y = Math.max(0, Math.min(left.position.y + left.size.height, right.position.y + right.size.height) - Math.max(left.position.y, right.position.y));
  const overlap = x * y;
  const smaller = Math.min(left.size.width * left.size.height, right.size.width * right.size.height);
  return smaller > 0 ? overlap / smaller : 0;
}

function isExpectedOverlay(left: TextLayer, right: TextLayer) {
  const names = `${left.name} ${right.name}`.toLowerCase();
  return ["initial", "symbol", "button", "badge", "mark", "number", "off", "arrow", "rating", "trend text"].some((token) => names.includes(token));
}

function backdropColorAt(project: KurogiProject, scene: Scene, layers: Layer[], text: TextLayer) {
  const center = { x: text.position.x + text.size.width / 2, y: text.position.y + text.size.height / 2 };
  const textIndex = scene.layerIds.indexOf(text.id);
  let color = scene.background.type === "solid" ? parseSolidColor(scene.background.color ?? "#ffffff") : parseSolidColor("#ffffff");

  for (let index = 0; index < textIndex; index += 1) {
    const layer = project.layers[scene.layerIds[index]];
    if (!layer || layer.type !== "shape" || !contains(layer, center.x, center.y)) continue;
    const next = parseSolidColor(layer.style.fill);
    if (next) color = next;
  }
  return color;
}

function contains(layer: ShapeLayer, x: number, y: number) {
  return x >= layer.position.x && x <= layer.position.x + layer.size.width && y >= layer.position.y && y <= layer.position.y + layer.size.height;
}

function parseSolidColor(value: string) {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return {
      r: parseInt(hex[1].slice(0, 2), 16),
      g: parseInt(hex[1].slice(2, 4), 16),
      b: parseInt(hex[1].slice(4, 6), 16),
    };
  }
  const rgb = value.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  return null;
}

function contrastRatio(left: { r: number; g: number; b: number }, right: { r: number; g: number; b: number }) {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function luminance(color: { r: number; g: number; b: number }) {
  const channels = [color.r, color.g, color.b].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

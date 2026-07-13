import type { TextVerticalAlign } from "../types";

export function normalizeTextVerticalAlign(value: unknown): TextVerticalAlign {
  return value === "top" || value === "bottom" || value === "middle" ? value : "middle";
}

export function textVerticalJustification(value: unknown): "flex-start" | "center" | "flex-end" {
  const alignment = normalizeTextVerticalAlign(value);
  if (alignment === "top") return "flex-start";
  if (alignment === "bottom") return "flex-end";
  return "center";
}

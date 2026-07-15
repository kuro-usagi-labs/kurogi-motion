import type { ProjectAsset } from "../types";

export interface FontFamilyGroup {
  label: string;
  families: readonly string[];
}

/**
 * Offline-safe families commonly available in Windows/macOS creative tools.
 * Imported project fonts are appended separately and embedded with the project.
 */
export const SYSTEM_FONT_GROUPS: readonly FontFamilyGroup[] = [
  {
    label: "Modern sans",
    families: ["Inter", "Segoe UI", "Aptos", "Arial", "Helvetica", "Calibri", "Tahoma", "Verdana", "Trebuchet MS", "Century Gothic"],
  },
  {
    label: "Editorial serif",
    families: ["Georgia", "Times New Roman", "Cambria", "Garamond", "Baskerville", "Palatino Linotype", "Book Antiqua"],
  },
  {
    label: "Display",
    families: ["Arial Black", "Impact", "Franklin Gothic Medium", "Copperplate", "Rockwell"],
  },
  {
    label: "Monospace",
    families: ["DM Mono", "Consolas", "Courier New", "Lucida Console", "Monaco"],
  },
] as const;

export const SYSTEM_FONT_FAMILIES = [...new Set(SYSTEM_FONT_GROUPS.flatMap((group) => group.families))];

export function projectFontFamilies(assets: Record<string, ProjectAsset>) {
  return [...new Set(Object.values(assets)
    .filter((asset) => asset.type === "font" && asset.fontFamily)
    .map((asset) => asset.fontFamily!.trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

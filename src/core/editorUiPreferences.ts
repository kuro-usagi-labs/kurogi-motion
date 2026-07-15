export interface EditorUiPreferences {
  showDesignToolbar: boolean;
  sidebarVisible: boolean;
  inspectorVisible: boolean;
  timelineVisible: boolean;
  sidebarWidth: number;
  inspectorWidth: number;
}

export const EDITOR_PANEL_LIMITS = {
  railWidth: 56,
  minimumStageWidth: 360,
  sidebar: { minimum: 210, maximum: 420, defaultValue: 252 },
  inspector: { minimum: 260, maximum: 480, defaultValue: 310 },
} as const;

export const DEFAULT_EDITOR_UI_PREFERENCES: EditorUiPreferences = {
  showDesignToolbar: true,
  sidebarVisible: true,
  inspectorVisible: true,
  timelineVisible: true,
  sidebarWidth: EDITOR_PANEL_LIMITS.sidebar.defaultValue,
  inspectorWidth: EDITOR_PANEL_LIMITS.inspector.defaultValue,
};

const STORAGE_KEY = "kurogi-editor-ui-v1";

export function loadEditorUiPreferences(): EditorUiPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_EDITOR_UI_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EDITOR_UI_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<EditorUiPreferences>;
    return {
      showDesignToolbar: typeof parsed.showDesignToolbar === "boolean"
        ? parsed.showDesignToolbar
        : DEFAULT_EDITOR_UI_PREFERENCES.showDesignToolbar,
      sidebarVisible: booleanPreference(parsed.sidebarVisible, DEFAULT_EDITOR_UI_PREFERENCES.sidebarVisible),
      inspectorVisible: booleanPreference(parsed.inspectorVisible, DEFAULT_EDITOR_UI_PREFERENCES.inspectorVisible),
      timelineVisible: booleanPreference(parsed.timelineVisible, DEFAULT_EDITOR_UI_PREFERENCES.timelineVisible),
      sidebarWidth: numericPreference(parsed.sidebarWidth, EDITOR_PANEL_LIMITS.sidebar.minimum, EDITOR_PANEL_LIMITS.sidebar.maximum, DEFAULT_EDITOR_UI_PREFERENCES.sidebarWidth),
      inspectorWidth: numericPreference(parsed.inspectorWidth, EDITOR_PANEL_LIMITS.inspector.minimum, EDITOR_PANEL_LIMITS.inspector.maximum, DEFAULT_EDITOR_UI_PREFERENCES.inspectorWidth),
    };
  } catch {
    return { ...DEFAULT_EDITOR_UI_PREFERENCES };
  }
}

export function fitEditorPanelWidths(preferences: EditorUiPreferences, viewportWidth: number): EditorUiPreferences {
  if (!Number.isFinite(viewportWidth)) return preferences;
  if (!preferences.sidebarVisible || !preferences.inspectorVisible) return preferences;
  const minimumTotal = EDITOR_PANEL_LIMITS.sidebar.minimum + EDITOR_PANEL_LIMITS.inspector.minimum;
  const available = Math.max(minimumTotal, Math.floor(viewportWidth - EDITOR_PANEL_LIMITS.railWidth - EDITOR_PANEL_LIMITS.minimumStageWidth));
  const currentTotal = preferences.sidebarWidth + preferences.inspectorWidth;
  if (currentTotal <= available) return preferences;

  const ratio = available / currentTotal;
  let sidebarWidth = numericPreference(preferences.sidebarWidth * ratio, EDITOR_PANEL_LIMITS.sidebar.minimum, EDITOR_PANEL_LIMITS.sidebar.maximum, EDITOR_PANEL_LIMITS.sidebar.defaultValue);
  let inspectorWidth = numericPreference(available - sidebarWidth, EDITOR_PANEL_LIMITS.inspector.minimum, EDITOR_PANEL_LIMITS.inspector.maximum, EDITOR_PANEL_LIMITS.inspector.defaultValue);
  const overflow = sidebarWidth + inspectorWidth - available;
  if (overflow > 0) {
    const inspectorReduction = Math.min(overflow, inspectorWidth - EDITOR_PANEL_LIMITS.inspector.minimum);
    inspectorWidth -= inspectorReduction;
    sidebarWidth = Math.max(EDITOR_PANEL_LIMITS.sidebar.minimum, sidebarWidth - (overflow - inspectorReduction));
  }
  if (sidebarWidth === preferences.sidebarWidth && inspectorWidth === preferences.inspectorWidth) return preferences;
  return { ...preferences, sidebarWidth, inspectorWidth };
}

function booleanPreference(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numericPreference(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.round(value)))
    : fallback;
}

export function saveEditorUiPreferences(preferences: EditorUiPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // UI preferences are non-critical. The editor remains usable when storage is unavailable.
  }
}

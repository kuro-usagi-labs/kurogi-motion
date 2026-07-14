export interface EditorUiPreferences {
  showDesignToolbar: boolean;
}

export const DEFAULT_EDITOR_UI_PREFERENCES: EditorUiPreferences = {
  showDesignToolbar: true,
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
    };
  } catch {
    return { ...DEFAULT_EDITOR_UI_PREFERENCES };
  }
}

export function saveEditorUiPreferences(preferences: EditorUiPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // UI preferences are non-critical. The editor remains usable when storage is unavailable.
  }
}

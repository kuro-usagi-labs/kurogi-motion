export const PROJECT_PREVIEW_MAX_SECONDS = 7;
export const PRESET_PREVIEW_WIDTH = 960;
export const PRESET_PREVIEW_HEIGHT = 540;

export function projectPreviewDuration(duration: number) {
  if (!Number.isFinite(duration)) return PROJECT_PREVIEW_MAX_SECONDS;
  return Math.max(1 / 60, Math.min(PROJECT_PREVIEW_MAX_SECONDS, duration));
}

export function previewDurationInFrames(duration: number, fps: number) {
  const safeFps = Number.isFinite(fps) ? Math.max(1, Math.round(fps)) : 30;
  return Math.max(1, Math.round(projectPreviewDuration(duration) * safeFps));
}

export function fitPresetLayer(width: number, height: number) {
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  const scale = Math.min(1, 360 / safeWidth, 180 / safeHeight);
  return {
    width: Math.max(84, safeWidth * scale),
    height: Math.max(56, safeHeight * scale),
    scale,
  };
}

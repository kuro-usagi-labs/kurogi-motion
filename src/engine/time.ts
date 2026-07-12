export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const timeToFrame = (timeMs: number, fps: number): number =>
  Math.floor((Math.max(0, timeMs) / 1000) * fps);

export const frameToTime = (frame: number, fps: number): number =>
  (Math.max(0, frame) / fps) * 1000;

export const calculateProgress = (
  currentTimeMs: number,
  startTimeMs: number,
  durationMs: number,
): number => {
  if (durationMs <= 0) return 1;
  return clamp((currentTimeMs - startTimeMs) / durationMs, 0, 1);
};

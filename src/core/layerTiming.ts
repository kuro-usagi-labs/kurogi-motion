import type { Layer, Scene } from "../types";

export interface LayerRenderTiming {
  startTime: number;
  duration: number;
  animationOffset: number;
  inferredFromActions: boolean;
}

export function getLayerRenderTiming(layer: Layer, scene: Scene): LayerRenderTiming {
  const startTime = Math.max(0, layer.startTime ?? 0);
  const duration = Math.max(.01, layer.duration ?? scene.duration);
  const spansWholeScene = startTime <= .001 && duration >= scene.duration - .01;
  if (!spansWholeScene || layer.animationActions.length === 0) {
    return { startTime, duration, animationOffset: startTime, inferredFromActions: false };
  }

  const entering = layer.animationActions.filter((action) => action.category === "in");
  const exiting = layer.animationActions.filter((action) => action.category === "out");
  const inferredStart = entering.length
    ? Math.max(...entering.map((action) => Math.max(0, action.startTime + action.delay)))
    : 0;
  const inferredEnd = exiting.length
    ? Math.max(...exiting.map((action) => Math.max(0, action.startTime + action.delay + action.duration)))
    : scene.duration;
  const clampedStart = Math.min(Math.max(0, inferredStart), Math.max(0, scene.duration - .01));
  const clampedEnd = Math.min(scene.duration, Math.max(clampedStart + .01, inferredEnd));
  const inferred = clampedStart > .001 || clampedEnd < scene.duration - .001;
  if (!inferred) return { startTime, duration, animationOffset: startTime, inferredFromActions: false };

  // V3 authored shot timing through absolute animation timestamps because
  // layers did not yet have a lifespan. Keep those timestamps absolute while
  // avoiding mounting invisible media outside the inferred action window.
  return {
    startTime: clampedStart,
    duration: Math.max(.01, clampedEnd - clampedStart),
    animationOffset: 0,
    inferredFromActions: true,
  };
}

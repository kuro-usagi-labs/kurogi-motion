import type {
  AnimationActionDocument,
  EvaluatedLayer,
  EvaluatedScene,
  KurogiProject,
  LayerDocument,
  SceneId,
} from "../domain/project";
import { applyEasing } from "./easing";
import { calculateProgress, clamp, timeToFrame } from "./time";

interface MutableEvaluation {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  blur: number;
}

const directionVector = (
  direction: AnimationActionDocument["parameters"]["direction"] = "up",
): { x: number; y: number } => {
  switch (direction) {
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "down":
      return { x: 0, y: 1 };
    default:
      return { x: 0, y: -1 };
  }
};

const getLoopPhase = (action: AnimationActionDocument, timeMs: number): number => {
  if (timeMs < action.startTimeMs || action.durationMs <= 0) return 0;
  const repeatDelay = action.repeat?.delayMs ?? 0;
  const cycleDuration = Math.max(1, action.durationMs + repeatDelay);
  const elapsed = timeMs - action.startTimeMs;
  const cycle = Math.floor(elapsed / cycleDuration);
  if (action.repeat?.count !== "infinite" && action.repeat?.count !== undefined) {
    if (cycle >= action.repeat.count) return 0;
  }
  const insideCycle = elapsed % cycleDuration;
  if (insideCycle > action.durationMs) return 0;
  let phase = insideCycle / action.durationMs;
  if (action.repeat?.alternate && cycle % 2 === 1) phase = 1 - phase;
  return clamp(phase, 0, 1);
};

const applyAction = (
  state: MutableEvaluation,
  action: AnimationActionDocument,
  timeMs: number,
): void => {
  if (!action.enabled) return;

  const rawProgress = calculateProgress(timeMs, action.startTimeMs, action.durationMs);
  const progress = applyEasing(action.easing, rawProgress);
  const isIn = action.category === "in";
  const isOut = action.category === "out";
  const distance = action.parameters.distance ?? 80;
  const vector = directionVector(action.parameters.direction);

  switch (action.type) {
    case "fade": {
      const from = action.parameters.fromOpacity ?? 0;
      const to = action.parameters.toOpacity ?? 1;
      if (isIn) state.opacity *= from + (to - from) * progress;
      else if (isOut) state.opacity *= to + (from - to) * progress;
      break;
    }
    case "move": {
      if (isIn) {
        state.x += vector.x * distance * (1 - progress);
        state.y += vector.y * distance * (1 - progress);
      } else if (isOut) {
        state.x += vector.x * distance * progress;
        state.y += vector.y * distance * progress;
      }
      break;
    }
    case "scale": {
      const fromScale = action.parameters.fromScale ?? 0.75;
      const toScale = action.parameters.toScale ?? 1;
      const scale = isOut
        ? toScale + (fromScale - toScale) * progress
        : fromScale + (toScale - fromScale) * progress;
      state.scaleX *= scale;
      state.scaleY *= scale;
      break;
    }
    case "rotate": {
      const degrees = action.parameters.rotationDegrees ?? 45;
      state.rotation += isOut ? degrees * progress : degrees * (1 - progress);
      break;
    }
    case "blur": {
      const amount = action.parameters.blurAmount ?? 16;
      state.blur += isOut ? amount * progress : amount * (1 - progress);
      break;
    }
    case "pulse": {
      if (timeMs < action.startTimeMs) break;
      const phase = getLoopPhase(action, timeMs);
      const intensity = action.parameters.intensity ?? 0.06;
      const pulse = 1 + Math.sin(phase * Math.PI * 2) * intensity;
      state.scaleX *= pulse;
      state.scaleY *= pulse;
      break;
    }
    case "float": {
      if (timeMs < action.startTimeMs) break;
      const phase = getLoopPhase(action, timeMs);
      const amount = distance * (action.parameters.intensity ?? 1);
      const wave = Math.sin(phase * Math.PI * 2) * amount;
      state.x += vector.x * wave;
      state.y += vector.y * wave;
      break;
    }
  }
};

const evaluateLayer = (
  project: KurogiProject,
  layer: LayerDocument,
  timeMs: number,
): EvaluatedLayer => {
  const state: MutableEvaluation = {
    x: layer.transform.position.x,
    y: layer.transform.position.y,
    scaleX: layer.transform.scale.x,
    scaleY: layer.transform.scale.y,
    rotation: layer.transform.rotation,
    opacity: layer.appearance.opacity,
    blur: layer.appearance.blur,
  };

  for (const actionId of layer.animationActionIds) {
    const action = project.animationActions[actionId];
    if (action) applyAction(state, action, timeMs);
  }

  return {
    id: layer.id,
    type: layer.type,
    name: layer.name,
    visible: layer.visible,
    transform: {
      x: state.x,
      y: state.y,
      width: layer.transform.size.width,
      height: layer.transform.size.height,
      scaleX: state.scaleX,
      scaleY: state.scaleY,
      rotation: state.rotation,
      anchorX: layer.transform.anchor.x,
      anchorY: layer.transform.anchor.y,
    },
    appearance: {
      opacity: clamp(state.opacity, 0, 1),
      blur: Math.max(0, state.blur),
      fillColor: layer.appearance.fill?.color,
      strokeColor: layer.appearance.stroke?.color,
      strokeWidth: layer.appearance.stroke?.width,
      borderRadius: layer.appearance.borderRadius,
    },
    source: layer,
  };
};

export const evaluateSceneAtTime = (
  project: KurogiProject,
  sceneId: SceneId,
  requestedTimeMs: number,
): EvaluatedScene => {
  const scene = project.scenes[sceneId];
  if (!scene) throw new Error(`Scene not found: ${sceneId}`);

  const timeMs = clamp(requestedTimeMs, 0, scene.durationMs);
  const layers = scene.rootLayerIds
    .map((layerId) => project.layers[layerId])
    .filter((layer): layer is LayerDocument => Boolean(layer))
    .map((layer) => evaluateLayer(project, layer, timeMs));

  return {
    id: scene.id,
    width: scene.width,
    height: scene.height,
    durationMs: scene.durationMs,
    fps: scene.fps,
    background: scene.background,
    timeMs,
    frame: timeToFrame(timeMs, scene.fps),
    layers,
  };
};

import type {
  AnimationAction,
  EasingName,
  Layer,
  Scene,
  StaggerOrder,
  TextAnimationUnit,
} from "../types";

export interface EvaluatedLayerVisual {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  scaleX: number;
  scaleY: number;
  blur: number;
  clipPath?: string;
  visible: boolean;
}

export interface EvaluatedUnitVisual {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotation: number;
  blur: number;
  clipPath?: string;
}

export interface TextUnit {
  key: string;
  text: string;
}

export function evaluateLayer(layer: Layer, scene: Scene, time: number): EvaluatedLayerVisual {
  const visual: EvaluatedLayerVisual = {
    x: layer.position.x,
    y: layer.position.y,
    width: layer.size.width,
    height: layer.size.height,
    rotation: layer.rotation,
    opacity: layer.opacity,
    scaleX: layer.scale.x,
    scaleY: layer.scale.y,
    blur: layer.type === "shape" ? layer.style.blur : 0,
    visible: layer.visible,
  };

  if (!layer.visible) return visual;

  for (const action of orderedActions(layer.animationActions)) {
    if (layer.type === "text" && action.stagger?.enabled && action.stagger.unit !== "layer") continue;
    applyActionToLayer(visual, action, scene, time);
  }

  visual.opacity = clamp(visual.opacity, 0, 1);
  visual.scaleX = finite(visual.scaleX, 1);
  visual.scaleY = finite(visual.scaleY, 1);
  visual.rotation = finite(visual.rotation, 0);
  visual.blur = Math.max(0, finite(visual.blur, 0));
  return visual;
}

export function evaluateTextUnit(
  layer: Layer,
  scene: Scene,
  time: number,
  unitIndex: number,
  unitCount: number,
): EvaluatedUnitVisual {
  const visual: EvaluatedUnitVisual = {
    opacity: 1,
    translateX: 0,
    translateY: 0,
    scale: 1,
    rotation: 0,
    blur: 0,
  };

  if (layer.type !== "text") return visual;

  for (const action of orderedActions(layer.animationActions)) {
    const stagger = action.stagger;
    if (!stagger?.enabled || stagger.unit === "layer") continue;
    const offset = stagger.delay * staggerRank(unitIndex, unitCount, stagger.order, stagger.seed ?? 1);
    applyActionToUnit(visual, action, scene, time - offset);
  }

  visual.opacity = clamp(visual.opacity, 0, 1);
  visual.scale = finite(visual.scale, 1);
  visual.blur = Math.max(0, finite(visual.blur, 0));
  return visual;
}

export function splitTextUnits(text: string, unit: TextAnimationUnit): TextUnit[] {
  if (unit === "layer") return [{ key: "layer", text }];
  if (unit === "line") {
    const lines = text.split("\n");
    return lines.flatMap((line, index) => [
      { key: `line-${index}`, text: line },
      ...(index < lines.length - 1 ? [{ key: `break-${index}`, text: "\n" }] : []),
    ]);
  }
  if (unit === "word") {
    return text.split(/(\s+)/).filter(Boolean).map((part, index) => ({ key: `word-${index}`, text: part }));
  }
  return Array.from(text).map((character, index) => ({ key: `character-${index}`, text: character }));
}

export function getTextAnimationUnit(layer: Layer): TextAnimationUnit {
  if (layer.type !== "text") return "layer";
  const staggered = layer.animationActions.find(
    (action) => action.stagger?.enabled && action.stagger.unit !== "layer",
  );
  return staggered?.stagger?.unit ?? "layer";
}

export function applyEasing(name: EasingName, progress: number): number {
  const t = clamp(progress, 0, 1);
  if (name === "linear") return t;
  if (name === "easeIn") return t * t * t;
  if (name === "easeOut") return 1 - Math.pow(1 - t, 3);
  if (name === "easeInOut") {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  if (name === "backIn") {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  }
  if (name === "backOut" || name === "overshoot") {
    const c1 = name === "overshoot" ? 2.35 : 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  if (name === "bounce") return bounceOut(t);
  if (name === "elastic") {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }
  return t;
}

function applyActionToLayer(
  visual: EvaluatedLayerVisual,
  action: AnimationAction,
  scene: Scene,
  time: number,
) {
  if (action.category === "loop") {
    const progress = loopProgress(action, time);
    if (progress === null) return;
    applyLoop(visual, action, applyEasing(action.easing, progress));
    return;
  }

  const raw = oneShotProgress(action, time);
  const progress = applyEasing(action.easing, raw);
  if (action.category === "in") applyIn(visual, action, progress, scene);
  else applyOut(visual, action, progress, scene);
}

function applyActionToUnit(
  visual: EvaluatedUnitVisual,
  action: AnimationAction,
  scene: Scene,
  time: number,
) {
  if (action.category === "loop") {
    const progress = loopProgress(action, time);
    if (progress === null) return;
    applyUnitLoop(visual, action, applyEasing(action.easing, progress));
    return;
  }
  const progress = applyEasing(action.easing, oneShotProgress(action, time));
  const distance = numberParameter(action, "distance", Math.min(scene.width, scene.height) * 0.08);
  const direction = directionVector(stringParameter(action, "direction", "up"), distance);
  const rotation = numberParameter(action, "rotation", 25);
  const blur = numberParameter(action, "blur", 18);
  const initialScale = numberParameter(action, "scale", 0.7);

  if (action.category === "in") {
    if (action.type === "fadeIn" || action.type === "moveIn" || action.type === "scaleIn" || action.type === "rotateIn" || action.type === "blurIn" || action.type === "maskReveal") {
      visual.opacity *= progress;
    }
    if (action.type === "moveIn") {
      visual.translateX += direction.x * (1 - progress);
      visual.translateY += direction.y * (1 - progress);
    }
    if (action.type === "scaleIn") visual.scale *= initialScale + (1 - initialScale) * progress;
    if (action.type === "rotateIn") visual.rotation += rotation * (1 - progress);
    if (action.type === "blurIn") visual.blur += blur * (1 - progress);
    if (action.type === "maskReveal") visual.clipPath = maskClip(stringParameter(action, "direction", "left"), 1 - progress);
  } else {
    if (action.type === "fadeOut" || action.type === "moveOut" || action.type === "scaleOut" || action.type === "rotateOut" || action.type === "blurOut" || action.type === "maskHide") {
      visual.opacity *= 1 - progress;
    }
    if (action.type === "moveOut") {
      visual.translateX += direction.x * progress;
      visual.translateY += direction.y * progress;
    }
    if (action.type === "scaleOut") visual.scale *= 1 + (initialScale - 1) * progress;
    if (action.type === "rotateOut") visual.rotation += rotation * progress;
    if (action.type === "blurOut") visual.blur += blur * progress;
    if (action.type === "maskHide") visual.clipPath = maskClip(stringParameter(action, "direction", "left"), progress);
  }
}

function applyIn(
  visual: EvaluatedLayerVisual,
  action: AnimationAction,
  progress: number,
  scene: Scene,
) {
  const distance = numberParameter(action, "distance", Math.min(scene.width, scene.height) * 0.08);
  const direction = directionVector(stringParameter(action, "direction", "up"), distance);
  if (action.type === "fadeIn" || action.type === "moveIn" || action.type === "scaleIn" || action.type === "rotateIn" || action.type === "blurIn" || action.type === "maskReveal") {
    visual.opacity *= progress;
  }
  if (action.type === "moveIn") {
    visual.x += direction.x * (1 - progress);
    visual.y += direction.y * (1 - progress);
  }
  if (action.type === "scaleIn") {
    const initial = numberParameter(action, "scale", 0.7);
    const scale = initial + (1 - initial) * progress;
    visual.scaleX *= scale;
    visual.scaleY *= scale;
  }
  if (action.type === "rotateIn") visual.rotation += numberParameter(action, "rotation", 25) * (1 - progress);
  if (action.type === "blurIn") visual.blur += numberParameter(action, "blur", 18) * (1 - progress);
  if (action.type === "maskReveal") visual.clipPath = maskClip(stringParameter(action, "direction", "left"), 1 - progress);
}

function applyOut(
  visual: EvaluatedLayerVisual,
  action: AnimationAction,
  progress: number,
  scene: Scene,
) {
  const distance = numberParameter(action, "distance", Math.min(scene.width, scene.height) * 0.08);
  const direction = directionVector(stringParameter(action, "direction", "up"), distance);
  if (action.type === "fadeOut" || action.type === "moveOut" || action.type === "scaleOut" || action.type === "rotateOut" || action.type === "blurOut" || action.type === "maskHide") {
    visual.opacity *= 1 - progress;
  }
  if (action.type === "moveOut") {
    visual.x += direction.x * progress;
    visual.y += direction.y * progress;
  }
  if (action.type === "scaleOut") {
    const target = numberParameter(action, "scale", 0.7);
    const scale = 1 + (target - 1) * progress;
    visual.scaleX *= scale;
    visual.scaleY *= scale;
  }
  if (action.type === "rotateOut") visual.rotation += numberParameter(action, "rotation", 25) * progress;
  if (action.type === "blurOut") visual.blur += numberParameter(action, "blur", 18) * progress;
  if (action.type === "maskHide") visual.clipPath = maskClip(stringParameter(action, "direction", "left"), progress);
}

function applyLoop(visual: EvaluatedLayerVisual, action: AnimationAction, progress: number) {
  const wave = Math.sin(progress * Math.PI * 2);
  if (action.type === "pulse") {
    const intensity = numberParameter(action, "intensity", 0.06);
    visual.scaleX *= 1 + wave * intensity;
    visual.scaleY *= 1 + wave * intensity;
  }
  if (action.type === "float") visual.y += wave * numberParameter(action, "intensity", 18);
  if (action.type === "shake") {
    const frequency = numberParameter(action, "frequency", 5);
    visual.x += Math.sin(progress * Math.PI * 2 * frequency) * numberParameter(action, "intensity", 10);
  }
  if (action.type === "spin") {
    const direction = stringParameter(action, "direction", "clockwise") === "counterclockwise" ? -1 : 1;
    visual.rotation += progress * 360 * numberParameter(action, "turns", 1) * direction;
  }
  if (action.type === "breathe") {
    const intensity = numberParameter(action, "intensity", 0.06);
    const breathe = (1 - Math.cos(progress * Math.PI * 2)) / 2;
    visual.scaleX *= 1 + breathe * intensity;
    visual.scaleY *= 1 + breathe * intensity;
  }
  if (action.type === "swing") visual.rotation += wave * numberParameter(action, "intensity", 8);
}

function applyUnitLoop(visual: EvaluatedUnitVisual, action: AnimationAction, progress: number) {
  const wave = Math.sin(progress * Math.PI * 2);
  if (action.type === "pulse") visual.scale *= 1 + wave * numberParameter(action, "intensity", 0.06);
  if (action.type === "float") visual.translateY += wave * numberParameter(action, "intensity", 18);
  if (action.type === "shake") {
    const frequency = numberParameter(action, "frequency", 5);
    visual.translateX += Math.sin(progress * Math.PI * 2 * frequency) * numberParameter(action, "intensity", 10);
  }
  if (action.type === "spin") visual.rotation += progress * 360 * numberParameter(action, "turns", 1);
  if (action.type === "breathe") visual.scale *= 1 + ((1 - Math.cos(progress * Math.PI * 2)) / 2) * numberParameter(action, "intensity", 0.06);
  if (action.type === "swing") visual.rotation += wave * numberParameter(action, "intensity", 8);
}

function oneShotProgress(action: AnimationAction, time: number): number {
  const start = action.startTime + action.delay;
  return clamp((time - start) / Math.max(0.0001, action.duration), 0, 1);
}

function loopProgress(action: AnimationAction, time: number): number | null {
  const start = action.startTime + action.delay;
  const elapsed = time - start;
  if (elapsed < 0) return null;
  const cycleDuration = Math.max(0.0001, action.duration);
  const rest = Math.max(0, action.repeat?.delay ?? 0);
  const totalCycle = cycleDuration + rest;
  const count = action.repeat?.count ?? "infinite";
  if (count !== "infinite" && elapsed >= totalCycle * count) return null;
  const withinCycle = elapsed % totalCycle;
  if (withinCycle > cycleDuration) return 0;
  return clamp(withinCycle / cycleDuration, 0, 1);
}

function orderedActions(actions: AnimationAction[]): AnimationAction[] {
  return [...actions].sort((a, b) => {
    const categoryOrder = { in: 0, loop: 1, out: 2 } as const;
    return categoryOrder[a.category] - categoryOrder[b.category] || a.startTime - b.startTime;
  });
}

function staggerRank(
  index: number,
  count: number,
  order: StaggerOrder,
  seed: number,
): number {
  if (order === "reverse") return Math.max(0, count - 1 - index);
  if (order === "center") {
    const center = (count - 1) / 2;
    return Math.abs(index - center);
  }
  if (order === "edges") {
    return Math.min(index, Math.max(0, count - 1 - index));
  }
  if (order === "random") return seededOrder(count, seed).indexOf(index);
  return index;
}

function seededOrder(count: number, seed: number): number[] {
  const values = Array.from({ length: count }, (_, index) => index);
  let state = (seed | 0) || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
}

function directionVector(direction: string, distance: number): { x: number; y: number } {
  if (direction === "left") return { x: -distance, y: 0 };
  if (direction === "right") return { x: distance, y: 0 };
  if (direction === "down") return { x: 0, y: -distance };
  return { x: 0, y: distance };
}

function maskClip(direction: string, amount: number): string {
  const percent = clamp(amount, 0, 1) * 100;
  if (direction === "right") return `inset(0 0 0 ${percent}%)`;
  if (direction === "up") return `inset(0 0 ${percent}% 0)`;
  if (direction === "down") return `inset(${percent}% 0 0 0)`;
  return `inset(0 ${percent}% 0 0)`;
}

function numberParameter(action: AnimationAction, name: string, fallback: number): number {
  const value = action.parameters[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringParameter(action: AnimationAction, name: string, fallback: string): string {
  const value = action.parameters[name];
  return typeof value === "string" ? value : fallback;
}

function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const shifted = t - 1.5 / d1;
    return n1 * shifted * shifted + 0.75;
  }
  if (t < 2.5 / d1) {
    const shifted = t - 2.25 / d1;
    return n1 * shifted * shifted + 0.9375;
  }
  const shifted = t - 2.625 / d1;
  return n1 * shifted * shifted + 0.984375;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

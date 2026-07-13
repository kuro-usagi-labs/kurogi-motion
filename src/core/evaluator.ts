import type {
  AnimationAction,
  AnimationType,
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
  rotateX: number;
  rotateY: number;
  skewX: number;
  skewY: number;
  opacity: number;
  scaleX: number;
  scaleY: number;
  blur: number;
  brightness: number;
  saturation: number;
  glow: number;
  clipPath?: string;
  visible: boolean;
}

export interface EvaluatedUnitVisual {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotation: number;
  rotateX: number;
  rotateY: number;
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
    rotateX: 0,
    rotateY: 0,
    skewX: 0,
    skewY: 0,
    opacity: layer.opacity,
    scaleX: layer.scale.x,
    scaleY: layer.scale.y,
    blur: layer.type === "shape" ? layer.style.blur : 0,
    brightness: 1,
    saturation: 1,
    glow: 0,
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
  visual.rotateX = finite(visual.rotateX, 0);
  visual.rotateY = finite(visual.rotateY, 0);
  visual.skewX = finite(visual.skewX, 0);
  visual.skewY = finite(visual.skewY, 0);
  visual.blur = Math.max(0, finite(visual.blur, 0));
  visual.brightness = Math.max(0, finite(visual.brightness, 1));
  visual.saturation = Math.max(0, finite(visual.saturation, 1));
  visual.glow = Math.max(0, finite(visual.glow, 0));
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
    rotateX: 0,
    rotateY: 0,
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
  visual.rotation = finite(visual.rotation, 0);
  visual.rotateX = finite(visual.rotateX, 0);
  visual.rotateY = finite(visual.rotateY, 0);
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
  if (name === "easeInOut") return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  if (name === "backIn") {
    const c1 = 1.70158;
    return (c1 + 1) * t * t * t - c1 * t * t;
  }
  if (name === "backOut" || name === "overshoot") {
    const c1 = name === "overshoot" ? 2.35 : 1.70158;
    return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  if (name === "bounce") return bounceOut(t);
  if (name === "elastic") {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * c4) + 1;
  }
  return t;
}

function applyActionToLayer(visual: EvaluatedLayerVisual, action: AnimationAction, scene: Scene, time: number) {
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

function applyActionToUnit(visual: EvaluatedUnitVisual, action: AnimationAction, scene: Scene, time: number) {
  if (action.category === "loop") {
    const progress = loopProgress(action, time);
    if (progress === null) return;
    applyUnitLoop(visual, action, applyEasing(action.easing, progress));
    return;
  }

  const progress = applyEasing(action.easing, oneShotProgress(action, time));
  const distance = numberParameter(action, "distance", Math.min(scene.width, scene.height) * .08);
  const direction = directionVector(stringParameter(action, "direction", "up"), distance);
  const rotation = numberParameter(action, "rotation", 35);
  const blur = numberParameter(action, "blur", 18);
  const initialScale = numberParameter(action, "scale", .62);
  const entering = action.category === "in";
  const amount = entering ? 1 - progress : progress;

  if (isFadingType(action.type)) visual.opacity *= entering ? progress : 1 - progress;
  if (isMovingType(action.type)) {
    visual.translateX += direction.x * amount;
    visual.translateY += direction.y * amount;
  }
  if (isScalingType(action.type)) visual.scale *= entering
    ? initialScale + (1 - initialScale) * progress
    : 1 + (initialScale - 1) * progress;
  if (isRotatingType(action.type)) visual.rotation += rotation * amount * (entering ? 1 : 1);
  if (action.type === "flipIn" || action.type === "flipOut") visual.rotateY += 88 * amount;
  if (action.type === "blurIn" || action.type === "blurOut" || action.type === "zoomBlurIn" || action.type === "zoomBlurOut" || action.type === "dissolveOut") visual.blur += blur * amount;
  if (isMaskType(action.type)) visual.clipPath = maskClip(stringParameter(action, "direction", "left"), entering ? 1 - progress : progress);
}

function applyIn(visual: EvaluatedLayerVisual, action: AnimationAction, progress: number, scene: Scene) {
  const distance = numberParameter(action, "distance", Math.min(scene.width, scene.height) * .1);
  const direction = directionVector(stringParameter(action, "direction", defaultDirection(action.type)), distance);
  const rotation = numberParameter(action, "rotation", 85);
  const initialScale = numberParameter(action, "scale", defaultScale(action.type));
  const amount = 1 - progress;

  if (isFadingType(action.type)) visual.opacity *= progress;

  if (action.type === "moveIn" || action.type === "slideIn" || action.type === "dropIn" || action.type === "rollIn") {
    visual.x += direction.x * amount;
    visual.y += direction.y * amount;
  }

  if (action.type === "scaleIn" || action.type === "popIn" || action.type === "springIn" || action.type === "elasticIn") {
    const scale = initialScale + (1 - initialScale) * progress;
    visual.scaleX *= scale;
    visual.scaleY *= scale;
  }

  if (action.type === "rotateIn" || action.type === "rollIn") visual.rotation += rotation * amount;
  if (action.type === "flipIn") {
    const axis = stringParameter(action, "axis", "y");
    if (axis === "x") visual.rotateX += 88 * amount;
    else visual.rotateY += 88 * amount;
    visual.scaleX *= .8 + .2 * progress;
  }
  if (action.type === "stretchIn") {
    const axis = stringParameter(action, "axis", "x");
    if (axis === "y") visual.scaleY *= .12 + .88 * progress;
    else visual.scaleX *= .12 + .88 * progress;
  }
  if (action.type === "blurIn") visual.blur += numberParameter(action, "blur", 20) * amount;
  if (action.type === "zoomBlurIn") {
    visual.blur += numberParameter(action, "blur", 28) * amount;
    visual.scaleX *= 1 + .5 * amount;
    visual.scaleY *= 1 + .5 * amount;
  }
  if (action.type === "maskReveal" || action.type === "wipeIn") {
    visual.clipPath = maskClip(stringParameter(action, "direction", "left"), 1 - progress);
  }
}

function applyOut(visual: EvaluatedLayerVisual, action: AnimationAction, progress: number, scene: Scene) {
  const distance = numberParameter(action, "distance", Math.min(scene.width, scene.height) * .1);
  const direction = directionVector(stringParameter(action, "direction", defaultDirection(action.type)), distance);
  const rotation = numberParameter(action, "rotation", 85);
  const targetScale = numberParameter(action, "scale", defaultScale(action.type));

  if (isFadingType(action.type)) visual.opacity *= 1 - progress;

  if (action.type === "moveOut" || action.type === "slideOut" || action.type === "dropOut" || action.type === "rollOut") {
    visual.x += direction.x * progress;
    visual.y += direction.y * progress;
  }
  if (action.type === "scaleOut" || action.type === "popOut") {
    const scale = 1 + (targetScale - 1) * progress;
    visual.scaleX *= scale;
    visual.scaleY *= scale;
  }
  if (action.type === "rotateOut" || action.type === "rollOut") visual.rotation += rotation * progress;
  if (action.type === "flipOut") {
    const axis = stringParameter(action, "axis", "y");
    if (axis === "x") visual.rotateX += 88 * progress;
    else visual.rotateY += 88 * progress;
  }
  if (action.type === "stretchOut") {
    const axis = stringParameter(action, "axis", "x");
    if (axis === "y") visual.scaleY *= 1 - .88 * progress;
    else visual.scaleX *= 1 - .88 * progress;
  }
  if (action.type === "blurOut" || action.type === "dissolveOut") visual.blur += numberParameter(action, "blur", action.type === "dissolveOut" ? 8 : 20) * progress;
  if (action.type === "zoomBlurOut") {
    visual.blur += numberParameter(action, "blur", 28) * progress;
    visual.scaleX *= 1 + .5 * progress;
    visual.scaleY *= 1 + .5 * progress;
  }
  if (action.type === "maskHide" || action.type === "wipeOut") {
    visual.clipPath = maskClip(stringParameter(action, "direction", "left"), progress);
  }
  if (action.type === "dissolveOut") {
    const flicker = .82 + .18 * Math.sin(progress * Math.PI * 18);
    visual.opacity *= (1 - progress) * flicker;
    visual.saturation *= 1 - progress * .4;
  }
}

function applyLoop(visual: EvaluatedLayerVisual, action: AnimationAction, progress: number) {
  const wave = Math.sin(progress * Math.PI * 2);
  const cosine = Math.cos(progress * Math.PI * 2);

  if (action.type === "pulse") {
    const intensity = numberParameter(action, "intensity", .06);
    visual.scaleX *= 1 + wave * intensity;
    visual.scaleY *= 1 + wave * intensity;
  }
  if (action.type === "float") visual.y += wave * numberParameter(action, "intensity", 18);
  if (action.type === "hover") {
    const intensity = numberParameter(action, "intensity", 12);
    visual.y += wave * intensity;
    visual.rotation += cosine * intensity * .08;
  }
  if (action.type === "shake") {
    const frequency = numberParameter(action, "frequency", 5);
    visual.x += Math.sin(progress * Math.PI * 2 * frequency) * numberParameter(action, "intensity", 10);
  }
  if (action.type === "spin") {
    const direction = stringParameter(action, "direction", "clockwise") === "counterclockwise" ? -1 : 1;
    visual.rotation += progress * 360 * numberParameter(action, "turns", 1) * direction;
  }
  if (action.type === "breathe") {
    const intensity = numberParameter(action, "intensity", .06);
    const breathe = (1 - cosine) / 2;
    visual.scaleX *= 1 + breathe * intensity;
    visual.scaleY *= 1 + breathe * intensity;
  }
  if (action.type === "swing") visual.rotation += wave * numberParameter(action, "intensity", 8);
  if (action.type === "wobble") {
    const intensity = numberParameter(action, "intensity", .08);
    visual.scaleX *= 1 + wave * intensity;
    visual.scaleY *= 1 - wave * intensity * .7;
    visual.rotation += cosine * intensity * 45;
  }
  if (action.type === "heartbeat") {
    const pulse = Math.pow(Math.max(0, Math.sin(progress * Math.PI * 4)), 8);
    visual.scaleX *= 1 + pulse * numberParameter(action, "intensity", .12);
    visual.scaleY *= 1 + pulse * numberParameter(action, "intensity", .12);
  }
  if (action.type === "drift") {
    const intensity = numberParameter(action, "intensity", 16);
    visual.x += wave * intensity;
    visual.y += Math.sin(progress * Math.PI * 2 + Math.PI / 2) * intensity * .65;
  }
  if (action.type === "orbit") {
    const radius = numberParameter(action, "intensity", 22);
    visual.x += cosine * radius;
    visual.y += wave * radius;
  }
  if (action.type === "wave") {
    const intensity = numberParameter(action, "intensity", 10);
    visual.y += wave * intensity;
    visual.rotation += wave * intensity * .45;
  }
  if (action.type === "jiggle") {
    const intensity = numberParameter(action, "intensity", 7);
    visual.x += Math.sin(progress * Math.PI * 14) * intensity;
    visual.rotation += Math.sin(progress * Math.PI * 18) * intensity * .5;
  }
  if (action.type === "glowPulse") {
    const intensity = numberParameter(action, "intensity", 18);
    visual.glow += ((wave + 1) / 2) * intensity;
    visual.brightness *= 1 + ((wave + 1) / 2) * .08;
  }
  if (action.type === "ripple") {
    const intensity = numberParameter(action, "intensity", .05);
    visual.scaleX *= 1 + wave * intensity;
    visual.scaleY *= 1 - wave * intensity;
  }
  if (action.type === "liquid") {
    const intensity = numberParameter(action, "intensity", .08);
    visual.scaleX *= 1 + wave * intensity;
    visual.scaleY *= 1 + cosine * intensity;
    visual.skewX += wave * intensity * 24;
  }
}

function applyUnitLoop(visual: EvaluatedUnitVisual, action: AnimationAction, progress: number) {
  const wave = Math.sin(progress * Math.PI * 2);
  if (action.type === "pulse" || action.type === "heartbeat") visual.scale *= 1 + wave * numberParameter(action, "intensity", .06);
  if (action.type === "float" || action.type === "hover" || action.type === "wave") visual.translateY += wave * numberParameter(action, "intensity", 18);
  if (action.type === "shake" || action.type === "jiggle") {
    const frequency = action.type === "jiggle" ? 8 : numberParameter(action, "frequency", 5);
    visual.translateX += Math.sin(progress * Math.PI * 2 * frequency) * numberParameter(action, "intensity", 10);
  }
  if (action.type === "spin") visual.rotation += progress * 360;
  if (action.type === "breathe" || action.type === "wobble" || action.type === "liquid") visual.scale *= 1 + wave * numberParameter(action, "intensity", .06);
  if (action.type === "swing") visual.rotation += wave * numberParameter(action, "intensity", 8);
  if (action.type === "orbit" || action.type === "drift") {
    const radius = numberParameter(action, "intensity", 16);
    visual.translateX += Math.cos(progress * Math.PI * 2) * radius;
    visual.translateY += wave * radius;
  }
}

function orderedActions(actions: AnimationAction[]) {
  const priority: Record<AnimationAction["category"], number> = { in: 0, loop: 1, out: 2 };
  return [...actions].sort((a, b) => priority[a.category] - priority[b.category] || a.startTime - b.startTime || a.id.localeCompare(b.id));
}

function oneShotProgress(action: AnimationAction, time: number) {
  const start = action.startTime + action.delay;
  if (time <= start) return 0;
  if (action.duration <= 0) return 1;
  return clamp((time - start) / action.duration, 0, 1);
}

function loopProgress(action: AnimationAction, time: number): number | null {
  const start = action.startTime + action.delay;
  if (time < start || action.duration <= 0) return null;
  const repeatDelay = Math.max(0, action.repeat?.delay ?? 0);
  const cycle = action.duration + repeatDelay;
  const elapsed = time - start;
  const cycleIndex = Math.floor(elapsed / cycle);
  const count = action.repeat?.count ?? "infinite";
  if (count !== "infinite" && cycleIndex >= count) return null;
  const cycleTime = elapsed - cycleIndex * cycle;
  if (cycleTime > action.duration) return null;
  return clamp(cycleTime / action.duration, 0, 1);
}

function staggerRank(index: number, count: number, order: StaggerOrder, seed: number) {
  if (order === "reverse") return count - index - 1;
  if (order === "center") return Math.abs(index - (count - 1) / 2);
  if (order === "edges") return Math.min(index, count - index - 1);
  if (order === "random") {
    const ranks = Array.from({ length: count }, (_, value) => value);
    ranks.sort((a, b) => seededRandom(seed + a * 101) - seededRandom(seed + b * 101));
    return ranks.indexOf(index);
  }
  return index;
}

function seededRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function directionVector(direction: string, distance: number) {
  if (direction === "left") return { x: -distance, y: 0 };
  if (direction === "right") return { x: distance, y: 0 };
  if (direction === "down") return { x: 0, y: distance };
  return { x: 0, y: -distance };
}

function maskClip(direction: string, amount: number) {
  const percentage = clamp(amount, 0, 1) * 100;
  if (direction === "right") return `inset(0 ${percentage}% 0 0)`;
  if (direction === "up") return `inset(0 0 ${percentage}% 0)`;
  if (direction === "down") return `inset(${percentage}% 0 0 0)`;
  return `inset(0 0 0 ${percentage}%)`;
}

function isFadingType(type: AnimationType) {
  return !["pulse", "float", "shake", "spin", "breathe", "swing", "hover", "wobble", "heartbeat", "drift", "orbit", "wave", "jiggle", "glowPulse", "ripple", "liquid"].includes(type);
}

function isMovingType(type: AnimationType) {
  return ["moveIn", "slideIn", "dropIn", "rollIn", "moveOut", "slideOut", "dropOut", "rollOut"].includes(type);
}

function isScalingType(type: AnimationType) {
  return ["scaleIn", "popIn", "springIn", "elasticIn", "scaleOut", "popOut"].includes(type);
}

function isRotatingType(type: AnimationType) {
  return ["rotateIn", "rollIn", "rotateOut", "rollOut"].includes(type);
}

function isMaskType(type: AnimationType) {
  return ["maskReveal", "wipeIn", "maskHide", "wipeOut"].includes(type);
}

function defaultDirection(type: AnimationType) {
  if (type === "dropIn") return "up";
  if (type === "dropOut") return "down";
  if (type === "rollIn") return "left";
  if (type === "rollOut") return "right";
  return "up";
}

function defaultScale(type: AnimationType) {
  if (type === "popIn" || type === "popOut") return .2;
  if (type === "springIn" || type === "elasticIn") return .45;
  return .7;
}

function numberParameter(action: AnimationAction, key: string, fallback: number) {
  const value = action.parameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringParameter(action: AnimationAction, key: string, fallback: string) {
  const value = action.parameters[key];
  return typeof value === "string" ? value : fallback;
}

function bounceOut(value: number) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (value < 1 / d1) return n1 * value * value;
  if (value < 2 / d1) {
    const t = value - 1.5 / d1;
    return n1 * t * t + .75;
  }
  if (value < 2.5 / d1) {
    const t = value - 2.25 / d1;
    return n1 * t * t + .9375;
  }
  const t = value - 2.625 / d1;
  return n1 * t * t + .984375;
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

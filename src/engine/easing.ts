import type { EasingName } from "../domain/project";

export type EasingFunction = (progress: number) => number;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const linear: EasingFunction = (t) => t;
const easeIn: EasingFunction = (t) => t * t;
const easeOut: EasingFunction = (t) => 1 - (1 - t) * (1 - t);
const easeInOut: EasingFunction = (t) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const backIn: EasingFunction = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * t * t * t - c1 * t * t;
};
const backOut: EasingFunction = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const overshoot: EasingFunction = backOut;
const bounce: EasingFunction = (t) => {
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
};
const elastic: EasingFunction = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

export const easingRegistry: Record<EasingName, EasingFunction> = {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  backIn,
  backOut,
  overshoot,
  bounce,
  elastic,
};

export const applyEasing = (name: EasingName, progress: number): number =>
  easingRegistry[name](clamp01(progress));

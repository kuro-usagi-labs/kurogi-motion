import type { AnimationCategory, AnimationType, EasingName } from "../types";

export interface AnimationPreset {
  type: AnimationType;
  category: AnimationCategory;
  label: string;
  description: string;
  icon: string;
  recommendedEasing?: EasingName;
  recommendedDuration?: number;
}

export const ANIMATION_PRESETS: AnimationPreset[] = [
  { type: "fadeIn", category: "in", label: "Fade in", description: "A clean opacity entrance", icon: "fade", recommendedEasing: "easeOut", recommendedDuration: .55 },
  { type: "moveIn", category: "in", label: "Move in", description: "Enter from any direction", icon: "move", recommendedEasing: "easeOut", recommendedDuration: .65 },
  { type: "scaleIn", category: "in", label: "Scale in", description: "Grow smoothly into place", icon: "scale", recommendedEasing: "backOut", recommendedDuration: .65 },
  { type: "rotateIn", category: "in", label: "Rotate in", description: "Turn into position", icon: "rotate", recommendedEasing: "backOut", recommendedDuration: .75 },
  { type: "blurIn", category: "in", label: "Blur in", description: "Focus sharply into view", icon: "blur", recommendedEasing: "easeOut", recommendedDuration: .7 },
  { type: "maskReveal", category: "in", label: "Mask reveal", description: "Reveal from a clean edge", icon: "mask", recommendedEasing: "easeOut", recommendedDuration: .7 },
  { type: "popIn", category: "in", label: "Pop", description: "Fast elastic scale pop", icon: "scale", recommendedEasing: "overshoot", recommendedDuration: .48 },
  { type: "slideIn", category: "in", label: "Slide", description: "Confident long-distance slide", icon: "move", recommendedEasing: "easeOut", recommendedDuration: .7 },
  { type: "springIn", category: "in", label: "Spring", description: "Springy overshoot entrance", icon: "pulse", recommendedEasing: "elastic", recommendedDuration: .9 },
  { type: "flipIn", category: "in", label: "Flip", description: "Perspective card flip", icon: "rotate", recommendedEasing: "backOut", recommendedDuration: .8 },
  { type: "stretchIn", category: "in", label: "Stretch", description: "Stretch from a thin edge", icon: "scale", recommendedEasing: "overshoot", recommendedDuration: .7 },
  { type: "wipeIn", category: "in", label: "Wipe", description: "Graphic directional wipe", icon: "mask", recommendedEasing: "easeInOut", recommendedDuration: .65 },
  { type: "zoomBlurIn", category: "in", label: "Zoom blur", description: "Cinematic zoom and focus", icon: "blur", recommendedEasing: "easeOut", recommendedDuration: .75 },
  { type: "dropIn", category: "in", label: "Drop", description: "Drop in with weight", icon: "move", recommendedEasing: "bounce", recommendedDuration: .9 },
  { type: "rollIn", category: "in", label: "Roll", description: "Roll in from the side", icon: "rotate", recommendedEasing: "easeOut", recommendedDuration: .85 },
  { type: "elasticIn", category: "in", label: "Elastic", description: "Playful elastic expansion", icon: "pulse", recommendedEasing: "elastic", recommendedDuration: 1 },

  { type: "pulse", category: "loop", label: "Pulse", description: "Rhythmic scale loop", icon: "pulse", recommendedEasing: "easeInOut", recommendedDuration: 1.2 },
  { type: "float", category: "loop", label: "Float", description: "Gentle vertical motion", icon: "float", recommendedEasing: "easeInOut", recommendedDuration: 2.2 },
  { type: "shake", category: "loop", label: "Shake", description: "Energetic vibration", icon: "shake", recommendedEasing: "linear", recommendedDuration: .65 },
  { type: "spin", category: "loop", label: "Spin", description: "Continuous rotation", icon: "spin", recommendedEasing: "linear", recommendedDuration: 2 },
  { type: "breathe", category: "loop", label: "Breathe", description: "Soft expanding loop", icon: "breathe", recommendedEasing: "easeInOut", recommendedDuration: 2.1 },
  { type: "swing", category: "loop", label: "Swing", description: "Pendulum rotation", icon: "swing", recommendedEasing: "easeInOut", recommendedDuration: 1.8 },
  { type: "hover", category: "loop", label: "Hover", description: "Slow premium levitation", icon: "float", recommendedEasing: "easeInOut", recommendedDuration: 3 },
  { type: "wobble", category: "loop", label: "Wobble", description: "Soft shape deformation", icon: "swing", recommendedEasing: "easeInOut", recommendedDuration: 1.5 },
  { type: "heartbeat", category: "loop", label: "Heartbeat", description: "Double-beat emphasis", icon: "pulse", recommendedEasing: "easeInOut", recommendedDuration: 1.25 },
  { type: "drift", category: "loop", label: "Drift", description: "Slow diagonal wandering", icon: "move", recommendedEasing: "easeInOut", recommendedDuration: 3.4 },
  { type: "orbit", category: "loop", label: "Orbit", description: "Circular orbital movement", icon: "rotate", recommendedEasing: "linear", recommendedDuration: 3 },
  { type: "wave", category: "loop", label: "Wave", description: "Flowing rise and rotation", icon: "float", recommendedEasing: "easeInOut", recommendedDuration: 1.8 },
  { type: "jiggle", category: "loop", label: "Jiggle", description: "Quick playful micro-motion", icon: "shake", recommendedEasing: "linear", recommendedDuration: .8 },
  { type: "glowPulse", category: "loop", label: "Glow pulse", description: "Breathing luminous emphasis", icon: "pulse", recommendedEasing: "easeInOut", recommendedDuration: 2 },
  { type: "ripple", category: "loop", label: "Ripple", description: "Expanding wave distortion", icon: "blur", recommendedEasing: "easeInOut", recommendedDuration: 2 },
  { type: "liquid", category: "loop", label: "Liquid", description: "Organic liquid deformation", icon: "breathe", recommendedEasing: "easeInOut", recommendedDuration: 2.4 },

  { type: "fadeOut", category: "out", label: "Fade out", description: "Disappear smoothly", icon: "fade", recommendedEasing: "easeIn", recommendedDuration: .5 },
  { type: "moveOut", category: "out", label: "Move out", description: "Exit in any direction", icon: "move", recommendedEasing: "easeIn", recommendedDuration: .65 },
  { type: "scaleOut", category: "out", label: "Scale out", description: "Shrink cleanly away", icon: "scale", recommendedEasing: "easeIn", recommendedDuration: .6 },
  { type: "rotateOut", category: "out", label: "Rotate out", description: "Turn away with momentum", icon: "rotate", recommendedEasing: "easeIn", recommendedDuration: .7 },
  { type: "blurOut", category: "out", label: "Blur out", description: "Defocus and disappear", icon: "blur", recommendedEasing: "easeIn", recommendedDuration: .65 },
  { type: "maskHide", category: "out", label: "Mask hide", description: "Hide toward an edge", icon: "mask", recommendedEasing: "easeInOut", recommendedDuration: .65 },
  { type: "popOut", category: "out", label: "Pop out", description: "Quick shrinking pop", icon: "scale", recommendedEasing: "backIn", recommendedDuration: .45 },
  { type: "slideOut", category: "out", label: "Slide out", description: "Fast long-distance exit", icon: "move", recommendedEasing: "easeIn", recommendedDuration: .65 },
  { type: "flipOut", category: "out", label: "Flip out", description: "Perspective card exit", icon: "rotate", recommendedEasing: "backIn", recommendedDuration: .75 },
  { type: "stretchOut", category: "out", label: "Stretch out", description: "Collapse toward an edge", icon: "scale", recommendedEasing: "easeIn", recommendedDuration: .65 },
  { type: "wipeOut", category: "out", label: "Wipe out", description: "Graphic directional wipe", icon: "mask", recommendedEasing: "easeInOut", recommendedDuration: .65 },
  { type: "zoomBlurOut", category: "out", label: "Zoom blur out", description: "Cinematic zoom departure", icon: "blur", recommendedEasing: "easeIn", recommendedDuration: .7 },
  { type: "dropOut", category: "out", label: "Drop out", description: "Fall away with gravity", icon: "move", recommendedEasing: "easeIn", recommendedDuration: .75 },
  { type: "rollOut", category: "out", label: "Roll out", description: "Roll off screen", icon: "rotate", recommendedEasing: "easeIn", recommendedDuration: .8 },
  { type: "dissolveOut", category: "out", label: "Dissolve", description: "Soft grainy dissolve", icon: "blur", recommendedEasing: "easeInOut", recommendedDuration: .8 },
];

export function presetFor(type: AnimationType): AnimationPreset {
  return ANIMATION_PRESETS.find((preset) => preset.type === type) ?? ANIMATION_PRESETS[0];
}

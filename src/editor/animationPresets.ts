import type { AnimationCategory, AnimationType } from "../types";

export interface AnimationPreset {
  type: AnimationType;
  category: AnimationCategory;
  label: string;
  description: string;
  icon: string;
}

export const ANIMATION_PRESETS: AnimationPreset[] = [
  { type: "fadeIn", category: "in", label: "Fade in", description: "Appear smoothly", icon: "◐" },
  { type: "moveIn", category: "in", label: "Move in", description: "Enter from a direction", icon: "↗" },
  { type: "scaleIn", category: "in", label: "Scale in", description: "Grow into place", icon: "⊕" },
  { type: "rotateIn", category: "in", label: "Rotate in", description: "Turn into position", icon: "↻" },
  { type: "blurIn", category: "in", label: "Blur in", description: "Focus into view", icon: "◌" },
  { type: "maskReveal", category: "in", label: "Mask reveal", description: "Reveal from an edge", icon: "◧" },
  { type: "pulse", category: "loop", label: "Pulse", description: "Rhythmic scale loop", icon: "⌁" },
  { type: "float", category: "loop", label: "Float", description: "Gentle vertical motion", icon: "≈" },
  { type: "shake", category: "loop", label: "Shake", description: "Energetic vibration", icon: "≋" },
  { type: "spin", category: "loop", label: "Spin", description: "Continuous rotation", icon: "⟳" },
  { type: "breathe", category: "loop", label: "Breathe", description: "Soft expanding loop", icon: "◉" },
  { type: "swing", category: "loop", label: "Swing", description: "Pendulum rotation", icon: "⌇" },
  { type: "fadeOut", category: "out", label: "Fade out", description: "Disappear smoothly", icon: "◑" },
  { type: "moveOut", category: "out", label: "Move out", description: "Exit in a direction", icon: "↘" },
  { type: "scaleOut", category: "out", label: "Scale out", description: "Shrink away", icon: "⊖" },
  { type: "rotateOut", category: "out", label: "Rotate out", description: "Turn away", icon: "↺" },
  { type: "blurOut", category: "out", label: "Blur out", description: "Lose focus and leave", icon: "◎" },
  { type: "maskHide", category: "out", label: "Mask hide", description: "Hide toward an edge", icon: "◨" },
];

export function presetFor(type: AnimationType): AnimationPreset {
  return ANIMATION_PRESETS.find((preset) => preset.type === type) ?? ANIMATION_PRESETS[0];
}

import React from "react";

export type IconName =
  | "layers" | "assets" | "text" | "shapes" | "templates" | "help"
  | "undo" | "redo" | "minus" | "plus" | "frame" | "play" | "pause"
  | "share" | "export" | "eye" | "eyeOff" | "lock" | "unlock"
  | "chevronUp" | "chevronDown" | "upload" | "copy" | "trash" | "close"
  | "search" | "sparkles" | "fade" | "move" | "scale" | "rotate"
  | "blur" | "mask" | "pulse" | "float" | "shake" | "spin"
  | "breathe" | "swing" | "rectangle" | "circle" | "line"
  | "polygon" | "arrow" | "restart" | "previous" | "next" | "grip";

const paths: Record<IconName, React.ReactNode> = {
  layers: <><path d="M4 7h16"/><path d="M6 3h12l2 4H4l2-4Z"/><path d="M5 11h14l-2 4H7l-2-4Z"/><path d="M8 19h8"/></>,
  assets: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></>,
  text: <><path d="M4 5h16"/><path d="M12 5v14"/><path d="M8 19h8"/></>,
  shapes: <><rect x="3.5" y="3.5" width="8" height="8" rx="1.5"/><circle cx="16.5" cy="16.5" r="4"/></>,
  templates: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 4.1 1.7c-1 .8-1.9 1.2-1.9 2.8"/><path d="M12 17h.01"/></>,
  undo: <><path d="M9 7 4 12l5 5"/><path d="M20 17a8 8 0 0 0-8-8H4"/></>,
  redo: <><path d="m15 7 5 5-5 5"/><path d="M4 17a8 8 0 0 1 8-8h8"/></>,
  minus: <path d="M5 12h14"/>, plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
  frame: <><path d="M4 8V4h4"/><path d="M16 4h4v4"/><path d="M20 16v4h-4"/><path d="M8 20H4v-4"/></>,
  play: <path d="m8 5 11 7-11 7V5Z"/>, pause: <><path d="M9 5v14"/><path d="M15 5v14"/></>,
  share: <><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5"/><path d="m8 13 8 5"/></>,
  export: <><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6h14v-6"/></>,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  eyeOff: <><path d="m3 3 18 18"/><path d="M10.6 6.2A9 9 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.8"/><path d="M6.2 6.3C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3-.5"/></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  unlock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/></>,
  chevronUp: <path d="m7 14 5-5 5 5"/>, chevronDown: <path d="m7 10 5 5 5-5"/>,
  upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 20h16"/></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
  trash: <><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 1 13h8l1-13"/><path d="M10 11v5M14 11v5"/></>,
  close: <><path d="m6 6 12 12"/><path d="m18 6-12 12"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
  sparkles: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></>,
  fade: <><circle cx="12" cy="12" r="7"/><path d="M12 5a7 7 0 0 1 0 14Z"/></>,
  move: <><path d="M5 19 19 5"/><path d="M11 5h8v8"/></>,
  scale: <><path d="M8 3H3v5"/><path d="m3 3 7 7"/><path d="M16 21h5v-5"/><path d="m21 21-7-7"/></>,
  rotate: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></>,
  blur: <><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" strokeDasharray="2 3"/></>,
  mask: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 4v16"/></>,
  pulse: <path d="M3 12h4l2-5 4 10 2-5h6"/>,
  float: <><path d="M5 8c2-3 4 3 7 0s5 3 7 0"/><path d="M5 16c2-3 4 3 7 0s5 3 7 0"/></>,
  shake: <><path d="m4 8 3-3 3 6 4-6 3 6 3-3"/><path d="m4 16 3-3 3 6 4-6 3 6 3-3"/></>,
  spin: <><circle cx="12" cy="12" r="7"/><path d="M12 5v4l3-2"/></>,
  breathe: <><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="8"/></>,
  swing: <><path d="M12 3v5"/><path d="m8 20 4-12 4 12"/><path d="M7 20h10"/></>,
  rectangle: <rect x="4" y="6" width="16" height="12" rx="2"/>, circle: <circle cx="12" cy="12" r="8"/>,
  line: <path d="M4 12h16"/>, polygon: <path d="m12 3 9 7-3.5 11h-11L3 10l9-7Z"/>,
  arrow: <><path d="M4 12h15"/><path d="m14 7 5 5-5 5"/></>,
  restart: <><path d="M4 4v6h6"/><path d="M5.5 16a8 8 0 1 0 .5-8"/></>,
  previous: <><path d="M6 5v14"/><path d="m18 6-8 6 8 6V6Z"/></>,
  next: <><path d="M18 5v14"/><path d="m6 6 8 6-8 6V6Z"/></>,
  grip: <><circle cx="9" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1" fill="currentColor" stroke="none"/></>,
};

export function Icon({ name, size = 18, className, strokeWidth = 1.8 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function animationIconName(type: string): IconName {
  if (type.startsWith("fade") || type.startsWith("dissolve")) return "fade";
  if (type.startsWith("move") || type.startsWith("slide") || type.startsWith("drop") || type === "drift" || type === "orbit" || type === "motionPath") return "move";
  if (type === "counter") return "text";
  if (type.startsWith("scale") || type.startsWith("pop") || type.startsWith("spring") || type.startsWith("stretch") || type.startsWith("elastic")) return "scale";
  if (type.startsWith("rotate") || type.startsWith("flip") || type.startsWith("roll")) return "rotate";
  if (type.startsWith("blur") || type.startsWith("zoomBlur") || type === "ripple") return "blur";
  if (type.startsWith("mask") || type.startsWith("wipe")) return "mask";
  if (type === "pulse" || type === "heartbeat" || type === "glowPulse") return "pulse";
  if (type === "float" || type === "hover" || type === "wave") return "float";
  if (type === "shake" || type === "jiggle") return "shake";
  if (type === "spin") return "spin";
  if (type === "breathe" || type === "wobble" || type === "liquid") return "breathe";
  return "swing";
}

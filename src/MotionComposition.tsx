import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Layer, Project} from './types';

const animated = (layer: Layer, frame: number, fps: number) => {
  const t = frame / fps; const local = Math.max(0, t - layer.start); let opacity = layer.opacity; let y = layer.y; let scale = 1;
  if (layer.motion.includes('fadeUp')) { const p = spring({frame: Math.round(local * fps), fps, config: {damping: 15, stiffness: 130}}); opacity *= p; y += (1 - p) * 80; }
  if (layer.motion.includes('scaleIn')) { const p = spring({frame: Math.round(local * fps), fps, config: {damping: 12, stiffness: 130}}); opacity *= p; scale *= .75 + p * .25; }
  if (layer.motion.includes('float')) y += Math.sin((t - layer.start) * Math.PI * 1.4) * 18;
  if (layer.motion.includes('pulse')) scale *= 1 + Math.sin((t - layer.start) * Math.PI * 2) * .045;
  if (layer.motion.includes('fadeOut') && t > layer.start + layer.duration - .5) opacity *= interpolate(t, [layer.start + layer.duration - .5, layer.start + layer.duration], [1, 0], {extrapolateRight: 'clamp'});
  return {opacity, y, scale};
};

export const MotionComposition: React.FC<{project: Project; selectedId?: string; onSelect?: (id: string) => void; onMove?: (id: string, x: number, y: number) => void; editable?: boolean}> = ({project, selectedId, onSelect, onMove, editable}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig();
  const canvas = React.useRef<HTMLDivElement>(null); const drag = React.useRef<{id: string; offsetX: number; offsetY: number} | null>(null);
  const move = (event: React.PointerEvent) => { if (!drag.current || !canvas.current) return; const rect = canvas.current.getBoundingClientRect(); onMove?.(drag.current.id, Math.max(-300, Math.min(project.width, (event.clientX - rect.left) / rect.width * project.width - drag.current.offsetX)), Math.max(-300, Math.min(project.height, (event.clientY - rect.top) / rect.height * project.height - drag.current.offsetY))); };
  return <div ref={canvas} onPointerMove={move} onPointerUp={() => drag.current = null} style={{width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: project.background}}>
    {project.layers.filter(l => !l.hidden).map(layer => { const a = animated(layer, frame, fps); const selected = selectedId === layer.id; const style: React.CSSProperties = {position: 'absolute', left: `${layer.x / project.width * 100}%`, top: `${a.y / project.height * 100}%`, width: `${layer.width / project.width * 100}%`, height: `${layer.height / project.height * 100}%`, opacity: a.opacity, transform: `rotate(${layer.rotation}deg) scale(${a.scale})`, transformOrigin: 'center', cursor: editable ? 'move' : 'default', outline: selected ? '3px solid #7c5cff' : 'none', outlineOffset: 5};
      return <div key={layer.id} style={style} onPointerDown={editable ? e => {e.stopPropagation(); const rect = canvas.current?.getBoundingClientRect(); if (rect) drag.current = {id: layer.id, offsetX: (e.clientX - rect.left) / rect.width * project.width - layer.x, offsetY: (e.clientY - rect.top) / rect.height * project.height - layer.y}; onSelect?.(layer.id); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)} : undefined}>
        {layer.kind === 'text' ? <div style={{whiteSpace: 'pre-line', fontFamily: 'Inter, Arial, sans-serif', fontWeight: 800, letterSpacing: '-.065em', lineHeight: .86, color: layer.color, fontSize: `${layer.fontSize || 48}px`}}>{layer.text}</div> : layer.kind === 'image' && layer.src ? <img src={layer.src} draggable={false} style={{width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none'}}/> : <div style={{width: '100%', height: '100%', borderRadius: '50%', background: layer.color, boxShadow: '0 25px 50px rgba(91,55,212,.27)'}}/>}
      </div>;
    })}
  </div>;
};

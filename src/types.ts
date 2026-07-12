export type LayerKind = 'text' | 'shape' | 'image';
export type MotionKind = 'fadeUp' | 'scaleIn' | 'float' | 'pulse' | 'fadeOut';
export type Layer = {id: string; name: string; kind: LayerKind; x: number; y: number; width: number; height: number; rotation: number; opacity: number; color: string; text?: string; src?: string; fontSize?: number; hidden?: boolean; locked?: boolean; motion: MotionKind[]; start: number; duration: number};
export type Project = {name: string; width: number; height: number; fps: number; duration: number; background: string; layers: Layer[]};

export const starterProject: Project = {
  name: 'Untitled motion', width: 1080, height: 1080, fps: 30, duration: 5, background: '#F5F4FF',
  layers: [
    {id: 'hero', name: 'Make it move', kind: 'text', text: 'MAKE IT\nMOVE.', x: 120, y: 180, width: 760, height: 280, rotation: 0, opacity: 1, color: '#1B173A', fontSize: 128, motion: ['fadeUp'], start: 0, duration: 1.1},
    {id: 'orb', name: 'Violet orb', kind: 'shape', x: 700, y: 570, width: 235, height: 235, rotation: 0, opacity: 1, color: '#8B5CF6', motion: ['float', 'pulse'], start: .25, duration: 2.2},
    {id: 'label', name: 'Action-based animation', kind: 'text', text: 'ACTION-BASED ANIMATION', x: 125, y: 725, width: 550, height: 60, rotation: 0, opacity: 1, color: '#6B6389', fontSize: 25, motion: ['fadeUp'], start: .45, duration: .8}
  ]
};

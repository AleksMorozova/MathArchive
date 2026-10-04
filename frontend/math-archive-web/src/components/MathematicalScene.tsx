import { useMediaQuery } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

const scenes = [
  { grade: 5, curve: 'M85 180 L175 55 L265 180 Z M300 120 a45 45 0 1 0 90 0 a45 45 0 1 0 -90 0', construction: 'M175 55 V180', label: 'S = ½ah', point: [175, 55] },
  { grade: 6, curve: 'M85 180 L340 70', construction: 'M200 130 V200 M60 130 H200', label: 'a : b = c : d', point: [200, 130] },
  { grade: 7, curve: 'M75 185 L350 60', construction: 'M240 110 V200', label: 'y = kx + b', point: [240, 110] },
  { grade: 8, curve: 'M95 190 Q160 105 210 90 Q270 70 360 65', construction: 'M210 90 V200', label: 'y = √x', point: [210, 90] },
  { grade: 9, curve: 'M90 50 Q225 320 360 50', construction: 'M225 185 V60', label: 'y = ax² + bx + c', point: [225, 185] },
  { grade: 10, curve: 'M90 190 C170 190 200 140 235 110 S300 60 365 55', construction: 'M165 170 L305 50', label: 'y − f(a) = f′(a)(x − a)', point: [235, 110] },
  { grade: 11, curve: 'M125 100 H245 V200 H125 Z M180 50 H300 V150 H180 Z M125 100 L180 50 M245 100 L300 50 M245 200 L300 150', construction: 'M125 200 L180 150 H300', label: 'V = abc', point: [245, 100] }
];

export function MathematicalScene({ grade = 9 }: { grade?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const initialGrade = useRef(grade);
  const [startup, setStartup] = useState(true);
  useEffect(() => {
    if (grade !== initialGrade.current) setStartup(false);
    const timer = setTimeout(() => setStartup(false), 1500);
    return () => clearTimeout(timer);
  }, [grade]);
  const pointerEnabled = useMediaQuery('(min-width: 901px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  useEffect(() => {
    const node = ref.current;
    const surface = node?.parentElement;
    if (!node || !surface || !pointerEnabled) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      node.style.setProperty('--scene-x', `${x}px`);
      node.style.setProperty('--scene-y', `${y}px`);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const rect = surface.getBoundingClientRect();
      x = Math.max(-2, Math.min(2, ((event.clientX - rect.left) / rect.width - .5) * 4));
      y = Math.max(-2, Math.min(2, ((event.clientY - rect.top) / rect.height - .5) * 4));
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const reset = () => { x = 0; y = 0; if (!frame) frame = requestAnimationFrame(paint); };
    surface.addEventListener('pointermove', move, { passive: true });
    surface.addEventListener('pointerleave', reset);
    return () => {
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerleave', reset);
      cancelAnimationFrame(frame);
      node.style.removeProperty('--scene-x');
      node.style.removeProperty('--scene-y');
    };
  }, [pointerEnabled]);
  return <div ref={ref} className={`living-math-scene${startup ? '' : ' scene-constructed'}`} aria-hidden="true">
    <svg viewBox="0 0 450 260" focusable="false">
      <path className="scene-grid" d="M60 40H400 M60 80H400 M60 120H400 M60 160H400 M100 30V220 M150 30V220 M200 30V220 M250 30V220 M300 30V220 M350 30V220" />
      <path className="scene-axes" pathLength="1" d="M60 200H405 M80 220V25 M398 194L405 200L398 206 M74 32L80 25L86 32" />
      <g className="scene-points"><circle cx="150" cy="200" r="2" /><circle cx="300" cy="200" r="2" /><circle cx="80" cy="120" r="2" /></g>
      {scenes.map(scene => <g key={scene.grade} className={`scene-state${scene.grade === grade ? ' scene-active' : ''}`}>
        <path className="scene-curve" pathLength="1" d={scene.curve} />
        <path className="scene-construction" pathLength="1" d={scene.construction} />
        <circle className="scene-highlight" cx={scene.point[0]} cy={scene.point[1]} r="4" />
        <text className="scene-expression" x="120" y="248">{scene.label}</text>
      </g>)}
      <text x="412" y="205">x</text><text x="66" y="23">y</text>
    </svg>
  </div>;
}

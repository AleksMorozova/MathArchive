import { useMediaQuery } from '@mui/material';
import { useEffect, useRef } from 'react';

// Separate wrappers let pointer depth and ambient motion compose without competing transforms.
export function MathBackground({ variant = 'default' }: { variant?: 'default' | 'about' }) {
  const ref = useRef<HTMLDivElement>(null);
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
      node.style.setProperty('--math-x', String(x));
      node.style.setProperty('--math-y', String(y));
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const rect = surface.getBoundingClientRect();
      x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
      y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / Math.min(rect.height, window.innerHeight) * 2 - 1));
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const reset = () => { x = 0; y = 0; if (!frame) frame = requestAnimationFrame(paint); };
    surface.addEventListener('pointermove', move, { passive: true });
    surface.addEventListener('pointerleave', reset);
    return () => {
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerleave', reset);
      cancelAnimationFrame(frame);
      node.style.removeProperty('--math-x');
      node.style.removeProperty('--math-y');
    };
  }, [pointerEnabled]);
  return <div ref={ref} className={`public-math-background mathematical-atmosphere math-background-${variant}`} aria-hidden="true">
    <div className="math-depth math-depth-far">
      <svg className="ambient-object ambient-orbit" viewBox="0 0 400 400" focusable="false"><circle cx="200" cy="200" r="185" /><circle cx="200" cy="200" r="145" strokeDasharray="4 14" /><path d="M15 200H385 M200 15V385" /></svg>
      <svg className="ambient-object ambient-grid" viewBox="0 0 400 260" focusable="false"><path d="M20 40H380 M20 80H380 M20 120H380 M20 160H380 M20 200H380 M60 20V240 M120 20V240 M180 20V240 M240 20V240 M300 20V240 M360 20V240" /></svg>
      <span className="ambient-object ambient-pi">π</span>
      <svg className="ambient-object ambient-large-parabola" viewBox="0 0 400 260" focusable="false"><path d="M20 20 Q200 440 380 20 M200 20V240" /></svg>
    </div>
    <div className="math-depth math-depth-middle">
      <svg className="ambient-object ambient-parabola" viewBox="0 0 300 220" focusable="false"><path d="M20 180H285 M150 205V15 M35 25Q150 335 265 25" /><circle cx="150" cy="180" r="3" /><circle cx="92.5" cy="141.25" r="3" /><circle cx="207.5" cy="141.25" r="3" /><text x="165" y="210">y = x²</text></svg>
      <svg className="ambient-object ambient-triangle" viewBox="0 0 230 200" focusable="false"><path d="M35 155V40L195 155Z M35 139H51V155" /><path d="M35 40L115 155" strokeDasharray="5 7" /><text x="30" y="185">a² + b² = c²</text></svg>
      <svg className="ambient-object ambient-circle" viewBox="0 0 220 200" focusable="false"><circle cx="105" cy="90" r="65" /><path d="M105 90H170 M105 25V155" /><text x="125" y="80">r</text><text x="55" y="185">S = πr²</text></svg>
      <svg className="ambient-object ambient-sine" viewBox="0 0 320 170" focusable="false"><path d="M15 90H305 M30 145V20 M30 90C55 15 80 15 105 90S155 165 180 90S230 15 255 90S280 165 305 90" /><text x="110" y="25">y = sin x</text></svg>
      <svg className="ambient-object ambient-linear" viewBox="0 0 260 190" focusable="false"><path d="M20 155H245 M45 180V20 M30 150L225 45" /><text x="95" y="35">y = kx + b</text></svg>
      <svg className="ambient-object ambient-polygon" viewBox="0 0 200 200" focusable="false"><path d="M100 20L176 75L147 164H53L24 75Z M100 20L147 164M100 20L53 164" strokeDasharray="5 5" /><circle cx="100" cy="20" r="3" /></svg>
      <svg className="ambient-object ambient-square" viewBox="0 0 200 160" focusable="false"><path d="M35 20H145V130H35Z M35 20L145 130" /><text x="65" y="155">d = a√2</text></svg>
      <span className="ambient-object ambient-root">√x</span>
      <span className="ambient-object ambient-sum">∑</span>
      <span className="ambient-object ambient-function">f(x)</span>
      <svg className="ambient-object ambient-fraction" viewBox="0 0 140 100" focusable="false"><text x="30" y="35">x + 1</text><path d="M20 48H115" /><text x="45" y="78">2</text></svg>
    </div>
    <div className="math-depth math-depth-near">
      <svg className="ambient-object ambient-angle" viewBox="0 0 160 140" focusable="false"><path d="M20 110H145 M20 110L110 20 M60 110A40 40 0 0 0 48.3 81.7" /><text x="72" y="95">α</text></svg>
      <svg className="ambient-object ambient-tangent" viewBox="0 0 260 190" focusable="false"><path d="M25 155Q130 155 225 30" /><path className="ambient-draw" pathLength="1" d="M40 178.4L220 65.9" /><circle className="ambient-pulse" cx="127.5" cy="123.75" r="4" /><text x="40" y="35">f′(x)</text></svg>
      <span className="ambient-object ambient-squared">x²</span>
      <svg className="ambient-object ambient-points" viewBox="0 0 180 90" focusable="false"><path d="M20 70L90 25L155 50" strokeDasharray="3 8" /><circle cx="20" cy="70" r="3" /><circle cx="90" cy="25" r="4" /><circle cx="155" cy="50" r="3" /></svg>
      <span className="ambient-object ambient-equation">a + b = b + a</span>
    </div>
  </div>;
}

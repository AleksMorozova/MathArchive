import { useMediaQuery } from '@mui/material';
import { useLayoutEffect, useRef } from 'react';

type Snapshot = { left: number; top: number; width: number; height: number; clone: HTMLElement };

// A bounded FLIP fallback for browsers without document view transitions.
export function useMaterialLayout(revision: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(new Map<string, Snapshot>());
  const previousWidth = useRef(0);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    if (reduced || typeof document.startViewTransition === 'function' || typeof grid.animate !== 'function') {
      previous.current.clear();
      return;
    }
    const bounds = grid.getBoundingClientRect();
    if (Math.abs(previousWidth.current - bounds.width) > 1) previous.current.clear();
    previousWidth.current = bounds.width;
    const nodes = [...grid.querySelectorAll<HTMLElement>('[data-material-motion]')].slice(0, 24);
    // Read all layout before changing styles or starting animations.
    const measurements = nodes.map(node => ({ node, rect: node.getBoundingClientRect() }));
    const next = new Map<string, Snapshot>();
    const animations: Animation[] = [];
    const ghosts: HTMLElement[] = [];
    const options = { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
    for (const { node, rect } of measurements) {
      const id = node.dataset.materialMotion!;
      const snapshot = { left: rect.left - bounds.left, top: rect.top - bounds.top, width: rect.width, height: rect.height, clone: node.cloneNode(true) as HTMLElement };
      next.set(id, snapshot);
      const old = previous.current.get(id);
      if (old && (old.left !== snapshot.left || old.top !== snapshot.top)) {
        const animation = node.animate([
          { transform: `translate(${old.left - snapshot.left}px, ${old.top - snapshot.top}px)` },
          { transform: 'translate(0, 0)' }
        ], options);
        void animation.finished.catch(() => undefined);
        animations.push(animation);
      }
    }
    for (const [id, old] of previous.current) {
      if (next.has(id)) continue;
      const ghost = old.clone;
      ghost.classList.add('material-exit-ghost');
      ghost.removeAttribute('data-material-motion');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      ghost.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      Object.assign(ghost.style, { position: 'absolute', left: `${old.left}px`, top: `${old.top}px`, width: `${old.width}px`, height: `${old.height}px`, pointerEvents: 'none', margin: '0', zIndex: '1' });
      grid.appendChild(ghost);
      const animation = ghost.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.985)' }], options);
      void animation.finished.then(() => ghost.remove(), () => ghost.remove());
      ghosts.push(ghost);
      animations.push(animation);
    }
    previous.current = next;
    return () => { animations.forEach(animation => animation.cancel()); ghosts.forEach(ghost => ghost.remove()); };
  }, [revision, reduced]);
  return ref;
}

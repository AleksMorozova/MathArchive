import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export function ScrollProgress() {
  const ref = useRef<HTMLSpanElement>(null);
  const { pathname, search } = useLocation();
  useEffect(() => {
    let frame = 0;
    const paint = () => {
      frame = 0;
      const maximum = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maximum > 0 ? Math.max(0, Math.min(1, window.scrollY / maximum)) : 0;
      ref.current?.style.setProperty('--scroll-progress', String(progress));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    observer?.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    paint();
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [pathname, search]);
  return <span ref={ref} className="header-math-progress" aria-hidden="true" />;
}

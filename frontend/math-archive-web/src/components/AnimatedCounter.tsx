import { useMediaQuery } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

export function AnimatedCounter({ value }: { value: number | undefined }) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [displayed, setDisplayed] = useState(value ?? 0);
  const current = useRef(value);
  useEffect(() => {
    // Retain the last result during filter loading, so the next result can count from it.
    if (value === undefined) return;
    if (reducedMotion || current.current === undefined) {
      current.current = value;
      setDisplayed(value);
      return;
    }
    const from = current.current;
    if (from === value) return;
    let frame = 0;
    let start: number | undefined;
    const tick = (time: number) => {
      start ??= time;
      const progress = Math.min((time - start) / 220, 1);
      current.current = Math.round(from + (value - from) * (1 - (1 - progress) ** 3));
      setDisplayed(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reducedMotion]);
  return <span className="animated-count"><span aria-hidden="true">{reducedMotion ? value : displayed}</span><span className="visually-hidden">{value}</span></span>;
}

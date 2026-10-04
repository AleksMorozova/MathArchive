import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '@mui/material';
import { flushSync } from 'react-dom';

// Keep the last result through network loading; snapshot only when fresh results arrive.
export function useMotionResults<T>(data: T | undefined) {
  const [visible, setVisible] = useState(data);
  const current = useRef(data);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    if (data === undefined || data === current.current) return;
    let cancelled = false;
    let transition: ViewTransition | undefined;
    // Run outside React's effect lifecycle so flushSync can commit the new snapshot.
    queueMicrotask(() => {
      if (cancelled) return;
      const update = () => { if (!cancelled) { current.current = data; flushSync(() => setVisible(data)); } };
      if (!reduced && typeof document.startViewTransition === 'function' && current.current !== undefined && document.visibilityState !== 'hidden') {
        transition = document.startViewTransition(update);
        void transition.finished.catch(() => undefined);
      } else update();
    });
    return () => { cancelled = true; transition?.skipTransition(); };
  }, [data, reduced]);
  return visible;
}

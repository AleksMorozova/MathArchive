import { useMediaQuery } from '@mui/material';
import { useEffect, useRef } from 'react';

export function useSectionReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    const node = ref.current;
    if (!node || reduced || typeof IntersectionObserver === 'undefined') return;
    node.classList.add('section-reveal-pending');
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      node.classList.remove('section-reveal-pending');
      node.classList.add('section-revealed');
      observer.disconnect();
    }, { threshold: .08 });
    observer.observe(node);
    return () => { observer.disconnect(); node.classList.remove('section-reveal-pending'); };
  }, [reduced]);
  return ref;
}

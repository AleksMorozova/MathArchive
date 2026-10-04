import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { IconButton, useMediaQuery } from '@mui/material';
import { useEffect, useState } from 'react';

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 600);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  if (!visible) return null;
  return <IconButton className="scroll-to-top" aria-label="Повернутися нагору" onClick={() => window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' })}><ArrowUpwardIcon /></IconButton>;
}

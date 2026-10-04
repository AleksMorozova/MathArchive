import CheckIcon from '@mui/icons-material/Check';
import DownloadIcon from '@mui/icons-material/Download';
import { useEffect, useRef, useState } from 'react';

export function useDownloadFeedback() {
  const [completed, setCompleted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, []);
  return {
    completed,
    reset: () => { clearTimeout(timer.current); setCompleted(false); },
    confirm: () => {
      if (!mounted.current) return;
      clearTimeout(timer.current);
      setCompleted(true);
      timer.current = setTimeout(() => setCompleted(false), 1600);
    }
  };
}

export function DownloadFeedback({ pending, completed }: { pending: boolean; completed: boolean }) {
  return completed ? <CheckIcon className="download-confirmed" /> : <DownloadIcon className={pending ? 'download-pending' : undefined} />;
}

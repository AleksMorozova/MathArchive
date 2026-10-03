import { lazy, Suspense, useState } from 'react';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CloseIcon from '@mui/icons-material/Close';
import { Box, Dialog, Fab, IconButton, Stack, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useAssistantSession } from './AssistantSession';
import { useLocation } from 'react-router-dom';

const AssistantChat = lazy(() => import('./AssistantChat').then(module => ({ default: module.AssistantChat })));
export function AssistantWidget() {
  const { available } = useAssistantSession();
  const [open, setOpen] = useState(false);
  const mobile = useMediaQuery(useTheme().breakpoints.down('sm'));
  const location = useLocation();
  if (!available || location.pathname === '/assistant') return null;
  return <>
    <Tooltip title="AI-помічник"><Fab aria-label="AI-помічник" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? 'assistant-panel' : undefined} onClick={() => setOpen(true)} sx={{ position: 'fixed', right: 'max(16px, env(safe-area-inset-right))', bottom: 'max(16px, env(safe-area-inset-bottom))', zIndex: theme => theme.zIndex.drawer - 1, bgcolor: '#E8AE18', color: '#082B5C', width: 56, height: 56, '&:hover': { bgcolor: '#F3C44B' } }}><ChatBubbleOutlineIcon /></Fab></Tooltip>
    <Dialog open={open} onClose={() => setOpen(false)} fullScreen={mobile} aria-labelledby="assistant-panel-title" maxWidth={false}
      sx={{ '& .MuiDialog-container': { alignItems: { xs: 'stretch', sm: 'flex-end' }, justifyContent: { xs: 'stretch', sm: 'flex-end' } }, '& .MuiDialog-paper': { width: { xs: '100%', sm: 480 }, maxWidth: { xs: '100%', sm: 'calc(100vw - 32px)' }, height: { xs: '100dvh', sm: 'min(720px, calc(100dvh - 48px))' }, m: { xs: 0, sm: 2 }, borderRadius: { xs: 0, sm: '20px' }, overflow: 'hidden', bgcolor: '#FFFDF6' } }}>
      <Stack id="assistant-panel" sx={{ height: '100%', minHeight: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1, bgcolor: '#082B5C', color: '#FFFDF6', flexShrink: 0 }}><Stack direction="row" alignItems="center" gap={1}><ChatBubbleOutlineIcon sx={{ color: '#E8AE18' }} /><Typography id="assistant-panel-title" fontWeight={700}>AI-помічник</Typography></Stack><IconButton autoFocus aria-label="Закрити AI-помічника" onClick={() => setOpen(false)} sx={{ color: '#FFFDF6', '&:hover': { bgcolor: '#164476' } }}><CloseIcon /></IconButton></Stack>
        <Box sx={{ flex: 1, minHeight: 0 }}><Suspense fallback={<Typography role="status" sx={{ p: 2 }}>Відкриваємо помічника…</Typography>}><AssistantChat onNavigate={() => setOpen(false)} /></Suspense></Box>
      </Stack>
    </Dialog>
  </>;
}

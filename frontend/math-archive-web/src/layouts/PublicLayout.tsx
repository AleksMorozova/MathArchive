import MenuIcon from '@mui/icons-material/Menu';
import { AppBar, Box, Button, Container, Drawer, IconButton, Stack, Toolbar, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { trackSiteVisit } from '../api/analyticsApi';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { MathBackground } from '../components/MathBackground';
import { AssistantSessionProvider, useAssistantSession } from '../components/assistant/AssistantSession';
import { AssistantWidget } from '../components/assistant/AssistantWidget';

const links = [
  { to: '/', label: 'Головна' },
  { to: '/materials', label: 'Матеріали' },
  { to: '/about', label: 'Про сайт' }
];

export function PublicLayout() {
  return <AssistantSessionProvider><PublicLayoutContent /></AssistantSessionProvider>;
}
function PublicLayoutContent() {
  const { available } = useAssistantSession();
  useEffect(() => { trackSiteVisit(); }, []);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const mathBackgroundVariant = location.pathname === '/about' ? 'about' : 'default';

  const navigation = (
    <Stack component="nav" aria-label="Основна навігація" direction={{ xs: 'column', sm: 'row' }} gap={1}>
      {links.map((link) => (
        <Button key={link.to} component={NavLink} to={link.to} onClick={() => setOpen(false)}>
          {link.label}
        </Button>
      ))}
    </Stack>
  );

  return (
    <Box className="page-shell">
      <AppBar position="sticky" elevation={0} color="inherit" className="public-header">
        <Container maxWidth="lg">
          <Toolbar disableGutters className="header-toolbar">
            <Stack component={Link} to="/" direction="row" alignItems="center" className="brand-link">
              <Box>
                <Typography variant="h6" color="text.primary">MathArchive</Typography>
                <Typography variant="caption" color="text.secondary">Навчальні матеріали з математики</Typography>
              </Box>
            </Stack>
            <Box className="desktop-nav">{navigation}</Box>
            <IconButton className="mobile-nav-button" aria-label="Відкрити меню" onClick={() => setOpen(true)}>
              <MenuIcon />
            </IconButton>
          </Toolbar>
        </Container>
      </AppBar>
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)} className="public-navigation-drawer">
        <Box sx={{ width: 260, p: 2 }}>{navigation}</Box>
      </Drawer>
      <Box component="main" className={`main-content public-main-content${location.pathname === '/' ? ' home-route' : ''}`}>
        <MathBackground variant={mathBackgroundVariant} />
        <Outlet />
      </Box>
      <Box component="footer" className="footer" sx={available ? { pb: 'calc(88px + env(safe-area-inset-bottom))' } : undefined}>
        <Container maxWidth="lg">
          <Typography variant="body2">MathArchive · Навчальні матеріали з математики</Typography>
        </Container>
      </Box>
      <AssistantWidget />
    </Box>
  );
}

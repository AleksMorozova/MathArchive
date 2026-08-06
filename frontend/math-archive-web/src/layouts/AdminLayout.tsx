import AddIcon from '@mui/icons-material/Add';
import LogoutIcon from '@mui/icons-material/Logout';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import MenuIcon from '@mui/icons-material/Menu';
import { Box, Button, Drawer, IconButton, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { logout } from '../api/authApi';

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const signOut = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  const nav = (
    <Stack gap={1}>
      <Button component={NavLink} to="/admin/documents" startIcon={<LibraryBooksIcon />} onClick={() => setOpen(false)}>
        Матеріали
      </Button>
      <Button component={NavLink} to="/admin/documents/new" startIcon={<AddIcon />} onClick={() => setOpen(false)}>
        Додати матеріал
      </Button>
      <Button startIcon={<LogoutIcon />} onClick={signOut}>Вийти</Button>
    </Stack>
  );

  return (
    <Box className="admin-shell">
      <Box component="aside" className="admin-sidebar">
        <Typography variant="h6">MathArchive</Typography>
        {nav}
      </Box>
      <Box className="admin-main">
        <Box className="admin-mobile-bar">
          <Typography variant="h6">MathArchive</Typography>
          <IconButton aria-label="Відкрити меню" onClick={() => setOpen(true)}>
            <MenuIcon />
          </IconButton>
        </Box>
        <Outlet />
      </Box>
      <Drawer open={open} onClose={() => setOpen(false)}>
        <Box sx={{ width: 260, p: 2 }}>{nav}</Box>
      </Drawer>
    </Box>
  );
}

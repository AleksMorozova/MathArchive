import { createTheme } from '@mui/material/styles';

// Scoped to admin routes, including their portaled dialogs and menus.
export const adminTheme = createTheme({
  palette: {
    primary: { main: '#F16A22', light: '#FFF0E8', dark: '#D95617', contrastText: '#FFFFFF' },
    secondary: { main: '#102F5B' },
    background: { default: '#F4F8FC', paper: '#FFFFFF' },
    text: { primary: '#102F5B', secondary: '#536A84' },
    divider: '#D6E1EC',
    warning: { main: '#B76600' },
    error: { main: '#B42318' },
    success: { main: '#24754D' }
  },
  shape: { borderRadius: 18 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
    h1: { fontWeight: 750 },
    h2: { fontWeight: 740 },
    h3: { fontWeight: 730 },
    h4: { fontWeight: 720 },
    h5: { fontWeight: 650 },
    h6: { fontWeight: 700 },
    body1: { lineHeight: 1.7 },
    body2: { lineHeight: 1.65 },
    button: { textTransform: 'none', fontWeight: 700 }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          minHeight: 44,
          paddingInline: 20,
          '&:focus-visible': { outline: '3px solid rgba(241, 106, 34, 0.38)', outlineOffset: 3 }
        },
        containedPrimary: {
          boxShadow: '0 8px 20px rgba(241, 106, 34, 0.20)',
          '&:hover': { boxShadow: '0 12px 24px rgba(217, 86, 23, 0.28)' }
        }
      }
    },
    MuiCard: {
      styleOverrides: { root: { border: '1px solid #D6E1EC', borderRadius: 20, boxShadow: '0 12px 30px rgba(16, 47, 91, 0.08)' } }
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', slotProps: { inputLabel: { shrink: true } } }
    },
    MuiInputLabel: {
      styleOverrides: { root: { backgroundColor: '#FFFFFF', paddingInline: 6, lineHeight: 1.2 } }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { backgroundColor: '#FFFFFF', '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(241, 106, 34, 0.14)' } },
        notchedOutline: { borderColor: '#D6E1EC' }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: { color: '#102F5B', borderRadius: 12, '&:hover': { backgroundColor: '#FFF0E8' }, '&:focus-visible': { outline: '3px solid rgba(241, 106, 34, 0.38)', outlineOffset: 2 } }
      }
    },
    MuiDialog: { styleOverrides: { paper: { border: '1px solid #D6E1EC', borderRadius: 20 } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 999, fontWeight: 600 } } }
  }
});

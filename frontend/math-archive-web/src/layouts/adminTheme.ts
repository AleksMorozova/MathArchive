import { createTheme } from '@mui/material/styles';

// Scoped to admin routes, including their portaled dialogs and menus.
export const adminTheme = createTheme({
  palette: {
    primary: { main: '#007F99', light: '#EAF9FC', dark: '#00697F', contrastText: '#FFFFFF' },
    secondary: { main: '#082B59' },
    background: { default: '#F5FAFF', paper: '#FFFFFF' },
    text: { primary: '#082B59', secondary: '#38516F' },
    divider: '#CFE0EC',
    warning: { main: '#AC6000' },
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
          '&:focus-visible': { outline: '3px solid #F7B500', outlineOffset: 3 }
        },
        containedPrimary: {
          boxShadow: '0 8px 20px rgba(0, 127, 153, 0.20)',
          '&:hover': { boxShadow: '0 12px 24px rgba(0, 127, 153, 0.28)' }
        }
      }
    },
    MuiCard: {
      styleOverrides: { root: { border: '1px solid #CFE0EC', borderRadius: 20, boxShadow: '0 12px 30px rgba(8, 43, 89, 0.08)' } }
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', slotProps: { inputLabel: { shrink: true } } }
    },
    MuiInputLabel: {
      styleOverrides: { root: { backgroundColor: '#FFFFFF', paddingInline: 6, lineHeight: 1.2 } }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { backgroundColor: '#FFFFFF', '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(0, 151, 178, 0.12)' } },
        notchedOutline: { borderColor: '#CFE0EC' }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: { color: '#007F99', borderRadius: 12, '&:hover': { backgroundColor: '#EAF9FC' }, '&:focus-visible': { outline: '3px solid #F7B500', outlineOffset: 2 } }
      }
    },
    MuiDialog: { styleOverrides: { paper: { border: '1px solid #CFE0EC', borderRadius: 20 } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 999, fontWeight: 600 } } }
  }
});

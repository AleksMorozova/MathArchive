import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

const theme = createTheme({
  palette: {
    background: { default: '#F4F8FC', paper: '#FFFFFF' },
    primary: { main: '#F16A22', dark: '#D95617', light: '#FFF0E8', contrastText: '#FFFFFF' },
    secondary: { main: '#102F5B', dark: '#0A2345', light: '#EAF0F7', contrastText: '#FFFFFF' },
    success: { main: '#24754D' },
    warning: { main: '#B76600' },
    error: { main: '#B42318' },
    text: { primary: '#102F5B', secondary: '#536A84' },
    divider: '#D6E1EC'
  },
  shape: { borderRadius: 18 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
    h1: { fontWeight: 700, letterSpacing: 0, color: '#102F5B' },
    h2: { fontWeight: 700, letterSpacing: 0, color: '#102F5B' },
    h3: { fontWeight: 700, letterSpacing: 0, color: '#102F5B' },
    h4: { fontWeight: 700, letterSpacing: 0, color: '#102F5B' },
    h5: { fontWeight: 650, letterSpacing: 0 },
    h6: { fontWeight: 700, letterSpacing: 0 },
    body1: { lineHeight: 1.7 },
    body2: { lineHeight: 1.65 },
    button: { textTransform: 'none', fontWeight: 700, letterSpacing: 0 }
  },
  components: {
    MuiButtonBase: {
      defaultProps: { disableRipple: false }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 18,
          paddingInline: 20,
          minHeight: 44,
          transition: 'background-color 240ms ease, box-shadow 240ms ease, transform 240ms ease, border-color 240ms ease'
        },
        contained: {
          boxShadow: '0 10px 24px rgba(241, 106, 34, 0.20)',
          '&:hover': {
            backgroundColor: '#D95617',
            boxShadow: '0 14px 30px rgba(217, 86, 23, 0.28)',
            transform: 'translateY(-1px)'
          }
        },
        outlined: {
          borderColor: '#AFC2D5',
          backgroundColor: '#FFFFFF',
          color: '#102F5B'
        },
        text: {
          color: '#102F5B'
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          border: '1px solid #D6E1EC',
          boxShadow: '0 14px 36px rgba(16, 47, 91, 0.09)'
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          backgroundColor: '#FFF0E8',
          color: '#102F5B',
          fontWeight: 600
        }
      }
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        slotProps: {
          inputLabel: { shrink: true }
        }
      }
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          paddingInline: 6,
          lineHeight: 1.2,
          zIndex: 1
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 18,
          backgroundColor: '#FFFFFF',
          transition: 'box-shadow 240ms ease, background-color 240ms ease, border-color 240ms ease',
          '&:hover': { backgroundColor: '#FFFFFF' },
          '&.Mui-focused': { boxShadow: '0 0 0 4px rgba(241, 106, 34, 0.14)' }
        },
        notchedOutline: { borderColor: '#D6E1EC' }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          color: '#102F5B',
          transition: 'background-color 240ms ease, transform 240ms ease',
          '&:hover': { transform: 'translateY(-1px)', backgroundColor: '#FFF0E8' }
        }
      }
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 18 }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 20 }
      }
    }
  }
});

const queryClient = new QueryClient();

const root = document.getElementById('root')!;
root.replaceChildren();

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

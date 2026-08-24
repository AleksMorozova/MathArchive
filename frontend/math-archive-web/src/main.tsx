import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

const theme = createTheme({
  palette: {
    background: { default: '#F8F5F1', paper: '#FFFCF8' },
    primary: { main: '#8A6A52', dark: '#755741', light: '#E8D8C2', contrastText: '#FFFFFF' },
    secondary: { main: '#A78F73', dark: '#7F684F', light: '#EFE4D4', contrastText: '#23364A' },
    success: { main: '#7D8F6B' },
    error: { main: '#A9645C' },
    text: { primary: '#23364A', secondary: '#5D5D5D' },
    divider: '#E7DED3'
  },
  shape: { borderRadius: 18 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
    h1: { fontWeight: 750, letterSpacing: 0, color: '#23364A' },
    h2: { fontWeight: 740, letterSpacing: 0, color: '#23364A' },
    h3: { fontWeight: 730, letterSpacing: 0, color: '#23364A' },
    h4: { fontWeight: 720, letterSpacing: 0, color: '#23364A' },
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
          boxShadow: '0 12px 24px rgba(138, 106, 82, 0.18)',
          '&:hover': {
            backgroundColor: '#755741',
            boxShadow: '0 16px 32px rgba(138, 106, 82, 0.24)',
            transform: 'translateY(-1px)'
          }
        },
        outlined: {
          borderColor: '#D9C4A5',
          backgroundColor: 'rgba(255, 252, 248, 0.78)',
          color: '#755741'
        },
        text: {
          color: '#755741'
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          boxShadow: '0 18px 42px rgba(78, 60, 43, 0.09)'
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          backgroundColor: '#F1E7D8',
          color: '#4B3B2D',
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
          backgroundColor: '#FFFCF8',
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
          backgroundColor: 'rgba(255, 252, 248, 0.86)',
          transition: 'box-shadow 240ms ease, background-color 240ms ease, border-color 240ms ease',
          '&:hover': { backgroundColor: '#FFFCF8' },
          '&.Mui-focused': { boxShadow: '0 0 0 4px rgba(138, 106, 82, 0.14)' }
        },
        notchedOutline: { borderColor: '#E7DED3' }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          color: '#755741',
          transition: 'background-color 240ms ease, transform 240ms ease',
          '&:hover': { transform: 'translateY(-1px)', backgroundColor: 'rgba(217, 196, 165, 0.24)' }
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

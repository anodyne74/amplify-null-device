import { createTheme } from '@mui/material/styles';

/**
 * Material UI Theme for Operator Portal
 * Applies NullDevice dark theme colors and tokens to MUI components
 * Optimized for mobile-first field use
 */
export const operatorTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#ffb300', // nd-operator-accent (amber)
      light: '#ffc933',
      dark: '#cc8f00',
      contrastText: '#0a0a0a',
    },
    secondary: {
      main: '#00ff88', // nd-accent-primary (neon green)
      light: '#33ffaa',
      dark: '#00cc6a',
      contrastText: '#0a0a0a',
    },
    background: {
      default: '#0a0a0a', // nd-bg-void
      paper: '#111111', // nd-bg-surface
    },
    divider: 'rgba(255, 255, 255, 0.08)', // nd-border-subtle
    text: {
      primary: 'rgba(255, 255, 255, 0.92)', // nd-text-primary
      secondary: 'rgba(255, 255, 255, 0.6)', // nd-text-secondary
      disabled: 'rgba(255, 255, 255, 0.38)', // nd-text-muted
    },
    action: {
      active: 'rgba(255, 255, 255, 0.92)',
      hover: 'rgba(255, 179, 0, 0.08)', // nd-operator-accent-dim
      selected: 'rgba(255, 179, 0, 0.12)',
      disabled: 'rgba(255, 255, 255, 0.38)',
      disabledBackground: 'rgba(255, 255, 255, 0.12)',
    },
    error: {
      main: '#ff4757', // nd-status-danger
    },
    warning: {
      main: '#ffa502', // nd-status-warning
    },
    success: {
      main: '#00ff88', // nd-status-active
    },
    info: {
      main: '#00e5ff', // nd-status-completed
    },
  },
  typography: {
    fontFamily:
      'var(--nd-font-body, Inter, system-ui, -apple-system, sans-serif)',
    h1: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.125rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    body1: {
      fontSize: '0.9375rem',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#1a1a1a', // nd-bg-elevated
          backgroundImage: 'none',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        root: {
          '& .MuiBackdrop-root': {
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
        paper: {
          backgroundColor: '#111111', // nd-bg-surface
          borderRight: '1px solid rgba(255, 179, 0, 0.3)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '4px', // nd-radius-sm
          textTransform: 'none',
          fontSize: '0.875rem',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: '4px',
          '&:hover': {
            backgroundColor: 'rgba(255, 179, 0, 0.08)',
          },
        },
        sizeMedium: {
          padding: '8px',
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: '4px',
          marginBottom: '4px',
          '&.Mui-selected': {
            backgroundColor: 'rgba(255, 179, 0, 0.12)',
            '&:hover': {
              backgroundColor: 'rgba(255, 179, 0, 0.16)',
            },
          },
          '&:hover': {
            backgroundColor: 'rgba(255, 179, 0, 0.08)',
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: 'inherit',
          minWidth: '40px',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#1a1a1a', // nd-bg-elevated
          borderRadius: '4px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: '4px',
          },
        },
      },
    },
  },
  shape: {
    borderRadius: 4, // nd-radius-sm
  },
});

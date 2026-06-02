import { createTheme } from '@mui/material/styles';
import { ndThemePalettes } from '@/app/theme/themeTokens';

const darkPalette = ndThemePalettes.dark;

/**
 * Material UI Theme for Operator Portal
 * Applies NullDevice dark theme colors and tokens to MUI components
 * Optimized for mobile-first field use
 */
export const operatorTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: darkPalette.operatorAccent,
      light: darkPalette.statusPlanned,
      dark: darkPalette.statusPlanned,
      contrastText: darkPalette.textInverse,
    },
    secondary: {
      main: darkPalette.accentPrimary,
      light: darkPalette.statusActive,
      dark: darkPalette.statusActive,
      contrastText: darkPalette.textInverse,
    },
    background: {
      default: darkPalette.backgroundCanvas,
      paper: darkPalette.backgroundSurface,
    },
    divider: darkPalette.borderSubtle,
    text: {
      primary: darkPalette.textPrimary,
      secondary: darkPalette.textSecondary,
      disabled: darkPalette.textMuted,
    },
    action: {
      active: darkPalette.textPrimary,
      hover: 'color-mix(in srgb, var(--nd-operator-accent) 8%, transparent)',
      selected: darkPalette.operatorAccentDim,
      disabled: darkPalette.textMuted,
      disabledBackground: 'color-mix(in srgb, var(--nd-text-primary) 12%, transparent)',
    },
    error: {
      main: darkPalette.statusDanger,
    },
    warning: {
      main: darkPalette.statusWarning,
    },
    success: {
      main: darkPalette.statusActive,
    },
    info: {
      main: darkPalette.statusCompleted,
    },
  },
  typography: {
    fontFamily:
      'var(--nd-font-body, Inter, system-ui, -apple-system, sans-serif)',
    h1: {
      fontFamily: 'var(--nd-font-display, Comfortaa, sans-serif)',
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h2: {
      fontFamily: 'var(--nd-font-display, Comfortaa, sans-serif)',
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h3: {
      fontFamily: 'var(--nd-font-display, Comfortaa, sans-serif)',
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h4: {
      fontFamily: 'var(--nd-font-display, Comfortaa, sans-serif)',
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
          backgroundColor: darkPalette.backgroundElevated,
          backgroundImage: 'none',
          borderBottom: `1px solid ${darkPalette.borderSubtle}`,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        root: {
          '& .MuiBackdrop-root': {
            backgroundColor: 'color-mix(in srgb, var(--nd-bg-void) 50%, transparent)',
          },
        },
        paper: {
          backgroundColor: darkPalette.backgroundSurface,
          borderRight: '1px solid color-mix(in srgb, var(--nd-operator-accent) 30%, transparent)',
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
            backgroundColor: 'color-mix(in srgb, var(--nd-operator-accent) 8%, transparent)',
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
            backgroundColor: 'color-mix(in srgb, var(--nd-operator-accent) 12%, transparent)',
            '&:hover': {
              backgroundColor: 'color-mix(in srgb, var(--nd-operator-accent) 16%, transparent)',
            },
          },
          '&:hover': {
            backgroundColor: 'color-mix(in srgb, var(--nd-operator-accent) 8%, transparent)',
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
          backgroundColor: darkPalette.backgroundElevated,
          borderRadius: '4px',
          border: `1px solid ${darkPalette.borderSubtle}`,
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

import { createTheme } from '@mui/material/styles';
import { ndThemePalettes, type ThemeModeResolved } from '@/app/theme/themeTokens';

/**
 * Material UI theme for the operator portal.
 * Defaults to dark for field use, but follows the resolved app theme when available.
 */
export function getOperatorTheme(mode: ThemeModeResolved = 'dark') {
  const palette = ndThemePalettes[mode];

  return createTheme({
  palette: {
    mode,
    primary: {
      main: palette.operatorAccent,
      light: palette.statusPlanned,
      dark: palette.statusPlanned,
      contrastText: palette.textInverse,
    },
    secondary: {
      main: palette.accentPrimary,
      light: palette.statusActive,
      dark: palette.statusActive,
      contrastText: palette.textInverse,
    },
    background: {
      default: palette.backgroundCanvas,
      paper: palette.backgroundSurface,
    },
    divider: palette.borderSubtle,
    text: {
      primary: palette.textPrimary,
      secondary: palette.textSecondary,
      disabled: palette.textMuted,
    },
    action: {
      active: palette.textPrimary,
      hover: 'color-mix(in srgb, var(--nd-operator-accent) 8%, transparent)',
      selected: palette.operatorAccentDim,
      disabled: palette.textMuted,
      disabledBackground: 'color-mix(in srgb, var(--nd-text-primary) 12%, transparent)',
    },
    error: {
      main: palette.statusDanger,
    },
    warning: {
      main: palette.statusWarning,
    },
    success: {
      main: palette.statusActive,
    },
    info: {
      main: palette.statusCompleted,
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
          backgroundColor: palette.backgroundElevated,
          backgroundImage: 'none',
          borderBottom: `1px solid ${palette.borderSubtle}`,
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
          backgroundColor: palette.backgroundSurface,
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
          backgroundColor: palette.backgroundElevated,
          borderRadius: '4px',
          border: `1px solid ${palette.borderSubtle}`,
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
}

export const operatorTheme = getOperatorTheme('dark');

export type ThemeModeResolved = 'light' | 'dark';

export interface ThemePaletteTokens {
  backgroundCanvas: string;
  backgroundSurface: string;
  backgroundElevated: string;
  backgroundOverlay: string;
  borderSubtle: string;
  borderDefault: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  accentPrimary: string;
  accentPrimaryDim: string;
  customerAccent: string;
  customerAccentDim: string;
  operatorAccent: string;
  operatorAccentDim: string;
  statusActive: string;
  statusCompleted: string;
  statusPlanned: string;
  statusArchived: string;
  statusDanger: string;
  statusWarning: string;
}

export const ndSharedTokens = {
  logoPrimary: '#5D65E6',
  logoPrimaryDim: 'rgba(93, 101, 230, 0.15)',
  logoSecondary: '#B181E8',
  logoSecondaryDim: 'rgba(177, 129, 232, 0.15)',
  radiusSm: '4px',
  radiusMd: '6px',
  radiusLg: '8px',
} as const;

// Palette mirrors app/globals.css — see that file's comments for the
// Null Device Design System mapping (navy ink, indigo as the single action
// colour, unified per-portal accents).
export const ndThemePalettes: Record<ThemeModeResolved, ThemePaletteTokens> = {
  dark: {
    backgroundCanvas: '#0E1329',
    backgroundSurface: '#141B38',
    backgroundElevated: '#1C244A',
    backgroundOverlay: '#2B3150',
    borderSubtle: 'rgba(255, 255, 255, 0.09)',
    borderDefault: 'rgba(255, 255, 255, 0.16)',
    borderStrong: 'rgba(255, 255, 255, 0.3)',
    textPrimary: '#F3F5FC',
    textSecondary: 'rgba(243, 245, 252, 0.86)',
    textMuted: 'rgba(243, 245, 252, 0.62)',
    textInverse: '#141B38',
    accentPrimary: '#5D65E6',
    accentPrimaryDim: 'rgba(93, 101, 230, 0.15)',
    customerAccent: '#5D65E6',
    customerAccentDim: 'rgba(93, 101, 230, 0.15)',
    operatorAccent: '#5D65E6',
    operatorAccentDim: 'rgba(93, 101, 230, 0.15)',
    statusActive: '#5D65E6',
    statusCompleted: '#3A40A6',
    statusPlanned: '#BF8412',
    statusArchived: '#9AA0BA',
    statusDanger: '#C62B31',
    statusWarning: '#BF8412',
  },
  light: {
    backgroundCanvas: '#F6F7FB',
    backgroundSurface: '#FFFFFF',
    backgroundElevated: '#FBFCFE',
    backgroundOverlay: '#EDEFF6',
    borderSubtle: '#DFE2EE',
    borderDefault: '#C7CBDD',
    borderStrong: '#9AA0BA',
    textPrimary: '#141B38',
    textSecondary: '#2B3150',
    textMuted: '#5A6180',
    textInverse: '#FFFFFF',
    accentPrimary: '#5D65E6',
    accentPrimaryDim: 'rgba(93, 101, 230, 0.12)',
    customerAccent: '#5D65E6',
    customerAccentDim: 'rgba(93, 101, 230, 0.12)',
    operatorAccent: '#5D65E6',
    operatorAccentDim: 'rgba(93, 101, 230, 0.12)',
    statusActive: '#5D65E6',
    statusCompleted: '#3A40A6',
    statusPlanned: '#BF8412',
    statusArchived: '#9AA0BA',
    statusDanger: '#C62B31',
    statusWarning: '#BF8412',
  },
};

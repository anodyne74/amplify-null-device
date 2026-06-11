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
  logoSecondary: '#AD80E8',
  logoSecondaryDim: 'rgba(173, 128, 232, 0.15)',
  radiusSm: '4px',
  radiusMd: '6px',
  radiusLg: '8px',
} as const;

export const ndThemePalettes: Record<ThemeModeResolved, ThemePaletteTokens> = {
  dark: {
    backgroundCanvas: '#0A0A0A',
    backgroundSurface: '#111111',
    backgroundElevated: '#1A1A1A',
    backgroundOverlay: '#222222',
    borderSubtle: 'rgba(255, 255, 255, 0.08)',
    borderDefault: 'rgba(255, 255, 255, 0.15)',
    borderStrong: 'rgba(255, 255, 255, 0.3)',
    textPrimary: 'rgba(255, 255, 255, 0.92)',
    textSecondary: 'rgba(255, 255, 255, 0.6)',
    textMuted: 'rgba(255, 255, 255, 0.38)',
    textInverse: '#0A0A0A',
    accentPrimary: '#00FF88',
    accentPrimaryDim: 'rgba(0, 255, 136, 0.15)',
    customerAccent: '#00E5FF',
    customerAccentDim: 'rgba(0, 229, 255, 0.15)',
    operatorAccent: '#FFB300',
    operatorAccentDim: 'rgba(255, 179, 0, 0.15)',
    statusActive: '#00FF88',
    statusCompleted: '#00E5FF',
    statusPlanned: '#FFB300',
    statusArchived: 'rgba(255, 255, 255, 0.38)',
    statusDanger: '#FF4757',
    statusWarning: '#FFA502',
  },
  light: {
    backgroundCanvas: '#F4F6F8',
    backgroundSurface: '#FFFFFF',
    backgroundElevated: '#F8FAFC',
    backgroundOverlay: '#EEF2F7',
    borderSubtle: 'rgba(17, 24, 39, 0.1)',
    borderDefault: 'rgba(17, 24, 39, 0.2)',
    borderStrong: 'rgba(17, 24, 39, 0.38)',
    textPrimary: '#111827',
    textSecondary: '#374151',
    textMuted: '#6B7280',
    textInverse: '#FFFFFF',
    accentPrimary: '#00C978',
    accentPrimaryDim: 'rgba(0, 201, 120, 0.15)',
    customerAccent: '#00BCD4',
    customerAccentDim: 'rgba(0, 188, 212, 0.12)',
    operatorAccent: '#E09A00',
    operatorAccentDim: 'rgba(224, 154, 0, 0.14)',
    statusActive: '#0AA35F',
    statusCompleted: '#0A9CB0',
    statusPlanned: '#C78900',
    statusArchived: '#9CA3AF',
    statusDanger: '#DC2626',
    statusWarning: '#D97706',
  },
};

import { createTheme } from '@aws-amplify/ui';

// Mirrors app/components/ui/tokens.css's neutral/indigo scales and light/dark
// semantic aliases. Kept as plain hex here (rather than reading the CSS custom
// properties) because Amplify's Theme tokens are resolved at theme-creation
// time, not read live from the DOM.
const DESIGN_SYSTEM_PALETTE = {
  light: {
    backgroundPrimary: '#f6f7fb', // --neutral-50 / --surface-page
    backgroundSecondary: '#ffffff', // --neutral-0 / --surface-card
    border: '#c7cbdd', // --neutral-300 / --border-default
    textPrimary: '#141b38', // --neutral-950 / --text-heading
    textSecondary: '#2b3150', // --neutral-800 / --text-body
    brandDim: '#eef0fe', // --indigo-50
    brand: '#5d65e6', // --indigo-500
    brandHover: '#4a51cc', // --indigo-600
    brandActive: '#3a40a6', // --indigo-700
  },
  dark: {
    backgroundPrimary: '#0e1329', // --surface-page (dark)
    backgroundSecondary: '#141b38', // --neutral-950 / --surface-card (dark)
    border: 'rgba(255, 255, 255, 0.16)', // --border-default (dark)
    textPrimary: '#f3f5fc', // --text-heading (dark)
    textSecondary: 'rgba(243, 245, 252, 0.86)', // --text-body (dark)
    brandDim: 'rgba(93, 101, 230, 0.18)', // --surface-brand-subtle (dark)
    brand: '#5d65e6', // --indigo-500
    brandHover: '#a0a8f4', // --indigo-300
    brandActive: '#a0a8f4', // --indigo-300
  },
} as const;

function toAmplifyColorTokens(mode: 'light' | 'dark') {
  const palette = DESIGN_SYSTEM_PALETTE[mode];

  return {
    background: {
      primary: { value: palette.backgroundPrimary },
      secondary: { value: palette.backgroundSecondary },
    },
    border: {
      primary: { value: palette.border },
    },
    font: {
      primary: { value: palette.textPrimary },
      secondary: { value: palette.textSecondary },
    },
    brand: {
      primary: {
        10: { value: palette.brandDim },
        80: { value: palette.brand },
        90: { value: palette.brandHover },
        100: { value: palette.brandActive },
      },
    },
  };
}

export const amplifyTheme = createTheme({
  name: 'nulldevice',
  tokens: {
    colors: toAmplifyColorTokens('light'),
    radii: {
      small: { value: '6px' },
      medium: { value: '12px' },
      large: { value: '16px' },
    },
  },
  overrides: [
    {
      colorMode: 'dark',
      tokens: {
        colors: toAmplifyColorTokens('dark'),
      },
    },
  ],
});

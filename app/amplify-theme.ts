import { createTheme } from '@aws-amplify/ui';
import { ndSharedTokens, ndThemePalettes } from '@/app/theme/themeTokens';

function toAmplifyColorTokens(mode: 'light' | 'dark') {
  const palette = ndThemePalettes[mode];
  const brandMain = palette.operatorAccent;
  const brandMainHover = mode === 'light' ? palette.statusPlanned : palette.operatorAccent;

  return {
    background: {
      primary: { value: palette.backgroundCanvas },
      secondary: { value: palette.backgroundSurface },
    },
    border: {
      primary: { value: palette.borderDefault },
    },
    font: {
      primary: { value: palette.textPrimary },
      secondary: { value: palette.textSecondary },
    },
    brand: {
      primary: {
        10: { value: palette.operatorAccentDim },
        80: { value: brandMain },
        90: { value: brandMainHover },
        100: { value: brandMainHover },
      },
    },
  };
}

export const amplifyTheme = createTheme({
  name: 'nulldevice',
  tokens: {
    colors: toAmplifyColorTokens('light'),
    radii: {
      small: { value: ndSharedTokens.radiusSm },
      medium: { value: ndSharedTokens.radiusMd },
      large: { value: ndSharedTokens.radiusLg },
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

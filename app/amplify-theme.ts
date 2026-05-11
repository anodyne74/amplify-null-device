import { createTheme } from '@aws-amplify/ui';

export const amplifyTheme = createTheme({
  name: 'nulldevice',
  tokens: {
    colors: {
      background: {
        primary: { value: '#f7f8fa' },
        secondary: { value: '#ffffff' },
      },
      border: {
        primary: { value: '#d0d5dd' },
      },
      font: {
        primary: { value: '#111827' },
        secondary: { value: '#4b5563' },
      },
      brand: {
        primary: {
          10: { value: 'rgba(255, 179, 0, 0.12)' },
          80: { value: '#ffb300' },
          90: { value: '#e6a100' },
          100: { value: '#cc8f00' },
        },
      },
    },
    radii: {
      small: { value: '4px' },
      medium: { value: '6px' },
      large: { value: '8px' },
    },
  },
  overrides: [
    {
      colorMode: 'dark',
      tokens: {
        colors: {
          background: {
            primary: { value: '#111111' },
            secondary: { value: '#1a1a1a' },
          },
          border: {
            primary: { value: 'rgba(255, 255, 255, 0.15)' },
          },
          font: {
            primary: { value: 'rgba(255, 255, 255, 0.92)' },
            secondary: { value: 'rgba(255, 255, 255, 0.6)' },
          },
          brand: {
            primary: {
              10: { value: 'rgba(255, 179, 0, 0.15)' },
              80: { value: '#ffb300' },
              90: { value: '#ffb300' },
              100: { value: '#ffb300' },
            },
          },
        },
      },
    },
  ],
});

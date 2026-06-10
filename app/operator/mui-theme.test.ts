import { getOperatorTheme } from '@/app/operator/mui-theme';

describe('getOperatorTheme', () => {
  it('derives palette mode and paper color from the resolved theme mode', () => {
    const darkTheme = getOperatorTheme('dark');
    const lightTheme = getOperatorTheme('light');

    expect(darkTheme.palette.mode).toBe('dark');
    expect(lightTheme.palette.mode).toBe('light');
    expect(darkTheme.palette.background.paper).not.toBe(lightTheme.palette.background.paper);
  });
});

import { amplifyTheme } from './amplify-theme';

describe('amplifyTheme', () => {
  it("sets the design system's body font, not Amplify's Inter", () => {
    const fonts = amplifyTheme.tokens.fonts?.default;
    expect(fonts?.variable?.value).toBe('var(--font-body)');
    expect(fonts?.static?.value).toBe('var(--font-body)');
  });
});

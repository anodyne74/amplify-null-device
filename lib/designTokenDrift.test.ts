import { compareTokens, normaliseValue, parseTokens } from './designTokenDrift';

describe('normaliseValue', () => {
  it('ignores case, spacing, leading zeros and trailing decimal zeros', () => {
    expect(normaliseValue(' #5D65E6 ')).toBe('#5d65e6');
    expect(normaliseValue('0 1px 3px rgba(13, 13, 13, 0.07)')).toBe('0 1px 3px rgba(13,13,13,.07)');
    expect(normaliseValue('rgba(13,13,13,.10)')).toBe('rgba(13,13,13,.1)');
    expect(normaliseValue('rgba(255,255,255,.30)')).toBe('rgba(255,255,255,.3)');
    expect(normaliseValue('1.50')).toBe('1.5');
  });

  it('keeps whole numbers and zero values intact', () => {
    expect(normaliseValue('100px')).toBe('100px');
    expect(normaliseValue('0px')).toBe('0px');
    expect(normaliseValue('0ms')).toBe('0ms');
    expect(normaliseValue('-0.02em')).toBe('-.02em');
    expect(normaliseValue('0em')).toBe('0em');
  });

  it('treats quote styles as the same', () => {
    expect(normaliseValue("'Manrope', system-ui")).toBe(normaliseValue('"Manrope",system-ui'));
  });
});

describe('parseTokens', () => {
  it('reads custom properties, several to a line, and ignores comments and ordinary properties', () => {
    const css = `:root{ /* c */ --a:1px;--b:#FFF; color:red; }`;
    expect(parseTokens(css)).toEqual([
      { scope: 'default', name: '--a', value: '1px' },
      { scope: 'default', name: '--b', value: '#fff' },
    ]);
  });

  it('puts :root and a theme block that also matches :root in the same default scope', () => {
    const css = `:root,\n[data-theme='light'] { --a: 1; }`;
    expect(parseTokens(css)).toEqual([{ scope: 'default', name: '--a', value: '1' }]);
  });

  it('reads the night theme however its selector is written', () => {
    const design = parseTokens(`[data-theme="dark"],[data-theme="night"]{ --a: 1; }`);
    const repo = parseTokens(`[data-theme='dark'],\n[data-theme='night'] { --a: 1; }`);
    expect(design).toEqual([{ scope: 'night', name: '--a', value: '1' }]);
    expect(repo).toEqual(design);
  });

  it('puts properties inside prefers-reduced-motion in their own scope', () => {
    const css = `:root{ --d:250ms; } @media (prefers-reduced-motion:reduce){:root{ --d:0ms; }}`;
    expect(parseTokens(css)).toEqual([
      { scope: 'default', name: '--d', value: '250ms' },
      { scope: 'reduced-motion', name: '--d', value: '0ms' },
    ]);
  });
});

describe('compareTokens', () => {
  const token = (name: string, value: string, scope = 'default') => ({ scope, name, value });

  it('finds changed, missing and extra tokens, scope by scope', () => {
    const design = [token('--a', '1'), token('--b', '2'), token('--c', '3'), token('--a', 'night-a', 'night')];
    const repo = [token('--a', '1'), token('--b', '9'), token('--d', '4'), token('--a', 'night-a', 'night')];

    expect(compareTokens(design, repo)).toEqual({
      changed: [{ scope: 'default', name: '--b', design: '2', repo: '9' }],
      missing: [{ scope: 'default', name: '--c', design: '3' }],
      extra: [{ scope: 'default', name: '--d', repo: '4' }],
    });
  });

  it('treats the same name in two scopes as two tokens', () => {
    const design = [token('--a', '1'), token('--a', '2', 'night')];
    const repo = [token('--a', '1')];
    expect(compareTokens(design, repo).missing).toEqual([{ scope: 'night', name: '--a', design: '2' }]);
  });

  it('finds nothing when they match', () => {
    const same = [token('--a', '1')];
    expect(compareTokens(same, same)).toEqual({ changed: [], missing: [], extra: [] });
  });
});

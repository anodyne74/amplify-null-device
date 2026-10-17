/**
 * Compares the CSS custom properties in app/components/ui/tokens.css with the
 * design system's tokens/*.css, scope by scope. The design system is the source
 * of the visual language and tokens.css is a hand port of it; this says where
 * the port has drifted. Pure: scripts/design-token-drift.ts reads the files.
 *
 * A scope is where a property is declared: the default theme, the night theme,
 * or reduced motion. The same property in two scopes is two tokens. Values are
 * compared after normalising spacing, case and leading zeros, so only a real
 * difference counts.
 */

export type TokenScope = 'default' | 'night' | 'reduced-motion' | string;

export interface Token {
  scope: TokenScope;
  name: string;
  value: string;
}

export interface TokenDrift {
  /** In both, with different values. */
  changed: Array<{ scope: TokenScope; name: string; design: string; repo: string }>;
  /** In the design system, not in the repo. */
  missing: Array<{ scope: TokenScope; name: string; design: string }>;
  /** In the repo, not in the design system. Informational: the app adds its own. */
  extra: Array<{ scope: TokenScope; name: string; repo: string }>;
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** A stable form of a value: lower case, no space after commas or inside brackets, `.5` not `0.50`. */
export function normaliseValue(value: string): string {
  return value
    .replace(/!important/gi, '')
    .replace(/["']/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/(^|[^\d.])0+\.(\d)/g, '$1.$2')
    .replace(/(\.\d*?)0+(?=\D|$)/g, '$1')
    .replace(/\.(?=\D|$)/g, '')
    .trim()
    .toLowerCase();
}

/** Which scope a rule's selector list (and enclosing at-rules) declares into. */
function scopeOf(selectors: string[], atRules: string[]): TokenScope {
  const list = selectors.flatMap((selector) => selector.split(',')).map((selector) => selector.replace(/["']/g, '"').replace(/\s+/g, '').trim());
  const base = list.includes(':root')
    ? 'default'
    : list.some((selector) => /^\[data-theme="(dark|night)"\]$/.test(selector))
      ? 'night'
      : list.join(',');
  return atRules.some((rule) => /prefers-reduced-motion/.test(rule)) ? `reduced-motion` : base;
}

/** Every custom property declared in `css`, with the scope it is declared in. */
export function parseTokens(css: string): Token[] {
  const tokens: Token[] = [];
  const text = stripComments(css);
  const stack: Array<{ kind: 'rule' | 'at'; text: string }> = [];
  let buffer = '';

  const declarations = (body: string) => {
    for (const declaration of body.split(';')) {
      const match = declaration.match(/^\s*(--[A-Za-z0-9_-]+)\s*:([\s\S]+)$/);
      if (!match) continue;
      const selectors = stack.filter((entry) => entry.kind === 'rule').map((entry) => entry.text);
      const atRules = stack.filter((entry) => entry.kind === 'at').map((entry) => entry.text);
      tokens.push({ scope: scopeOf(selectors.slice(-1), atRules), name: match[1], value: normaliseValue(match[2]) });
    }
  };

  for (const char of text) {
    if (char === '{') {
      const head = buffer.trim();
      stack.push({ kind: head.startsWith('@') ? 'at' : 'rule', text: head });
      buffer = '';
    } else if (char === '}') {
      declarations(buffer);
      buffer = '';
      stack.pop();
    } else {
      buffer += char;
    }
  }
  return tokens;
}

const keyOf = (token: { scope: TokenScope; name: string }) => `${token.scope}\u0000${token.name}`;

/** Where `repo` differs from `design`. A property declared twice in one scope keeps its last value, as CSS does. */
export function compareTokens(design: readonly Token[], repo: readonly Token[]): TokenDrift {
  const designByKey = new Map(design.map((token) => [keyOf(token), token]));
  const repoByKey = new Map(repo.map((token) => [keyOf(token), token]));
  const drift: TokenDrift = { changed: [], missing: [], extra: [] };

  for (const [key, token] of designByKey) {
    const other = repoByKey.get(key);
    if (!other) drift.missing.push({ scope: token.scope, name: token.name, design: token.value });
    else if (other.value !== token.value) {
      drift.changed.push({ scope: token.scope, name: token.name, design: token.value, repo: other.value });
    }
  }
  for (const [key, token] of repoByKey) {
    if (!designByKey.has(key)) drift.extra.push({ scope: token.scope, name: token.name, repo: token.value });
  }
  return drift;
}

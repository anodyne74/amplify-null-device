import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.join(__dirname, '..', 'globals.css'), 'utf8');

// Every selector in globals.css whose subject is a plain <button>.
function buttonSelectors(): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const preludes = withoutComments.match(/[^{}]+(?=\{)/g) ?? [];
  return preludes
    .flatMap((prelude) => prelude.split(','))
    .map((selector) => selector.trim())
    .filter((selector) => /^button\b/.test(selector));
}

// (ids, classes + attributes + pseudo-classes, elements). `:where()` counts for
// nothing, whatever is inside it. Enough for the simple selectors in this file.
function specificity(selector: string): [number, number, number] {
  let rest = selector;
  while (rest.includes(':where(')) {
    rest = rest.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '');
  }
  rest = rest.replace(/:not\(([^()]*)\)/g, ' $1');
  const ids = rest.match(/#[\w-]+/g)?.length ?? 0;
  const classes = rest.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g)?.length ?? 0;
  const elements = rest.match(/(?:^|[\s>+~])[a-z][\w-]*|::[\w-]+/g)?.length ?? 0;
  return [ids, classes, elements];
}

describe('global plain-button style', () => {
  it('is styled at all', () => {
    expect(buttonSelectors().length).toBeGreaterThan(0);
  });

  // A component's own class, e.g. a CSS-module `.sortButton`, scores (0,1,0).
  // The global default must lose to it, including on hover and focus (#445).
  it.each(buttonSelectors())('%s weighs no more than a bare element', (selector) => {
    expect(specificity(selector)).toEqual([0, 0, 1]);
  });

  it('still leaves nd-btn and Amplify buttons alone', () => {
    for (const selector of buttonSelectors()) {
      expect(selector).toContain(':not(.amplify-button):not(.nd-btn)');
    }
  });
});

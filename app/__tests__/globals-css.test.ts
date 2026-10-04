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

describe('global plain-button style', () => {
  it('finds the plain-button rules', () => {
    expect(buttonSelectors().length).toBeGreaterThan(0);
  });

  // `:where()` adds no specificity, so `button:where(...)` weighs the same as
  // `button` and loses to any class a component applies, e.g. a CSS-module
  // `.sortButton`, including on hover and focus.
  it.each(buttonSelectors())('%s weighs no more than a bare element (#445)', (selector) => {
    expect(selector).toMatch(/^button:where\(.+\)$/);
  });

  it('still leaves nd-btn and Amplify buttons alone', () => {
    for (const selector of buttonSelectors()) {
      expect(selector).toContain(':not(.amplify-button):not(.nd-btn)');
    }
  });
});

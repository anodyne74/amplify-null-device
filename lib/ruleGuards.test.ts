import fs from 'node:fs';
import path from 'node:path';

// Domain rules that live in one module. A source file that reads the raw
// fields instead of asking the owner is the bug these catch.
const RULES = [
  {
    rule: 'the Removed Stop rule',
    owner: path.join('lib', 'loadChange.ts'),
    pattern: /\bstop\.removed\b/,
    use: 'activeStops() or isStopRemoved()',
  },
  {
    rule: 'a completed Route',
    owner: path.join('lib', 'signRunPhase.ts'),
    pattern: /=== 'completed' \|\| [\w.?]+ === 'archived'|!== 'completed' && [\w.?]+ !== 'archived'/,
    use: 'isRouteCompleted()',
  },
];

const root = path.resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(relative);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}

const files = [...sourceFiles('lib'), ...sourceFiles('app')];

describe.each(RULES)('$rule', ({ owner, pattern, use }) => {
  it(`is read through ${owner}, with ${use}`, () => {
    const offenders = files
      .filter((file) => file !== owner)
      .filter((file) => pattern.test(fs.readFileSync(path.join(root, file), 'utf8')));

    expect(offenders).toEqual([]);
  });
});

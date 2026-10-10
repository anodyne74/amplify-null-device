import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const owner = path.join('lib', 'loadChange.ts');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(relative);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}

describe('the Removed Stop rule', () => {
  it('is read through lib/loadChange.ts, never off a Stop directly', () => {
    const offenders = [...sourceFiles('lib'), ...sourceFiles('app')]
      .filter((file) => file !== owner)
      .filter((file) => /\bstop\.removed\b/.test(fs.readFileSync(path.join(root, file), 'utf8')));

    expect(offenders).toEqual([]);
  });
});

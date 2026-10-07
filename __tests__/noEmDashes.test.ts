/**
 * Guard for #505: copy never uses an em-dash as punctuation. A string that is exactly "—" is the
 * empty-value placeholder and stays. Comments are not copy, so they are skipped.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const EM_DASH = '—';
const ROOTS = ['app', 'lib', 'amplify'];
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__', '.amplify']);

export function findEmDashCopy(fileName: string, source: string): string[] {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const report = (node: ts.Node, text: string) => {
    if (!text.includes(EM_DASH) || text === EM_DASH) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    found.push(`${fileName}:${line + 1}`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) report(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) report(node, node.text);
    else if (ts.isJsxText(node)) report(node, node.text.trim());
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('findEmDashCopy', () => {
  it('flags em-dashes in strings, template text and JSX text', () => {
    expect(findEmDashCopy('a.tsx', `const a = 'Foo ${EM_DASH} bar';`)).toHaveLength(1);
    expect(findEmDashCopy('a.tsx', 'const a = `Foo ${x} ' + EM_DASH + ' bar`;')).toHaveLength(1);
    expect(findEmDashCopy('a.tsx', `const a = <p>Foo ${EM_DASH} bar</p>;`)).toHaveLength(1);
  });

  it('allows the empty-value placeholder and comments', () => {
    expect(findEmDashCopy('a.tsx', `const a = x ?? '${EM_DASH}'; const b = <span>${EM_DASH}</span>;`)).toEqual([]);
    expect(findEmDashCopy('a.ts', `// a ${EM_DASH} b\n/* c ${EM_DASH} d */ const a = 1;`)).toEqual([]);
  });
});

describe('copy in app/, lib/ and amplify/', () => {
  it('has no em-dash outside the "—" placeholder', () => {
    const offenders = ROOTS.flatMap((root) =>
      sourceFiles(path.join(process.cwd(), root)).flatMap((file) =>
        findEmDashCopy(path.relative(process.cwd(), file), fs.readFileSync(file, 'utf8')),
      ),
    );
    expect(offenders).toEqual([]);
  });
});

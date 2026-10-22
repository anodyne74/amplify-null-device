/**
 * Reports where app/components/ui/tokens.css has drifted from the design
 * system's tokens/*.css (lib/designTokenDrift.ts).
 *
 *   npm run check:design-tokens -- <dir>
 *
 * <dir> holds a copy of the design system's token files (colors.css,
 * semantic.css, elevation.css, motion.css, radius.css, spacing.css,
 * typography.css). The design project needs a claude.ai login to read, so fetch
 * them first -- ask Claude to read tokens/*.css from the "Null Device Design
 * System" project into a folder. fonts.css and base.css are skipped: tokens.css
 * deliberately doesn't port them (see its header).
 *
 * Exits 1 if any design token is missing from, or differs in, the repo. Tokens
 * only the repo has are listed but don't fail the check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { compareTokens, parseTokens } from '../lib/designTokenDrift';

const SKIPPED = new Set(['fonts.css', 'base.css']);

// Differences that are deliberate. Listed, never failed on. Anything else that differs fails the check.
const INTENTIONAL: Record<string, string> = {
  '--font-display': 'tokens.css puts the app\'s next/font variable first (see its header)',
  '--font-body': 'tokens.css puts the app\'s next/font variable first (see its header)',
  '--font-mono': 'tokens.css puts the app\'s next/font variable first (see its header)',
};
// npm runs scripts from the repo root.
const repoFile = path.resolve(process.cwd(), 'app', 'components', 'ui', 'tokens.css');

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: npm run check:design-tokens -- <dir with the design system tokens/*.css>');
  process.exit(2);
}

const files = fs.readdirSync(dir).filter((file) => file.endsWith('.css') && !SKIPPED.has(file));
if (files.length === 0) {
  console.error(`No token files found in ${dir}.`);
  process.exit(2);
}

const design = files.flatMap((file) => parseTokens(fs.readFileSync(path.join(dir, file), 'utf8')));
const repo = parseTokens(fs.readFileSync(repoFile, 'utf8'));
const found = compareTokens(design, repo);
const drift = {
  ...found,
  changed: found.changed.filter((token) => !(token.name in INTENTIONAL)),
};
const intentional = found.changed.filter((token) => token.name in INTENTIONAL);

const where = (scope: string) => (scope === 'default' ? '' : ` [${scope}]`);
const section = (title: string, lines: string[]) => {
  console.log(`\n${title} (${lines.length})`);
  lines.forEach((line) => console.log(`  ${line}`));
};

console.log(`Compared ${design.length} design tokens from ${files.length} files with ${repo.length} in tokens.css.`);
section('Changed', drift.changed.map((t) => `${t.name}${where(t.scope)}: design ${t.design}  |  repo ${t.repo}`));
section('Intentional differences (not a failure)', intentional.map((t) => `${t.name}${where(t.scope)}: ${INTENTIONAL[t.name]}`));
section('Missing from the repo', drift.missing.map((t) => `${t.name}${where(t.scope)}: ${t.design}`));
section('Only in the repo (not a failure)', drift.extra.map((t) => `${t.name}${where(t.scope)}: ${t.repo}`));

process.exit(drift.changed.length + drift.missing.length > 0 ? 1 : 0);

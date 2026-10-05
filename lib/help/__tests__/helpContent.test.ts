/**
 * Guards the customer user guide's content (#485): every page in
 * content/help/ is bundled, valid, and speaks the customer glossary.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HELP_SOURCES } from '@/lib/help/helpContent.generated';
import { FEATURE_FLAG_NAMES } from '@/lib/featureFlags';
import { helpPages, fillHelpPlaceholders, parseHelpPage, selectFlaggedText } from '@/lib/help/helpPages';

const root = path.resolve(__dirname, '../../..');
const contentDir = path.join(root, 'content/help');
const files = fs.readdirSync(contentDir).filter((file) => file.endsWith('.md'));

/** Everything a Customer could read on a page: its title, summary and body, every flag branch included. */
const readable = (slug: string) => {
  const page = parseHelpPage(slug, HELP_SOURCES[slug]);
  return [page.title, page.summary, page.body.replace(/^:::.*$/gm, '')].join('\n');
};

/**
 * Terms from CONTEXT.md's _Avoid_ lines. A term qualified "(when …)", "(except …)"
 * or "(as …)" is only wrong in some senses, which a test can't tell, so it's skipped,
 * as is any term that is itself a glossary name (e.g. "Visit").
 */
function avoidTerms(): string[] {
  const context = fs.readFileSync(path.join(root, 'CONTEXT.md'), 'utf8');
  const names = new Set([...context.matchAll(/^\*\*(.+?)\*\*:/gm)].map((m) => m[1].toLowerCase()));
  const terms: string[] = [];
  for (const [, list] of context.matchAll(/^_Avoid_:(.*)$/gm)) {
    const firstSentence = list.split(/\.\s/)[0];
    for (const raw of firstSentence.split(',')) {
      const qualified = /\((when|except|as)\b/i.test(raw);
      const term = raw.replace(/\(.*?\)?$/, '').replace(/\(.*$/, '').trim().replace(/\.$/, '');
      if (!term || qualified || names.has(term.toLowerCase())) continue;
      terms.push(...term.split('/').map((t) => t.trim()));
    }
  }
  return terms;
}

const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('customer help content', () => {
  it('is bundled exactly as written (run `npm run generate:help` after editing content/help/)', () => {
    const onDisk = Object.fromEntries(files.map((file) => [file.replace(/\.md$/, ''), fs.readFileSync(path.join(contentDir, file), 'utf8')]));
    expect(HELP_SOURCES).toEqual(onDisk);
  });

  it('has the eleven pages, in order, each with its own place', () => {
    expect(helpPages().map((page) => page.slug)).toEqual([
      'getting-started',
      'request-a-route',
      'change-a-route',
      'follow-a-route',
      'route-feedback',
      'invoices-and-billed-time',
      'route-defaults',
      'users',
      'property-history',
      'settings',
      'glossary',
    ]);
    expect(new Set(helpPages().map((page) => page.order)).size).toBe(helpPages().length);
  });

  it('keeps invoices, Route Defaults and users to Account Owners, and Property History behind its flag', () => {
    const access = Object.fromEntries(helpPages().map((page) => [page.slug, [page.role, page.flag]]));
    expect(access['invoices-and-billed-time']).toEqual(['account_owner', null]);
    expect(access['route-defaults']).toEqual(['account_owner', null]);
    expect(access.users).toEqual(['account_owner', null]);
    expect(access['property-history']).toEqual(['any', 'property-history']);
    for (const slug of ['getting-started', 'request-a-route', 'change-a-route', 'follow-a-route', 'route-feedback', 'settings', 'glossary']) {
      expect(access[slug]).toEqual(['any', null]);
    }
  });

  it('opens from customer screens that exist, each claimed by one page at most', () => {
    const screens = helpPages().flatMap((page) => page.screens);
    expect(new Set(screens).size).toBe(screens.length);
    for (const screen of screens) {
      expect(fs.existsSync(path.join(root, 'app', screen, 'page.tsx'))).toBe(true);
    }
  });

  it.each(helpPages().map((page) => [page.slug, page] as const))('%s links only to help pages that exist', (_slug, page) => {
    const slugs = new Set(helpPages().map((p) => p.slug));
    for (const [, target] of page.body.matchAll(/\]\(\/customer\/help\/([^)]+)\)/g)) {
      expect(slugs).toContain(target);
    }
    expect(page.body).not.toMatch(/\]\(\/(?!customer\/help\/)/);
  });

  it.each(files)('%s uses only known placeholders and flags', (file) => {
    const source = HELP_SOURCES[file.replace(/\.md$/, '')];
    expect(() => fillHelpPlaceholders(source)).not.toThrow();
    for (const on of [true, false]) {
      expect(() => selectFlaggedText(source, () => on)).not.toThrow();
    }
    for (const [, flag] of source.matchAll(/^:::if\s+(\S+)/gm)) {
      expect(FEATURE_FLAG_NAMES).toContain(flag);
    }
  });

  it.each(files)('%s never hard-codes a Null Device address or domain', (file) => {
    const source = HELP_SOURCES[file.replace(/\.md$/, '')];
    expect(source).not.toMatch(/@nulldevice\.|nulldevice\.dev|nulldevice\.com\.au/i);
  });

  it.each(files)('%s never mentions operators, staff or drivers, or uses a term the glossary avoids', (file) => {
    const text = readable(file.replace(/\.md$/, ''));
    const banned = ['operator', 'staff', 'driver', ...avoidTerms()];
    const found = banned.filter((term) => new RegExp(`\\b${escape(term)}(s|es)?\\b`, 'i').test(text));
    expect(found).toEqual([]);
  });

  it('reads the avoided terms from CONTEXT.md', () => {
    const terms = avoidTerms().map((t) => t.toLowerCase());
    expect(terms).toEqual(expect.arrayContaining(['order', 'teammate', 'preferences', 'skipped', 'export']));
    expect(terms).not.toContain('visit');
    expect(terms).not.toContain('completed');
  });

  it('defines every term a Customer sees in the glossary', () => {
    const glossary = HELP_SOURCES.glossary;
    for (const term of [
      'Route',
      'Stop',
      'Property',
      'Placement Date',
      'Pickup Date',
      'Route Request',
      'Route Amendment',
      'Schedule',
      'Signs Placed',
      'Signs Collected',
      'Missing Signs',
      "Couldn't Collect",
      'Removed Stop',
      'Billed Time',
      'Route Feedback',
      'Account Owner',
      'Route Defaults',
    ]) {
      expect(glossary).toContain(`**${term}**:`);
    }
  });
});

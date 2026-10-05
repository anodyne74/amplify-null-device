/**
 * The customer user guide (#485): Markdown pages in content/help/, bundled by
 * scripts/build-help-content.mjs. Each page's front matter says who may see
 * it; a page someone can't see isn't listed, linked or reachable, the same
 * "see no sign of it" rule as Feature Flags (CONTEXT.md).
 *
 * Front matter, one `key: value` per line between `---` lines:
 *   title, summary, order   required
 *   role                    `any` (default) or `account_owner`
 *   flag                    a Feature Flag the page needs, if any
 *   screens                 comma-separated customer paths whose "?" link opens this page
 *
 * Text that depends on a Feature Flag goes between `:::if <flag>` and
 * `:::end` lines, with an optional `:::else` (see selectFlaggedText).
 */

import { isFeatureFlagName, type FeatureFlagName } from '@/lib/featureFlags';
import { BILLING_EMAIL, REQUESTS_EMAIL, SUPPORT_EMAIL } from '@/lib/publicAppConfig';
import { HELP_SOURCES } from '@/lib/help/helpContent.generated';

export type HelpPageRole = 'any' | 'account_owner';

export interface HelpPage {
  slug: string;
  title: string;
  summary: string;
  order: number;
  role: HelpPageRole;
  flag: FeatureFlagName | null;
  screens: string[];
  /** Markdown, with placeholders still in it (see fillHelpPlaceholders). */
  body: string;
}

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n?/;
const KEYS = ['title', 'summary', 'order', 'role', 'flag', 'screens'];

export function parseHelpPage(slug: string, source: string): HelpPage {
  const refuse = (problem: string): never => {
    throw new Error(`Help page ${slug}: ${problem}`);
  };
  const match = FRONT_MATTER.exec(source);
  if (!match) return refuse('no front matter');

  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n').filter((l) => l.trim())) {
    const separator = line.indexOf(':');
    const key = line.slice(0, separator).trim();
    if (separator === -1 || !KEYS.includes(key)) refuse(`unknown front matter "${line}"`);
    fields[key] = line.slice(separator + 1).trim();
  }

  const order = Number(fields.order);
  const role = fields.role ?? 'any';
  const flag = fields.flag ?? null;
  if (!fields.title) refuse('no title');
  if (!fields.summary) refuse('no summary');
  if (!fields.order || !Number.isInteger(order)) refuse('no order');
  if (role !== 'any' && role !== 'account_owner') refuse(`unknown role "${role}"`);
  if (flag !== null && !isFeatureFlagName(flag)) refuse(`unknown flag "${flag}"`);

  return {
    slug,
    title: fields.title,
    summary: fields.summary,
    order,
    role: role as HelpPageRole,
    flag: flag as FeatureFlagName | null,
    screens: (fields.screens ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    body: source.slice(match[0].length).trim(),
  };
}

let parsed: HelpPage[] | null = null;

/** Every help page, in reading order. Parsed on first use, not on import, so
 *  a page that won't parse can't break screens while customer-help is off. */
export function helpPages(): HelpPage[] {
  parsed ??= Object.entries(HELP_SOURCES)
    .map(([slug, source]) => parseHelpPage(slug, source))
    .sort((a, b) => a.order - b.order);
  return parsed;
}

export function helpHref(slug: string): string {
  return `/customer/help/${slug}`;
}

export interface HelpViewer {
  role: 'account_owner' | 'read_only';
  isOn: (flag: FeatureFlagName) => boolean;
}

export function canSeeHelpPage(page: HelpPage, viewer: HelpViewer): boolean {
  if (page.role === 'account_owner' && viewer.role !== 'account_owner') return false;
  return page.flag === null || viewer.isOn(page.flag);
}

/** The page a customer screen's "?" link opens, or null if none covers it. */
export function helpPageForPath(pathname: string, pages: readonly HelpPage[] = helpPages()): HelpPage | null {
  return pages.find((page) => page.screens.some((screen) => pathname === screen || pathname.startsWith(`${screen}/`))) ?? null;
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** The values help pages may use, written `{{name}}`: addresses follow the branch's domain. */
export const HELP_PLACEHOLDERS: Record<string, string> = {
  requestsEmail: REQUESTS_EMAIL,
  supportEmail: SUPPORT_EMAIL,
  billingEmail: BILLING_EMAIL,
};

export function fillHelpPlaceholders(text: string, values: Record<string, string> = HELP_PLACEHOLDERS): string {
  return text.replace(PLACEHOLDER, (_whole, name: string) => {
    if (!(name in values)) throw new Error(`Unknown help placeholder {{${name}}}`);
    return values[name];
  });
}

const FLAG_LINE = /^:::(if\s+(\S+)|else|end)\s*$/;

/** A page body with each `:::if <flag>` block reduced to the branch that applies. */
export function selectFlaggedText(text: string, isOn: (flag: FeatureFlagName) => boolean): string {
  const kept: string[] = [];
  let block: { on: boolean; inElse: boolean } | null = null;
  for (const line of text.split('\n')) {
    const marker = FLAG_LINE.exec(line.trim());
    if (marker?.[2] !== undefined) {
      if (block) throw new Error('A :::if block inside another in help text');
      if (!isFeatureFlagName(marker[2])) throw new Error(`Unknown flag in help text: ${marker[2]}`);
      block = { on: isOn(marker[2]), inElse: false };
    } else if (marker) {
      if (!block) throw new Error(`A :::${marker[1]} with no :::if in help text`);
      if (marker[1] === 'else') block.inElse = true;
      else block = null;
    } else if (!block || block.on !== block.inElse) {
      kept.push(line);
    }
  }
  if (block) throw new Error('Unclosed :::if block in help text');
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** What a reader sees of a page's body: its flagged text resolved and its placeholders filled. */
export function helpPageBody(page: HelpPage, isOn: (flag: FeatureFlagName) => boolean): string {
  return fillHelpPlaceholders(selectFlaggedText(page.body, isOn));
}

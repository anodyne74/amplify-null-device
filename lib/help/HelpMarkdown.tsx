import Link from 'next/link';
import type { ReactNode } from 'react';
import { helpHref } from '@/lib/help/helpPages';

/**
 * The small Markdown subset help pages are written in (#485): `##`/`###`
 * headings, paragraphs, `-` and `1.` lists, `**bold**` and `[text](href)`
 * links. Text is always rendered as text, never as HTML. Links go only to
 * email, https or help pages; anything else, and a help page the reader
 * can't see, is left as plain text, so hidden pages are never linked.
 */

const HELP_PREFIX = helpHref('');
const OUTSIDE_LINK = /^(mailto:|https:\/\/)/;
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function inline(text: string, canSeeHelpPage: (slug: string) => boolean): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const key = `${index}`;
    const [, bold, label, href] = match;
    if (bold !== undefined) {
      nodes.push(<strong key={key}>{inline(bold, canSeeHelpPage)}</strong>);
    } else if (href.startsWith(HELP_PREFIX)) {
      nodes.push(
        canSeeHelpPage(href.slice(HELP_PREFIX.length)) ? (
          <Link key={key} href={href}>
            {label}
          </Link>
        ) : (
          label
        )
      );
    } else if (OUTSIDE_LINK.test(href)) {
      nodes.push(
        <a key={key} href={href}>
          {label}
        </a>
      );
    } else {
      nodes.push(label);
    }
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

const LIST_ITEM = /^(-|\d+\.)\s+(.*)$/;

function blocks(source: string): Block[] {
  const result: Block[] = [];
  for (const chunk of source.split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const heading = /^(#{2,3})\s+(.*)$/.exec(lines[0]);
    if (heading && lines.length === 1) {
      result.push({ kind: 'heading', level: heading[1].length as 2 | 3, text: heading[2] });
    } else if (lines.every((line) => LIST_ITEM.test(line))) {
      result.push({ kind: 'list', ordered: !lines[0].startsWith('-'), items: lines.map((line) => LIST_ITEM.exec(line)![2]) });
    } else {
      result.push({ kind: 'paragraph', text: lines.join(' ') });
    }
  }
  return result;
}

export function HelpMarkdown({ source, canSeeHelpPage }: { source: string; canSeeHelpPage: (slug: string) => boolean }) {
  return (
    <>
      {blocks(source).map((block, index) => {
        if (block.kind === 'heading') {
          const Heading = block.level === 2 ? 'h2' : 'h3';
          return <Heading key={index}>{inline(block.text, canSeeHelpPage)}</Heading>;
        }
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={index}>
              {block.items.map((item, i) => (
                <li key={i}>{inline(item, canSeeHelpPage)}</li>
              ))}
            </List>
          );
        }
        return <p key={index}>{inline(block.text, canSeeHelpPage)}</p>;
      })}
    </>
  );
}

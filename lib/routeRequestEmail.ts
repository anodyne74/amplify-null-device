/**
 * Reading an email sent to requests@ into the record an administrator reviews
 * (#358, ADR 0008): who sent it and when, its subject and plain-text body, its
 * attachments, and SES's SPF/DKIM/DMARC verdicts. The raw message in the
 * inbound bucket stays the evidence; this is what's extracted from it.
 *
 * Pure: no AWS calls and no `@/` imports, so the capture Lambda can bundle it.
 */
import PostalMime from 'postal-mime';

/** What SES tells the capture about one received message. */
export interface SesReceipt {
  /** SES's message ID -- also the raw message's key in the inbound bucket. */
  messageId: string;
  /** When SES received the message. */
  timestamp: string;
  spfVerdict: string | null;
  dkimVerdict: string | null;
  dmarcVerdict: string | null;
}

export interface RequestEmailFields {
  fromName: string | null;
  fromAddress: string;
  sentAt: string;
  receivedAt: string;
  subject: string | null;
  bodyText: string;
  spfVerdict: string | null;
  dkimVerdict: string | null;
  dmarcVerdict: string | null;
  rawMessageKey: string;
  loggedByStaff: boolean;
}

export interface RequestEmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  /** An inline part, such as a signature logo, rather than an attached file. */
  inline: boolean;
  content: Uint8Array;
}

/** The longest body kept on the record; the raw message always has all of it. */
const MAX_BODY_CHARS = 100_000;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** A readable plain-text version of an HTML body. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] === '#') {
        const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isNaN(point) ? entity : String.fromCodePoint(point);
      }
      return ENTITIES[code.toLowerCase()] ?? entity;
    })
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join('\n')
    .trim();
}

function toBytes(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof content === 'string') return new TextEncoder().encode(content);
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}

function domainOf(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1).toLowerCase();
}

/** Reads a received message into the record's fields and its attachments. */
export async function parseRequestEmail(
  raw: Uint8Array | ArrayBuffer,
  receipt: SesReceipt,
  ownDomain: string
): Promise<{ record: RequestEmailFields; attachments: RequestEmailAttachment[] }> {
  const email = await PostalMime.parse(raw);
  const fromAddress = (email.from?.address ?? '').toLowerCase();
  const sentAt = email.date && !Number.isNaN(Date.parse(email.date)) ? new Date(email.date).toISOString() : receipt.timestamp;
  const text = email.text?.trim() ? email.text : htmlToText(email.html ?? '');

  return {
    record: {
      fromName: email.from?.name || null,
      fromAddress,
      sentAt,
      receivedAt: receipt.timestamp,
      subject: email.subject ?? null,
      bodyText: text.replace(/\r\n/g, '\n').trim().slice(0, MAX_BODY_CHARS),
      spfVerdict: receipt.spfVerdict,
      dkimVerdict: receipt.dkimVerdict,
      dmarcVerdict: receipt.dmarcVerdict,
      rawMessageKey: receipt.messageId,
      loggedByStaff: Boolean(fromAddress) && domainOf(fromAddress) === ownDomain.toLowerCase(),
    },
    attachments: email.attachments.map((attachment, index) => {
      const content = toBytes(attachment.content);
      return {
        filename: attachment.filename || `attachment-${index + 1}`,
        contentType: attachment.mimeType,
        size: content.byteLength,
        inline: attachment.disposition === 'inline' || Boolean(attachment.related),
        content,
      };
    }),
  };
}

/** Domains many unrelated people send from, so sharing one says nothing about the Customer. */
const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.com.au',
  'hotmail.com',
  'hotmail.com.au',
  'live.com',
  'live.com.au',
  'yahoo.com',
  'yahoo.com.au',
  'icloud.com',
  'me.com',
  'bigpond.com',
  'bigpond.net.au',
  'optusnet.com.au',
]);

/**
 * The Customer the sender probably belongs to: the one with a Customer User at
 * that address, else the only one with Customer Users at that domain (never a
 * public mail service). Only a suggestion -- nothing is linked automatically.
 */
export function suggestCustomer(
  fromAddress: string,
  customerUsers: ReadonlyArray<{ customerId: string; email?: string | null }>
): string | null {
  const address = fromAddress.trim().toLowerCase();
  if (!address.includes('@')) return null;

  const exact = customerUsers.find((user) => user.email?.trim().toLowerCase() === address);
  if (exact) return exact.customerId;

  const domain = domainOf(address);
  if (PUBLIC_MAIL_DOMAINS.has(domain)) return null;
  const sameDomain = new Set(
    customerUsers.filter((user) => user.email && domainOf(user.email.trim()) === domain).map((user) => user.customerId)
  );
  return sameDomain.size === 1 ? [...sameDomain][0] : null;
}

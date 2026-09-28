/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  htmlToText,
  parseRequestEmail,
  requestAttachmentKey,
  suggestCustomer,
  type SesReceipt,
} from './routeRequestEmail';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', 'route-requests', name));

const PASSING: SesReceipt = {
  messageId: 'ses-msg-1',
  timestamp: '2026-09-27T23:16:02.000Z',
  spfVerdict: 'PASS',
  dkimVerdict: 'PASS',
  dmarcVerdict: 'PASS',
};

describe('parseRequestEmail', () => {
  it('takes the sender, times, subject, text body, verdicts and raw key from an email with attachments', async () => {
    const parsed = await parseRequestEmail(fixture('two-attachments.eml'), PASSING, 'nulldevice.dev');

    expect(parsed.record).toEqual({
      fromName: 'Ann Agent',
      fromAddress: 'ann.agent@harcourts.com.au',
      sentAt: '2026-09-27T23:15:00.000Z',
      receivedAt: '2026-09-27T23:16:02.000Z',
      subject: 'Route for Tuesday 6 Oct',
      bodyText: 'Hi team,\n\nPlease schedule the attached properties for Tuesday.\n\nAnn',
      spfVerdict: 'PASS',
      dkimVerdict: 'PASS',
      dmarcVerdict: 'PASS',
      rawMessageKey: 'ses-msg-1',
      loggedByStaff: false,
    });
  });

  it('keeps every attachment, marking the ones that were inline parts', async () => {
    const { attachments } = await parseRequestEmail(fixture('two-attachments.eml'), PASSING, 'nulldevice.dev');

    expect(attachments.map(({ content, ...file }) => ({ ...file, bytes: content.byteLength }))).toEqual([
      { filename: 'logo.png', contentType: 'image/png', size: 8, inline: true, bytes: 8 },
      { filename: 'Tuesday schedule.pdf', contentType: 'application/pdf', size: 15, inline: false, bytes: 15 },
      {
        filename: 'properties.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 5,
        inline: false,
        bytes: 5,
      },
    ]);
  });

  it('derives the text body from HTML when there is no text part', async () => {
    const { record, attachments } = await parseRequestEmail(fixture('html-only.eml'), PASSING, 'nulldevice.dev');

    expect(record.bodyText).toBe('Please add 14 Cliff Rd & remove 3 Oak St.\nThanks,\nBob');
    expect(record.fromName).toBe('Bob Broker');
    expect(attachments).toEqual([]);
  });

  it('flags email from our own domain as logged by staff, and falls back to the receipt time with no Date header', async () => {
    const { record } = await parseRequestEmail(fixture('own-domain.eml'), PASSING, 'NullDevice.dev');

    expect(record.loggedByStaff).toBe(true);
    expect(record.sentAt).toBe(PASSING.timestamp);
    expect(record.bodyText).toBe('Ann rang: route for Friday, 12 properties.');
  });

  it('records a failed DKIM verdict as given', async () => {
    const { record } = await parseRequestEmail(fixture('html-only.eml'), { ...PASSING, dkimVerdict: 'FAIL' }, 'nulldevice.dev');

    expect(record.dkimVerdict).toBe('FAIL');
  });

  it('names an unnamed attachment by its position', async () => {
    const raw = [
      'From: a@b.com',
      'Content-Type: multipart/mixed; boundary=x',
      '',
      '--x',
      'Content-Type: text/plain',
      '',
      'hi',
      '--x',
      'Content-Type: application/octet-stream',
      'Content-Disposition: attachment',
      '',
      'data',
      '--x--',
      '',
    ].join('\r\n');
    const { attachments } = await parseRequestEmail(Buffer.from(raw), PASSING, 'nulldevice.dev');

    expect(attachments.map((file) => file.filename)).toEqual(['attachment-1']);
  });
});

describe('htmlToText', () => {
  it('turns block elements into line breaks, drops scripts and styles, and decodes entities', () => {
    expect(htmlToText('<style>x{}</style><p>One&nbsp;&lt;two&gt;</p><ul><li>a</li><li>b</li></ul><p>&#8217;&#x2019;&quot;</p>')).toBe(
      'One <two>\na\nb\n’’"'
    );
  });
});

describe('suggestCustomer', () => {
  const users = [
    { customerId: 'c1', email: 'ann.agent@harcourts.com.au' },
    { customerId: 'c1', email: 'owner@harcourts.com.au' },
    { customerId: 'c2', email: 'bob@raywhite.com' },
    { customerId: 'c3', email: 'carol@gmail.com' },
    { customerId: 'c4', email: 'x@shared.com.au' },
    { customerId: 'c5', email: 'y@shared.com.au' },
    { customerId: 'c6', email: null },
  ];

  it("suggests the Customer whose user sent it, ignoring case", () => {
    expect(suggestCustomer('Bob@RayWhite.com', users)).toBe('c2');
  });

  it("suggests the Customer whose users share the sender's domain", () => {
    expect(suggestCustomer('new.agent@harcourts.com.au', users)).toBe('c1');
  });

  it('suggests nothing when the domain is shared by several Customers, is a public mail service, or matches no one', () => {
    expect(suggestCustomer('z@shared.com.au', users)).toBeNull();
    expect(suggestCustomer('someone@gmail.com', users)).toBeNull();
    expect(suggestCustomer('who@nowhere.com', users)).toBeNull();
    expect(suggestCustomer('', users)).toBeNull();
  });

  it('still suggests by exact address on a public mail service', () => {
    expect(suggestCustomer('carol@gmail.com', users)).toBe('c3');
  });
});

describe('requestAttachmentKey', () => {
  it("keeps files apart by position and makes the name safe for a key", () => {
    expect(requestAttachmentKey('ses-msg-1', 0, 'Tuesday schedule.pdf')).toBe('requests/ses-msg-1/0-Tuesday schedule.pdf');
    expect(requestAttachmentKey('ses-msg-1', 2, '../evil/\\name?.pdf')).toBe('requests/ses-msg-1/2-.._evil__name_.pdf');
  });
});

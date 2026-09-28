import { customerAttachment, customerRouteRequestSummary, toCustomerRouteRequests } from './customerRouteRequestView';

const record = (overrides: object) => ({
  id: 'x',
  source: 'email',
  status: 'linked',
  routeId: 'route-1',
  role: 'amendment',
  fromName: 'Ann Agent',
  fromAddress: 'ann@agency.test',
  sentAt: '2026-09-27T23:15:00.000Z',
  receivedAt: '2026-09-27T23:16:00.000Z',
  subject: 'Route for Tuesday',
  bodyText: 'Please see attached.',
  spfVerdict: 'FAIL',
  dkimVerdict: 'PASS',
  dmarcVerdict: 'FAIL',
  rawMessageKey: 'inbound/raw-1',
  attachments: [],
  loggedByStaff: false,
  suggestedCustomerId: 'c1',
  enteredBySub: 'sub-admin',
  linkedBySub: 'sub-admin',
  linkedAt: '2026-09-28T00:00:00.000Z',
  unlinkedNote: 'moved',
  ...overrides,
});

describe('toCustomerRouteRequests', () => {
  it('puts the Route Request first, then Amendments in the order they were sent', () => {
    const records = [
      record({ id: 'late', sentAt: '2026-09-29T00:00:00.000Z' }),
      record({ id: 'req', role: 'request', sentAt: '2026-09-28T12:00:00.000Z' }),
      record({ id: 'early', sentAt: '2026-09-26T00:00:00.000Z' }),
    ];

    expect(toCustomerRouteRequests(records).map((entry) => entry.id)).toEqual(['req', 'early', 'late']);
  });

  it('leaves out dismissed and unlinked records', () => {
    const records = [record({ id: 'a' }), record({ id: 'b', status: 'dismissed' }), record({ id: 'c', status: 'unlinked', routeId: null })];

    expect(toCustomerRouteRequests(records).map((entry) => entry.id)).toEqual(['a']);
  });

  it('gives only what the customer may see: never verdicts, flags, the raw message or who handled it', () => {
    const [entry] = toCustomerRouteRequests([
      record({
        role: 'request',
        attachments: [{ key: 'requests/x/0-run.pdf', filename: 'run.pdf', contentType: 'application/pdf', size: 90000, inline: false }],
      }),
    ]);

    expect(entry).toEqual({
      id: 'x',
      role: 'request',
      requesterName: 'Ann Agent',
      requesterEmail: 'ann@agency.test',
      recordedByNullDevice: false,
      sentAt: '2026-09-27T23:15:00.000Z',
      subject: 'Route for Tuesday',
      bodyText: 'Please see attached.',
      attachments: [{ index: 0, filename: 'run.pdf', contentType: 'application/pdf', size: 90000 }],
    });
  });

  it("names a Logged-by-staff email's real requester, never the staff member who forwarded it", () => {
    const [entry] = toCustomerRouteRequests([
      record({ loggedByStaff: true, fromName: 'Staff Member', fromAddress: 'staff@nulldevice.test', requesterName: 'Ben Buyer' }),
    ]);

    expect(entry).toMatchObject({ requesterName: 'Ben Buyer', requesterEmail: null, recordedByNullDevice: true });
    expect(JSON.stringify(entry)).not.toMatch(/staff/i);
  });

  it('never shows the forwarder of a Logged-by-staff email with no requester entered', () => {
    const [entry] = toCustomerRouteRequests([
      record({ loggedByStaff: true, fromName: 'Staff Member', fromAddress: 'staff@nulldevice.test' }),
    ]);

    expect(entry).toMatchObject({ requesterName: null, requesterEmail: null, recordedByNullDevice: true });
  });

  it("gives a manual entry the name entered, marked as recorded by Null Device in place of an email, and never the administrator's note", () => {
    const [entry] = toCustomerRouteRequests([
      record({ source: 'manual', fromName: null, fromAddress: null, requesterName: 'Cat Caller', requesterEmail: 'cat@agency.test', note: 'Rang the office' }),
    ]);

    expect(entry).toMatchObject({ requesterName: 'Cat Caller', requesterEmail: null, recordedByNullDevice: true });
    expect(JSON.stringify(entry)).not.toMatch(/Rang the office/);
  });

  it('hides inline images under 50 KB, keeping each other attachment at its original position', () => {
    const [entry] = toCustomerRouteRequests([
      record({
        attachments: [
          { key: 'k0', filename: 'logo.png', contentType: 'image/png', size: 4000, inline: true },
          { key: 'k1', filename: 'photo.jpg', contentType: 'image/jpeg', size: 60000, inline: true },
          { key: 'k2', filename: 'run.pdf', contentType: 'application/pdf', size: 1000, inline: false },
          { key: 'k3', filename: 'unsized.png', contentType: 'image/png', size: null, inline: true },
        ],
      }),
    ]);

    expect(entry.attachments.map((attachment) => attachment.index)).toEqual([1, 2, 3]);
  });
});

describe('customerAttachment', () => {
  const attachments = [
    { key: 'k0', filename: 'logo.png', contentType: 'image/png', size: 4000, inline: true },
    { key: 'k1', filename: 'run.pdf', contentType: 'application/pdf', size: 1000, inline: false },
  ];

  it('finds an attachment the customer can see', () => {
    expect(customerAttachment(record({ attachments }), 1)).toEqual(attachments[1]);
  });

  it('refuses a hidden attachment, a missing one, and any file of a record not linked', () => {
    expect(customerAttachment(record({ attachments }), 0)).toBeNull();
    expect(customerAttachment(record({ attachments }), 5)).toBeNull();
    expect(customerAttachment(record({ attachments, status: 'dismissed' }), 1)).toBeNull();
  });
});

describe('customerRouteRequestSummary', () => {
  it('says who asked, when, and how many Amendments followed', () => {
    const entries = toCustomerRouteRequests([record({ role: 'request' }), record({ id: 'a1' }), record({ id: 'a2' })]);

    expect(customerRouteRequestSummary(entries, (iso) => iso.slice(0, 10))).toBe('Requested by Ann Agent on 2026-09-27, 2 amendments');
  });

  it('counts one Amendment in the singular, and none when there are none', () => {
    const one = toCustomerRouteRequests([record({ role: 'request' }), record({ id: 'a1' })]);
    const none = toCustomerRouteRequests([record({ role: 'request' })]);

    expect(customerRouteRequestSummary(one, (iso) => iso.slice(0, 10))).toBe('Requested by Ann Agent on 2026-09-27, 1 amendment');
    expect(customerRouteRequestSummary(none, (iso) => iso.slice(0, 10))).toBe('Requested by Ann Agent on 2026-09-27, 0 amendments');
  });

  it('has nothing to say without a Route Request', () => {
    expect(customerRouteRequestSummary(toCustomerRouteRequests([record({})]), (iso) => iso)).toBeNull();
    expect(customerRouteRequestSummary([], (iso) => iso)).toBeNull();
  });
});

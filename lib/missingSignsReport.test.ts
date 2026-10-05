import { missingSignsReportDecision, missingSignsReportEmail, missingSignsReportRecipients } from './missingSignsReport';

const route = { status: 'completed' as const, missingSignsReportSentAt: null };
const customer = { missingSignsReportEnabled: true, sendMissingSignsReport: true };
const stops = [
  { address: '44 Eastcote Road, North Epping', formattedAddress: '44 Eastcote Rd, North Epping NSW 2121, Australia', missingSignsCount: 1 },
  { address: '9 Grayson Rd, North Epping', missingSignsCount: 0 },
  { address: '20 Gloucester Road, Epping', missingSignsCount: 2 },
  // A Removed Stop never counts.
  { address: '3 Hazelwood Place, Epping', missingSignsCount: 5, removed: true },
];

describe('missingSignsReportDecision (#468)', () => {
  it('sends when switched on, wanted, and signs are missing, listing each Property', () => {
    expect(missingSignsReportDecision({ route, customer, stops })).toEqual({
      send: true,
      total: 3,
      properties: [
        { address: '44 Eastcote Rd, North Epping NSW 2121, Australia', missing: 1 },
        { address: '20 Gloucester Road, Epping', missing: 2 },
      ],
    });
  });

  it.each([
    ['the Route is not finalised', { route: { ...route, status: 'in_progress' as const } }, 'route not finalised'],
    ['it was already sent', { route: { ...route, missingSignsReportSentAt: '2026-10-05T01:00:00.000Z' } }, 'already sent'],
    ['an administrator has not switched reports on', { customer: { ...customer, missingSignsReportEnabled: null } }, 'reports not switched on for this customer'],
    ["the Customer doesn't want them", { customer: { ...customer, sendMissingSignsReport: false } }, 'customer has turned reports off'],
    ['no signs are missing', { stops: [stops[1]] }, 'no missing signs'],
  ])('skips when %s', (_case, overrides, reason) => {
    expect(missingSignsReportDecision({ route, customer, stops, ...overrides })).toEqual({ send: false, reason });
  });

  it("treats the Customer's preference as on until they turn it off", () => {
    expect(missingSignsReportDecision({ route, customer: { missingSignsReportEnabled: true, sendMissingSignsReport: null }, stops })).toMatchObject({ send: true });
  });
});

describe('missingSignsReportRecipients (#468)', () => {
  it('sends to the invoice recipient and billing CCs, copying admin, without repeats', () => {
    expect(
      missingSignsReportRecipients({
        invoiceRecipient: 'Owner@Agency.test',
        billingCcEmails: ['accounts@agency.test', 'owner@agency.test', ' ', 'admin@nulldevice.dev'],
        adminEmail: 'admin@nulldevice.dev',
      })
    ).toEqual({ to: ['Owner@Agency.test', 'accounts@agency.test'], cc: ['admin@nulldevice.dev'] });
  });

  it('falls back to admin alone when the Customer has no address', () => {
    expect(missingSignsReportRecipients({ invoiceRecipient: null, billingCcEmails: null, adminEmail: 'admin@nulldevice.dev' })).toEqual({
      to: ['admin@nulldevice.dev'],
      cc: [],
    });
  });
});

describe('missingSignsReportEmail (#468)', () => {
  it('lists each Property and the total, in customer-facing words', () => {
    const email = missingSignsReportEmail({
      routeCode: 'W40-26-003',
      customerName: 'Harcourts Epping',
      placementDate: '2026-10-06',
      pickupDate: '2026-10-10',
      properties: [
        { address: '44 Eastcote Rd, North Epping', missing: 1 },
        { address: '20 Gloucester Road, Epping', missing: 2 },
      ],
      total: 3,
    });

    expect(email.subject).toBe('Missing signs on Route W40-26-003');
    expect(email.text).toContain('44 Eastcote Rd, North Epping — 1 sign');
    expect(email.text).toContain('20 Gloucester Road, Epping — 2 signs');
    expect(email.text).toContain('3 signs missing in total.');
    expect(email.text).toMatch(/Oct 6, 2026/);
    expect(email.text).toMatch(/Oct 10, 2026/);
    expect(email.text).not.toMatch(/operator|driver|staff/i);
  });
});

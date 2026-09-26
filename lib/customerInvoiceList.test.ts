import { buildInvoicesCsv, compareInvoiceDateDesc, getInvoiceRouteLabel } from './customerInvoiceList';

describe('getInvoiceRouteLabel', () => {
  it('uses the route code when there is one', () => {
    expect(getInvoiceRouteLabel({ routeId: 'abcdef1234567890', routeCode: 'W39-26-001' })).toBe('W39-26-001');
  });

  it('falls back to the first 8 characters of the route ID', () => {
    expect(getInvoiceRouteLabel({ routeId: 'abcdef1234567890', routeCode: null })).toBe('abcdef12');
    expect(getInvoiceRouteLabel({ routeId: 'abcdef1234567890', routeCode: '  ' })).toBe('abcdef12');
  });

  it('is empty when the invoice has no route', () => {
    expect(getInvoiceRouteLabel({ routeId: null, routeCode: null })).toBe('');
  });
});

describe('compareInvoiceDateDesc', () => {
  const sortIds = (invoices: Parameters<typeof compareInvoiceDateDesc>[0][]) =>
    [...invoices].sort(compareInvoiceDateDesc).map((invoice) => invoice.id);

  it('puts the newest invoice date first', () => {
    expect(
      sortIds([
        { id: 'jan', invoiceDate: '2026-01-15' },
        { id: 'mar', invoiceDate: '2026-03-15' },
        { id: 'feb', invoiceDate: '2026-02-15' },
      ])
    ).toEqual(['mar', 'feb', 'jan']);
  });

  it('breaks date ties by invoice number descending, numerically', () => {
    expect(
      sortIds([
        { id: 'a', invoiceDate: '2026-01-15', invoiceNumber: 'INV-9' },
        { id: 'b', invoiceDate: '2026-01-15', invoiceNumber: 'INV-10' },
        { id: 'c', invoiceDate: '2026-01-15', invoiceNumber: 'INV-2' },
      ])
    ).toEqual(['b', 'a', 'c']);
  });

  it('breaks remaining ties by id so the order is stable', () => {
    expect(
      sortIds([
        { id: 'x1', invoiceDate: '2026-01-15' },
        { id: 'x3', invoiceDate: '2026-01-15' },
        { id: 'x2', invoiceDate: '2026-01-15' },
      ])
    ).toEqual(['x3', 'x2', 'x1']);
  });

  it('sorts invoices without a date last', () => {
    expect(
      sortIds([
        { id: 'none', invoiceDate: null },
        { id: 'old', invoiceDate: '2020-01-01' },
        { id: 'new', invoiceDate: '2026-01-01' },
      ])
    ).toEqual(['new', 'old', 'none']);
  });
});

describe('buildInvoicesCsv', () => {
  it('labels the route column "Route" and fills it with the route label', () => {
    const csv = buildInvoicesCsv([
      {
        id: 'inv-1',
        invoiceNumber: 'INV-1',
        routeId: 'route-uuid-1234',
        routeCode: 'W39-26-001',
        totalAmount: 10,
        status: 'paid',
      },
      { id: 'inv-2', invoiceNumber: 'INV-2', routeId: 'fedcba9876543210', routeCode: null },
      { id: 'inv-3', invoiceNumber: 'INV-3', routeId: null },
    ]);
    const [header, ...rows] = csv.split('\r\n');

    expect(header).toBe('"Invoice #","Route","Date","Period start","Period end","Amount","Status"');
    expect(rows[0].startsWith('"INV-1","W39-26-001",')).toBe(true);
    expect(rows[1].startsWith('"INV-2","fedcba98",')).toBe(true);
    expect(rows[2].startsWith('"INV-3","",')).toBe(true);
    expect(csv).not.toContain('route-uuid-1234');
  });

  it('keeps rows in the order given', () => {
    const csv = buildInvoicesCsv([
      { id: 'b', invoiceNumber: 'B' },
      { id: 'a', invoiceNumber: 'A' },
    ]);
    expect(csv.split('\r\n').slice(1).map((row) => row.split(',')[0])).toEqual(['"B"', '"A"']);
  });
});

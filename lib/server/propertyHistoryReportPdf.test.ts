/**
 * @jest-environment node
 */
import { renderPropertyHistoryReportPdf, type PropertyHistoryReportPdfInput } from './propertyHistoryReportPdf';
import type { PropertyGroup, VisitRow } from '@/lib/propertyHistory';

function visit(overrides: Partial<VisitRow> = {}): VisitRow {
  return {
    stopId: 's1',
    routeId: 'r1',
    date: '2026-08-01',
    routeCode: 'W26-08-101',
    agent: 'Betty',
    auction: true,
    signsPlaced: 2,
    invoices: [{ id: 'i1', invoiceNumber: 'INV-0001' }],
    status: 'completed',
    ...overrides,
  };
}

const CLIFF_14: PropertyGroup = {
  propertyKey: 'epping|2121|cliff road|14',
  address: '14 Cliff Rd, Epping',
  visitCount: 1,
  visits: [visit()],
  scheduled: [visit({ stopId: 's2', routeId: 'r2', routeCode: 'W26-10-303', date: '2026-10-03', invoices: [], status: 'planned' })],
};

const INPUT: PropertyHistoryReportPdfInput = {
  referenceNumber: 'PHR-20260927-ABC123',
  organisation: { companyName: 'Null Device Signs', abn: 'ABN 12 345 678 901', phone: '02 9999 0000', address: '1 Yard St, Epping' },
  customerLabel: 'Harcourts Epping',
  generatedBy: 'Olivia Owner',
  generatedAt: '2026-09-27T03:04:05.000Z',
  searchLabel: 'Street: Cliff Road, Epping 2121',
  filterLabels: ['From 2026-01-01', 'Agent: Betty'],
  counts: { propertyCount: 1, visitCount: 1 },
  result: { level: 'street', properties: [CLIFF_14] },
  staff: false,
};

// jsPDF writes uncompressed content streams, so the drawn text is in the bytes.
function pdfText(input: PropertyHistoryReportPdfInput): string {
  return Buffer.from(renderPropertyHistoryReportPdf(input)).toString('latin1');
}

describe('renderPropertyHistoryReportPdf', () => {
  it('renders a PDF', () => {
    expect(pdfText(INPUT).startsWith('%PDF-')).toBe(true);
  });

  it('heads the report with the branding, Customer, generator, search, filters, counts and reference', () => {
    const text = pdfText(INPUT);
    for (const expected of [
      'Property History Report',
      'Null Device Signs',
      'Harcourts Epping',
      'Olivia Owner',
      'Street: Cliff Road, Epping 2121',
      'From 2026-01-01 · Agent: Betty',
      '1 Property',
      '1 Visit',
      'PHR-20260927-ABC123',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('lists each Property with its Visits and Scheduled Routes as plain text', () => {
    const text = pdfText(INPUT);
    for (const expected of ['14 Cliff Rd, Epping', 'W26-08-101', 'INV-0001', 'Completed', 'Scheduled', 'W26-10-303', 'Not yet invoiced']) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain('/URI');
    expect(text).not.toContain('/Link');
  });

  it('stamps every page with the snapshot time', () => {
    const many: PropertyGroup[] = Array.from({ length: 40 }, (_, i) => ({ ...CLIFF_14, propertyKey: `k${i}`, address: `${i} Cliff Rd` }));
    const text = pdfText({ ...INPUT, result: { level: 'street', properties: many } });
    const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
    expect(text.match(/Snapshot as at 27 Sept 2026, 1:04 pm/g)).toHaveLength(pages);
  });

  it('shows the staff columns only on a staff report', () => {
    const staffRow = visit({ customerName: 'Ray White', operatorName: 'Sam', missingSigns: 1, locationPrecision: 'approximate' });
    const staff = pdfText({ ...INPUT, staff: true, result: { level: 'address', property: { ...CLIFF_14, visits: [staffRow], scheduled: [] } } });
    expect(staff).toContain('Missing Signs');
    expect(staff).toContain('Ray White');

    const customer = pdfText(INPUT);
    expect(customer).not.toContain('Missing Signs');
    expect(customer).not.toContain('Operator');
  });

  it('says when nothing matched', () => {
    const text = pdfText({ ...INPUT, counts: { propertyCount: 0, visitCount: 0 }, result: { level: 'address', property: null } });
    expect(text).toContain('No Visits match this search.');
  });
});

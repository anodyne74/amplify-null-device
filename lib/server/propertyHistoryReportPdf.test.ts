/**
 * @jest-environment node
 */
import { renderPropertyHistoryReportPdf, type PropertyHistoryReportPdfInput } from './propertyHistoryReportPdf';
import type { PropertyGroup, VisitRow } from '@/lib/propertyHistory';

// The PDF is compressed and its text drawn in embedded fonts, so record what
// each page draws instead of reading it back out of the bytes.
const drawn: Array<{ page: number; text: string }> = [];
const images: string[] = [];
const imageBoxes: number[][] = [];

jest.mock('jspdf', () => {
  const actual = jest.requireActual('jspdf');
  class RecordingJsPDF extends actual.jsPDF {
    constructor(...args: unknown[]) {
      super(...args);
      const text = this.text.bind(this);
      this.text = (value: string | string[], ...rest: unknown[]) => {
        const page = this.getCurrentPageInfo().pageNumber;
        for (const line of ([] as string[]).concat(value)) drawn.push({ page, text: line });
        return text(value, ...rest);
      };
      const addImage = this.addImage.bind(this);
      this.addImage = (...imageArgs: unknown[]) => {
        images.push(String(imageArgs[1]));
        imageBoxes.push(imageArgs.slice(2, 6) as number[]);
        return addImage(...imageArgs);
      };
    }
  }
  return { ...actual, jsPDF: RecordingJsPDF };
});

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
  customerAddress: '88 Rowe Street, Eastwood NSW 2122',
  generatedBy: 'Olivia Owner',
  generatedAt: '2026-09-27T03:04:05.000Z',
  search: { kind: 'Street', text: 'Cliff Road, Epping 2121' },
  filterLabels: ['From 2026-01-01', 'Agent: Betty'],
  result: { level: 'street', properties: [CLIFF_14] },
  staff: false,
};

function render(input: PropertyHistoryReportPdfInput) {
  drawn.length = 0;
  images.length = 0;
  imageBoxes.length = 0;
  const bytes = Buffer.from(renderPropertyHistoryReportPdf(input)).toString('latin1');
  const texts = drawn.map((entry) => entry.text);
  // Wrapped text is drawn a line at a time; `all` joins it back up.
  return { bytes, texts, all: texts.join(' ') };
}

describe('renderPropertyHistoryReportPdf', () => {
  it('renders a PDF with the brand fonts embedded and the logo in the header', () => {
    const { bytes } = render(INPUT);
    expect(bytes.startsWith('%PDF-')).toBe(true);
    for (const font of ['Comfortaa', 'Manrope', 'JetBrainsMono']) {
      expect(bytes).toContain(`/BaseFont /${font}`);
    }
    expect(images).toEqual(['PNG']);
  });

  it('draws the logo as on the invoice: 70% size, inset 24pt and centred in the header', () => {
    render(INPUT);
    // Page margin is 0.7in; the header band is 92pt tall and starts at the top margin.
    const [x, y, width, height] = imageBoxes[0];
    expect(x).toBeCloseTo(50.4 + 24);
    expect(width).toBeCloseTo(119.7);
    expect(height).toBeCloseTo(33.6);
    expect(y + height / 2).toBeCloseTo(50.4 + 92 / 2);
  });

  it('heads the report with the title, reference, Customer and address, search, filters and generator', () => {
    const { texts, all } = render(INPUT);
    for (const expected of ['Property history', 'PHR-20260927-ABC123', 'Harcourts Epping', 'Cliff Road, Epping 2121', 'Olivia Owner', '2026-09-27 13:04']) {
      expect(texts).toContain(expected);
    }
    expect(all).toContain('88 Rowe Street, Eastwood NSW 2122');
    expect(all).toContain('Street search · From 2026-01-01 · Agent: Betty');
    // The organisation's contact line has gone from the header.
    expect(all).not.toContain('02 9999 0000');
  });

  it('shows "All customers" with no address on an all-customers report', () => {
    const { texts, all } = render({ ...INPUT, customerLabel: 'All customers', customerAddress: null, filterLabels: ['No filters'] });
    expect(texts).toContain('All customers');
    expect(all).not.toContain('Rowe Street');
    expect(all).toContain('Street search · no filters');
  });

  it('shows the totals band', () => {
    const { texts } = render(INPUT);
    for (const expected of ['PROPERTIES', 'COMPLETED VISITS', 'SIGNS PLACED', 'SCHEDULED']) {
      expect(texts).toContain(expected);
    }
  });

  it('gives each Property one table, scheduled Visits first, as plain text', () => {
    const { texts, bytes } = render(INPUT);
    expect(texts).toContain('Visits by property');
    expect(texts).toContain('Every sign visit on Cliff Road, Epping 2121 since 2026, newest first.');
    expect(texts).toContain('14 Cliff Rd, Epping');
    expect(texts).toContain('1 VISIT · 1 SCHEDULED');
    expect(texts.filter((text) => text === 'DATE')).toHaveLength(1);
    expect(texts.indexOf('W26-10-303')).toBeLessThan(texts.indexOf('W26-08-101'));
    for (const expected of ['INV-0001', 'Not invoiced', 'Planned', 'Completed', '2026-08-01']) {
      expect(texts).toContain(expected);
    }
    expect(bytes).not.toContain('/URI');
    expect(bytes).not.toContain('/Link');
  });

  it('keeps a heading per street on a suburb report', () => {
    const { texts } = render({ ...INPUT, result: { level: 'suburb', streets: [{ street: 'cliff road', properties: [CLIFF_14] }] } });
    expect(texts).toContain('Cliff Road · 1 property');
    expect(texts).toContain('14 Cliff Rd, Epping');
  });

  it('puts the snapshot time, reference and company on every page, with no page numbers', () => {
    const many: PropertyGroup[] = Array.from({ length: 40 }, (_, i) => ({ ...CLIFF_14, propertyKey: `k${i}`, address: `${i} Cliff Rd` }));
    render({ ...INPUT, result: { level: 'street', properties: many } });
    const pages = Math.max(...drawn.map((entry) => entry.page));
    expect(pages).toBeGreaterThan(1);
    for (let page = 1; page <= pages; page += 1) {
      const onPage = drawn.filter((entry) => entry.page === page).map((entry) => entry.text);
      expect(onPage).toContain('Snapshot as at 27 Sept 2026, 1:04 pm AEST');
      expect(onPage).toContain('PHR-20260927-ABC123');
      expect(onPage).toContain('Null Device Signs · ABN 12 345 678 901');
    }
    expect(drawn.some((entry) => /Page \d/.test(entry.text))).toBe(false);
  });

  it('shows the staff columns only on a staff report', () => {
    const staffRow = visit({ customerName: 'Ray White', operatorName: 'Sam', missingSigns: 1, locationPrecision: 'approximate' });
    const staff = render({ ...INPUT, staff: true, result: { level: 'address', property: { ...CLIFF_14, visits: [staffRow], scheduled: [] } } });
    expect(staff.all).toContain('MISSING SIGNS');
    expect(staff.texts).toContain('Ray White');
    expect(staff.texts).toContain('Approximate');

    const customer = render(INPUT);
    expect(customer.all).not.toContain('MISSING');
    expect(customer.all).not.toContain('OPERATOR');
  });

  it('says when nothing matched, and leaves out "since" when no Visit has a date', () => {
    const { texts } = render({ ...INPUT, result: { level: 'address', property: null } });
    expect(texts).toContain('Visits by property');
    expect(texts).toContain('Every sign visit on Cliff Road, Epping 2121, newest first.');
    expect(texts).toContain('No Visits match this search.');
  });
});

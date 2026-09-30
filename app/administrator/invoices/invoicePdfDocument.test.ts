/**
 * @jest-environment node
 */
import { jsPDF } from 'jspdf';
import { drawInvoicePdfDocument, type InvoicePdfDocumentData } from './invoicePdfDocument';
import { buildInvoicePdfConfig } from './invoicePdfTheme';

// The PDF is compressed and its text drawn in embedded fonts, so record what
// is drawn, and in which font, instead of reading it back out of the bytes.
const drawn: Array<{ text: string; font: string }> = [];
const images: string[] = [];

jest.mock('jspdf', () => {
  const actual = jest.requireActual('jspdf');
  class RecordingJsPDF extends actual.jsPDF {
    constructor(...args: unknown[]) {
      super(...args);
      const text = this.text.bind(this);
      this.text = (value: string | string[], ...rest: unknown[]) => {
        const font = this.getFont().fontName;
        for (const line of ([] as string[]).concat(value)) drawn.push({ text: line, font });
        return text(value, ...rest);
      };
      const addImage = this.addImage.bind(this);
      this.addImage = (...imageArgs: unknown[]) => {
        images.push(String(imageArgs[0]).slice(0, 22));
        return addImage(...imageArgs);
      };
    }
  }
  return { ...actual, jsPDF: RecordingJsPDF };
});

const DATA: InvoicePdfDocumentData = {
  invoiceNumber: 'INV-0042',
  invoiceDate: '2026-09-30',
  routeCode: 'W26-09-404',
  company: { name: 'Null Device Signs', abn: 'ABN 12 345 678 901', phone: '02 9999 0000', address: '1 Yard St, Epping', email: 'accounts@nulldevice.dev' },
  customer: { name: 'Harcourts Epping', address: '88 Rowe Street, Eastwood NSW 2122' },
  lines: [{ description: 'Sign placement', quantityHours: 2, hourlyRate: 60, total: 120 }],
  subtotal: 120,
  gstAmount: 12,
  totalAmount: 132,
  payment: { accountName: 'Null Device Signs', bsb: '123-456', accountNumber: '12345678' },
  routeStops: [
    { address: '1 A St, Epping NSW 2121', agent: 'GZ', numberOfSigns: 1 },
    { address: '2 B St, Epping NSW 2121', agent: null, numberOfSigns: 2 },
    { address: '3 C St, Epping NSW 2121', agent: 'BO', numberOfSigns: 3 },
    { address: '4 D St, Epping NSW 2121', agent: 'KP', numberOfSigns: 1 },
    { address: '5 E St, Epping NSW 2121', agent: 'DM', numberOfSigns: 2 },
  ],
  groupStopsByAgentForCustomer: false,
};

function render(data: InvoicePdfDocumentData) {
  drawn.length = 0;
  images.length = 0;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true, putOnlyUsedFonts: true });
  drawInvoicePdfDocument(doc, buildInvoicePdfConfig(), data);
  const bytes = Buffer.from(doc.output('arraybuffer')).toString('latin1');
  return { bytes, texts: drawn.map((entry) => entry.text), fontOf: (text: string) => drawn.find((entry) => entry.text === text)?.font };
}

describe('drawInvoicePdfDocument', () => {
  it('embeds the brand fonts, uses no Helvetica, and draws the committed logo', () => {
    const { bytes } = render(DATA);
    for (const font of ['Comfortaa', 'Manrope', 'JetBrainsMono']) {
      expect(bytes).toContain(`/BaseFont /${font}`);
    }
    expect(drawn.some((entry) => /helvetica/i.test(entry.font))).toBe(false);
    expect(bytes).not.toContain('/BaseFont /Helvetica');
    expect(images).toEqual(['data:image/png;base64,']);
  });

  it('sets headings in the display font and figures in the mono font', () => {
    const { fontOf } = render(DATA);
    expect(fontOf('Invoice')).toBe('Comfortaa');
    expect(fontOf('Route stop details')).toBe('Comfortaa');
    expect(fontOf('Harcourts Epping')).toBe('Manrope');
    expect(fontOf('$132.00')).toBe('JetBrainsMono');
    expect(fontOf('INV-0042')).toBe('JetBrainsMono');
    expect(fontOf('123-456')).toBe('JetBrainsMono');
  });

  it('says the signs were placed and collected', () => {
    const { texts } = render(DATA);
    expect(texts).toContain('5 stops · 9 signs placed and collected on route W26-09-404.');
  });

  it('orders agent groups alphabetically with Unassigned last when grouping is on', () => {
    const { texts } = render({ ...DATA, groupStopsByAgentForCustomer: true });
    const subtotals = texts.filter((text) => text.endsWith(' subtotal'));
    expect(subtotals).toEqual(['BO subtotal', 'DM subtotal', 'GZ subtotal', 'KP subtotal', 'Unassigned subtotal']);
  });

  it('keeps the flat Property / Agent / Signs table in run order when grouping is off', () => {
    const { texts } = render(DATA);
    expect(texts).toEqual(expect.arrayContaining(['Property', 'Agent', 'Signs']));
    expect(texts.some((text) => text.endsWith(' subtotal'))).toBe(false);
    expect(texts.indexOf('1 A St, Epping')).toBeLessThan(texts.indexOf('3 C St, Epping'));
    expect(texts.indexOf('3 C St, Epping')).toBeLessThan(texts.indexOf('5 E St, Epping'));
  });
});

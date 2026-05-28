import { parseInvoiceText } from './parseInvoice';

describe('parseInvoiceText', () => {
  it('parses invoice number, date, total and route code from common text', () => {
    const text = `
      Invoice Number: INV-12345
      Invoice Date: May 27, 2026
      Total Amount: $1,234.50
      Route: W19-26-001
    `;

    const result = parseInvoiceText(text);

    expect(result).toEqual({
      invoiceNumber: 'INV-12345',
      invoiceDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      totalAmount: 1234.5,
      routeCode: 'W19-26-001',
    });
  });

  it('parses slash date with two-digit year and fallback invoice token', () => {
    const text = 'INV A9-55  invoice date 5/27/26  amount due $250.00';

    expect(parseInvoiceText(text)).toEqual({
      invoiceNumber: 'INVA9-55',
      invoiceDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      totalAmount: 250,
      routeCode: undefined,
    });
  });

  it('returns undefined fields when values are missing or invalid', () => {
    const text = 'Invoice no: X1 amount due: not-a-number invoice date: 13/40/2026';

    expect(parseInvoiceText(text)).toEqual({
      invoiceNumber: 'Invoice',
      invoiceDate: undefined,
      totalAmount: undefined,
      routeCode: undefined,
    });
  });

  it('parses alternate total pattern with trailing label', () => {
    const text = '$999.99 total';

    expect(parseInvoiceText(text)).toEqual({
      invoiceNumber: undefined,
      invoiceDate: undefined,
      totalAmount: 999.99,
      routeCode: undefined,
    });
  });
});

import {
  CUSTOMER_PORTAL_INVOICE_PDF_THEME,
  buildInvoicePdfConfig,
} from '@/app/administrator/invoices/invoicePdfTheme';

describe('invoice PDF customer portal theme', () => {
  it('uses customer portal color semantics for generated invoice documents', () => {
    const config = buildInvoicePdfConfig();

    expect(CUSTOMER_PORTAL_INVOICE_PDF_THEME.colors.header).toEqual([20, 27, 56]);
    expect(CUSTOMER_PORTAL_INVOICE_PDF_THEME.colors.accent).toEqual([238, 240, 254]);
    expect(config.colors.header).toEqual(CUSTOMER_PORTAL_INVOICE_PDF_THEME.colors.header);
    expect(config.colors.accent).toEqual(CUSTOMER_PORTAL_INVOICE_PDF_THEME.colors.accent);
    expect(config.fonts.large).toBeLessThan(config.fonts.xlarge);
    expect(config.fonts.label).toBeLessThan(config.fonts.default);
    expect(config.layout.headerHeight).toBeGreaterThan(0);
    expect(config.margins.right).toBeGreaterThan(config.margins.left);
  });
});

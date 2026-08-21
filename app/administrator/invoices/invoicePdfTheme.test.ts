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
    expect(config.colors.totalBand).toEqual(CUSTOMER_PORTAL_INVOICE_PDF_THEME.colors.accentStrong);
    expect(config.fonts.large).toBeLessThan(config.fonts.xlarge);
    expect(config.layout.headerHeight).toBeLessThan(config.layout.companyDetailsTop);
    expect(config.layout.companyDetailsMaxWidth).toBeLessThanOrEqual(484);
  });
});

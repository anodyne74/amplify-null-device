export type PdfRgb = [number, number, number];

export const CUSTOMER_PORTAL_INVOICE_PDF_THEME = {
  colors: {
    header: [0, 77, 96] as PdfRgb,
    headerText: [241, 253, 255] as PdfRgb,
    text: [15, 23, 42] as PdfRgb,
    muted: [71, 85, 105] as PdfRgb,
    border: [203, 213, 225] as PdfRgb,
    secondary: [248, 250, 252] as PdfRgb,
    accent: [230, 250, 253] as PdfRgb,
    accentStrong: [204, 245, 250] as PdfRgb,
  },
  fonts: {
    regular: 'helvetica',
    bold: 'helvetica',
    default: 11,
    small: 10,
    medium: 12,
    large: 18,
    xlarge: 22,
  },
};

export function buildInvoicePdfConfig() {
  return {
    margins: { top: 64, bottom: 64, left: 56, right: 540 },
    colors: {
      ...CUSTOMER_PORTAL_INVOICE_PDF_THEME.colors,
      totalBand: CUSTOMER_PORTAL_INVOICE_PDF_THEME.colors.accentStrong,
      tableHead: CUSTOMER_PORTAL_INVOICE_PDF_THEME.colors.accent,
    },
    fonts: CUSTOMER_PORTAL_INVOICE_PDF_THEME.fonts,
  };
}

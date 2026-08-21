export type PdfRgb = [number, number, number];

export const CUSTOMER_PORTAL_INVOICE_PDF_THEME = {
  colors: {
    header: [20, 27, 56] as PdfRgb, // navy #141B38
    headerText: [255, 255, 255] as PdfRgb,
    text: [43, 49, 80] as PdfRgb, // neutral-800 #2B3150
    muted: [90, 97, 128] as PdfRgb, // neutral-600 #5A6180
    border: [223, 226, 238] as PdfRgb, // neutral-200 #DFE2EE
    secondary: [246, 247, 251] as PdfRgb, // neutral-50 #F6F7FB
    accent: [238, 240, 254] as PdfRgb, // indigo-50 #EEF0FE
    accentStrong: [223, 226, 253] as PdfRgb, // indigo-100 #DFE2FD
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
  layout: {
    headerHeight: 92,
    companyDetailsTop: 112,
    companyDetailsHeight: 74,
    companyDetailsMaxWidth: 484,
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
    layout: CUSTOMER_PORTAL_INVOICE_PDF_THEME.layout,
  };
}

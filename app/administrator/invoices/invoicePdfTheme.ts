export type PdfRgb = [number, number, number];

export const CUSTOMER_PORTAL_INVOICE_PDF_THEME = {
  colors: {
    header: [20, 27, 56] as PdfRgb, // navy #141B38 (neutral-950)
    headerText: [255, 255, 255] as PdfRgb,
    headerTextMuted: [176, 180, 199] as PdfRgb, // white at ~66% opacity over navy, pre-blended
    text: [43, 49, 80] as PdfRgb, // neutral-800 #2B3150
    bodyMuted: [90, 97, 128] as PdfRgb, // neutral-600 #5A6180 — table headers, GST/no-GST note
    labelMuted: [118, 125, 155] as PdfRgb, // neutral-500 #767D9B — uppercase field labels, footer
    hairline: [237, 239, 246] as PdfRgb, // neutral-100 #EDEFF6 — thin row dividers
    border: [223, 226, 238] as PdfRgb, // neutral-200 #DFE2EE — panel borders, footer rule
    accent: [238, 240, 254] as PdfRgb, // indigo-50 #EEF0FE — total-due band
    brandText: [58, 64, 166] as PdfRgb, // indigo-700 #3A40A6 — brand accent labels, group headers
  },
  fonts: {
    regular: 'helvetica',
    bold: 'helvetica',
    xlarge: 20, // header "Invoice" title
    large: 13, // section headings
    medium: 11, // payment details heading
    default: 10, // body text
    small: 9, // notes, footer
    label: 8, // uppercase field labels, table column headers
    total: 24, // total-amount-due figure
  },
  layout: {
    headerHeight: 92,
    headerRadius: 16,
    panelRadius: 12,
    totalBandRadius: 14,
  },
};

export function buildInvoicePdfConfig() {
  return {
    margins: { top: 50, bottom: 50, left: 50, right: 545 },
    colors: CUSTOMER_PORTAL_INVOICE_PDF_THEME.colors,
    fonts: CUSTOMER_PORTAL_INVOICE_PDF_THEME.fonts,
    layout: CUSTOMER_PORTAL_INVOICE_PDF_THEME.layout,
  };
}

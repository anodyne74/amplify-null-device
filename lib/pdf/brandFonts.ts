import type { jsPDF } from 'jspdf';
import { FONT_BASE64, HEADER_LOGO_PNG_BASE64 } from '@/lib/pdf/brandAssets.generated';
import { PDF_FONT } from '@/lib/pdf/fontFamilies';

export { PDF_FONT };

/** Body text also comes in 'semibold'; display is 'bold' only. */
export type PdfFontStyle = 'normal' | 'semibold' | 'bold';

const REGISTRATIONS: Array<[file: string, family: string, style: PdfFontStyle]> = [
  ['Comfortaa-Bold.ttf', PDF_FONT.display, 'bold'],
  ['Manrope-Regular.ttf', PDF_FONT.body, 'normal'],
  ['Manrope-SemiBold.ttf', PDF_FONT.body, 'semibold'],
  ['Manrope-Bold.ttf', PDF_FONT.body, 'bold'],
  ['JetBrainsMono-Regular.ttf', PDF_FONT.mono, 'normal'],
  ['JetBrainsMono-Bold.ttf', PDF_FONT.mono, 'bold'],
];

/**
 * Embeds the brand fonts in a jsPDF document. Works on the server and in the
 * browser: the fonts are bundled as base64, not read from disk. jsPDF embeds
 * each font once, whichever pages use it.
 */
export function registerBrandFonts(doc: jsPDF): void {
  for (const [file, family, style] of REGISTRATIONS) {
    doc.addFileToVFS(file, FONT_BASE64[file]);
    doc.addFont(file, family, style);
  }
}

/**
 * The white header logo as a PNG data URL, 171x48pt at 4x (see scripts/build-pdf-assets.mjs):
 * public/logo.svg at 219x98pt, cropped to the artwork from (26, 26).
 */
export const HEADER_LOGO_PNG = `data:image/png;base64,${HEADER_LOGO_PNG_BASE64}`;
export const HEADER_LOGO_SIZE = { width: 171, height: 48 } as const;
/** Both PDF headers draw the logo at this fraction of HEADER_LOGO_SIZE. */
export const HEADER_LOGO_SCALE = 0.7;

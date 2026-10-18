import { layoutText, type PositionedText } from '@/lib/pdfLayoutText';

/**
 * The text of a PDF with its page layout kept (lib/pdfLayoutText.ts), pages
 * separated by a blank line. Empty when the PDF has no text layer, a scan or
 * pictures of a sheet, which the caller must not send to the model as if read.
 * pdfjs-dist is listed in serverExternalPackages (next.config.js) so it loads
 * its own worker file in Node instead of being bundled.
 */
export async function extractPdfLayoutText(data: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const document = await task.promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const { items } = await page.getTextContent();
      const positioned: PositionedText[] = [];
      for (const item of items) {
        if ('str' in item) positioned.push({ str: item.str, x: item.transform[4], y: item.transform[5] });
      }
      const pageText = layoutText(positioned);
      if (pageText) pages.push(pageText);
    }
    return pages.join('\n\n');
  } finally {
    await task.destroy();
  }
}

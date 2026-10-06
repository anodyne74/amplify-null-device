/**
 * Shared invoice PDF file name format: "Invoice {CustomerName} {InvoiceNumber}.pdf"
 * Used for both customer/admin PDF downloads and emailed invoice attachments.
 */
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\r\n]+/g;

export function buildInvoiceFileName(
  customerName: string | null | undefined,
  invoiceNumber: string | null | undefined,
  fallbackId: string
): string {
  const namePart = (customerName || 'Customer').replace(INVALID_FILENAME_CHARS, ' ').trim();
  const numberPart = (invoiceNumber || fallbackId).replace(INVALID_FILENAME_CHARS, ' ').trim();
  return `Invoice ${namePart} ${numberPart}.pdf`;
}

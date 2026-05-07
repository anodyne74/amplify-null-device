export interface ParsedInvoiceDetails {
  invoiceNumber?: string;
  invoiceDate?: string;
  totalAmount?: number;
  routeCode?: string;
}

function parseDateToIso(raw: string): string | undefined {
  const text = raw.trim();
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  const slashMatch = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!slashMatch) return undefined;

  const month = Number(slashMatch[1]);
  const day = Number(slashMatch[2]);
  let year = Number(slashMatch[3]);
  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const iso = `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  return iso;
}

function parseCurrency(raw: string): number | undefined {
  const normalized = raw.replace(/[^\d.\-]/g, '');
  if (!normalized) return undefined;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return undefined;
  return value;
}

export function parseInvoiceText(text: string): ParsedInvoiceDetails {
  const normalized = text.replace(/\s+/g, ' ');

  const invoiceNumberMatch =
    normalized.match(/invoice\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9\/-]{3,})/i) ??
    normalized.match(/\b(INV[-\s]?[A-Z0-9-]{2,})\b/i);

  const invoiceDateMatch = normalized.match(
    /invoice\s*date\s*[:#-]?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i
  );

  const totalMatch =
    normalized.match(/(?:total\s*(?:amount)?|amount\s*due|balance\s*due)\s*[:#-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i) ??
    normalized.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:total|due)/i);

  const routeCodeMatch = normalized.match(/\b(W\d{2}-\d{2}-\d{3})\b/i);

  return {
    invoiceNumber: invoiceNumberMatch?.[1]?.replace(/\s+/g, '').trim(),
    invoiceDate: invoiceDateMatch ? parseDateToIso(invoiceDateMatch[1]) : undefined,
    totalAmount: totalMatch ? parseCurrency(totalMatch[1]) : undefined,
    routeCode: routeCodeMatch?.[1]?.toUpperCase(),
  };
}
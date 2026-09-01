import type { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { buildInvoicePdfConfig } from './invoicePdfTheme';
import { formatStopProperty, groupStopsByAgent, type StopSummary } from './stopFormatting';

type InvoicePdfConfig = ReturnType<typeof buildInvoicePdfConfig>;

export interface InvoicePdfLineRow {
  description: string;
  quantityHours: number;
  hourlyRate: number;
  total: number;
}

export interface InvoicePdfDocumentData {
  invoiceNumber: string;
  invoiceDate: string;
  routeCode: string;
  logoDataUrl: string | null;
  company: { name: string; abn: string; phone: string; address: string; email: string };
  customer: { name: string; address: string };
  lines: InvoicePdfLineRow[];
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  payment: { accountName: string; bsb: string; accountNumber: string };
  routeStops: StopSummary[];
  groupStopsByAgentForCustomer: boolean;
}

const PAGE_WIDTH = 595;
const PAGE_BOTTOM = 780;
const FOOTER_LINE_Y = 812;
const FOOTER_TEXT_Y = 826;

/**
 * Draws the full invoice document (letterhead, totals, payment details, route
 * stop breakdown, footer) onto an already-constructed jsPDF instance, matching
 * the "Invoice" design template. Pure w.r.t. its inputs — all data fetching,
 * number crunching and file upload stays in useInvoiceDocumentActions.ts.
 */
export function drawInvoicePdfDocument(doc: jsPDF, config: InvoicePdfConfig, data: InvoicePdfDocumentData): void {
  const contentLeft = config.margins.left;
  const contentRight = config.margins.right;
  const contentWidth = contentRight - contentLeft;

  let y = config.margins.top;

  const ensurePageSpace = (requiredHeight: number) => {
    if (y + requiredHeight <= PAGE_BOTTOM) return;
    doc.addPage();
    y = config.margins.top;
  };

  // 1. Header — rounded navy panel with logo and invoice title/number.
  const headerTop = y;
  const headerHeight = config.layout.headerHeight;
  doc.setFillColor(...config.colors.header);
  doc.roundedRect(contentLeft, headerTop, contentWidth, headerHeight, config.layout.headerRadius, config.layout.headerRadius, 'F');

  if (data.logoDataUrl) {
    doc.addImage(data.logoDataUrl, 'PNG', contentLeft + 24, headerTop + (headerHeight - 96) / 2, 220, 96);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(config.fonts.xlarge);
  doc.setTextColor(...config.colors.headerText);
  doc.text('Invoice', contentRight - 24, headerTop + 38, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(config.fonts.small);
  doc.setTextColor(...config.colors.headerTextMuted);
  doc.text(data.invoiceNumber, contentRight - 24, headerTop + 54, { align: 'right' });

  y = headerTop + headerHeight + 30;

  // 2. Three-column info grid — From / Bill to / Route, Date, Invoice.
  const gap = 24;
  const colWidth = (contentWidth - gap * 2) / 3;
  const col1X = contentLeft;
  const col2X = col1X + colWidth + gap;
  const col3X = col2X + colWidth + gap;
  const gridTop = y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(config.fonts.label);
  doc.setTextColor(...config.colors.labelMuted);
  doc.text('FROM', col1X, gridTop);
  doc.text('BILL TO', col2X, gridTop);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(config.fonts.default);
  doc.setTextColor(...config.colors.header);
  doc.text(data.company.name, col1X, gridTop + 16);
  doc.text(data.customer.name, col2X, gridTop + 16);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...config.colors.text);
  const companyLines = doc.splitTextToSize(`${data.company.abn}\n${data.company.phone}\n${data.company.address}`, colWidth);
  doc.text(companyLines, col1X, gridTop + 30);
  const customerLines = doc.splitTextToSize(data.customer.address, colWidth);
  doc.text(customerLines, col2X, gridTop + 30);

  const metaRows: Array<[string, string]> = [
    ['Route', data.routeCode],
    ['Date', data.invoiceDate],
    ['Invoice', data.invoiceNumber],
  ];
  metaRows.forEach(([label, value], index) => {
    const rowY = gridTop + index * 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(config.fonts.default);
    doc.setTextColor(...config.colors.labelMuted);
    doc.text(label, col3X, rowY);
    doc.setTextColor(...config.colors.header);
    doc.text(value, col3X + colWidth, rowY, { align: 'right' });
  });

  y = gridTop + 30 + Math.max(companyLines.length, customerLines.length) * 12 + 26;

  // 3. Total amount due band.
  ensurePageSpace(80);
  const bandTop = y;
  const bandHeight = 72;
  doc.setFillColor(...config.colors.accent);
  doc.roundedRect(contentLeft, bandTop, contentWidth, bandHeight, config.layout.totalBandRadius, config.layout.totalBandRadius, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(config.fonts.label);
  doc.setTextColor(...config.colors.brandText);
  doc.text('TOTAL AMOUNT DUE', contentLeft + 20, bandTop + 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(config.fonts.small);
  doc.setTextColor(...config.colors.bodyMuted);
  const termsLines = doc.splitTextToSize(
    'Payment terms are due on receipt unless otherwise agreed. Please quote the invoice number in all correspondence.',
    contentWidth - 220
  );
  doc.text(termsLines, contentLeft + 20, bandTop + 38);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(config.fonts.total);
  doc.setTextColor(...config.colors.header);
  doc.text(`$${data.totalAmount.toFixed(2)}`, contentRight - 20, bandTop + 44, { align: 'right' });

  y = bandTop + bandHeight + 34;

  // 4. Invoice lines.
  ensurePageSpace(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(config.fonts.large);
  doc.setTextColor(...config.colors.header);
  doc.text('Invoice lines', contentLeft, y);

  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(config.fonts.label);
  doc.setTextColor(...config.colors.bodyMuted);
  doc.text('DESCRIPTION', contentLeft, y);
  doc.text('QTY (HOURS)', contentRight - 190, y, { align: 'right' });
  doc.text('RATE', contentRight - 100, y, { align: 'right' });
  doc.text('TOTAL', contentRight, y, { align: 'right' });

  y += 6;
  doc.setDrawColor(...config.colors.header);
  doc.setLineWidth(1.1);
  doc.line(contentLeft, y, contentRight, y);

  for (const row of data.lines) {
    ensurePageSpace(24);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(config.fonts.default);
    doc.setTextColor(...config.colors.text);
    doc.text(row.description, contentLeft, y, { maxWidth: contentWidth - 260 });
    doc.text(row.quantityHours.toFixed(2), contentRight - 190, y, { align: 'right' });
    doc.text(`$${row.hourlyRate.toFixed(2)}`, contentRight - 100, y, { align: 'right' });
    doc.text(`$${row.total.toFixed(2)}`, contentRight, y, { align: 'right' });
    y += 3;
    doc.setDrawColor(...config.colors.hairline);
    doc.setLineWidth(0.6);
    doc.line(contentLeft, y, contentRight, y);
  }

  // 5. Totals — Subtotal, optional GST line, bold Total due, no-GST footnote.
  ensurePageSpace(70);
  const totalsWidth = 200;
  const totalsX = contentRight - totalsWidth;

  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(config.fonts.default);
  doc.setTextColor(...config.colors.bodyMuted);
  doc.text('Subtotal', totalsX, y);
  doc.setTextColor(...config.colors.text);
  doc.text(`$${data.subtotal.toFixed(2)}`, contentRight, y, { align: 'right' });

  if (data.gstAmount > 0) {
    y += 16;
    doc.setTextColor(...config.colors.bodyMuted);
    doc.text('GST (10%)', totalsX, y);
    doc.setTextColor(...config.colors.text);
    doc.text(`$${data.gstAmount.toFixed(2)}`, contentRight, y, { align: 'right' });
  }

  y += 14;
  doc.setDrawColor(...config.colors.header);
  doc.setLineWidth(1.1);
  doc.line(totalsX, y, contentRight, y);

  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...config.colors.header);
  doc.text('Total due', totalsX, y);
  doc.text(`$${data.totalAmount.toFixed(2)}`, contentRight, y, { align: 'right' });

  if (data.gstAmount <= 0) {
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(config.fonts.small);
    doc.setTextColor(...config.colors.labelMuted);
    doc.text('No GST has been charged', contentRight, y, { align: 'right' });
  }

  // 6. Payment details — always the last block on page 1.
  ensurePageSpace(100);
  y += 30;
  const paymentTop = y;
  const paymentHeight = 78;
  doc.setDrawColor(...config.colors.border);
  doc.setLineWidth(1);
  doc.roundedRect(contentLeft, paymentTop, contentWidth, paymentHeight, config.layout.panelRadius, config.layout.panelRadius, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(config.fonts.medium);
  doc.setTextColor(...config.colors.header);
  doc.text('Payment details', contentLeft + 20, paymentTop + 22);

  const paymentFields: Array<[string, string]> = [
    ['NAME', data.payment.accountName],
    ['BSB', data.payment.bsb],
    ['ACCOUNT', data.payment.accountNumber],
  ];
  const paymentColWidth = contentWidth / 3;
  paymentFields.forEach(([label, value], index) => {
    const fieldX = contentLeft + 20 + index * paymentColWidth;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(config.fonts.label);
    doc.setTextColor(...config.colors.labelMuted);
    doc.text(label, fieldX, paymentTop + 44);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(config.fonts.default);
    doc.setTextColor(...config.colors.header);
    doc.text(value, fieldX, paymentTop + 60);
  });

  // Route stop details always starts on a new page — payment details is
  // deliberately the last thing on page 1, regardless of how much room is left.
  doc.addPage();
  y = config.margins.top;

  if (data.routeStops.length > 0) {
    const totalSigns = data.routeStops.reduce((sum, stop) => sum + (stop.numberOfSigns ?? 0), 0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(config.fonts.large);
    doc.setTextColor(...config.colors.header);
    doc.text('Route stop details', contentLeft, y);

    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(config.fonts.small);
    doc.setTextColor(...config.colors.labelMuted);
    doc.text(
      `${data.routeStops.length} stop${data.routeStops.length === 1 ? '' : 's'} · ${totalSigns} signs placed and collected on route ${data.routeCode}.`,
      contentLeft,
      y
    );

    y += 12;

    // 7. Route stop table — grouped by agent (with per-agent subtotal rows)
    // when the customer's on-charging preference calls for it, flat otherwise.
    const stopTableBody = data.groupStopsByAgentForCustomer
      ? groupStopsByAgent(data.routeStops).flatMap((group) => [
          [
            {
              content: group.agent,
              colSpan: 2,
              styles: { fontStyle: 'bold' as const, textColor: config.colors.brandText, fontSize: config.fonts.label },
            },
          ],
          ...group.stops.map((stop) => [
            formatStopProperty(stop),
            typeof stop.numberOfSigns === 'number' ? String(stop.numberOfSigns) : '—',
          ]),
          [
            {
              content: `${group.agent} subtotal`,
              styles: {
                fontStyle: 'bold' as const,
                textColor: config.colors.header,
                lineWidth: { top: 1.1 },
                lineColor: config.colors.header,
              },
            },
            {
              content: String(group.signCount),
              styles: {
                fontStyle: 'bold' as const,
                textColor: config.colors.header,
                halign: 'right' as const,
                lineWidth: { top: 1.1 },
                lineColor: config.colors.header,
              },
            },
          ],
        ])
      : data.routeStops.map((stop) => [
          formatStopProperty(stop),
          stop.agent?.trim() || '—',
          typeof stop.numberOfSigns === 'number' ? String(stop.numberOfSigns) : '—',
        ]);

    autoTable(doc, {
      startY: y,
      head: data.groupStopsByAgentForCustomer ? [['Property', 'Signs']] : [['Property', 'Agent', 'Signs']],
      body: stopTableBody,
      theme: 'plain',
      margin: { left: contentLeft, right: PAGE_WIDTH - contentRight },
      styles: {
        font: 'helvetica',
        fontSize: config.fonts.default,
        textColor: config.colors.text,
        lineColor: config.colors.hairline,
        lineWidth: { bottom: 0.6 },
      },
      headStyles: {
        textColor: config.colors.bodyMuted,
        fontStyle: 'bold',
        fontSize: config.fonts.label,
        lineWidth: { bottom: 1.1 },
        lineColor: config.colors.header,
      },
      columnStyles: data.groupStopsByAgentForCustomer
        ? { 0: { cellWidth: contentWidth - 70 }, 1: { cellWidth: 70, halign: 'right' } }
        : { 0: { cellWidth: contentWidth - 154 }, 1: { cellWidth: 84 }, 2: { cellWidth: 70, halign: 'right' } },
      didParseCell: (cellData) => {
        const lastColumn = data.groupStopsByAgentForCustomer ? 1 : 2;
        if (cellData.section === 'head' && cellData.column.index === lastColumn) {
          cellData.cell.styles.halign = 'right';
        }
      },
    });
  }

  // 8. Footer on every page.
  const totalPages = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setDrawColor(...config.colors.border);
    doc.setLineWidth(0.75);
    doc.line(contentLeft, FOOTER_LINE_Y, contentRight, FOOTER_LINE_Y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(config.fonts.small);
    doc.setTextColor(...config.colors.labelMuted);
    doc.text(data.company.name, contentLeft, FOOTER_TEXT_Y);
    doc.text(data.company.abn, contentLeft + contentWidth * 0.32, FOOTER_TEXT_Y);
    doc.text(data.company.phone, contentLeft + contentWidth * 0.6, FOOTER_TEXT_Y);
    doc.text(data.company.email, contentRight, FOOTER_TEXT_Y, { align: 'right' });
  }
}

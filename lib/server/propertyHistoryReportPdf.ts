import { jsPDF } from 'jspdf';
import { autoTable, type CellHookData, type FontStyle, type Styles } from 'jspdf-autotable';
import { CUSTOMER_PORTAL_INVOICE_PDF_THEME, type PdfRgb } from '@/app/administrator/invoices/invoicePdfTheme';
import { HEADER_LOGO_PNG, HEADER_LOGO_SIZE, PDF_FONT, registerBrandFonts, type PdfFontStyle } from '@/lib/pdf/brandFonts';
import { VISIT_STATUS_LABELS, type PropertyGroup, type PropertyHistoryResult, type VisitRow } from '@/lib/propertyHistory';
import { reportSummaryLine, reportTotals, resultProperties, type ReportSearch } from '@/lib/propertyHistoryReport';
import { titleCase } from '@/lib/format';

export interface PropertyHistoryReportPdfInput {
  referenceNumber: string;
  organisation: { companyName: string; abn: string; phone: string; address: string };
  /** The Customer's name, or "All customers". */
  customerLabel: string;
  /** The Customer's address; null for an all-customers report or a Customer without one. */
  customerAddress: string | null;
  generatedBy: string;
  generatedAt: string;
  search: ReportSearch;
  filterLabels: string[];
  result: PropertyHistoryResult;
  /** Adds the staff-only columns; a customer's report never has them. */
  staff: boolean;
}

const { colors, layout } = CUSTOMER_PORTAL_INVOICE_PDF_THEME;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50.4; // 0.7in
const LEFT = MARGIN;
const RIGHT = PAGE_WIDTH - MARGIN;
const WIDTH = RIGHT - LEFT;
const TOP = MARGIN;
const FOOTER_Y = PAGE_HEIGHT - MARGIN + 6;
const FOOTER_RULE_Y = FOOTER_Y - 14;
const CONTENT_BOTTOM = FOOTER_RULE_Y - 12;
const LABEL_SPACING = 0.9;
const STATUS_DOT_RADIUS = 2.6;

const TIMESTAMP = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Sydney',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

const SYDNEY_PARTS = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Sydney',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** e.g. 2026-09-27 13:04, in Sydney time. */
function sydneyMinute(iso: string): string {
  const part = Object.fromEntries(SYDNEY_PARTS.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]));
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "{company} · ABN {abn}"; the settings may already carry the "ABN" prefix. */
function companyLine(organisation: PropertyHistoryReportPdfInput['organisation']): string {
  const abn = organisation.abn.replace(/^\s*ABN\s*/i, '').trim();
  return abn ? `${organisation.companyName} · ABN ${abn}` : organisation.companyName;
}

type Column = { header: string; width: number; staffWidth: number; mono?: boolean; align?: 'right' };

// Widths in points; each set adds up to the content width, so the table never clips.
const COLUMNS: Column[] = [
  { header: 'Date', width: 70, staffWidth: 48, mono: true },
  { header: 'Route', width: 70, staffWidth: 48, mono: true },
  { header: 'Agent', width: 92, staffWidth: 50 },
  { header: 'Auction', width: 44, staffWidth: 38 },
  { header: 'Signs', width: 34, staffWidth: 26, mono: true, align: 'right' },
  { header: 'Invoice', width: 86, staffWidth: 48, mono: true },
  { header: 'Status', width: WIDTH - 396, staffWidth: 64 },
];
const STAFF_COLUMNS: Column[] = [
  { header: 'Customer', width: 0, staffWidth: 48 },
  { header: 'Operator', width: 0, staffWidth: 40 },
  { header: 'Missing Signs', width: 0, staffWidth: 36, mono: true, align: 'right' },
  { header: 'Location', width: 0, staffWidth: WIDTH - 446 },
];
const STATUS_COLUMN = COLUMNS.findIndex((column) => column.header === 'Status');

function visitCells(row: VisitRow, staff: boolean): string[] {
  const cells = [
    row.date ?? '—',
    row.routeCode ?? row.routeId,
    row.agent || '—',
    row.auction ? 'Auction' : '—',
    String(row.signsPlaced),
    row.invoices.length > 0 ? row.invoices.map((invoice) => invoice.invoiceNumber).join(', ') : 'Not invoiced',
    VISIT_STATUS_LABELS[row.status],
  ];
  if (!staff) return cells;
  return [
    ...cells,
    row.customerName ?? '—',
    row.operatorName ?? '—',
    row.missingSigns ? String(row.missingSigns) : '—',
    row.locationPrecision ? titleCase(row.locationPrecision) : '—',
  ];
}

function statusColors(status: VisitRow['status']): { dot: PdfRgb; text: PdfRgb } {
  if (status === 'planned') return { dot: colors.amber, text: colors.amberText };
  if (status === 'completed') return { dot: colors.brandText, text: colors.brandText };
  return { dot: colors.labelMuted, text: colors.text };
}

/**
 * Renders a Property History Report (#291, restyled in #387) on the server:
 * the logo and reference, who it's for, the search and who generated it, a
 * totals band, then one table per Property, scheduled Visits first, and a
 * footer on every page. Everything is plain text -- a report is handed to
 * agents, so it carries no links into the portal.
 */
export function renderPropertyHistoryReportPdf(input: PropertyHistoryReportPdfInput): ArrayBuffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  registerBrandFonts(doc);
  let y = TOP;

  const font = (family: string, style: PdfFontStyle, size: number, color: PdfRgb) => {
    doc.setFont(family, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const labelWidth = (text: string) => doc.getTextWidth(text.toUpperCase()) + LABEL_SPACING * (text.length - 1);

  // An uppercase, letter-spaced label. jsPDF doesn't count character spacing when aligning, so place it by hand,
  // measuring before the spacing is set: for embedded fonts getTextWidth counts it, but for the others it doesn't.
  const label = (text: string, x: number, baseline: number, color: PdfRgb, align: 'left' | 'right' = 'left') => {
    font(PDF_FONT.body, 'bold', 8, color);
    const width = labelWidth(text);
    doc.setCharSpace(LABEL_SPACING);
    doc.text(text.toUpperCase(), align === 'right' ? x - width : x, baseline);
    doc.setCharSpace(0);
  };

  const ensureSpace = (height: number) => {
    if (y + height <= CONTENT_BOTTOM) return;
    doc.addPage();
    y = TOP;
  };

  // Header band: the logo on the left, the title and reference on the right.
  const headerHeight = HEADER_LOGO_SIZE.height + 44;
  doc.setFillColor(...colors.header);
  doc.roundedRect(LEFT, y, WIDTH, headerHeight, layout.headerRadius, layout.headerRadius, 'F');
  doc.addImage(HEADER_LOGO_PNG, 'PNG', LEFT + 28, y + 22, HEADER_LOGO_SIZE.width, HEADER_LOGO_SIZE.height);
  font(PDF_FONT.display, 'bold', 20, colors.headerText);
  doc.text('Property history', RIGHT - 28, y + 44, { align: 'right' });
  font(PDF_FONT.mono, 'normal', 9, colors.headerTextMuted);
  doc.text(input.referenceNumber, RIGHT - 28, y + 60, { align: 'right' });
  y += headerHeight + 30;

  // Details: the Customer, the search, and when, by whom and which reference.
  const unit = (WIDTH - 2 * 28) / 3.2;
  const detailX = [LEFT, LEFT + unit + 28, LEFT + 2 * unit + 56];
  const detailWidth = [unit, unit, unit * 1.2];
  const detailsTop = y;
  let detailsBottom = y;

  const detailColumn = (column: number, heading: string, strong: string, rest: string | null) => {
    label(heading, detailX[column], detailsTop, colors.labelMuted);
    let lineY = detailsTop + 16;
    font(PDF_FONT.body, 'bold', 10, colors.strong);
    const strongLines: string[] = doc.splitTextToSize(strong, detailWidth[column]);
    doc.text(strongLines, detailX[column], lineY, { lineHeightFactor: 1.35 });
    lineY += strongLines.length * 13.5;
    if (rest) {
      font(PDF_FONT.body, 'normal', 10, colors.text);
      const restLines: string[] = doc.splitTextToSize(rest, detailWidth[column]);
      doc.text(restLines, detailX[column], lineY, { lineHeightFactor: 1.35 });
      lineY += restLines.length * 13.5;
    }
    detailsBottom = Math.max(detailsBottom, lineY);
  };

  detailColumn(0, 'Customer', input.customerLabel, input.customerAddress);
  const filters = input.filterLabels.length > 0 && input.filterLabels[0] !== 'No filters' ? input.filterLabels.join(' · ') : 'no filters';
  detailColumn(1, 'Search', input.search.text, `${input.search.kind} search · ${filters}`);

  const aboutX = detailX[2];
  const aboutRight = aboutX + detailWidth[2];
  label('Report', aboutX, detailsTop, colors.labelMuted);
  const about: Array<[string, string, string]> = [
    ['Generated', sydneyMinute(input.generatedAt), PDF_FONT.mono],
    ['By', input.generatedBy, PDF_FONT.body],
    ['Reference', input.referenceNumber, PDF_FONT.mono],
  ];
  about.forEach(([name, value, family], index) => {
    const rowY = detailsTop + 16 + index * 15;
    font(PDF_FONT.body, 'normal', 10, colors.labelMuted);
    doc.text(name, aboutX, rowY);
    font(family, family === PDF_FONT.body ? 'semibold' : 'normal', family === PDF_FONT.mono ? 9 : 10, colors.strong);
    const [value1] = doc.splitTextToSize(value, detailWidth[2] - 60) as string[];
    doc.text(value1, aboutRight, rowY, { align: 'right' });
    detailsBottom = Math.max(detailsBottom, rowY);
  });
  y = detailsBottom + 26;

  // Totals band.
  const totals = reportTotals(input.result);
  const figures: Array<[string, number]> = [
    ['Properties', totals.properties],
    ['Completed visits', totals.completedVisits],
    ['Signs placed', totals.signsPlaced],
    ['Scheduled', totals.scheduled],
  ];
  const bandHeight = 72;
  doc.setFillColor(...colors.accent);
  doc.roundedRect(LEFT, y, WIDTH, bandHeight, layout.totalBandRadius, layout.totalBandRadius, 'F');
  const figureWidth = (WIDTH - 44) / figures.length;
  figures.forEach(([name, value], index) => {
    const x = LEFT + 22 + index * figureWidth;
    label(name, x, y + 26, colors.brandText);
    font(PDF_FONT.mono, 'bold', 20, colors.strong);
    doc.text(String(value), x, y + 52);
  });
  y += bandHeight + 30;

  // Visits by property.
  ensureSpace(60);
  font(PDF_FONT.display, 'bold', 13, colors.strong);
  doc.text('Visits by property', LEFT, y + 10);
  y += 26;
  font(PDF_FONT.body, 'normal', 9, colors.labelMuted);
  doc.text(reportSummaryLine(input.search.text, input.result), LEFT, y);
  y += 12;

  const columns = input.staff ? [...COLUMNS, ...STAFF_COLUMNS] : COLUMNS;
  const bodySize = input.staff ? 7 : 9.5;
  const padding = input.staff ? 3 : 5;
  const columnStyles: Record<number, Partial<Styles>> = Object.fromEntries(
    columns.map((column, index): [number, Partial<Styles>] => [
      index,
      {
        cellWidth: input.staff ? column.staffWidth : column.width,
        font: column.mono ? PDF_FONT.mono : PDF_FONT.body,
        halign: column.align ?? 'left',
        ...(index === 0 ? { textColor: colors.strong } : {}),
      },
    ])
  );

  // A property's gap and heading, the table's header row and a two-line row.
  const KEEP_WITH_HEADING = 18 + 16 + (input.staff ? 26 : 22) + (input.staff ? 30 : 36);

  const visitTable = (rows: VisitRow[]) => {
    // autoTable hands hooks each row's cells, so map them back to their Visit.
    const visitOf = new Map<unknown, VisitRow>();
    const body = rows.map((row) => {
      const cells = visitCells(row, input.staff);
      visitOf.set(cells, row);
      return cells;
    });
    autoTable(doc, {
      startY: y,
      head: [columns.map((column) => column.header.toUpperCase())],
      body,
      theme: 'plain',
      margin: { left: LEFT, right: PAGE_WIDTH - RIGHT, top: TOP, bottom: PAGE_HEIGHT - CONTENT_BOTTOM },
      tableWidth: WIDTH,
      rowPageBreak: 'avoid',
      styles: {
        font: PDF_FONT.body,
        fontStyle: 'normal',
        fontSize: bodySize,
        textColor: colors.text,
        cellPadding: { top: 5, bottom: 5, left: padding, right: padding },
        lineColor: colors.hairline,
        lineWidth: { bottom: 1 },
        overflow: 'linebreak',
      },
      headStyles: {
        font: PDF_FONT.body,
        fontStyle: 'bold',
        fontSize: input.staff ? 6 : 7.5,
        textColor: colors.bodyMuted,
        lineColor: colors.strong,
        lineWidth: { bottom: 1.5 },
      },
      columnStyles,
      didParseCell: (data: CellHookData) => {
        if (data.section === 'head') data.cell.styles.halign = columns[data.column.index].align ?? 'left';
        if (data.section !== 'body' || data.column.index !== STATUS_COLUMN) return;
        const row = visitOf.get(data.row.raw);
        if (!row) return;
        data.cell.styles.fontStyle = 'semibold' as FontStyle;
        data.cell.styles.textColor = statusColors(row.status).text;
        data.cell.styles.cellPadding = { top: 5, bottom: 5, left: padding + STATUS_DOT_RADIUS * 2 + 4, right: padding };
      },
      didDrawCell: (data: CellHookData) => {
        const row = data.section === 'body' && data.column.index === STATUS_COLUMN ? visitOf.get(data.row.raw) : undefined;
        if (!row) return;
        doc.setFillColor(...statusColors(row.status).dot);
        doc.circle(data.cell.x + padding + STATUS_DOT_RADIUS, data.cell.y + 5 + bodySize * 0.45, STATUS_DOT_RADIUS, 'F');
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  };

  const propertySection = (property: PropertyGroup) => {
    // The heading, the table's header row and its first row stay together.
    ensureSpace(KEEP_WITH_HEADING);
    y += 18;
    const count = plural(property.visitCount, 'visit', 'visits') + (property.scheduled.length > 0 ? ` · ${property.scheduled.length} scheduled` : '');
    label(count, RIGHT, y + 8, colors.brandText, 'right');
    const countWidth = labelWidth(count) + 12;
    font(PDF_FONT.body, 'bold', 11, colors.strong);
    const [address] = doc.splitTextToSize(property.address, WIDTH - countWidth) as string[];
    doc.text(address, LEFT, y + 8);
    y += 16;
    visitTable([...property.scheduled, ...property.visits]);
  };

  if (resultProperties(input.result).length === 0) {
    y += 12;
    font(PDF_FONT.body, 'normal', 10, colors.labelMuted);
    doc.text('No Visits match this search.', LEFT, y);
  } else if (input.result.level === 'suburb') {
    for (const street of input.result.streets) {
      ensureSpace(24 + KEEP_WITH_HEADING);
      y += 24;
      font(PDF_FONT.body, 'bold', 10.5, colors.brandText);
      doc.text(`${titleCase(street.street)} · ${plural(street.properties.length, 'property', 'properties')}`, LEFT, y);
      doc.setDrawColor(...colors.border);
      doc.setLineWidth(1);
      doc.line(LEFT, y + 6, RIGHT, y + 6);
      y += 6;
      street.properties.forEach(propertySection);
    }
  } else {
    resultProperties(input.result).forEach(propertySection);
  }

  const snapshot = `Snapshot as at ${TIMESTAMP.format(new Date(input.generatedAt))}`;
  const company = companyLine(input.organisation);
  for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(1);
    doc.line(LEFT, FOOTER_RULE_Y, RIGHT, FOOTER_RULE_Y);
    font(PDF_FONT.body, 'normal', 9, colors.labelMuted);
    doc.text(snapshot, LEFT, FOOTER_Y);
    doc.text(company, RIGHT, FOOTER_Y, { align: 'right' });
    font(PDF_FONT.mono, 'normal', 9, colors.labelMuted);
    doc.text(input.referenceNumber, LEFT + WIDTH / 2, FOOTER_Y, { align: 'center' });
  }

  return doc.output('arraybuffer');
}

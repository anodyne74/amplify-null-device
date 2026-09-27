import type { PropertyHistoryFilters, PropertyHistorySearch } from '@/lib/propertyHistory';
import {
  canSeeReport,
  countPropertyHistory,
  describeFilters,
  describeSearch,
  newReportReference,
  reportObjectKey,
  reportRetention,
  type PropertyHistoryReportSummary,
  type ReportViewer,
} from '@/lib/propertyHistoryReport';
import { listAllPages } from '@/lib/listAll';
import type { PropertyHistoryCaller } from '@/lib/server/authorizePropertyHistoryRequest';
import type { IamDataClient } from '@/lib/server/iamDataClient';
import { searchPropertyHistory } from '@/lib/server/propertyHistory';
import { renderPropertyHistoryReportPdf } from '@/lib/server/propertyHistoryReportPdf';
import type { ReportStore } from '@/lib/server/reportStorage';

/**
 * Property History Reports (#291) as the reports API runs them: generate a
 * frozen snapshot (ADR 0002) on the server (ADR 0003), list the ones a caller
 * may see, and open one. Pass the IAM client and caller from
 * authorizePropertyHistoryRequest -- nothing here trusts the request for scope.
 */

// OrganizationSettings is one row with this well-known id (lib/queries/OrganizationSettings.ts).
const ORGANIZATION_SETTINGS_ID = 'organization';

export class ReportError extends Error {}

type ReportRecord = {
  id: string;
  referenceNumber: string;
  audience?: 'customer' | 'administrator' | null;
  customerId?: string | null;
  customerName?: string | null;
  generatedByName?: string | null;
  generatedAt: string;
  searchLabel?: string | null;
  filterLabels?: (string | null)[] | null;
  propertyCount?: number | null;
  visitCount?: number | null;
  s3Key: string;
  activeUntil?: string | null;
};

function toSummary(record: ReportRecord): PropertyHistoryReportSummary {
  return {
    id: record.id,
    referenceNumber: record.referenceNumber,
    audience: record.audience === 'customer' ? 'customer' : 'administrator',
    customerId: record.customerId ?? null,
    customerName: record.customerName ?? null,
    generatedByName: record.generatedByName ?? '',
    generatedAt: record.generatedAt,
    searchLabel: record.searchLabel ?? '',
    filterLabels: (record.filterLabels ?? []).filter((label): label is string => !!label),
    propertyCount: record.propertyCount ?? 0,
    visitCount: record.visitCount ?? 0,
    activeUntil: record.activeUntil ?? '',
  };
}

function messages(errors: readonly unknown[]): string {
  return errors.map((error) => (error as { message?: string })?.message ?? String(error)).join('; ');
}

async function customerName(client: IamDataClient, customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data, errors } = await client.models.Customer.get({ id: customerId }, { selectionSet: ['id', 'name'] });
  if (errors?.length) throw new ReportError(`Could not read the Customer: ${messages(errors)}`);
  return data?.name ?? customerId;
}

async function organisation(client: IamDataClient) {
  const { data, errors } = await client.models.OrganizationSettings.get({ id: ORGANIZATION_SETTINGS_ID });
  if (errors?.length) throw new ReportError(`Could not read the organisation settings: ${messages(errors)}`);
  return { companyName: data?.companyName || 'Null Device', abn: data?.abn ?? '', phone: data?.phone ?? '', address: data?.address ?? '' };
}

/**
 * Runs the search as the caller would see it, renders the PDF, files it under
 * reports/{customerId}/ and records it, logging the generation. A customer's
 * report always covers their own Customer with the customer-safe fields; an
 * administrator's covers the Customer they filtered to, or all of them. Any
 * failure throws, having undone whatever was already written.
 */
export async function generatePropertyHistoryReport(
  client: IamDataClient,
  store: ReportStore,
  caller: PropertyHistoryCaller,
  author: { sub: string; name: string },
  search: PropertyHistorySearch,
  filters: PropertyHistoryFilters,
  now: Date = new Date()
): Promise<{ report: PropertyHistoryReportSummary; url: string }> {
  const reportFilters = caller.audience === 'customer' ? { ...filters, customerId: undefined } : filters;
  const result = await searchPropertyHistory(client, caller, search, reportFilters);

  const customerId = caller.audience === 'customer' ? caller.customerId : (filters.customerId ?? null);
  const [name, org] = await Promise.all([customerName(client, customerId), organisation(client)]);
  const referenceNumber = newReportReference(now);
  const s3Key = reportObjectKey(customerId, referenceNumber);
  const generatedAt = now.toISOString();
  const counts = countPropertyHistory(result);
  const searchLabel = describeSearch(search, result);
  // A customer's own Customer is the whole report, so it isn't a filter to them.
  const filterLabels = describeFilters(reportFilters, name);

  const pdf = renderPropertyHistoryReportPdf({
    referenceNumber,
    organisation: org,
    customerLabel: name ?? 'All customers',
    generatedBy: author.name,
    generatedAt,
    searchLabel,
    filterLabels,
    counts,
    result,
    staff: caller.audience === 'administrator',
  });
  await store.put(s3Key, pdf, `${referenceNumber}.pdf`);

  const undo = async (what: string, recordId?: string) => {
    if (recordId) {
      const { errors } = await client.models.PropertyHistoryReport.delete({ id: recordId });
      if (errors?.length) console.error('Removing the report record failed:', errors);
    }
    await store.remove(s3Key).catch((error: unknown) => console.error('Removing the report PDF failed:', error));
    throw new ReportError(what);
  };

  const { data: record, errors: recordErrors } = await client.models.PropertyHistoryReport.create({
    referenceNumber,
    audience: caller.audience,
    customerId,
    customerName: name,
    generatedBySub: author.sub,
    generatedByName: author.name,
    generatedAt,
    // a.json() fields travel as a JSON string.
    search: JSON.stringify(search),
    filters: JSON.stringify(reportFilters),
    searchLabel,
    filterLabels,
    propertyCount: counts.propertyCount,
    visitCount: counts.visitCount,
    s3Key,
    ...reportRetention(now),
  });
  if (recordErrors?.length || !record) {
    console.error('Recording the report failed:', recordErrors);
    return undo('Could not record the report');
  }

  const { errors: auditErrors } = await client.models.AuditLog.create({
    customerId,
    operatorId: author.sub,
    eventType: 'data_access',
    resourceType: 'report',
    resourceId: record.id,
    action: 'property_history_report.generate',
    status: 'success',
    timestamp: generatedAt,
    details: JSON.stringify({ referenceNumber, audience: caller.audience, search, filters: reportFilters, ...counts }),
  });
  if (auditErrors?.length) {
    console.error('Logging the report generation failed:', auditErrors);
    return undo('Could not log the report, so it was not kept', record.id);
  }

  return { report: toSummary(record as ReportRecord), url: await store.signedUrl(s3Key) };
}

/** The reports the caller may see, newest first. */
export async function listPropertyHistoryReports(client: IamDataClient, caller: PropertyHistoryCaller): Promise<PropertyHistoryReportSummary[]> {
  const viewer: ReportViewer = caller;
  const { data, errors } =
    viewer.audience === 'customer'
      ? await listAllPages<ReportRecord>((page) =>
          client.models.PropertyHistoryReport.listPropertyHistoryReportsByCustomer({ customerId: viewer.customerId }, page)
        )
      : await listAllPages<ReportRecord>((page) => client.models.PropertyHistoryReport.list(page));
  if (errors.length > 0) throw new ReportError(`Could not read reports: ${messages(errors)}`);
  return data
    .filter((record) => canSeeReport({ audience: record.audience ?? 'administrator', customerId: record.customerId }, viewer))
    .map(toSummary)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

/** A short-lived link to the report's PDF, or null if there's no such report the caller may see. */
export async function openPropertyHistoryReport(
  client: IamDataClient,
  store: ReportStore,
  caller: PropertyHistoryCaller,
  reportId: string
): Promise<string | null> {
  const { data, errors } = await client.models.PropertyHistoryReport.get({ id: reportId });
  if (errors?.length) throw new ReportError(`Could not read the report: ${messages(errors)}`);
  const record = data as ReportRecord | null;
  if (!record || !canSeeReport({ audience: record.audience ?? 'administrator', customerId: record.customerId }, caller)) return null;
  return store.signedUrl(record.s3Key);
}

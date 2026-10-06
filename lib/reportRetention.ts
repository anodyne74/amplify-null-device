/**
 * Retention for Property History Reports (CONTEXT.md "Retention", #292). A
 * report's state comes from its dates, not a stored flag: active until
 * activeUntil, soft-deleted until purgeAfter, then purged. A manual delete
 * pulls activeUntil back to now; a restore pushes both dates forward. The
 * daily purge job (amplify/functions/report-purge) destroys the PDF and marks
 * the record purgedAt, leaving it as a stub.
 *
 * Kept free of `@/` imports: the purge Lambda imports it by relative path.
 */
import { recordAudit, type AuditClient } from './auditLog';
import { listAll } from './listAll';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_DAYS = 30;
const PURGE_DAYS = 60;

export type ReportState = 'active' | 'deleted' | 'purged';

export interface ReportDates {
  activeUntil?: string | null;
  purgeAfter?: string | null;
  purgedAt?: string | null;
}

/** Active for 30 days from `from`, purged after 60 -- for a new report, or a restored one. */
export function reportRetention(from: Date): { activeUntil: string; purgeAfter: string } {
  return {
    activeUntil: new Date(from.getTime() + ACTIVE_DAYS * DAY_MS).toISOString(),
    purgeAfter: new Date(from.getTime() + PURGE_DAYS * DAY_MS).toISOString(),
  };
}

export function reportState(report: ReportDates, now: Date): ReportState {
  const at = now.toISOString();
  if (report.purgedAt || (report.purgeAfter && at >= report.purgeAfter)) return 'purged';
  if (report.activeUntil && at >= report.activeUntil) return 'deleted';
  return 'active';
}

type PurgeCandidate = { id: string; customerId?: string | null; referenceNumber: string; s3Key: string; purgedAt?: string | null };

type PurgeClient = AuditClient & {
  models: {
    PropertyHistoryReport: {
      update: (input: { id: string; purgedAt: string }) => Promise<{ errors?: readonly unknown[] | null }>;
    };
  };
};

/**
 * The purge job: for every report past purgeAfter and not yet purged, delete
 * its PDF, stamp the record purgedAt (a stub, never restorable) and log it.
 * A restored report's purgeAfter has moved forward, so it isn't picked up. A
 * report that fails part-way is left for the next run; the rest carry on.
 */
export async function purgeExpiredReports(
  client: PurgeClient,
  deleteObject: (key: string) => Promise<void>,
  now: Date
): Promise<{ purged: string[]; failed: string[] }> {
  const at = now.toISOString();
  const { data, errors } = await listAll(client, 'PropertyHistoryReport', { filter: { purgeAfter: { le: at } } });
  if (errors.length > 0) throw new Error(`Could not list reports to purge: ${JSON.stringify(errors)}`);

  const purged: string[] = [];
  const failed: string[] = [];
  for (const report of data as PurgeCandidate[]) {
    if (report.purgedAt) continue;
    try {
      await deleteObject(report.s3Key);
      const { errors: updateErrors } = await client.models.PropertyHistoryReport.update({ id: report.id, purgedAt: at });
      if (updateErrors?.length) throw new Error(`Could not mark the report purged: ${JSON.stringify(updateErrors)}`);
      const audit = await recordAudit(client, {
        customerId: report.customerId,
        eventType: 'data_deletion',
        resource: { type: 'report', id: report.id },
        action: 'property_history_report.purge',
        at,
        details: { referenceNumber: report.referenceNumber, s3Key: report.s3Key, by: 'retention job' },
      });
      // The PDF is already gone, so a missing log entry is reported but not retried.
      if (!audit.ok) console.error(`Logging the purge of ${report.referenceNumber} failed:`, audit.errors);
      purged.push(report.referenceNumber);
    } catch (error) {
      console.error(`Purging ${report.referenceNumber} failed:`, error);
      failed.push(report.referenceNumber);
    }
  }
  return { purged, failed };
}

/**
 * Writes one audit log entry. Every writer builds the entry here, so the rules
 * for its shape live in one place: customerId is left out rather than sent as
 * null (it keys the Customer.auditLogs index, where DynamoDB rejects an
 * explicit null, #395), details travel as a JSON string, the time is stamped,
 * and a `failure` sets the status and reason.
 *
 * What to do when the entry can't be written stays with the caller (undo the
 * change, report it, or carry on), so this never throws: it hands back the
 * errors instead.
 *
 * Takes any data client (browser, IAM or Lambda). Kept free of `@/` imports:
 * the purge Lambda imports lib/reportRetention.ts, and with it this, by
 * relative path.
 */
import type { AuditEventType, AuditResourceType } from "../amplify/types";

export interface AuditEntry {
  /** The user who acted; left out for a scheduled job. */
  actor?: string;
  customerId?: string | null;
  eventType: AuditEventType;
  resource: { type: AuditResourceType; id: string };
  action: string;
  /** Why the action failed; recorded with status 'failure'. */
  failure?: string;
  details?: unknown;
  /** Defaults to now. */
  at?: Date | string;
  ipAddress?: string;
  userAgent?: string;
}

interface AuditLogInput {
  customerId?: string;
  operatorId?: string;
  eventType: AuditEventType;
  resourceType: AuditResourceType;
  resourceId: string;
  action: string;
  status: "success" | "failure";
  reason?: string;
  timestamp: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditClient {
  models: {
    AuditLog: {
      create(
        input: AuditLogInput,
      ): Promise<{ errors?: readonly unknown[] | null }>;
    };
  };
}

export type AuditResult =
  { ok: true } | { ok: false; errors: readonly unknown[] };

export async function recordAudit(
  client: AuditClient,
  entry: AuditEntry,
): Promise<AuditResult> {
  const at = entry.at ?? new Date();
  const input: AuditLogInput = {
    ...(entry.customerId ? { customerId: entry.customerId } : {}),
    ...(entry.actor ? { operatorId: entry.actor } : {}),
    eventType: entry.eventType,
    resourceType: entry.resource.type,
    resourceId: entry.resource.id,
    action: entry.action,
    status: entry.failure ? "failure" : "success",
    ...(entry.failure ? { reason: entry.failure } : {}),
    timestamp: typeof at === "string" ? at : at.toISOString(),
    // a.json() fields travel as a JSON string.
    ...(entry.details !== undefined
      ? { details: JSON.stringify(entry.details) }
      : {}),
    ...(entry.ipAddress ? { ipAddress: entry.ipAddress } : {}),
    ...(entry.userAgent ? { userAgent: entry.userAgent } : {}),
  };
  try {
    const { errors } = await client.models.AuditLog.create(input);
    return errors?.length ? { ok: false, errors } : { ok: true };
  } catch (error) {
    return { ok: false, errors: [error] };
  }
}

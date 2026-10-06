import { recordAudit, type AuditEntry, type AuditResult } from "@/lib/auditLog";
import { getIamDataClient } from "./iamDataClient";

/**
 * Writes an audit entry with the IAM client, for a route that has no client
 * of its own to write it with -- e.g. recording a refused caller, who by
 * definition never got one from authorizeIamRequest(). It can only append an
 * audit entry, so it doesn't widen what an unauthorized request can reach
 * (docs/adr/0001-ssr-iam-access-bypasses-appsync-authorization.md).
 */
export function recordServerAudit(entry: AuditEntry): Promise<AuditResult> {
  return recordAudit(getIamDataClient(), entry);
}

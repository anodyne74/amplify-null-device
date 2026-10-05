/**
 * The audit entry for one Missing Signs change at the door (CONTEXT.md):
 * the Operator logging a missing sign during Pickup, or undoing one. Written
 * after the Stop's count is saved; what to do if it can't be written stays
 * with the caller, as for every recordAudit().
 */
import { recordAudit, type AuditResult } from '@/lib/auditLog';
import { getDataClient } from '@/lib/data-client';
import { fetchUserId } from '@/lib/amplify-config';
import type { Stop } from '@/amplify/types';

export async function auditMissingSign(
  stop: Pick<Stop, 'id' | 'routeId' | 'customerId' | 'propertyKey'>,
  change: 'log' | 'undo',
  missingSignsCount: number
): Promise<AuditResult> {
  return recordAudit(getDataClient(), {
    actor: await fetchUserId(),
    customerId: stop.customerId,
    eventType: 'data_modification',
    resource: { type: 'stop', id: stop.id },
    action: `stop.missing_sign.${change}`,
    details: { routeId: stop.routeId, missingSignsCount, propertyKey: stop.propertyKey ?? null },
  });
}

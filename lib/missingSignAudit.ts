/**
 * The audit entry for one Missing Signs change at the door (CONTEXT.md): the
 * Operator logging a missing sign during Pickup, or undoing one. Written with
 * recordStopAudit once the Stop's count has saved.
 */
import type { OutboxAudit } from '@/lib/signRunOutbox';
import type { Stop } from '@/amplify/types';

export type MissingSignChange = 'log' | 'undo';

export function missingSignAudit(
  stop: Pick<Stop, 'id' | 'routeId' | 'customerId' | 'propertyKey'>,
  change: MissingSignChange,
  missingSignsCount: number
): OutboxAudit {
  return {
    customerId: stop.customerId,
    resourceId: stop.id,
    action: `stop.missingSign.${change}`,
    details: { routeId: stop.routeId, missingSignsCount, propertyKey: stop.propertyKey ?? null },
  };
}

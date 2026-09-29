/**
 * Checks a candidate route date against the service calendar before a route
 * is created — the design's stated rule is that a route is never built on a
 * day either side has blocked (see ServiceCalendar.tsx for the calendar
 * itself). There is no server-side guard: OperatorAvailabilityBlock and
 * CustomerClosureBlock allow full read/write independent of Route, so this
 * is enforced entirely by callers of this function (RouteForm, the admin
 * "new route" import flow) at creation time.
 */
import { listOperatorAvailabilityBlocks } from '@/lib/queries/ListOperatorAvailabilityBlocks';
import { listCustomerClosureBlocks } from '@/lib/customers';

export interface RouteDateBlockResult {
  blocked: boolean;
  type?: 'no_drivers' | 'closed';
  reason?: string;
}

export async function checkRouteDateBlocked(customerId: string, date: string): Promise<RouteDateBlockResult> {
  const [noDriversResult, closedBlocks] = await Promise.all([
    listOperatorAvailabilityBlocks(customerId),
    // Unreadable closed dates count as none, as unreadable no-driver blocks do.
    listCustomerClosureBlocks(customerId).catch(() => []),
  ]);

  const noDriversBlock = (noDriversResult.data || []).find((block) => block.date === date);
  if (noDriversBlock) {
    return { blocked: true, type: 'no_drivers', reason: noDriversBlock.reason || undefined };
  }

  const closedBlock = closedBlocks.find((block) => block.date === date);
  if (closedBlock) {
    return { blocked: true, type: 'closed', reason: closedBlock.reason || undefined };
  }

  return { blocked: false };
}

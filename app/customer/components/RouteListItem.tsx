import { Badge, type BadgeProps } from '@/app/components/ui/core/Badge';
import { getRouteStatusPresentation } from '@/lib/routeStatusHelpers';
import type { RoutePhaseInput, RoutePhaseKey } from '@/lib/signRunPhase';

const ROUTE_STATUS_TONE: Record<RoutePhaseKey, BadgeProps['tone']> = {
  planned: 'warning',
  signs_collected: 'info',
  signs_placed: 'info',
  signs_picked_up: 'info',
  signs_returned: 'info',
  completed: 'success',
};

/** Status pill for a route, reused by the routes table and the dashboard's route tracker. */
export function RouteStatusPill({ route }: { route: RoutePhaseInput }) {
  const { badgeKey, label } = getRouteStatusPresentation(route);
  return (
    <Badge tone={ROUTE_STATUS_TONE[badgeKey]} dot>
      {label}
    </Badge>
  );
}

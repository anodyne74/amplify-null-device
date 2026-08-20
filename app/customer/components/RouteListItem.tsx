import { Badge, type BadgeProps } from '@/app/components/ui/core/Badge';
import { getRouteStatusPresentation } from '@/lib/routeStatusHelpers';

const ROUTE_STATUS_TONE: Record<string, BadgeProps['tone']> = {
  planned: 'warning',
  active: 'info',
  completed: 'success',
  archived: 'neutral',
};

/** Status pill for a route, reused by the routes table and the dashboard's route tracker. */
export function RouteStatusPill({ status }: { status?: string | null }) {
  const { badgeKey, label } = getRouteStatusPresentation(status);
  return (
    <Badge tone={ROUTE_STATUS_TONE[badgeKey] ?? 'neutral'} dot>
      {label}
    </Badge>
  );
}

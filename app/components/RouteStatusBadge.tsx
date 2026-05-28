import { getRouteStatusPresentation } from '@/lib/routeStatusHelpers';

type RouteStatusBadgeClasses = {
  badge: string;
  badgePlanned: string;
  badgeActive: string;
  badgeCompleted: string;
  badgeArchived: string;
};

type RouteStatusBadgeProps = {
  status?: string | null;
  classes: RouteStatusBadgeClasses;
};

export default function RouteStatusBadge({ status, classes }: RouteStatusBadgeProps) {
  const presentation = getRouteStatusPresentation(status);
  const badgeClass = {
    planned: classes.badgePlanned,
    active: classes.badgeActive,
    completed: classes.badgeCompleted,
    archived: classes.badgeArchived,
  }[presentation.badgeKey];

  return (
    <span className={`${classes.badge} ${badgeClass}`}>{presentation.label}</span>
  );
}

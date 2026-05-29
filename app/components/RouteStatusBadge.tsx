import { getRouteStatusPresentation } from '@/lib/routeStatusHelpers';

type RouteStatusBadgeClasses = Readonly<Record<string, string>>;

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

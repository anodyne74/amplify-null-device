import { getRouteStatusPresentation } from '@/lib/routeStatusHelpers';
import type { RoutePhaseInput, RoutePhaseKey } from '@/lib/signRunPhase';

type RouteStatusBadgeClasses = Readonly<Record<string, string>>;

type RouteStatusBadgeProps = {
  route: RoutePhaseInput;
  classes: RouteStatusBadgeClasses;
};

// CSS callers only style 3 buckets (planned / active / completed) — badgeKey
// now ranges over all 6 phases, so the 4 "in progress" phases share the
// existing "active" styling. archived already reads as "completed" (see
// getRoutePhaseKey), so classes.badgeArchived is unused going forward.
const STYLE_BUCKET: Record<RoutePhaseKey, 'badgePlanned' | 'badgeActive' | 'badgeCompleted'> = {
  planned: 'badgePlanned',
  signs_collected: 'badgeActive',
  signs_placed: 'badgeActive',
  signs_picked_up: 'badgeActive',
  signs_returned: 'badgeActive',
  completed: 'badgeCompleted',
};

export default function RouteStatusBadge({ route, classes }: RouteStatusBadgeProps) {
  const presentation = getRouteStatusPresentation(route);
  const badgeClass = classes[STYLE_BUCKET[presentation.badgeKey]];

  return (
    <span className={`${classes.badge} ${badgeClass}`}>{presentation.label}</span>
  );
}

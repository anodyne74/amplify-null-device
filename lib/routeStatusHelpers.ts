export type RouteStatusPresentation = {
  badgeKey: 'planned' | 'active' | 'completed' | 'archived';
  label: string;
};

export function getRouteStatusPresentation(status?: string | null): RouteStatusPresentation {
  const normalized = (status ?? 'planned') as string;

  if (normalized === 'in_progress' || normalized === 'signs_placed' || normalized === 'signs_picked_up') {
    return { badgeKey: 'active', label: normalized.replace(/_/g, ' ') };
  }

  if (normalized === 'completed') {
    return { badgeKey: 'completed', label: 'completed' };
  }

  if (normalized === 'archived') {
    return { badgeKey: 'archived', label: 'archived' };
  }

  return { badgeKey: 'planned', label: normalized || 'unknown' };
}
import { getRouteStatusPresentation } from '@/lib/routeStatusHelpers';

describe('getRouteStatusPresentation', () => {
  it('maps active-phase statuses to active badge with readable labels', () => {
    expect(getRouteStatusPresentation('in_progress')).toEqual({
      badgeKey: 'active',
      label: 'in progress',
    });

    expect(getRouteStatusPresentation('signs_placed')).toEqual({
      badgeKey: 'active',
      label: 'signs placed',
    });

    expect(getRouteStatusPresentation('signs_picked_up')).toEqual({
      badgeKey: 'active',
      label: 'signs picked up',
    });
  });

  it('maps completed and archived statuses to their explicit badge keys', () => {
    expect(getRouteStatusPresentation('completed')).toEqual({
      badgeKey: 'completed',
      label: 'completed',
    });

    expect(getRouteStatusPresentation('archived')).toEqual({
      badgeKey: 'archived',
      label: 'archived',
    });
  });

  it('falls back to planned for planned, unknown, and missing statuses', () => {
    expect(getRouteStatusPresentation('planned')).toEqual({
      badgeKey: 'planned',
      label: 'planned',
    });

    expect(getRouteStatusPresentation('unexpected_status')).toEqual({
      badgeKey: 'planned',
      label: 'unexpected_status',
    });

    expect(getRouteStatusPresentation(undefined)).toEqual({
      badgeKey: 'planned',
      label: 'planned',
    });

    expect(getRouteStatusPresentation(null)).toEqual({
      badgeKey: 'planned',
      label: 'planned',
    });
  });
});

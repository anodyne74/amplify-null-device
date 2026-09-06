import { getRouteStatusPresentation } from '@/lib/routeStatusHelpers';

describe('getRouteStatusPresentation', () => {
  it('reads each in-progress sub-phase off executionPhase, with a readable label', () => {
    expect(getRouteStatusPresentation({ status: 'in_progress', executionPhase: null })).toEqual({
      badgeKey: 'signs_collected',
      label: 'signs collected',
    });

    expect(getRouteStatusPresentation({ status: 'in_progress', executionPhase: 'placement' })).toEqual({
      badgeKey: 'signs_placed',
      label: 'signs placed',
    });

    expect(getRouteStatusPresentation({ status: 'in_progress', executionPhase: 'pickup' })).toEqual({
      badgeKey: 'signs_picked_up',
      label: 'signs picked up',
    });

    expect(getRouteStatusPresentation({ status: 'in_progress', executionPhase: 'unload' })).toEqual({
      badgeKey: 'signs_returned',
      label: 'signs returned',
    });
  });

  it('reads legacy signs_placed/signs_picked_up statuses off executionPhase too', () => {
    expect(getRouteStatusPresentation({ status: 'signs_placed', executionPhase: 'pickup' })).toEqual({
      badgeKey: 'signs_picked_up',
      label: 'signs picked up',
    });
  });

  it('folds archived into the completed badge — archived is legacy-only, no longer distinguished', () => {
    expect(getRouteStatusPresentation({ status: 'completed' })).toEqual({
      badgeKey: 'completed',
      label: 'route completed',
    });

    expect(getRouteStatusPresentation({ status: 'archived' })).toEqual({
      badgeKey: 'completed',
      label: 'route completed',
    });
  });

  it('falls back to planned for planned and missing statuses', () => {
    expect(getRouteStatusPresentation({ status: 'planned' })).toEqual({
      badgeKey: 'planned',
      label: 'planned',
    });

    expect(getRouteStatusPresentation({ status: undefined })).toEqual({
      badgeKey: 'planned',
      label: 'planned',
    });

    expect(getRouteStatusPresentation({ status: null })).toEqual({
      badgeKey: 'planned',
      label: 'planned',
    });
  });
});

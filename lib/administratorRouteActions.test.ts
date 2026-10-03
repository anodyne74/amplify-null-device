const mockRouteUpdate = jest.fn();
const mockStopUpdate = jest.fn();
const mockAuditLogCreate = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Route: { update: mockRouteUpdate },
      Stop: { update: mockStopUpdate },
      AuditLog: { create: mockAuditLogCreate },
    },
  }),
}));

jest.mock('./amplify-config', () => ({
  configureAmplify: jest.fn(),
  fetchUserId: jest.fn().mockResolvedValue('admin-sub'),
}));

// The outbox isn't used here; keep its localStorage and auth out of the way.
jest.mock('aws-amplify/auth', () => ({ fetchAuthSession: jest.fn().mockResolvedValue({}) }));
jest.mock('./apiClient', () => ({ callApi: jest.fn().mockResolvedValue({}) }));

import {
  changePickupDate,
  correctBilledTime,
  finaliseRouteAsAdministrator,
  settleStopAsAdministrator,
} from './administratorRouteActions';
import { stopProgress } from './stopProgress';
import type { SignRunTransitionRoute } from './signRunTransitions';

const BILLED = { load: 15, placement: 20, pickup: 10, unload: 30 };

function readyRoute(overrides: Partial<SignRunTransitionRoute & { customerId: string | null }> = {}) {
  return {
    id: 'route-1',
    customerId: 'cust-1',
    status: 'in_progress',
    executionPhase: 'unload',
    unloadConfirmedAt: '2026-08-31T09:10:00.000Z',
    ...overrides,
  } as SignRunTransitionRoute & { customerId: string | null };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockRouteUpdate.mockResolvedValue({ data: { id: 'route-1' }, errors: null });
  mockStopUpdate.mockResolvedValue({ data: { id: 'stop-1' }, errors: null });
  // Like DynamoDB, an explicit null for the customerId index key fails the write.
  mockAuditLogCreate.mockImplementation(async (input: Record<string, unknown>) =>
    input.customerId === null ? { data: null, errors: [{ message: 'Type mismatch for Index Key customerId' }] } : { data: input, errors: null }
  );
});

describe('finaliseRouteAsAdministrator', () => {
  it('writes the operator Finalise fields straight away and audits who finalised it', async () => {
    await expect(finaliseRouteAsAdministrator(readyRoute(), { billedMinutes: BILLED, distanceKm: 37.5 })).resolves.toEqual({ ok: true });

    expect(mockRouteUpdate).toHaveBeenCalledWith({
      id: 'route-1',
      billedLoadMinutes: 15,
      billedPlacementMinutes: 20,
      billedPickupMinutes: 10,
      billedUnloadMinutes: 30,
      overrideDurationMinutes: 75,
      overrideDistanceKm: 37.5,
      status: 'completed',
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        operatorId: 'admin-sub',
        eventType: 'data_modification',
        resourceType: 'route',
        resourceId: 'route-1',
        action: 'route.finalise',
        status: 'success',
        details: JSON.stringify({ billedMinutes: BILLED, distanceKm: 37.5 }),
      })
    );
  });

  it('leaves customerId out of the audit entry when the Route has none', async () => {
    await expect(finaliseRouteAsAdministrator(readyRoute({ customerId: null }), { billedMinutes: BILLED, distanceKm: 0 })).resolves.toEqual({
      ok: true,
    });
    expect(mockAuditLogCreate.mock.calls[0][0].customerId).toBeUndefined();
  });

  it('refuses a Route that is not waiting on Finalise, and writes nothing', async () => {
    const result = await finaliseRouteAsAdministrator(readyRoute({ unloadConfirmedAt: null, executionPhase: 'pickup' }), {
      billedMinutes: BILLED,
      distanceKm: 1,
    });

    expect(result).toEqual({ ok: false, error: 'This route is not currently on the Finalise phase.', saved: false });
    expect(mockRouteUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('refuses a Route that is already completed', async () => {
    const result = await finaliseRouteAsAdministrator(readyRoute({ status: 'completed' }), { billedMinutes: BILLED, distanceKm: 1 });

    expect(result).toEqual({ ok: false, error: 'This route is already completed.', saved: false });
    expect(mockRouteUpdate).not.toHaveBeenCalled();
  });

  it('reports a failed save and writes no audit entry', async () => {
    mockRouteUpdate.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });

    const result = await finaliseRouteAsAdministrator(readyRoute(), { billedMinutes: BILLED, distanceKm: 1 });

    expect(result).toEqual({ ok: false, error: 'Could not finalise the route. Nothing was changed.', saved: false });
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('says the Route was finalised when only the audit entry fails', async () => {
    mockAuditLogCreate.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });

    const result = await finaliseRouteAsAdministrator(readyRoute(), { billedMinutes: BILLED, distanceKm: 1 });

    expect(result).toEqual({ ok: false, error: 'The route was finalised, but its audit entry could not be written.', saved: true });
  });
});

describe('correctBilledTime', () => {
  const completed = {
    id: 'route-1',
    customerId: 'cust-1',
    status: 'completed' as const,
    billedLoadMinutes: 15,
    billedPlacementMinutes: 20,
    billedPickupMinutes: 10,
    billedUnloadMinutes: 30,
    overrideDurationMinutes: 75,
    overrideDistanceKm: 37.5,
  };

  it('saves the corrected phases and their sum, and audits the Billed Time before and after', async () => {
    const corrected = { ...BILLED, placement: 35 };

    await expect(correctBilledTime(completed, { billedMinutes: corrected, distanceKm: 40 })).resolves.toEqual({ ok: true });

    expect(mockRouteUpdate).toHaveBeenCalledWith({
      id: 'route-1',
      billedLoadMinutes: 15,
      billedPlacementMinutes: 35,
      billedPickupMinutes: 10,
      billedUnloadMinutes: 30,
      overrideDurationMinutes: 90,
      overrideDistanceKm: 40,
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        operatorId: 'admin-sub',
        resourceId: 'route-1',
        action: 'route.billedTime.correct',
        details: JSON.stringify({
          before: { phases: BILLED, totalMinutes: 75, distanceKm: 37.5 },
          after: { phases: corrected, totalMinutes: 90, distanceKm: 40 },
        }),
      })
    );
  });

  it('corrects a total-only Route by its total and leaves its phases alone', async () => {
    const legacy = { id: 'route-1', customerId: null, status: 'archived' as const, actualDurationMinutes: 165 };

    await expect(correctBilledTime(legacy, { totalMinutes: 180, distanceKm: 12 })).resolves.toEqual({ ok: true });

    expect(mockRouteUpdate).toHaveBeenCalledWith({ id: 'route-1', overrideDurationMinutes: 180, overrideDistanceKm: 12 });
    expect(mockAuditLogCreate.mock.calls[0][0].details).toBe(
      JSON.stringify({
        before: { phases: null, totalMinutes: 165, distanceKm: null },
        after: { phases: null, totalMinutes: 180, distanceKm: 12 },
      })
    );
  });

  it('refuses a Route that is not completed yet, and writes nothing', async () => {
    const result = await correctBilledTime({ ...completed, status: 'in_progress' }, { totalMinutes: 90, distanceKm: 1 });

    expect(result).toEqual({ ok: false, error: 'Billed Time can only be corrected once the route is completed.', saved: false });
    expect(mockRouteUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it.each([0, 95])('refuses a total of %p min', async (totalMinutes) => {
    const result = await correctBilledTime(completed, { totalMinutes, distanceKm: 1 });

    expect(result).toEqual({ ok: false, error: 'The total charged must land on a 15 min increment.', saved: false });
    expect(mockRouteUpdate).not.toHaveBeenCalled();
  });

  it('reports a failed save and writes no audit entry', async () => {
    mockRouteUpdate.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });

    const result = await correctBilledTime(completed, { totalMinutes: 90, distanceKm: 1 });

    expect(result).toEqual({ ok: false, error: 'Could not save the Billed Time. Nothing was changed.', saved: false });
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('says the Billed Time was saved when only the audit entry fails', async () => {
    mockAuditLogCreate.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });

    const result = await correctBilledTime(completed, { totalMinutes: 90, distanceKm: 1 });

    expect(result).toEqual({ ok: false, error: 'The Billed Time was saved, but its audit entry could not be written.', saved: true });
  });
});

describe('settleStopAsAdministrator', () => {
  const pickupRoute = { status: 'in_progress' as const, executionPhase: 'pickup' as const };
  const stop = {
    id: 'stop-1',
    routeId: 'route-1',
    customerId: 'cust-1',
    notes: 'Gate code 4821',
    actualArrivalTime: null,
  };

  it("settles the Stop for the Route's phase straight away, and audits it", async () => {
    await expect(settleStopAsAdministrator(pickupRoute, stop, { action: 'skip', reason: 'No access' })).resolves.toEqual({ ok: true });

    const written = mockStopUpdate.mock.calls[0][0];
    expect(written.id).toBe('stop-1');
    expect(stopProgress(written).pickup).toMatchObject({ state: 'skipped', reason: 'No access' });
    expect(written.notes).toContain('Gate code 4821');
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        operatorId: 'admin-sub',
        resourceType: 'stop',
        resourceId: 'stop-1',
        action: 'stop.settle',
        details: JSON.stringify({ routeId: 'route-1', phase: 'pickup', action: 'skip', reason: 'No access' }),
      })
    );
  });

  it('refuses a Route that is not on Placement or Pickup, and writes nothing', async () => {
    const result = await settleStopAsAdministrator({ status: 'in_progress', executionPhase: 'unload' }, stop, { action: 'complete' });

    expect(result).toEqual({
      ok: false,
      error: 'Stops can only be settled while the route is on Placement or Pickup.',
      saved: false,
    });
    expect(mockStopUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('settles any Stop in Placement, whatever its service type', async () => {
    const placementRoute = { status: 'in_progress' as const, executionPhase: 'placement' as const };

    await expect(
      settleStopAsAdministrator(placementRoute, { ...stop, serviceType: 'pickup' as const }, { action: 'complete' })
    ).resolves.toEqual({ ok: true });

    expect(stopProgress(mockStopUpdate.mock.calls[0][0]).placement.state).toBe('done');
  });

  it('reports a failed save and writes no audit entry', async () => {
    mockStopUpdate.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });

    const result = await settleStopAsAdministrator(pickupRoute, stop, { action: 'complete' });

    expect(result).toEqual({ ok: false, error: 'Could not save that stop. Nothing was changed.', saved: false });
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('says the Stop was saved when only the audit entry fails', async () => {
    mockAuditLogCreate.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });

    const result = await settleStopAsAdministrator(pickupRoute, stop, { action: 'complete' });

    expect(result).toEqual({ ok: false, error: 'The stop was saved, but its audit entry could not be written.', saved: true });
  });
});

describe('changePickupDate', () => {
  const route = { id: 'route-1', customerId: 'cust-1', scheduledDate: '2026-10-09', pickupDate: '2026-10-10' };

  it('saves the new Pickup Date straight away, and audits it before and after', async () => {
    await expect(changePickupDate(route, '2026-10-12')).resolves.toEqual({ ok: true });

    expect(mockRouteUpdate).toHaveBeenCalledWith({ id: 'route-1', pickupDate: '2026-10-12' });
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        operatorId: 'admin-sub',
        resourceType: 'route',
        resourceId: 'route-1',
        action: 'route.pickupDate.change',
        details: JSON.stringify({ before: '2026-10-10', after: '2026-10-12' }),
      })
    );
  });

  it('refuses a Pickup Date before the Placement Date, and writes nothing', async () => {
    const result = await changePickupDate(route, '2026-10-08');

    expect(result).toEqual({ ok: false, error: 'The pickup date must be on or after the placement date.', saved: false });
    expect(mockRouteUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('refuses to clear the Pickup Date', async () => {
    const result = await changePickupDate(route, '');

    expect(result).toEqual({ ok: false, error: 'Choose a pickup date.', saved: false });
    expect(mockRouteUpdate).not.toHaveBeenCalled();
  });

  it('gives a Route from before Pickup Dates its first one', async () => {
    await expect(changePickupDate({ ...route, pickupDate: null }, '2026-10-10')).resolves.toEqual({ ok: true });

    expect(mockAuditLogCreate.mock.calls[0][0].details).toBe(JSON.stringify({ before: null, after: '2026-10-10' }));
  });

  it('reports a failed save and writes no audit entry', async () => {
    mockRouteUpdate.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });

    const result = await changePickupDate(route, '2026-10-12');

    expect(result).toEqual({ ok: false, error: 'Could not save the pickup date. Nothing was changed.', saved: false });
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('says the Pickup Date was saved when only the audit entry fails', async () => {
    mockAuditLogCreate.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });

    const result = await changePickupDate(route, '2026-10-12');

    expect(result).toEqual({ ok: false, error: 'The pickup date was saved, but its audit entry could not be written.', saved: true });
  });
});

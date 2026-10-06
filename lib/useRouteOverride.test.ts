import { act, renderHook } from '@testing-library/react';
import { useRouteOverride } from '@/lib/useRouteOverride';
import type { Route } from '@/amplify/types';
import { updateRoute } from '@/lib/routes';

jest.mock('@/lib/routes', () => ({
  updateRoute: jest.fn(),
}));

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-1',
    customerId: 'cust-1',
    ...overrides,
  };
}

interface TestValues {
  distanceKm: number;
}

describe('useRouteOverride', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('seeds values from computeDefaults', () => {
    const route = makeRoute();
    const { result } = renderHook(() =>
      useRouteOverride<TestValues>({
        route,
        refetchRoute: jest.fn(),
        computeDefaults: () => ({ distanceKm: 12 }),
        buildPayload: (values) => ({ overrideDistanceKm: values.distanceKm }),
      })
    );

    expect(result.current.values).toEqual({ distanceKm: 12 });
    expect(result.current.dirty).toBe(false);
  });

  it('marks dirty and updates state when setValues is called', () => {
    const route = makeRoute();
    const { result } = renderHook(() =>
      useRouteOverride<TestValues>({
        route,
        refetchRoute: jest.fn(),
        computeDefaults: () => ({ distanceKm: 12 }),
        buildPayload: (values) => ({ overrideDistanceKm: values.distanceKm }),
      })
    );

    act(() => {
      result.current.setValues({ distanceKm: 20 });
    });

    expect(result.current.values).toEqual({ distanceKm: 20 });
    expect(result.current.dirty).toBe(true);
  });

  it('does not clobber edited values when computeDefaults changes while dirty', () => {
    const route = makeRoute();
    const { result, rerender } = renderHook(
      ({ defaultKm }) =>
        useRouteOverride<TestValues>({
          route,
          refetchRoute: jest.fn(),
          computeDefaults: () => ({ distanceKm: defaultKm }),
          buildPayload: (values) => ({ overrideDistanceKm: values.distanceKm }),
        }),
      { initialProps: { defaultKm: 12 } }
    );

    act(() => {
      result.current.setValues({ distanceKm: 20 });
    });
    expect(result.current.values).toEqual({ distanceKm: 20 });

    rerender({ defaultKm: 99 });

    expect(result.current.values).toEqual({ distanceKm: 20 });
  });

  it('reseeds values and clears dirty when the route id changes', () => {
    const { result, rerender } = renderHook(
      ({ route, defaultKm }) =>
        useRouteOverride<TestValues>({
          route,
          refetchRoute: jest.fn(),
          computeDefaults: () => ({ distanceKm: defaultKm }),
          buildPayload: (values) => ({ overrideDistanceKm: values.distanceKm }),
        }),
      { initialProps: { route: makeRoute({ id: 'route-1' }), defaultKm: 12 } }
    );

    act(() => {
      result.current.setValues({ distanceKm: 20 });
    });
    expect(result.current.dirty).toBe(true);

    rerender({ route: makeRoute({ id: 'route-2' }), defaultKm: 45 });

    expect(result.current.values).toEqual({ distanceKm: 45 });
    expect(result.current.dirty).toBe(false);
  });

  it('saves successfully: calls updateRoute, refetches, sets success, clears dirty', async () => {
    (updateRoute as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
    const refetchRoute = jest.fn().mockResolvedValue(undefined);
    const route = makeRoute();

    const { result } = renderHook(() =>
      useRouteOverride<TestValues>({
        route,
        refetchRoute,
        computeDefaults: () => ({ distanceKm: 12 }),
        buildPayload: (values) => ({ overrideDistanceKm: values.distanceKm }),
        successMessage: 'Distance override saved.',
      })
    );

    act(() => {
      result.current.setValues({ distanceKm: 20 });
    });

    let saveResult: boolean | undefined;
    await act(async () => {
      saveResult = await result.current.save();
    });

    expect(saveResult).toBe(true);
    expect(updateRoute).toHaveBeenCalledWith('route-1', { overrideDistanceKm: 20 });
    expect(refetchRoute).toHaveBeenCalledTimes(1);
    expect(result.current.success).toBe('Distance override saved.');
    expect(result.current.error).toBeNull();
    expect(result.current.dirty).toBe(false);
  });

  it('surfaces an error and skips refetch when updateRoute returns errors', async () => {
    (updateRoute as jest.Mock).mockResolvedValue({ data: null, errors: [{ message: 'nope' }] });
    const refetchRoute = jest.fn().mockResolvedValue(undefined);
    const route = makeRoute();

    const { result } = renderHook(() =>
      useRouteOverride<TestValues>({
        route,
        refetchRoute,
        computeDefaults: () => ({ distanceKm: 12 }),
        buildPayload: (values) => ({ overrideDistanceKm: values.distanceKm }),
        errorMessage: 'Failed to save distance override.',
      })
    );

    let saveResult: boolean | undefined;
    await act(async () => {
      saveResult = await result.current.save();
    });

    expect(saveResult).toBe(false);
    expect(refetchRoute).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Failed to save distance override.');
    expect(result.current.success).toBeNull();
  });

  it('blocks the save when validate returns a message, without calling updateRoute', async () => {
    const route = makeRoute();
    const { result } = renderHook(() =>
      useRouteOverride<TestValues>({
        route,
        refetchRoute: jest.fn(),
        computeDefaults: () => ({ distanceKm: -5 }),
        buildPayload: (values) => ({ overrideDistanceKm: values.distanceKm }),
        validate: (values) =>
          values.distanceKm < 0 ? 'Distance must be a number greater than or equal to 0.' : null,
      })
    );

    let saveResult: boolean | undefined;
    await act(async () => {
      saveResult = await result.current.save();
    });

    expect(saveResult).toBe(false);
    expect(updateRoute).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Distance must be a number greater than or equal to 0.');
  });
});

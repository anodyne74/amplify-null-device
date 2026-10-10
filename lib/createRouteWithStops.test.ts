import { createRouteWithStops } from './createRouteWithStops';
import { createRoute, createStopsForRoute } from '@/lib/routes';
import { attachNewRouteRequest } from '@/lib/routeRequests';
import { DataError } from '@/lib/graphqlResult';

jest.mock('@/lib/routes');
jest.mock('@/lib/routeRequests');

const input = {
  route: { routeCode: ' W19-26-001 ', customerId: 'cust-1', scheduledDate: '2026-10-16', pickupDate: '2026-10-17', notes: '' },
  stops: [{ address: '1 A St' }, { address: '2 B St' }],
  request: { fromRecordId: null, requester: null, requestedAt: '2026-10-11T00:00:00.000Z', file: null },
};

describe('createRouteWithStops', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (createRoute as jest.Mock).mockResolvedValue({ id: 'route-1' });
    (createStopsForRoute as jest.Mock).mockResolvedValue([
      { index: 0, address: '1 A St', success: true },
      { index: 1, address: '2 B St', success: true },
    ]);
    (attachNewRouteRequest as jest.Mock).mockResolvedValue({ ok: true });
  });

  it('creates the Route, its Stops and its Route Request, and returns the Route', async () => {
    await expect(createRouteWithStops(input)).resolves.toEqual({ ok: true, routeId: 'route-1' });

    expect(createRoute).toHaveBeenCalledWith({
      routeCode: 'W19-26-001',
      customerId: 'cust-1',
      scheduledDate: '2026-10-16',
      pickupDate: '2026-10-17',
      status: 'planned',
      notes: undefined,
    });
    expect(createStopsForRoute).toHaveBeenCalledWith('route-1', 'cust-1', input.stops);
    expect(attachNewRouteRequest).toHaveBeenCalledWith({ ...input.request, routeId: 'route-1', customerId: 'cust-1' });
  });

  it('says which Stops failed, and does not attach the Route Request', async () => {
    (createStopsForRoute as jest.Mock).mockResolvedValue([
      { index: 0, address: '1 A St', success: true },
      { index: 1, address: '', success: false, errorMessage: 'Needs a suburb.' },
    ]);

    await expect(createRouteWithStops(input)).resolves.toEqual({
      ok: false,
      error: 'Route was created, but 1 stop(s) failed to save: #2 (Unknown address): Needs a suburb.',
    });
    expect(attachNewRouteRequest).not.toHaveBeenCalled();
  });

  it('says the Route was created when its Route Request could not be linked', async () => {
    (attachNewRouteRequest as jest.Mock).mockResolvedValue({ ok: false, error: 'That Route already has a Route Request.' });

    const result = await createRouteWithStops(input);

    expect(result).toEqual({
      ok: false,
      error:
        "Route was created, but not linked to its Route Request: That Route already has a Route Request. Link it from the Route's Requests.",
    });
  });

  it('writes nothing more when the Route itself cannot be created', async () => {
    (createRoute as jest.Mock).mockRejectedValue(new DataError('Failed to create route.'));

    await expect(createRouteWithStops(input)).resolves.toEqual({ ok: false, error: 'Failed to create route.' });
    expect(createStopsForRoute).not.toHaveBeenCalled();
  });

  it('hides the detail of an unexpected failure', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (createStopsForRoute as jest.Mock).mockRejectedValue(new Error('socket hang up'));

    await expect(createRouteWithStops(input)).resolves.toEqual({ ok: false, error: 'An unexpected error occurred.' });
  });
});

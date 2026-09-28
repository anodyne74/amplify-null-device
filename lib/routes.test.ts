// Mock the Amplify client BEFORE importing the Route aggregate
const mockRouteList = jest.fn();
const mockRouteGet = jest.fn();
const mockRouteCreate = jest.fn();
const mockRouteUpdate = jest.fn();
const mockRouteDelete = jest.fn();
const mockStopList = jest.fn();
const mockStopCreate = jest.fn();
const mockStopDelete = jest.fn();
const mockStopUpdate = jest.fn();
const mockStopGet = jest.fn();
const mockCustomerGet = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Route: {
        list: mockRouteList,
        get: mockRouteGet,
        create: mockRouteCreate,
        update: mockRouteUpdate,
        delete: mockRouteDelete,
      },
      Stop: {
        list: mockStopList,
        get: mockStopGet,
        create: mockStopCreate,
        delete: mockStopDelete,
        update: mockStopUpdate,
      },
      Customer: {
        get: mockCustomerGet,
      },
    },
  }),
}));

const mockUnlinkRecordsOfDeletedRoute = jest.fn();
jest.mock('./routeRequestLinks', () => ({
  unlinkRecordsOfDeletedRoute: (...args: unknown[]) => mockUnlinkRecordsOfDeletedRoute(...args),
}));

const mockGeocodeAddress = jest.fn();
const mockGetConfirmedPin = jest.fn();

jest.mock('./googleMaps', () => ({
  geocodeAddress: (...args: unknown[]) => mockGeocodeAddress(...args),
}));

jest.mock('./propertyLocations', () => ({
  getConfirmedPin: (...args: unknown[]) => mockGetConfirmedPin(...args),
}));

import {
  listCustomerRoutes,
  getRouteWithStops,
  listAllStopsForRoute,
  createRoute,
  updateRoute,
  updateStopExecution,
  deleteRoute,
  createStop,
  createStopsForRoute,
  listCustomerStops,
  resequenceStops,
  saveStop,
  saveStopFailure,
  STOP_NEEDS_SUBURB,
  updateStop,
} from './routes';

describe('routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCustomerGet.mockResolvedValue({ data: { viewerSubs: ['owner-sub', 'viewer-sub'] }, errors: undefined });
    mockUnlinkRecordsOfDeletedRoute.mockResolvedValue([]);
  });

  describe('listCustomerRoutes', () => {
    it('should fetch routes for a specific customer', async () => {
      const mockRoutes = [
        { id: 'r1', customerId: 'c1', status: 'planned', name: 'Route 1' },
        { id: 'r2', customerId: 'c1', status: 'signs_placed', name: 'Route 2' },
      ];

      mockRouteList.mockResolvedValue({
        data: mockRoutes,
        errors: undefined,
      });

      const result = await listCustomerRoutes('c1');

      expect(mockRouteList).toHaveBeenCalledWith({
        filter: { customerId: { eq: 'c1' } },
        limit: 1000,
        nextToken: undefined,
      });
      expect(result.data).toHaveLength(2);
    });

    it('should filter routes by status on client side', async () => {
      const mockRoutes = [
        { id: 'r1', customerId: 'c1', status: 'planned' },
        { id: 'r2', customerId: 'c1', status: 'signs_placed' },
      ];

      mockRouteList.mockResolvedValue({
        data: mockRoutes,
        errors: undefined,
      });

      const result = await listCustomerRoutes('c1', { status: 'signs_placed' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('signs_placed');
    });
  });

  describe('getRouteWithStops', () => {
    it('should fetch route and its associated stops', async () => {
      const mockRoute = { id: 'r1', customerId: 'c1', status: 'signs_placed' };
      const mockStops = [
        { id: 's1', routeId: 'r1', sequence: 1, address: '123 Main St' },
        { id: 's2', routeId: 'r1', sequence: 2, address: '456 Oak Ave' },
      ];

      mockRouteGet.mockResolvedValue({
        data: mockRoute,
        errors: undefined,
      });

      mockStopList.mockResolvedValue({
        data: mockStops,
        errors: undefined,
      });

      const result = await getRouteWithStops('r1');

      expect(result.route).toEqual(mockRoute);
      expect(result.stops).toHaveLength(2);
    });

    it('should aggregate paginated stop results and sort by sequence', async () => {
      const mockRoute = { id: 'r1', customerId: 'c1', status: 'planned' };

      mockRouteGet.mockResolvedValue({
        data: mockRoute,
        errors: undefined,
      });

      mockStopList
        .mockResolvedValueOnce({
          data: [{ id: 's2', routeId: 'r1', sequence: 2 }],
          errors: undefined,
          nextToken: 'next-page',
        })
        .mockResolvedValueOnce({
          data: [{ id: 's1', routeId: 'r1', sequence: 1 }],
          errors: undefined,
          nextToken: null,
        });

      const result = await getRouteWithStops('r1');

      expect(mockStopList).toHaveBeenCalledTimes(2);
      expect(result.stops.map((stop: { id: string }) => stop.id)).toEqual(['s1', 's2']);
      expect(result.errors).toEqual([]);
    });
  });

  describe('listAllStopsForRoute', () => {
    it('pages through every Stop.list call until nextToken is exhausted', async () => {
      mockStopList
        .mockResolvedValueOnce({
          data: [{ id: 's1', routeId: 'r1', sequence: 1 }],
          errors: undefined,
          nextToken: 'next-page',
        })
        .mockResolvedValueOnce({
          data: [{ id: 's2', routeId: 'r1', sequence: 2 }],
          errors: undefined,
          nextToken: null,
        });

      const result = await listAllStopsForRoute('r1');

      expect(mockStopList).toHaveBeenCalledTimes(2);
      expect(mockStopList).toHaveBeenNthCalledWith(1, {
        filter: { routeId: { eq: 'r1' } },
        nextToken: undefined,
        limit: 1000,
      });
      expect(mockStopList).toHaveBeenNthCalledWith(2, {
        filter: { routeId: { eq: 'r1' } },
        nextToken: 'next-page',
        limit: 1000,
      });
      expect(result.stops.map((stop: { id: string }) => stop.id)).toEqual(['s1', 's2']);
      expect(result.errors).toEqual([]);
    });
  });

  describe('createRoute', () => {
    it('should create a new route', async () => {
      const mockRoute = { id: 'r1', customerId: 'c1', status: 'planned' };
      mockRouteCreate.mockResolvedValue({
        data: mockRoute,
        errors: undefined,
      });

      const result = await createRoute({
        routeCode: 'W19-26-001',
        customerId: 'c1',
        status: 'planned',
      });

      expect(mockRouteCreate).toHaveBeenCalledWith({
        routeCode: 'W19-26-001',
        customerId: 'c1',
        status: 'planned',
      });
      expect(result.data).toEqual(mockRoute);
    });

    it('should return wrapped errors when route creation throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockRouteCreate.mockRejectedValue(new Error('route create failed'));

      const result = await createRoute({
        routeCode: 'W19-26-002',
        customerId: 'c1',
        status: 'planned',
      });

      expect(result.data).toBeNull();
      expect(result.errors).toHaveLength(1);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('updateRoute', () => {
    it('should update an existing route', async () => {
      const mockRoute = { id: 'r1', status: 'completed', actualDurationMinutes: 115 };
      mockRouteUpdate.mockResolvedValue({
        data: mockRoute,
        errors: undefined,
      });

      const result = await updateRoute('r1', {
        status: 'completed',
        actualDurationMinutes: 115,
      });

      expect(mockRouteUpdate).toHaveBeenCalledWith({
        id: 'r1',
        status: 'completed',
        actualDurationMinutes: 115,
      });
      expect(result.data).toEqual(mockRoute);
    });

    it('should return wrapped errors when route update throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockRouteUpdate.mockRejectedValue(new Error('route update failed'));

      const result = await updateRoute('r1', { status: 'completed' });

      expect(result.data).toBeNull();
      expect(result.errors).toHaveLength(1);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('deleteRoute', () => {
    it('should delete child stops before deleting the route', async () => {
      mockStopList.mockResolvedValue({
        data: [{ id: 's1' }, { id: 's2' }],
        errors: undefined,
      });
      mockStopDelete.mockResolvedValue({ data: {}, errors: undefined });
      mockRouteDelete.mockResolvedValue({ data: { id: 'r1' }, errors: undefined });

      const result = await deleteRoute('r1');

      expect(mockStopDelete).toHaveBeenCalledTimes(2);
      expect(mockRouteDelete).toHaveBeenCalledWith({ id: 'r1' });
      expect(result.errors).toBeUndefined();
    });

    it('should delete stops spanning multiple Stop.list pages, not just the first', async () => {
      mockStopList
        .mockResolvedValueOnce({
          data: [{ id: 's1' }],
          errors: undefined,
          nextToken: 'next-page',
        })
        .mockResolvedValueOnce({
          data: [{ id: 's2' }],
          errors: undefined,
          nextToken: null,
        });
      mockStopDelete.mockResolvedValue({ data: {}, errors: undefined });
      mockRouteDelete.mockResolvedValue({ data: { id: 'r1' }, errors: undefined });

      const result = await deleteRoute('r1');

      expect(mockStopList).toHaveBeenCalledTimes(2);
      expect(mockStopDelete).toHaveBeenCalledTimes(2);
      expect(mockStopDelete).toHaveBeenCalledWith({ id: 's1' });
      expect(mockStopDelete).toHaveBeenCalledWith({ id: 's2' });
      expect(mockRouteDelete).toHaveBeenCalledWith({ id: 'r1' });
      expect(result.errors).toBeUndefined();
    });

    it("returns the route's Route Request records to the inbox, naming the route, before deleting it", async () => {
      mockStopList.mockResolvedValue({ data: [], errors: undefined });
      mockRouteGet.mockResolvedValue({ data: { routeCode: 'W40-26-001' }, errors: undefined });
      mockRouteDelete.mockResolvedValue({ data: { id: 'r1' }, errors: undefined });

      await deleteRoute('r1');

      expect(mockUnlinkRecordsOfDeletedRoute).toHaveBeenCalledWith(expect.anything(), 'r1', 'W40-26-001');
      expect(mockRouteDelete).toHaveBeenCalledWith({ id: 'r1' });
    });

    it('keeps the route when its Route Request records cannot be returned to the inbox', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockStopList.mockResolvedValue({ data: [], errors: undefined });
      mockRouteGet.mockResolvedValue({ data: { routeCode: 'W40-26-001' }, errors: undefined });
      mockUnlinkRecordsOfDeletedRoute.mockResolvedValue(['Could not unlink it.']);

      const result = await deleteRoute('r1');

      expect(mockRouteDelete).not.toHaveBeenCalled();
      expect(result.errors).toEqual(['Could not unlink it.']);
    });

    it('should stop when stop list returns errors', async () => {
      mockStopList.mockResolvedValue({
        data: [],
        errors: [{ message: 'cannot list stops' }],
      });

      const result = await deleteRoute('r1');

      expect(mockRouteDelete).not.toHaveBeenCalled();
      expect(result.data).toBeNull();
      expect(result.errors).toBeDefined();
    });

    it('should return child stop delete errors without deleting route', async () => {
      mockStopList.mockResolvedValue({
        data: [{ id: 's1' }],
        errors: undefined,
      });
      mockStopDelete.mockResolvedValue({ data: null, errors: [{ message: 'stop delete failed' }] });

      const result = await deleteRoute('r1');

      expect(mockRouteDelete).not.toHaveBeenCalled();
      expect(result.data).toBeNull();
      expect(result.errors).toEqual([{ message: 'stop delete failed' }]);
    });

    it('should return wrapped errors when delete route throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockStopList.mockRejectedValue(new Error('delete route failed'));

      const result = await deleteRoute('r1');

      expect(result.data).toBeNull();
      expect(result.errors).toHaveLength(1);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('createStopsForRoute', () => {
    it('issues all stop-creation calls concurrently, not one at a time', async () => {
      const resolvers: Array<(value: { data: { id: string }; errors: undefined }) => void> = [];
      mockStopCreate.mockImplementation(
        () => new Promise((resolve) => { resolvers.push(resolve); })
      );

      const stops = [
        { address: '1 High St, Epping', serviceType: 'delivery' as const },
        { address: '2 High St, Epping', serviceType: 'delivery' as const },
        { address: '3 High St, Epping', serviceType: 'delivery' as const },
      ];

      const resultPromise = createStopsForRoute('r1', 'c1', stops);

      // Let the customer lookup settle without resolving any create call. A
      // sequential await-in-a-loop implementation would have only issued the
      // first call by this point; a concurrent one issues all of them upfront.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockStopCreate).toHaveBeenCalledTimes(3);

      resolvers.forEach((resolve, i) => resolve({ data: { id: `s${i}` }, errors: undefined }));
      const results = await resultPromise;

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('reports per-stop success and failure without failing the whole batch', async () => {
      mockStopCreate
        .mockResolvedValueOnce({ data: { id: 's1' }, errors: undefined })
        .mockResolvedValueOnce({ data: null, errors: [{ message: 'address invalid' }] })
        .mockResolvedValueOnce({ data: { id: 's3' }, errors: undefined });

      const stops = [
        { address: '1 High St, Epping', serviceType: 'delivery' as const },
        { address: '2 High St, Epping', serviceType: 'delivery' as const },
        { address: '3 High St, Epping', serviceType: 'delivery' as const },
      ];

      const results = await createStopsForRoute('r1', 'c1', stops);

      expect(results).toEqual([
        { index: 0, address: '1 High St, Epping', success: true },
        { index: 1, address: '2 High St, Epping', success: false, errorMessage: 'address invalid' },
        { index: 2, address: '3 High St, Epping', success: true },
      ]);
      expect(mockStopCreate).toHaveBeenCalledWith(
        expect.objectContaining({ routeId: 'r1', customerId: 'c1', sequence: 1, address: '1 High St, Epping' })
      );
      expect(mockStopCreate).toHaveBeenCalledWith(
        expect.objectContaining({ routeId: 'r1', customerId: 'c1', sequence: 2, address: '2 High St, Epping' })
      );
    });
    it("refuses a Stop with no pin and no suburb, which would have no Property, and creates the rest", async () => {
      mockStopCreate.mockResolvedValue({ data: { id: 's1' }, errors: undefined });

      const results = await createStopsForRoute('r1', 'c1', [
        { address: '10 brush road', serviceType: 'delivery' },
        { address: '10 brush road', serviceType: 'delivery', latitude: -33.79, longitude: 151.08 },
        { address: '1 High St, Epping', serviceType: 'delivery' },
      ]);

      expect(results).toEqual([
        { index: 0, address: '10 brush road', success: false, errorMessage: STOP_NEEDS_SUBURB },
        { index: 1, address: '10 brush road', success: true },
        { index: 2, address: '1 High St, Epping', success: true },
      ]);
      expect(mockStopCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('stamping customer viewers at creation', () => {
    it('createStopsForRoute gives every Stop the customer\'s current viewers, looking them up once', async () => {
      mockStopCreate.mockResolvedValue({ data: { id: 's' }, errors: undefined });

      await createStopsForRoute('r1', 'c1', [
        { address: '1 High St, Epping', serviceType: 'delivery' },
        { address: '2 High St, Epping', serviceType: 'pickup' },
      ]);

      expect(mockCustomerGet).toHaveBeenCalledTimes(1);
      expect(mockCustomerGet).toHaveBeenCalledWith({ id: 'c1' }, { selectionSet: ['viewerSubs'] });
      expect(mockStopCreate).toHaveBeenCalledTimes(2);
      mockStopCreate.mock.calls.forEach(([input]) => {
        expect(input.viewerSubs).toEqual(['owner-sub', 'viewer-sub']);
      });
    });

    it('createStop looks up the customer\'s viewers when none are given', async () => {
      mockStopCreate.mockResolvedValue({ data: { id: 's1' }, errors: undefined });

      await createStop({ routeId: 'r1', customerId: 'c1', sequence: 1, address: '1 High St, Epping', serviceType: 'delivery' });

      expect(mockCustomerGet).toHaveBeenCalledWith({ id: 'c1' }, { selectionSet: ['viewerSubs'] });
      expect(mockStopCreate).toHaveBeenCalledWith(
        expect.objectContaining({ routeId: 'r1', viewerSubs: ['owner-sub', 'viewer-sub'] })
      );
    });

    it('createStop uses the viewers it is given without a lookup', async () => {
      mockStopCreate.mockResolvedValue({ data: { id: 's1' }, errors: undefined });

      await createStop({ routeId: 'r1', customerId: 'c1', viewerSubs: ['given'], sequence: 1, address: '1 High St, Epping', serviceType: 'delivery' });

      expect(mockCustomerGet).not.toHaveBeenCalled();
      expect(mockStopCreate).toHaveBeenCalledWith(expect.objectContaining({ viewerSubs: ['given'] }));
    });

    it('still creates the Stop when the customer lookup fails, leaving it for the access sync', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockCustomerGet.mockRejectedValue(new Error('network'));
      mockStopCreate.mockResolvedValue({ data: { id: 's1' }, errors: undefined });

      const results = await createStopsForRoute('r1', 'c1', [{ address: '1 High St, Epping', serviceType: 'delivery' }]);

      expect(results).toEqual([{ index: 0, address: '1 High St, Epping', success: true }]);
      expect(mockStopCreate).toHaveBeenCalledWith(expect.not.objectContaining({ viewerSubs: expect.anything() }));
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('the Property key on a Stop write', () => {
    const ADDRESS = '14 Cliff Rd, Epping NSW 2121';
    const KEY = 'epping|2121|cliff road|14';

    beforeEach(() => {
      mockStopCreate.mockResolvedValue({ data: { id: 's1' }, errors: undefined });
      mockStopUpdate.mockResolvedValue({ data: { id: 's1' }, errors: undefined });
    });

    it('keys a new Stop from its entered address alone when it has no geocode', async () => {
      await createStopsForRoute('r1', 'c1', [{ address: ADDRESS, serviceType: 'delivery' }]);

      expect(mockStopCreate).toHaveBeenCalledWith(expect.objectContaining({ propertyKey: KEY }));
    });

    it("keys a new Stop from its geocoded components, where the entered address doesn't say", async () => {
      await createStop({
        routeId: 'r1',
        customerId: 'c1',
        sequence: 1,
        address: '14 Cliff Rd, Epping',
        serviceType: 'delivery',
        addressStreetNumber: '14',
        addressStreet: 'Cliff Road',
        addressSuburb: 'Epping',
        addressPostcode: '2121',
      });

      expect(mockStopCreate).toHaveBeenCalledWith(expect.objectContaining({ propertyKey: KEY }));
    });

    it('ignores a Property key the caller passes', async () => {
      await createStop({
        routeId: 'r1',
        customerId: 'c1',
        sequence: 1,
        address: ADDRESS,
        serviceType: 'delivery',
        propertyKey: 'somewhere|else|1',
      } as Parameters<typeof createStop>[0]);

      expect(mockStopCreate).toHaveBeenCalledWith(expect.objectContaining({ propertyKey: KEY }));
    });

    it('writes no key when the address has no street number, street and suburb', async () => {
      await createStop({ routeId: 'r1', customerId: 'c1', sequence: 1, address: 'Cliff Rd', serviceType: 'delivery' });

      expect(mockStopCreate).toHaveBeenCalledWith(expect.not.objectContaining({ propertyKey: expect.anything() }));
    });

    it("leaves the key alone on an update that doesn't write an address", async () => {
      await updateStop({ id: 's1', numberOfSigns: 3 });

      expect(mockStopGet).not.toHaveBeenCalled();
      expect(mockStopUpdate).toHaveBeenCalledWith({ id: 's1', numberOfSigns: 3 });
    });

    it('re-keys from the geocoded components an update writes', async () => {
      await updateStop({ id: 's1', address: '14 Cliff Rd, Epping', addressSuburb: 'Epping', addressPostcode: '2121' });

      expect(mockStopGet).not.toHaveBeenCalled();
      expect(mockStopUpdate).toHaveBeenCalledWith(expect.objectContaining({ propertyKey: KEY }));
    });

    it("keys an unchanged address from the Stop's stored components", async () => {
      mockStopGet.mockResolvedValue({
        data: { address: '14 Cliff Rd, Epping ', addressSuburb: 'Epping', addressPostcode: '2121' },
        errors: undefined,
      });

      await updateStop({ id: 's1', address: '14 Cliff Rd, Epping', numberOfSigns: 3 });

      expect(mockStopUpdate).toHaveBeenCalledWith(expect.objectContaining({ propertyKey: KEY, numberOfSigns: 3 }));
    });

    it("keys a changed address from its text, not the old address's components", async () => {
      mockStopGet.mockResolvedValue({
        data: { address: '2 Beecroft Rd, Beecroft', addressSuburb: 'Beecroft', addressPostcode: '2119' },
        errors: undefined,
      });

      await updateStop({ id: 's1', address: ADDRESS });

      expect(mockStopUpdate).toHaveBeenCalledWith(expect.objectContaining({ propertyKey: KEY }));
    });

    it("doesn't write when the stored Stop can't be read", async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockStopGet.mockResolvedValue({ data: null, errors: [{ message: 'Unauthorized' }] });

      const result = await updateStop({ id: 's1', address: ADDRESS });

      expect(mockStopUpdate).not.toHaveBeenCalled();
      expect(result.data).toBeNull();
      expect(result.errors).toHaveLength(1);
      consoleError.mockRestore();
    });
  });

  describe('saveStop', () => {
    const ADDRESS = '14 Cliff Rd, Epping NSW 2121';
    const KEY = 'epping|2121|cliff road|14';
    const GEOCODED = {
      formattedAddress: '14 Cliff Rd, Epping NSW 2121, Australia',
      latitude: -33.77,
      longitude: 151.08,
      locationPrecision: 'precise' as const,
      addressComponents: { streetNumber: '14', street: 'Cliff Road', suburb: 'Epping', postcode: '2121' },
    };
    const NEW = { routeId: 'r1', customerId: 'c1', sequence: 3 };
    const ORIGINAL = {
      id: 's1',
      address: '2 Beecroft Rd, Beecroft',
      latitude: -33.75,
      longitude: 151.06,
      locationPrecision: 'precise',
    };
    let consoleWarn: jest.SpyInstance;
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
      mockGeocodeAddress.mockResolvedValue(GEOCODED);
      mockGetConfirmedPin.mockResolvedValue(null);
      mockStopCreate.mockResolvedValue({ data: { id: 's1' }, errors: undefined });
      mockStopUpdate.mockResolvedValue({ data: { id: 's1' }, errors: undefined });
      consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarn.mockRestore();
      consoleError.mockRestore();
    });

    it('adds a geocoded, keyed Stop to the Route', async () => {
      const result = await saveStop(NEW, { address: ADDRESS, serviceType: 'delivery', numberOfSigns: 2 });

      expect(result).toEqual({ errors: undefined, pinned: true });
      expect(mockStopCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          ...NEW,
          address: ADDRESS,
          numberOfSigns: 2,
          latitude: -33.77,
          longitude: 151.08,
          locationPrecision: 'precise',
          propertyKey: KEY,
        })
      );
      expect(mockStopCreate).toHaveBeenCalledWith(expect.not.objectContaining({ resolvedLocation: expect.anything() }));
    });

    it("adds a Stop whose address can't be geocoded without a pin, still keyed to its Property", async () => {
      mockGeocodeAddress.mockRejectedValue(new Error('ZERO_RESULTS'));

      const result = await saveStop(NEW, { address: ADDRESS, serviceType: 'delivery' });

      expect(result).toEqual({ errors: undefined, pinned: false });
      expect(mockStopCreate).toHaveBeenCalledWith(expect.objectContaining({ propertyKey: KEY }));
      expect(mockStopCreate).toHaveBeenCalledWith(expect.not.objectContaining({ latitude: expect.anything() }));
    });

    it("refuses a Stop with no pin and no suburb, since it would have no Property", async () => {
      mockGeocodeAddress.mockRejectedValue(new Error('ZERO_RESULTS'));

      const result = await saveStop(NEW, { address: '10 brush road', serviceType: 'delivery' });

      expect(mockStopCreate).not.toHaveBeenCalled();
      expect(result).toEqual({ errors: [new Error(STOP_NEEDS_SUBURB)], pinned: false });
      expect(saveStopFailure(result, 'Failed to add stop.')).toBe(STOP_NEEDS_SUBURB);
    });

    it('adds a Stop with no suburb typed when the geocode finds one', async () => {
      const result = await saveStop(NEW, { address: '14 Cliff Rd', serviceType: 'delivery' });

      expect(result).toEqual({ errors: undefined, pinned: true });
      expect(mockStopCreate).toHaveBeenCalledWith(expect.objectContaining({ propertyKey: KEY }));
    });

    it("pins a Stop at its Property's Confirmed pin", async () => {
      mockGetConfirmedPin.mockResolvedValue({ latitude: -33.9, longitude: 151.2 });

      const result = await saveStop(NEW, { address: ADDRESS, serviceType: 'delivery' });

      expect(mockGetConfirmedPin).toHaveBeenCalledWith(KEY);
      expect(result.pinned).toBe(true);
      expect(mockStopCreate).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: -33.9, longitude: 151.2, locationPrecision: 'confirmed', propertyKey: KEY })
      );
    });

    it("saves nothing when the Confirmed pin can't be looked up", async () => {
      mockGetConfirmedPin.mockRejectedValue(new Error('offline'));

      const result = await saveStop(NEW, { address: ADDRESS, serviceType: 'delivery' });

      expect(mockStopCreate).not.toHaveBeenCalled();
      expect(result).toEqual({ errors: [expect.any(Error)], pinned: false });
    });

    it('reports a failed write', async () => {
      mockStopCreate.mockResolvedValue({ data: null, errors: [{ message: 'Unauthorized' }] });

      const result = await saveStop(NEW, { address: ADDRESS, serviceType: 'delivery' });

      expect(result.errors).toHaveLength(1);
      expect(saveStopFailure(result, 'Failed to add stop.')).toBe('Failed to add stop.');
    });

    it("edits a Stop without re-geocoding an address that hasn't changed (#58)", async () => {
      mockStopGet.mockResolvedValue({ data: { address: ORIGINAL.address }, errors: undefined });

      const result = await saveStop({ original: ORIGINAL }, { address: ORIGINAL.address, notes: 'Side gate' });

      expect(result).toEqual({ errors: undefined, pinned: true });
      expect(mockGeocodeAddress).not.toHaveBeenCalled();
      expect(mockStopUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 's1', address: ORIGINAL.address, notes: 'Side gate' })
      );
      expect(mockStopUpdate).toHaveBeenCalledWith(expect.not.objectContaining({ latitude: expect.anything() }));
    });

    it('moves an edited Stop to its new address, re-keyed', async () => {
      const result = await saveStop({ original: ORIGINAL }, { address: ADDRESS });

      expect(result.pinned).toBe(true);
      expect(mockStopUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 's1', latitude: -33.77, longitude: 151.08, propertyKey: KEY })
      );
    });

    it("clears the old pin when the new address can't be geocoded, keying the Stop by its new address", async () => {
      mockGeocodeAddress.mockRejectedValue(new Error('ZERO_RESULTS'));

      const result = await saveStop({ original: ORIGINAL }, { address: ADDRESS });

      expect(result).toEqual({ errors: undefined, pinned: false });
      expect(mockStopGet).not.toHaveBeenCalled();
      expect(mockStopUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 's1',
          latitude: null,
          longitude: null,
          locationPrecision: null,
          addressSuburb: null,
          propertyKey: KEY,
        })
      );
    });

    it("refuses an edit to an address with no suburb that can't be geocoded", async () => {
      mockGeocodeAddress.mockRejectedValue(new Error('ZERO_RESULTS'));

      const result = await saveStop({ original: ORIGINAL }, { address: '10 brush road' });

      expect(mockStopUpdate).not.toHaveBeenCalled();
      expect(result.errors).toEqual([new Error(STOP_NEEDS_SUBURB)]);
    });

    it('still saves other edits to a Stop already stored with no suburb and no pin', async () => {
      mockGeocodeAddress.mockRejectedValue(new Error('ZERO_RESULTS'));
      mockStopGet.mockResolvedValue({ data: { address: '10 brush road' }, errors: undefined });

      const result = await saveStop({ original: { id: 's2', address: '10 brush road' } }, { address: '10 brush road', notes: 'Gate' });

      expect(result).toEqual({ errors: undefined, pinned: false });
      expect(mockStopUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 's2', notes: 'Gate' }));
    });

    it("clears a Confirmed Stop's pin when its new address can't be geocoded: the pin was Confirmed for the old address", async () => {
      mockGeocodeAddress.mockRejectedValue(new Error('ZERO_RESULTS'));
      mockStopGet.mockResolvedValue({ data: { address: ORIGINAL.address }, errors: undefined });

      const result = await saveStop({ original: { ...ORIGINAL, locationPrecision: 'confirmed' } }, { address: ADDRESS });

      expect(result.pinned).toBe(false);
      expect(mockStopUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: null, longitude: null, locationPrecision: null, propertyKey: KEY })
      );
    });
  });

  describe('updateStopExecution', () => {
    it('should update stop execution fields', async () => {
      mockStopUpdate.mockResolvedValue({
        data: { id: 's1' },
        errors: undefined,
      });

      const result = await updateStopExecution('s1', {
        actualArrivalTime: '2024-01-01T10:00:00Z',
      });

      expect(mockStopUpdate).toHaveBeenCalledWith({
        id: 's1',
        actualArrivalTime: '2024-01-01T10:00:00Z',
      });
      expect(result.data).toEqual({ id: 's1' });
    });

    it('should return wrapped errors when stop update throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockStopUpdate.mockRejectedValue(new Error('stop update failed'));

      const result = await updateStopExecution('s1', {
        actualDepartureTime: '2024-01-01T11:00:00Z',
      });

      expect(result.data).toBeNull();
      expect(result.errors).toHaveLength(1);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('listCustomerStops', () => {
    it("reads every page of the Customer's Stops", async () => {
      // `limit` caps items scanned before the customerId filter, so a
      // Customer's Stops can land on different pages.
      mockStopList
        .mockResolvedValueOnce({ data: [{ id: 's1', customerId: 'cust-1' }], errors: undefined, nextToken: 'page-2' })
        .mockResolvedValueOnce({ data: [{ id: 's2', customerId: 'cust-1' }], errors: undefined, nextToken: null });

      const result = await listCustomerStops('cust-1');

      expect(result.data.map((stop) => stop.id)).toEqual(['s1', 's2']);
      expect(mockStopList).toHaveBeenCalledWith(
        expect.objectContaining({ filter: { customerId: { eq: 'cust-1' } } })
      );
      expect(mockStopList).toHaveBeenLastCalledWith(expect.objectContaining({ nextToken: 'page-2' }));
    });
  });

  describe('resequenceStops', () => {
    it('numbers the Stops 1, 2, ... in the order given', async () => {
      mockStopUpdate.mockResolvedValue({ data: {}, errors: undefined });

      await resequenceStops(['s3', 's1', 's2']);

      expect(mockStopUpdate).toHaveBeenCalledTimes(3);
      expect(mockStopUpdate).toHaveBeenCalledWith({ id: 's3', sequence: 1 });
      expect(mockStopUpdate).toHaveBeenCalledWith({ id: 's1', sequence: 2 });
      expect(mockStopUpdate).toHaveBeenCalledWith({ id: 's2', sequence: 3 });
    });

    it('rejects with the first error when any write fails', async () => {
      mockStopUpdate
        .mockResolvedValueOnce({ data: {}, errors: undefined })
        .mockResolvedValueOnce({ data: null, errors: [{ message: 'conditional check failed' }] });

      await expect(resequenceStops(['s1', 's2'])).rejects.toThrow('conditional check failed');
    });
  });
});

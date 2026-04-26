// Mock the Amplify client BEFORE importing the queries
const mockCustomerList = jest.fn();
const mockCustomerGet = jest.fn();
const mockRouteList = jest.fn();
const mockRouteGet = jest.fn();
const mockRouteCreate = jest.fn();
const mockRouteUpdate = jest.fn();
const mockStopList = jest.fn();
const mockInvoiceList = jest.fn();
const mockInvoiceGet = jest.fn();
const mockLineItemList = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Customer: {
        list: mockCustomerList,
        get: mockCustomerGet,
      },
      Route: {
        list: mockRouteList,
        get: mockRouteGet,
        create: mockRouteCreate,
        update: mockRouteUpdate,
        observeQuery: jest.fn(),
      },
      Stop: {
        list: mockStopList,
      },
      Invoice: {
        list: mockInvoiceList,
        get: mockInvoiceGet,
      },
      LineItem: {
        list: mockLineItemList,
      },
    },
  }),
}));

import {
  listCustomers,
  getCustomer,
  listCustomerRoutes,
  getRouteWithStops,
  listCustomerInvoices,
  getInvoiceWithLineItems,
  createRoute,
  updateRoute,
} from './queries';

describe('queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listCustomers', () => {
    it('should fetch customers with default pagination', async () => {
      const mockCustomers = [{ id: '1', name: 'Customer 1', email: 'c1@example.com' }];
      mockCustomerList.mockResolvedValue({
        data: mockCustomers,
        errors: undefined,
      });

      const result = await listCustomers();

      expect(mockCustomerList).toHaveBeenCalledWith({
        limit: 20,
        nextToken: undefined,
      });
      expect(result.data).toHaveLength(1);
      expect(result.errors).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockCustomerList.mockResolvedValue({
        data: [],
        errors: ['Error fetching customers'],
      });

      const result = await listCustomers();

      expect(result.data).toEqual([]);
      expect(result.errors).toBeDefined();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getCustomer', () => {
    it('should fetch a single customer by ID', async () => {
      const mockCustomer = { id: '1', name: 'Customer 1', email: 'c1@example.com' };
      mockCustomerGet.mockResolvedValue({
        data: mockCustomer,
        errors: undefined,
      });

      const result = await getCustomer('1');

      expect(mockCustomerGet).toHaveBeenCalledWith({ id: '1' });
      expect(result.data).toEqual(mockCustomer);
    });
  });

  describe('listCustomerRoutes', () => {
    it('should fetch routes for a specific customer', async () => {
      const mockRoutes = [
        { id: 'r1', customerId: 'c1', status: 'planned', name: 'Route 1' },
        { id: 'r2', customerId: 'c1', status: 'active', name: 'Route 2' },
      ];

      mockRouteList.mockResolvedValue({
        data: mockRoutes,
        errors: undefined,
      });

      const result = await listCustomerRoutes('c1');

      expect(mockRouteList).toHaveBeenCalledWith({
        filter: { customerId: { eq: 'c1' } },
        limit: 20,
        nextToken: undefined,
      });
      expect(result.data).toHaveLength(2);
    });

    it('should filter routes by status on client side', async () => {
      const mockRoutes = [
        { id: 'r1', customerId: 'c1', status: 'planned' },
        { id: 'r2', customerId: 'c1', status: 'active' },
      ];

      mockRouteList.mockResolvedValue({
        data: mockRoutes,
        errors: undefined,
      });

      const result = await listCustomerRoutes('c1', { status: 'active' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('active');
    });
  });

  describe('getRouteWithStops', () => {
    it('should fetch route and its associated stops', async () => {
      const mockRoute = { id: 'r1', customerId: 'c1', status: 'active' };
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
  });

  describe('createRoute', () => {
    it('should create a new route', async () => {
      const mockRoute = { id: 'r1', customerId: 'c1', status: 'planned' };
      mockRouteCreate.mockResolvedValue({
        data: mockRoute,
        errors: undefined,
      });

      const result = await createRoute({
        customerId: 'c1',
        status: 'planned',
        estimatedDurationMinutes: 120,
      });

      expect(mockRouteCreate).toHaveBeenCalledWith({
        customerId: 'c1',
        status: 'planned',
        estimatedDurationMinutes: 120,
      });
      expect(result.data).toEqual(mockRoute);
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
  });
});

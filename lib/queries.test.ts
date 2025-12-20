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

// Mock the Amplify client
jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Customer: {
        list: jest.fn(),
        get: jest.fn(),
      },
      Route: {
        list: jest.fn(),
        get: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        observeQuery: jest.fn(),
      },
      Stop: {
        list: jest.fn(),
      },
      Invoice: {
        list: jest.fn(),
        get: jest.fn(),
      },
      LineItem: {
        list: jest.fn(),
      },
    },
  }),
}));

describe('queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listCustomers', () => {
    it('should fetch customers with default pagination', async () => {
      const mockClients = require('aws-amplify/data');
      const client = mockClients.generateClient();

      client.models.Customer.list.mockResolvedValue({
        data: [{ id: '1', name: 'Customer 1', email: 'c1@example.com' }],
        errors: undefined,
      });

      const result = await listCustomers();

      expect(client.models.Customer.list).toHaveBeenCalledWith({
        limit: 20,
        nextToken: undefined,
      });
      expect(result.data).toHaveLength(1);
      expect(result.errors).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      const mockClients = require('aws-amplify/data');
      const client = mockClients.generateClient();

      client.models.Customer.list.mockResolvedValue({
        data: [],
        errors: ['Error fetching customers'],
      });

      const result = await listCustomers();

      expect(result.data).toEqual([]);
      expect(result.errors).toBeDefined();
    });
  });

  describe('getCustomer', () => {
    it('should fetch a single customer by ID', async () => {
      const mockClients = require('aws-amplify/data');
      const client = mockClients.generateClient();

      const mockCustomer = { id: '1', name: 'Customer 1', email: 'c1@example.com' };
      client.models.Customer.get.mockResolvedValue({
        data: mockCustomer,
        errors: undefined,
      });

      const result = await getCustomer('1');

      expect(client.models.Customer.get).toHaveBeenCalledWith({ id: '1' });
      expect(result.data).toEqual(mockCustomer);
    });
  });

  describe('listCustomerRoutes', () => {
    it('should fetch routes for a specific customer', async () => {
      const mockClients = require('aws-amplify/data');
      const client = mockClients.generateClient();

      const mockRoutes = [
        { id: 'r1', customerId: 'c1', status: 'planned', name: 'Route 1' },
        { id: 'r2', customerId: 'c1', status: 'active', name: 'Route 2' },
      ];

      client.models.Route.list.mockResolvedValue({
        data: mockRoutes,
        errors: undefined,
      });

      const result = await listCustomerRoutes('c1');

      expect(client.models.Route.list).toHaveBeenCalledWith({
        filter: { customerId: { eq: 'c1' } },
        limit: 20,
        nextToken: undefined,
      });
      expect(result.data).toHaveLength(2);
    });

    it('should filter routes by status on client side', async () => {
      const mockClients = require('aws-amplify/data');
      const client = mockClients.generateClient();

      const mockRoutes = [
        { id: 'r1', customerId: 'c1', status: 'planned' },
        { id: 'r2', customerId: 'c1', status: 'active' },
      ];

      client.models.Route.list.mockResolvedValue({
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
      const mockClients = require('aws-amplify/data');
      const client = mockClients.generateClient();

      const mockRoute = { id: 'r1', customerId: 'c1', status: 'active' };
      const mockStops = [
        { id: 's1', routeId: 'r1', sequence: 1, address: '123 Main St' },
        { id: 's2', routeId: 'r1', sequence: 2, address: '456 Oak Ave' },
      ];

      client.models.Route.get.mockResolvedValue({
        data: mockRoute,
        errors: undefined,
      });

      client.models.Stop.list.mockResolvedValue({
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
      const mockClients = require('aws-amplify/data');
      const client = mockClients.generateClient();

      const mockRoute = { id: 'r1', customerId: 'c1', status: 'planned' };
      client.models.Route.create.mockResolvedValue({
        data: mockRoute,
        errors: undefined,
      });

      const result = await createRoute({
        customerId: 'c1',
        status: 'planned',
        estimatedDurationMinutes: 120,
      });

      expect(client.models.Route.create).toHaveBeenCalledWith({
        customerId: 'c1',
        status: 'planned',
        estimatedDurationMinutes: 120,
      });
      expect(result.data).toEqual(mockRoute);
    });
  });

  describe('updateRoute', () => {
    it('should update an existing route', async () => {
      const mockClients = require('aws-amplify/data');
      const client = mockClients.generateClient();

      const mockRoute = { id: 'r1', status: 'completed', actualDurationMinutes: 115 };
      client.models.Route.update.mockResolvedValue({
        data: mockRoute,
        errors: undefined,
      });

      const result = await updateRoute('r1', {
        status: 'completed',
        actualDurationMinutes: 115,
      });

      expect(client.models.Route.update).toHaveBeenCalledWith({
        id: 'r1',
        status: 'completed',
        actualDurationMinutes: 115,
      });
      expect(result.data).toEqual(mockRoute);
    });
  });
});

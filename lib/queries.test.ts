// Mock the Amplify client BEFORE importing the queries
const mockCustomerList = jest.fn();
const mockCustomerGet = jest.fn();
const mockCustomerCreate = jest.fn();
const mockCustomerUpdate = jest.fn();
const mockCustomerDelete = jest.fn();
const mockRouteList = jest.fn();
const mockRouteGet = jest.fn();
const mockRouteCreate = jest.fn();
const mockRouteUpdate = jest.fn();
const mockRouteDelete = jest.fn();
const mockStopList = jest.fn();
const mockStopDelete = jest.fn();
const mockStopUpdate = jest.fn();
const mockInvoiceList = jest.fn();
const mockInvoiceGet = jest.fn();
const mockInvoiceCreate = jest.fn();
const mockInvoiceUpdate = jest.fn();
const mockInvoiceDelete = jest.fn();
const mockLineItemList = jest.fn();
const mockLineItemCreate = jest.fn();
const mockLineItemDelete = jest.fn();
const mockUserSettingsList = jest.fn();
const mockUserSettingsCreate = jest.fn();
const mockUserSettingsUpdate = jest.fn();
const mockCustomerUserList = jest.fn();
const mockCustomerUserCreate = jest.fn();
const mockCustomerUserDelete = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Customer: {
        list: mockCustomerList,
        get: mockCustomerGet,
        create: mockCustomerCreate,
        update: mockCustomerUpdate,
        delete: mockCustomerDelete,
      },
      Route: {
        list: mockRouteList,
        get: mockRouteGet,
        create: mockRouteCreate,
        update: mockRouteUpdate,
        delete: mockRouteDelete,
        observeQuery: jest.fn(),
      },
      Stop: {
        list: mockStopList,
        delete: mockStopDelete,
        update: mockStopUpdate,
      },
      Invoice: {
        list: mockInvoiceList,
        get: mockInvoiceGet,
        create: mockInvoiceCreate,
        update: mockInvoiceUpdate,
        delete: mockInvoiceDelete,
      },
      LineItem: {
        list: mockLineItemList,
        create: mockLineItemCreate,
        delete: mockLineItemDelete,
      },
      UserSettings: {
        list: mockUserSettingsList,
        create: mockUserSettingsCreate,
        update: mockUserSettingsUpdate,
      },
      CustomerUser: {
        list: mockCustomerUserList,
        create: mockCustomerUserCreate,
        delete: mockCustomerUserDelete,
      },
    },
  }),
}));

import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getUserSettings,
  upsertUserSettings,
  listCustomerRoutes,
  getRouteWithStops,
  getCustomerPortalContext,
  listCustomerInvoices,
  listInvoices,
  getInvoiceWithLineItems,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  updateInvoicePdfKey,
  createLineItem,
  createRoute,
  updateRoute,
  updateRouteExecution,
  updateStopExecution,
  deleteRoute,
  listCustomerUsers,
  createCustomerUser,
  deleteCustomerUser,
  syncViewerSubsForCustomer,
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

    it('should return wrapped errors when customer get throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockCustomerGet.mockRejectedValue(new Error('customer get failed'));

      const result = await getCustomer('1');

      expect(result.data).toBeNull();
      expect(result.errors).toHaveLength(1);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('customer CRUD helpers', () => {
    it('should create customer and normalize defaults', async () => {
      mockCustomerCreate.mockResolvedValue({
        data: { id: 'c-created' },
        errors: undefined,
      });

      const result = await createCustomer({
        name: 'Acme Pty Ltd',
        email: 'ops@acme.test',
        billingRatePerHour: 120,
      });

      expect(mockCustomerCreate).toHaveBeenCalled();
      expect(result.data).toEqual({ id: 'c-created' });
    });

    it('should update customer', async () => {
      mockCustomerUpdate.mockResolvedValue({
        data: { id: 'c1', name: 'Updated' },
        errors: undefined,
      });

      const result = await updateCustomer('c1', { name: 'Updated' });

      expect(mockCustomerUpdate).toHaveBeenCalled();
      expect(result.data).toEqual({ id: 'c1', name: 'Updated' });
    });

    it('should delete customer', async () => {
      mockCustomerDelete.mockResolvedValue({
        data: { id: 'c1' },
        errors: undefined,
      });

      const result = await deleteCustomer('c1');

      expect(mockCustomerDelete).toHaveBeenCalledWith({ id: 'c1' });
      expect(result.data).toEqual({ id: 'c1' });
    });
  });

  describe('getUserSettings', () => {
    it('should return first settings row for the user', async () => {
      mockUserSettingsList.mockResolvedValue({
        data: [
          { id: 'settings-1', userSub: 'user-1', defaultTheme: 'dark' },
          { id: 'settings-2', userSub: 'user-1', defaultTheme: 'light' },
        ],
        errors: undefined,
      });

      const result = await getUserSettings('user-1');

      expect(mockUserSettingsList).toHaveBeenCalledWith({
        filter: { userSub: { eq: 'user-1' } },
        limit: 1,
      });
      expect(result.data).toEqual({ id: 'settings-1', userSub: 'user-1', defaultTheme: 'dark' });
    });

    it('should return wrapped error when list throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockUserSettingsList.mockRejectedValue(new Error('settings failure'));

      const result = await getUserSettings('user-1');

      expect(result.data).toBeNull();
      expect(result.errors).toBeDefined();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('upsertUserSettings', () => {
    it('should update settings when an existing row is found', async () => {
      mockUserSettingsList.mockResolvedValue({
        data: [{ id: 'settings-1', userSub: 'user-1' }],
        errors: undefined,
      });
      mockUserSettingsUpdate.mockResolvedValue({ data: { id: 'settings-1' }, errors: undefined });

      const result = await upsertUserSettings('user-1', { defaultTheme: 'dark' });

      expect(mockUserSettingsUpdate).toHaveBeenCalled();
      expect(result.data).toEqual({ id: 'settings-1' });
    });

    it('should create settings when no existing row is found', async () => {
      mockUserSettingsList.mockResolvedValue({
        data: [],
        errors: undefined,
      });
      mockUserSettingsCreate.mockResolvedValue({ data: { id: 'settings-new' }, errors: undefined });

      const result = await upsertUserSettings('user-2', { mapTheme: 'dark' as any });

      expect(mockUserSettingsCreate).toHaveBeenCalled();
      expect(result.data).toEqual({ id: 'settings-new' });
    });
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
        limit: 20,
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

  describe('listCustomerInvoices', () => {
    it('should fetch invoices for a specific customer', async () => {
      mockInvoiceList.mockResolvedValue({
        data: [{ id: 'i1', customerId: 'c1', status: 'sent' }],
        errors: undefined,
      });

      const result = await listCustomerInvoices('c1');

      expect(mockInvoiceList).toHaveBeenCalledWith({
        filter: { customerId: { eq: 'c1' } },
        limit: 20,
      });
      expect(result.data).toHaveLength(1);
    });

    it('should return an empty list on error', async () => {
      mockInvoiceList.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });

      const result = await listCustomerInvoices('c1');

      expect(result.data).toEqual([]);
      expect(result.errors).toBeTruthy();
    });
  });

  describe('getCustomerPortalContext', () => {
    it('should resolve account owner role from CustomerUser mapping', async () => {
      mockCustomerUserList.mockResolvedValue({
        data: [{ role: 'account_owner', customerId: 'cust-1' }],
        errors: undefined,
      });

      const result = await getCustomerPortalContext('user-1');

      expect(result).toEqual({ role: 'account_owner', customerId: 'cust-1', errors: undefined });
    });

    it('should resolve read-only role when no owner mapping exists', async () => {
      mockCustomerUserList.mockResolvedValue({
        data: [{ role: 'read_only', customerId: 'cust-2' }],
        errors: undefined,
      });

      const result = await getCustomerPortalContext('user-2');

      expect(result).toEqual({ role: 'read_only', customerId: 'cust-2', errors: undefined });
    });

    it('should fallback to legacy customer when mapping is absent', async () => {
      mockCustomerUserList.mockResolvedValue({ data: [], errors: undefined });
      mockCustomerGet.mockResolvedValue({ data: { id: 'legacy-sub' }, errors: undefined });

      const result = await getCustomerPortalContext('legacy-sub');

      expect(result).toEqual({ role: 'account_owner', customerId: 'legacy-sub', errors: undefined });
    });

    it('should return empty customer id and errors when no mapping or legacy customer exists', async () => {
      mockCustomerUserList.mockResolvedValue({ data: [], errors: undefined });
      mockCustomerGet.mockResolvedValue({ data: null, errors: undefined });

      const result = await getCustomerPortalContext('missing-sub');

      expect(result.role).toBe('account_owner');
      expect(result.customerId).toBe('');
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
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

  describe('listInvoices', () => {
    it('should list invoices with optional status filtering', async () => {
      mockInvoiceList.mockResolvedValue({
        data: [
          { id: 'i1', status: 'draft' },
          { id: 'i2', status: 'sent' },
        ],
        errors: undefined,
      });

      const all = await listInvoices();
      const sent = await listInvoices({ status: 'sent' as any });

      expect(all.data).toHaveLength(2);
      expect(sent.data).toHaveLength(1);
      expect(sent.data[0].id).toBe('i2');
    });

    it('should return empty data and errors when invoice listing fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockInvoiceList.mockResolvedValue({
        data: [],
        errors: [{ message: 'boom' }],
      });

      const result = await listInvoices();

      expect(result.data).toEqual([]);
      expect(result.errors).toBeDefined();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getInvoiceWithLineItems', () => {
    it('should return invoice with associated line items', async () => {
      mockInvoiceGet.mockResolvedValue({
        data: { id: 'inv-1', status: 'draft' },
        errors: undefined,
      });
      mockLineItemList.mockResolvedValue({
        data: [{ id: 'li-1', invoiceId: 'inv-1' }],
        errors: undefined,
      });

      const result = await getInvoiceWithLineItems('inv-1');

      expect(result.invoice).toEqual({ id: 'inv-1', status: 'draft' });
      expect(result.lineItems).toHaveLength(1);
    });

    it('should return empty line items when invoice is not found', async () => {
      mockInvoiceGet.mockResolvedValue({
        data: null,
        errors: undefined,
      });

      const result = await getInvoiceWithLineItems('missing');

      expect(result.invoice).toBeNull();
      expect(result.lineItems).toEqual([]);
    });

    it('should return invoice errors when invoice fetch errors are present', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockInvoiceGet.mockResolvedValue({
        data: null,
        errors: [{ message: 'invoice get failed' }],
      });

      const result = await getInvoiceWithLineItems('inv-1');

      expect(result.invoice).toBeNull();
      expect(result.errors).toEqual([{ message: 'invoice get failed' }]);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('invoice mutation helpers', () => {
    it('should create invoice', async () => {
      mockInvoiceCreate.mockResolvedValue({ data: { id: 'inv-1' }, errors: undefined });

      const result = await createInvoice({
        customerId: 'c1',
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-01-01',
        totalAmount: 100,
        status: 'draft',
      });

      expect(mockInvoiceCreate).toHaveBeenCalled();
      expect(result.data).toEqual({ id: 'inv-1' });
    });

    it('should update invoice', async () => {
      mockInvoiceUpdate.mockResolvedValue({ data: { id: 'inv-1', status: 'sent' }, errors: undefined });

      const result = await updateInvoice('inv-1', { status: 'sent' });

      expect(mockInvoiceUpdate).toHaveBeenCalledWith({ id: 'inv-1', status: 'sent' });
      expect(result.data).toEqual({ id: 'inv-1', status: 'sent' });
    });

    it('should delegate PDF key updates to updateInvoice', async () => {
      mockInvoiceUpdate.mockResolvedValue({ data: { id: 'inv-1', pdfS3Key: 'invoices/x.pdf' }, errors: undefined });

      const result = await updateInvoicePdfKey('inv-1', 'invoices/x.pdf');

      expect(mockInvoiceUpdate).toHaveBeenCalledWith({ id: 'inv-1', pdfS3Key: 'invoices/x.pdf' });
      expect(result.data).toEqual({ id: 'inv-1', pdfS3Key: 'invoices/x.pdf' });
    });

    it('should delete child line items before deleting the invoice', async () => {
      mockLineItemList.mockResolvedValue({
        data: [{ id: 'li-1' }, { id: 'li-2' }],
        errors: undefined,
      });
      mockLineItemDelete.mockResolvedValue({ data: {}, errors: undefined });
      mockInvoiceDelete.mockResolvedValue({ data: { id: 'inv-1' }, errors: undefined });

      const result = await deleteInvoice('inv-1');

      expect(mockLineItemDelete).toHaveBeenCalledTimes(2);
      expect(mockInvoiceDelete).toHaveBeenCalledWith({ id: 'inv-1' });
      expect(result.errors).toBeUndefined();
    });

    it('should stop deleteInvoice when line item list returns errors', async () => {
      mockLineItemList.mockResolvedValue({
        data: [],
        errors: [{ message: 'cannot list line items' }],
      });

      const result = await deleteInvoice('inv-1');

      expect(mockInvoiceDelete).not.toHaveBeenCalled();
      expect(result.data).toBeNull();
      expect(result.errors).toBeDefined();
    });

    it('should return child line item delete errors without deleting the invoice', async () => {
      mockLineItemList.mockResolvedValue({
        data: [{ id: 'li-1' }],
        errors: undefined,
      });
      mockLineItemDelete.mockResolvedValue({ data: null, errors: [{ message: 'line item delete failed' }] });

      const result = await deleteInvoice('inv-1');

      expect(mockInvoiceDelete).not.toHaveBeenCalled();
      expect(result.data).toBeNull();
      expect(result.errors).toEqual([{ message: 'line item delete failed' }]);
    });

    it('should return wrapped errors when deleteInvoice throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockLineItemList.mockRejectedValue(new Error('delete invoice failed'));

      const result = await deleteInvoice('inv-1');

      expect(result.data).toBeNull();
      expect(result.errors).toHaveLength(1);
      consoleErrorSpy.mockRestore();
    });

    it('should create line item', async () => {
      mockLineItemCreate.mockResolvedValue({ data: { id: 'li-1' }, errors: undefined });

      const result = await createLineItem({
        invoiceId: 'inv-1',
        customerId: 'c1',
        description: 'Service',
        ratePerUnit: 50,
        amount: 100,
      });

      expect(mockLineItemCreate).toHaveBeenCalled();
      expect(result.data).toEqual({ id: 'li-1' });
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

  describe('updateRouteExecution', () => {
    it('should delegate execution updates through updateRoute', async () => {
      mockRouteUpdate.mockResolvedValue({
        data: { id: 'r1', status: 'in_progress' },
        errors: undefined,
      });

      const result = await updateRouteExecution('r1', {
        status: 'in_progress',
        executionPhase: 'placement',
      });

      expect(mockRouteUpdate).toHaveBeenCalledWith({
        id: 'r1',
        status: 'in_progress',
        executionPhase: 'placement',
      });
      expect(result.data).toEqual({ id: 'r1', status: 'in_progress' });
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

  describe('customer user helpers', () => {
    it('should list customer users for a customer', async () => {
      mockCustomerUserList.mockResolvedValue({
        data: [{ id: 'cu1', customerId: 'c1', role: 'account_owner' }],
        errors: undefined,
      });

      const result = await listCustomerUsers('c1');

      expect(mockCustomerUserList).toHaveBeenCalledWith({
        filter: { customerId: { eq: 'c1' } },
      });
      expect(result.data).toHaveLength(1);
    });

    it('should create a customer user', async () => {
      mockCustomerUserCreate.mockResolvedValue({
        data: { id: 'cu-new' },
        errors: undefined,
      });

      const result = await createCustomerUser({
        customerId: 'c1',
        userSub: 'u1',
        accountOwnerSub: 'u1',
        role: 'read_only',
      });

      expect(mockCustomerUserCreate).toHaveBeenCalled();
      expect(result.data).toEqual({ id: 'cu-new' });
    });

    it('should delete a customer user', async () => {
      mockCustomerUserDelete.mockResolvedValue({
        data: { id: 'cu1' },
        errors: undefined,
      });

      const result = await deleteCustomerUser('cu1');

      expect(mockCustomerUserDelete).toHaveBeenCalledWith({ id: 'cu1' });
      expect(result.data).toEqual({ id: 'cu1' });
    });
  });

  describe('syncViewerSubsForCustomer', () => {
    it('should sync viewer subs across routes and stops', async () => {
      mockRouteList.mockResolvedValue({
        data: [{ id: 'r1', customerId: 'c1' }],
        errors: undefined,
      });
      mockRouteUpdate.mockResolvedValue({ data: { id: 'r1' }, errors: undefined });
      mockStopList.mockResolvedValue({
        data: [{ id: 's1', routeId: 'r1' }, { id: 's2', routeId: 'r1' }],
        errors: undefined,
      });
      mockStopUpdate.mockResolvedValue({ data: {}, errors: undefined });

      const result = await syncViewerSubsForCustomer('c1', ['sub-owner', 'sub-read']);

      expect(mockRouteList).toHaveBeenCalledWith({
        filter: { customerId: { eq: 'c1' } },
        limit: 1000,
      });
      expect(mockRouteUpdate).toHaveBeenCalledWith({ id: 'r1', viewerSubs: ['sub-owner', 'sub-read'] });
      expect(mockStopUpdate).toHaveBeenCalledTimes(2);
      expect(result.updatedRoutes).toBe(1);
      expect(result.updatedStops).toBe(2);
      expect(result.errors).toEqual([]);
    });

    it('should collect and return update errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockRouteList.mockResolvedValue({
        data: [{ id: 'r1', customerId: 'c1' }],
        errors: undefined,
      });
      mockRouteUpdate.mockResolvedValue({ data: null, errors: [{ message: 'route update failed' }] });
      mockStopList.mockResolvedValue({
        data: [{ id: 's1', routeId: 'r1' }],
        errors: undefined,
      });
      mockStopUpdate.mockResolvedValue({ data: null, errors: [{ message: 'stop update failed' }] });

      const result = await syncViewerSubsForCustomer('c1', ['sub-owner']);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.updatedRoutes).toBe(0);
      expect(result.updatedStops).toBe(0);

      consoleErrorSpy.mockRestore();
    });
  });
});

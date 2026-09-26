// Mock the Amplify client BEFORE importing the queries
const mockCustomerList = jest.fn();
const mockCustomerGet = jest.fn();
const mockCustomerCreate = jest.fn();
const mockCustomerUpdate = jest.fn();
const mockCustomerDelete = jest.fn();
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
const mockCustomerUserUpdate = jest.fn();

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
        update: mockCustomerUserUpdate,
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
  getCustomerPortalContext,
  listCustomerInvoices,
  listInvoices,
  getInvoiceWithLineItems,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  updateInvoicePdfKey,
  createLineItem,
  listCustomerUsers,
  listAllCustomerUsers,
  createCustomerUser,
  deleteCustomerUser,
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
        limit: 1000,
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
        limit: 1000,
        nextToken: undefined,
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

  describe('listCustomerInvoices', () => {
    it('should fetch invoices for a specific customer', async () => {
      mockInvoiceList.mockResolvedValue({
        data: [{ id: 'i1', customerId: 'c1', status: 'sent' }],
        errors: undefined,
      });

      const result = await listCustomerInvoices('c1');

      expect(mockInvoiceList).toHaveBeenCalledWith({
        filter: { customerId: { eq: 'c1' } },
        limit: 1000,
        nextToken: undefined,
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

  describe('customer user helpers', () => {
    it('should list customer users for a customer', async () => {
      mockCustomerUserList.mockResolvedValue({
        data: [{ id: 'cu1', customerId: 'c1', role: 'account_owner' }],
        errors: undefined,
      });

      const result = await listCustomerUsers('c1');

      expect(mockCustomerUserList).toHaveBeenCalledWith({
        filter: { customerId: { eq: 'c1' } },
        limit: 1000,
        nextToken: undefined,
      });
      expect(result.data).toHaveLength(1);
    });

    it('should list customer users across every customer, paginating to completion', async () => {
      mockCustomerUserList
        .mockResolvedValueOnce({
          data: [{ id: 'cu1', customerId: 'c1', role: 'account_owner' }],
          errors: undefined,
          nextToken: 'token-2',
        })
        .mockResolvedValueOnce({
          data: [{ id: 'cu2', customerId: 'c2', role: 'read_only' }],
          errors: undefined,
          nextToken: null,
        });

      const result = await listAllCustomerUsers();

      expect(mockCustomerUserList).toHaveBeenCalledTimes(2);
      expect(mockCustomerUserList).toHaveBeenNthCalledWith(1, { limit: 1000, nextToken: undefined });
      expect(mockCustomerUserList).toHaveBeenNthCalledWith(2, { limit: 1000, nextToken: 'token-2' });
      expect(result.data).toEqual([
        { id: 'cu1', customerId: 'c1', role: 'account_owner' },
        { id: 'cu2', customerId: 'c2', role: 'read_only' },
      ]);
      expect(result.errors).toBeUndefined();
    });

    it('should stop and surface errors when listing all customer users fails partway through', async () => {
      mockCustomerUserList.mockResolvedValueOnce({
        data: [{ id: 'cu1', customerId: 'c1', role: 'account_owner' }],
        errors: undefined,
        nextToken: 'token-2',
      });
      mockCustomerUserList.mockResolvedValueOnce({
        data: undefined,
        errors: [new Error('boom')],
        nextToken: undefined,
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await listAllCustomerUsers();

      expect(result.data).toEqual([{ id: 'cu1', customerId: 'c1', role: 'account_owner' }]);
      expect(result.errors).toHaveLength(1);
      consoleErrorSpy.mockRestore();
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
});

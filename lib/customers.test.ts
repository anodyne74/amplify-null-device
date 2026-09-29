// Mock the Amplify client BEFORE importing the Customer aggregate
const mockCustomerCreate = jest.fn();
const mockCustomerGet = jest.fn();
const mockCustomerList = jest.fn();
const mockCustomerUpdate = jest.fn();
const mockCustomerUserCreate = jest.fn();
const mockCustomerUserDelete = jest.fn();
const mockCustomerUserList = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Customer: {
        create: mockCustomerCreate,
        get: mockCustomerGet,
        list: mockCustomerList,
        update: mockCustomerUpdate,
      },
      CustomerUser: {
        create: mockCustomerUserCreate,
        delete: mockCustomerUserDelete,
        list: mockCustomerUserList,
      },
    },
  }),
}));

import {
  listAllCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  getCustomerPortalContext,
  listCustomerUsers,
  listAllCustomerUsers,
  createCustomerUser,
  deleteCustomerUser,
} from './customers';
import { DataError } from './graphqlResult';

describe('customers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listAllCustomers', () => {
    it('should fetch customers with default pagination', async () => {
      const mockCustomers = [{ id: '1', name: 'Customer 1', email: 'c1@example.com' }];
      mockCustomerList.mockResolvedValue({
        data: mockCustomers,
        errors: undefined,
      });

      const result = await listAllCustomers();

      expect(mockCustomerList).toHaveBeenCalledWith({
        limit: 1000,
        nextToken: undefined,
      });
      expect(result).toEqual(mockCustomers);
    });

    it('throws a DataError when the read fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockCustomerList.mockResolvedValue({
        data: [],
        errors: [{ message: 'Error fetching customers' }],
      });

      await expect(listAllCustomers()).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to load customers.',
      });
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
      expect(result).toEqual(mockCustomer);
    });

    it('returns null for a Customer that does not exist', async () => {
      mockCustomerGet.mockResolvedValue({ data: null, errors: undefined });

      await expect(getCustomer('missing')).resolves.toBeNull();
    });

    it('throws a DataError when customer get throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockCustomerGet.mockRejectedValue(new Error('customer get failed'));

      await expect(getCustomer('1')).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to load customer.',
      });
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
      expect(result).toEqual({ id: 'c-created' });
    });

    it('should update customer', async () => {
      mockCustomerUpdate.mockResolvedValue({
        data: { id: 'c1', name: 'Updated' },
        errors: undefined,
      });

      const result = await updateCustomer('c1', { name: 'Updated' });

      expect(mockCustomerUpdate).toHaveBeenCalled();
      expect(result).toEqual({ id: 'c1', name: 'Updated' });
    });

    it('throws a DataError when the update fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockCustomerUpdate.mockResolvedValue({ data: null, errors: [{ message: 'Not Authorized' }] });

      await expect(updateCustomer('c1', { name: 'Updated' })).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to update customer.',
      });
      consoleErrorSpy.mockRestore();
    });

  });

  describe('getCustomerPortalContext', () => {
    it('should resolve account owner role from CustomerUser mapping', async () => {
      mockCustomerUserList.mockResolvedValue({
        data: [{ role: 'account_owner', customerId: 'cust-1' }],
        errors: undefined,
      });

      const result = await getCustomerPortalContext('user-1');

      expect(result).toEqual({ role: 'account_owner', customerId: 'cust-1' });
    });

    it('should resolve read-only role when no owner mapping exists', async () => {
      mockCustomerUserList.mockResolvedValue({
        data: [{ role: 'read_only', customerId: 'cust-2' }],
        errors: undefined,
      });

      const result = await getCustomerPortalContext('user-2');

      expect(result).toEqual({ role: 'read_only', customerId: 'cust-2' });
    });

    it('should fallback to legacy customer when mapping is absent', async () => {
      mockCustomerUserList.mockResolvedValue({ data: [], errors: undefined });
      mockCustomerGet.mockResolvedValue({ data: { id: 'legacy-sub' }, errors: undefined });

      const result = await getCustomerPortalContext('legacy-sub');

      expect(result).toEqual({ role: 'account_owner', customerId: 'legacy-sub' });
    });

    it('returns null when no mapping or legacy customer exists', async () => {
      mockCustomerUserList.mockResolvedValue({ data: [], errors: undefined });
      mockCustomerGet.mockResolvedValue({ data: null, errors: undefined });

      await expect(getCustomerPortalContext('missing-sub')).resolves.toBeNull();
    });

    it('throws rather than guessing an owner when the CustomerUser read fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockCustomerUserList.mockRejectedValue(new Error('network down'));

      await expect(getCustomerPortalContext('user-1')).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to load your account.',
      });
      consoleErrorSpy.mockRestore();
    });

    it('throws on a partial CustomerUser read instead of trusting the rows it got', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockCustomerUserList.mockResolvedValue({
        data: [{ role: 'read_only', customerId: 'cust-2' }],
        errors: [{ message: 'Not Authorized' }],
      });

      await expect(getCustomerPortalContext('user-2')).rejects.toBeInstanceOf(DataError);
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
        limit: 1000,
        nextToken: undefined,
      });
      expect(result).toHaveLength(1);
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
      expect(result).toEqual([
        { id: 'cu1', customerId: 'c1', role: 'account_owner' },
        { id: 'cu2', customerId: 'c2', role: 'read_only' },
      ]);
    });

    it('throws when listing all customer users fails partway through', async () => {
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

      await expect(listAllCustomerUsers()).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to load customer users.',
      });
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
      expect(result).toEqual({ id: 'cu-new' });
    });

    it('should delete a customer user', async () => {
      mockCustomerUserDelete.mockResolvedValue({
        data: { id: 'cu1' },
        errors: undefined,
      });

      const result = await deleteCustomerUser('cu1');

      expect(mockCustomerUserDelete).toHaveBeenCalledWith({ id: 'cu1' });
      expect(result).toEqual({ id: 'cu1' });
    });

    it('throws a DataError when the delete fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockCustomerUserDelete.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });

      await expect(deleteCustomerUser('cu1')).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to remove customer user.',
      });
      consoleErrorSpy.mockRestore();
    });
  });
});

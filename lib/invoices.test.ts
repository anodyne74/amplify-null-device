// Mock the Amplify client BEFORE importing the Invoice aggregate
const mockInvoiceCreate = jest.fn();
const mockInvoiceDelete = jest.fn();
const mockInvoiceGet = jest.fn();
const mockInvoiceList = jest.fn();
const mockInvoiceUpdate = jest.fn();
const mockLineItemCreate = jest.fn();
const mockLineItemDelete = jest.fn();
const mockLineItemList = jest.fn();
const mockRouteGet = jest.fn();
const mockRouteList = jest.fn();
const mockCustomerGet = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Invoice: {
        create: mockInvoiceCreate,
        delete: mockInvoiceDelete,
        get: mockInvoiceGet,
        list: mockInvoiceList,
        update: mockInvoiceUpdate,
      },
      LineItem: {
        create: mockLineItemCreate,
        delete: mockLineItemDelete,
        list: mockLineItemList,
      },
      Route: {
        get: mockRouteGet,
        list: mockRouteList,
      },
      Customer: {
        get: mockCustomerGet,
      },
    },
  }),
}));

import {
  listCustomerInvoices,
  listRouteInvoices,
  listInvoices,
  getInvoiceWithLineItems,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  updateInvoicePdfKey,
  createLineItem,
  listMyInvoices,
  getInvoiceDetail,
} from './invoices';
import { DataError } from './graphqlResult';

const mockGetCustomerPortalContext = jest.fn();
jest.mock('@/lib/customers', () => ({
  getCustomerPortalContext: (...args: unknown[]) => mockGetCustomerPortalContext(...args),
}));

describe('invoices', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('listRouteInvoices', () => {
    it('fetches the invoices raised for one Route', async () => {
      mockInvoiceList.mockResolvedValue({ data: [{ id: 'i1', routeId: 'r1', invoiceNumber: 'ND-INV-1' }], errors: undefined });

      const result = await listRouteInvoices('r1');

      expect(mockInvoiceList).toHaveBeenCalledWith({ filter: { routeId: { eq: 'r1' } }, limit: 1000, nextToken: undefined });
      expect(result).toHaveLength(1);
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
      expect(result).toHaveLength(1);
    });

    it('throws a DataError when the list fails', async () => {
      mockInvoiceList.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });

      await expect(listCustomerInvoices('c1')).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to load invoices.',
      });
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

      expect(all).toHaveLength(2);
      expect(sent).toHaveLength(1);
      expect(sent[0].id).toBe('i2');
    });

    it('throws on a partial list, and logs the raw errors once', async () => {
      const errors = [{ message: 'boom' }];
      mockInvoiceList.mockResolvedValue({ data: [{ id: 'i1', status: 'draft' }], errors });

      const failure = await listInvoices().catch((err) => err);

      expect(failure).toBeInstanceOf(DataError);
      expect(failure.message).toBe('Failed to load invoices.');
      expect(failure.cause).toEqual(errors);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
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

      expect(result?.invoice).toEqual({ id: 'inv-1', status: 'draft' });
      expect(result?.lineItems).toHaveLength(1);
    });

    it('returns null when the invoice is not found', async () => {
      mockInvoiceGet.mockResolvedValue({
        data: null,
        errors: undefined,
      });

      const result = await getInvoiceWithLineItems('missing');

      expect(result).toBeNull();
      expect(mockLineItemList).not.toHaveBeenCalled();
    });

    it('throws a DataError when the invoice read fails', async () => {
      mockInvoiceGet.mockResolvedValue({
        data: null,
        errors: [{ message: 'invoice get failed' }],
      });

      await expect(getInvoiceWithLineItems('inv-1')).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to load invoice.',
      });
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
      expect(result).toEqual({ id: 'inv-1' });
    });

    it('throws a DataError when the create fails', async () => {
      mockInvoiceCreate.mockResolvedValue({ data: null, errors: [{ message: 'Not Authorized' }] });

      await expect(
        createInvoice({
          customerId: 'c1',
          invoiceNumber: 'INV-001',
          invoiceDate: '2024-01-01',
          totalAmount: 100,
          status: 'draft',
        }),
      ).rejects.toMatchObject({ name: 'DataError', message: 'Failed to create invoice.' });
    });

    it('should update invoice', async () => {
      mockInvoiceUpdate.mockResolvedValue({ data: { id: 'inv-1', status: 'sent' }, errors: undefined });

      const result = await updateInvoice('inv-1', { status: 'sent' });

      expect(mockInvoiceUpdate).toHaveBeenCalledWith({ id: 'inv-1', status: 'sent' });
      expect(result).toEqual({ id: 'inv-1', status: 'sent' });
    });

    it('should delegate PDF key updates to updateInvoice', async () => {
      mockInvoiceUpdate.mockResolvedValue({ data: { id: 'inv-1', pdfS3Key: 'invoices/x.pdf' }, errors: undefined });

      const result = await updateInvoicePdfKey('inv-1', 'invoices/x.pdf');

      expect(mockInvoiceUpdate).toHaveBeenCalledWith({ id: 'inv-1', pdfS3Key: 'invoices/x.pdf' });
      expect(result).toEqual({ id: 'inv-1', pdfS3Key: 'invoices/x.pdf' });
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
      expect(result).toEqual({ id: 'inv-1' });
    });

    it('should stop deleteInvoice when line item list returns errors', async () => {
      mockLineItemList.mockResolvedValue({
        data: [],
        errors: [{ message: 'cannot list line items' }],
      });

      await expect(deleteInvoice('inv-1')).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to delete invoice.',
      });
      expect(mockInvoiceDelete).not.toHaveBeenCalled();
    });

    it('throws on a child line item delete error without deleting the invoice', async () => {
      mockLineItemList.mockResolvedValue({
        data: [{ id: 'li-1' }],
        errors: undefined,
      });
      mockLineItemDelete.mockResolvedValue({ data: null, errors: [{ message: 'line item delete failed' }] });

      const failure = await deleteInvoice('inv-1').catch((err) => err);

      expect(mockInvoiceDelete).not.toHaveBeenCalled();
      expect(failure).toBeInstanceOf(DataError);
      expect(failure.cause).toEqual([{ message: 'line item delete failed' }]);
    });

    it('wraps a thrown error in a DataError', async () => {
      const networkError = new Error('Network error');
      mockLineItemList.mockRejectedValue(networkError);

      const failure = await deleteInvoice('inv-1').catch((err) => err);

      expect(failure).toBeInstanceOf(DataError);
      expect(failure.message).toBe('Failed to delete invoice.');
      expect(failure.cause).toBe(networkError);
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
      expect(result).toEqual({ id: 'li-1' });
    });
  });

  describe('listMyInvoices route codes', () => {
    it("attaches each invoice's Route Code from the customer's routes", async () => {
      mockInvoiceList.mockResolvedValue({
        data: [
          { id: 'i1', customerId: 'c1', routeId: 'r1' },
          { id: 'i2', customerId: 'c1', routeId: null },
        ],
        errors: undefined,
      });
      mockRouteList.mockResolvedValue({ data: [{ id: 'r1', routeCode: 'W39-26-001' }], errors: undefined });

      const result = await listMyInvoices({ customerId: 'c1' });

      expect(mockRouteList).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: { customerId: { eq: 'c1' } },
          selectionSet: ['id', 'routeCode'],
        }),
      );
      expect(result).toEqual([
        { id: 'i1', customerId: 'c1', routeId: 'r1', routeCode: 'W39-26-001' },
        { id: 'i2', customerId: 'c1', routeId: null, routeCode: null },
      ]);
    });

    it('skips the route lookup when no invoice has a route', async () => {
      mockInvoiceList.mockResolvedValue({ data: [{ id: 'i1', customerId: 'c1' }], errors: undefined });

      await listMyInvoices({ customerId: 'c1' });

      expect(mockRouteList).not.toHaveBeenCalled();
    });

    it('still returns the invoices when the routes cannot be read', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockInvoiceList.mockResolvedValue({ data: [{ id: 'i1', customerId: 'c1', routeId: 'r1' }], errors: undefined });
      mockRouteList.mockRejectedValue(new Error('Not Authorized'));

      const result = await listMyInvoices({ customerId: 'c1' });

      expect(result).toEqual([{ id: 'i1', customerId: 'c1', routeId: 'r1', routeCode: null }]);
      warn.mockRestore();
    });

    it('refuses a read_only user with an Access denied DataError', async () => {
      mockGetCustomerPortalContext.mockResolvedValue({ role: 'read_only', customerId: 'c1' });

      await expect(listMyInvoices({ customerId: 'c1', userSub: 'u1' })).rejects.toMatchObject({
        name: 'DataError',
        message: 'Access denied',
      });
      expect(mockInvoiceList).not.toHaveBeenCalled();
    });
  });

  describe('getInvoiceDetail route code', () => {
    beforeEach(() => {
      mockInvoiceGet.mockResolvedValue({ data: { id: 'i1', customerId: 'c1', routeId: 'r1' } });
      mockCustomerGet.mockResolvedValue({ data: { name: 'Acme' } });
      mockLineItemList.mockResolvedValue({ data: [], errors: undefined });
    });

    it("includes the invoice's Route Code", async () => {
      mockRouteGet.mockResolvedValue({ data: { id: 'r1', routeCode: 'W39-26-001' } });

      const result = await getInvoiceDetail({ invoiceId: 'i1', customerId: 'c1' });

      expect(mockRouteGet).toHaveBeenCalledWith({ id: 'r1' }, { selectionSet: ['id', 'routeCode'] });
      expect(result?.routeCode).toBe('W39-26-001');
    });

    it('still loads the invoice when the route cannot be read', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockRouteGet.mockRejectedValue(new Error('Not Authorized'));

      const result = await getInvoiceDetail({ invoiceId: 'i1', customerId: 'c1' });

      expect(result?.routeId).toBe('r1');
      expect(result?.routeCode).toBeUndefined();
      warn.mockRestore();
    });
  });

  describe('getInvoiceDetail not found', () => {
    it("returns null for another Customer's invoice", async () => {
      mockInvoiceGet.mockResolvedValue({ data: { id: 'i1', customerId: 'c2' } });

      await expect(getInvoiceDetail({ invoiceId: 'i1', customerId: 'c1' })).resolves.toBeNull();
      expect(mockLineItemList).not.toHaveBeenCalled();
    });

    it('returns null for a missing invoice', async () => {
      mockInvoiceGet.mockResolvedValue({ data: null });

      await expect(getInvoiceDetail({ invoiceId: 'missing', customerId: 'c1' })).resolves.toBeNull();
    });

    it('returns null for a read_only user without reading the invoice', async () => {
      mockGetCustomerPortalContext.mockResolvedValue({ role: 'read_only', customerId: 'c1' });

      await expect(getInvoiceDetail({ invoiceId: 'i1', customerId: 'c1', userSub: 'u1' })).resolves.toBeNull();
      expect(mockInvoiceGet).not.toHaveBeenCalled();
    });

    it('throws a DataError when the line items cannot be read', async () => {
      mockInvoiceGet.mockResolvedValue({ data: { id: 'i1', customerId: 'c1' } });
      mockCustomerGet.mockResolvedValue({ data: { name: 'Acme' } });
      mockLineItemList.mockResolvedValue({ data: [], errors: [{ message: 'Not Authorized' }] });

      await expect(getInvoiceDetail({ invoiceId: 'i1', customerId: 'c1' })).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to load invoice.',
      });
    });
  });
});

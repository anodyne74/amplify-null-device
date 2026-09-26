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

describe('invoices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
        })
      );
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual([
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

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual([{ id: 'i1', customerId: 'c1', routeId: 'r1', routeCode: null }]);
      warn.mockRestore();
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
      expect(result.data?.routeCode).toBe('W39-26-001');
    });

    it('still loads the invoice when the route cannot be read', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockRouteGet.mockRejectedValue(new Error('Not Authorized'));

      const result = await getInvoiceDetail({ invoiceId: 'i1', customerId: 'c1' });

      expect(result.errors).toBeUndefined();
      expect(result.data?.routeId).toBe('r1');
      expect(result.data?.routeCode).toBeUndefined();
      warn.mockRestore();
    });
  });
});

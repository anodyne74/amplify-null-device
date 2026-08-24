import { act, renderHook } from '@testing-library/react';
import { useInvoiceDocumentActions } from './useInvoiceDocumentActions';
import { getInvoiceWithLineItems, getRouteWithStops, updateInvoicePdfKey } from '@/lib/queries';
import { uploadData } from 'aws-amplify/storage';
import { autoTable } from 'jspdf-autotable';
import type { Invoice } from '@/app/administrator/invoices/types';
import type { CustomerOption } from '@/app/administrator/invoices/types';

// GitHub issue #65: Generate PDF threw because `invoice.totalAmount.toFixed(2)`
// was called unguarded — any invoice row with a null/undefined totalAmount
// (legacy data, despite the schema marking the field required) crashed PDF
// generation instead of degrading gracefully like every other numeric field
// in this function.

jest.mock('@/lib/queries', () => ({
  getInvoiceWithLineItems: jest.fn(),
  getRouteWithStops: jest.fn(),
  updateInvoice: jest.fn(),
  updateInvoicePdfKey: jest.fn(),
}));

jest.mock('aws-amplify/storage', () => ({
  getUrl: jest.fn(),
  uploadData: jest.fn(),
}));

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn().mockResolvedValue({ tokens: { idToken: { toString: () => 'token' } } }),
}));

jest.mock('@/lib/extractScheduleText', () => ({
  extractScheduleText: jest.fn(),
}));

jest.mock('@/lib/parseInvoice', () => ({
  parseInvoiceText: jest.fn(),
}));

const docStub = {
  setFillColor: jest.fn(),
  rect: jest.fn(),
  addImage: jest.fn(),
  setTextColor: jest.fn(),
  setFont: jest.fn(),
  setFontSize: jest.fn(),
  text: jest.fn(),
  splitTextToSize: jest.fn((value: string) => value.split('\n')),
  roundedRect: jest.fn(),
  line: jest.fn(),
  setLineWidth: jest.fn(),
  setDrawColor: jest.fn(),
  addPage: jest.fn(),
  getNumberOfPages: jest.fn(() => 1),
  setPage: jest.fn(),
  output: jest.fn(() => new Blob(['pdf'], { type: 'application/pdf' })),
};

jest.mock('jspdf', () => ({
  jsPDF: jest.fn(() => docStub),
}));

jest.mock('jspdf-autotable', () => ({
  autoTable: jest.fn(),
}));

function createInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-001',
    customerId: 'cust-1',
    routeId: null,
    totalAmount: 150,
    status: 'draft',
    ...overrides,
  } as Invoice;
}

function renderDocumentActions(
  overrides: { setUploadError?: jest.Mock; customers?: CustomerOption[] } = {}
) {
  return renderHook(() =>
    useInvoiceDocumentActions({
      customers: overrides.customers ?? [{ id: 'cust-1', name: 'Acme Corp' } as never],
      routes: [],
      invoices: [],
      fileInputRef: { current: null },
      pendingUploadInvoiceIdRef: { current: null },
      setPendingUploadInvoiceId: jest.fn(),
      setUploadingId: jest.fn(),
      setUploadError: overrides.setUploadError ?? jest.fn(),
      setSuccessMessage: jest.fn(),
      setPdfActionLoadingId: jest.fn(),
      setEmailingInvoiceId: jest.fn(),
      setError: jest.fn(),
      updateInvoiceInState: jest.fn(),
      billingCompanyName: 'Null Device',
      billingAbn: '11 222 333 444',
      billingPhone: '02 5555 5555',
      billingCompanyAddress: '1 Example St',
      billingPaymentAccountName: 'Null Device',
      billingBsb: '123-456',
      billingAccountNumber: '12345678',
    })
  );
}

describe('useInvoiceDocumentActions — handleGeneratePdf (#65)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    (getInvoiceWithLineItems as jest.Mock).mockResolvedValue({ invoice: null, lineItems: [], errors: undefined });
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: null, stops: [], errors: undefined });
    (uploadData as jest.Mock).mockReturnValue({ result: Promise.resolve({}) });
    (updateInvoicePdfKey as jest.Mock).mockResolvedValue({ data: { id: 'inv-1' }, errors: undefined });
  });

  it('does not throw when invoice.totalAmount is null', async () => {
    const setUploadError = jest.fn();
    const { result } = renderDocumentActions({ setUploadError });

    await act(async () => {
      await result.current.handleGeneratePdf(createInvoice({ totalAmount: null as unknown as number }));
    });

    expect(docStub.text).toHaveBeenCalledWith('$0.00', 500, expect.any(Number), { align: 'right' });
    expect(uploadData).toHaveBeenCalled();
    // setUploadError(null) is called at the start of every attempt; it must never
    // be called again with an actual error message.
    expect(setUploadError).not.toHaveBeenCalledWith(expect.stringContaining('Unable to generate'));
  });

  it('generates successfully and renders the real total when totalAmount is present', async () => {
    const { result } = renderDocumentActions();

    await act(async () => {
      await result.current.handleGeneratePdf(createInvoice({ totalAmount: 275.5 }));
    });

    expect(docStub.text).toHaveBeenCalledWith('$275.50', 500, expect.any(Number), { align: 'right' });
    expect(updateInvoicePdfKey).toHaveBeenCalledWith('inv-1', 'invoices/inv-1.pdf');
  });
});

describe('useInvoiceDocumentActions — stop table agent grouping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    (getInvoiceWithLineItems as jest.Mock).mockResolvedValue({ invoice: null, lineItems: [], errors: undefined });
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: null,
      stops: [
        { address: '1 Test St, Epping NSW 2121', agent: "Betty O'Shea", numberOfSigns: 3 },
        { address: '2 Test St, Epping NSW 2121', agent: 'David Mun', numberOfSigns: 2 },
      ],
      errors: undefined,
    });
    (uploadData as jest.Mock).mockReturnValue({ result: Promise.resolve({}) });
    (updateInvoicePdfKey as jest.Mock).mockResolvedValue({ data: { id: 'inv-1' }, errors: undefined });
  });

  it('keeps the stop table flat when the customer has no grouping preference set', async () => {
    const { result } = renderDocumentActions({
      customers: [{ id: 'cust-1', name: 'Acme Corp', groupLineItemsByAgent: false } as never],
    });

    await act(async () => {
      await result.current.handleGeneratePdf(createInvoice({ routeId: 'route-1' }));
    });

    const stopDetailsCall = (autoTable as jest.Mock).mock.calls.find(
      ([, config]) => config?.head?.[0]?.[0] === 'Property'
    );
    expect(stopDetailsCall).toBeDefined();
    expect(stopDetailsCall![1].body).toEqual([
      ['1 Test St, Epping', "Betty O'Shea", '3'],
      ['2 Test St, Epping', 'David Mun', '2'],
    ]);
  });

  it('groups the stop table by agent when the customer has that on-charging preference set', async () => {
    const { result } = renderDocumentActions({
      customers: [{ id: 'cust-1', name: 'Acme Corp', groupLineItemsByAgent: true } as never],
    });

    await act(async () => {
      await result.current.handleGeneratePdf(createInvoice({ routeId: 'route-1' }));
    });

    const stopDetailsCall = (autoTable as jest.Mock).mock.calls.find(
      ([, config]) => config?.head?.[0]?.[0] === 'Property'
    );
    expect(stopDetailsCall).toBeDefined();
    const body = stopDetailsCall![1].body as Array<Array<{ content?: string } | string>>;
    expect(body[0][0]).toMatchObject({ content: "Betty O'Shea — 3 signs" });
    expect(body[1]).toEqual(['1 Test St, Epping', '', '3']);
    expect(body[2][0]).toMatchObject({ content: 'David Mun — 2 signs' });
    expect(body[3]).toEqual(['2 Test St, Epping', '', '2']);
  });
});

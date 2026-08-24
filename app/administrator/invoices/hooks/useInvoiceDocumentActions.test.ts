import { act, renderHook } from '@testing-library/react';
import { useInvoiceDocumentActions } from './useInvoiceDocumentActions';
import { getInvoiceWithLineItems, getRouteWithStops, updateInvoicePdfKey } from '@/lib/queries';
import { uploadData } from 'aws-amplify/storage';
import type { Invoice } from '@/app/administrator/invoices/types';

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

function renderDocumentActions(overrides: { setUploadError?: jest.Mock } = {}) {
  return renderHook(() =>
    useInvoiceDocumentActions({
      customers: [{ id: 'cust-1', name: 'Acme Corp' } as never],
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

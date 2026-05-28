jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const { TextEncoder } = require('util');

const verifyMock = jest.fn();
const sesSendMock = jest.fn();
const invoiceGetMock = jest.fn();
const getUrlMock = jest.fn();
const listCustomerUsersMock = jest.fn();
const getCustomerMock = jest.fn();
const updateInvoiceMock = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: sesSendMock })),
  GetTemplateCommand: jest.fn(function GetTemplateCommand(input) {
    this.input = input;
  }),
  SendRawEmailCommand: jest.fn(function SendRawEmailCommand(input) {
    this.input = input;
  }),
}));

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Invoice: {
        get: invoiceGetMock,
      },
    },
  }),
}));

jest.mock('aws-amplify/storage', () => ({
  getUrl: (...args: unknown[]) => getUrlMock(...args),
}));

jest.mock('@/lib/queries', () => ({
  listCustomerUsers: (...args: unknown[]) => listCustomerUsersMock(...args),
  getCustomer: (...args: unknown[]) => getCustomerMock(...args),
  updateInvoice: (...args: unknown[]) => updateInvoiceMock(...args),
}));

import { POST } from '@/app/api/admin/send-invoice-email/route';

describe('send invoice email API', () => {
  const originalFetch = global.fetch;
  const originalTextEncoder = (global as any).TextEncoder;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    (global as any).TextEncoder = TextEncoder;

    verifyMock.mockResolvedValue({ 'cognito:groups': ['administrator'] });

    invoiceGetMock.mockResolvedValue({
      data: {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-01-05',
        totalAmount: 125,
        customerId: 'cust-1',
        pdfS3Key: 'invoices/inv-1.pdf',
      },
      errors: undefined,
    });

    getCustomerMock.mockResolvedValue({ data: { id: 'cust-1', name: 'Acme', email: 'billing@acme.test' }, errors: undefined });
    listCustomerUsersMock.mockResolvedValue({ data: [], errors: undefined });
    updateInvoiceMock.mockResolvedValue({ data: {}, errors: undefined });

    getUrlMock.mockResolvedValue({
      url: new URL('https://example.test/invoice.pdf'),
    });

    sesSendMock
      .mockResolvedValueOnce({
        Template: {
          HtmlPart: '<p>Hello {{customerName}}</p>',
          TextPart: 'Hello {{customerName}}',
          SubjectPart: 'Invoice {{invoiceNumber}}',
        },
      })
      .mockResolvedValueOnce({
        MessageId: 'ses-message-id-1',
      });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
    (global as any).TextEncoder = originalTextEncoder;
  });

  function makeRequest(options?: {
    token?: string;
    body?: Record<string, unknown>;
  }) {
    return {
      headers: new Headers(options?.token ? { authorization: `Bearer ${options.token}` } : {}),
      json: async () => options?.body ?? { invoiceId: 'inv-1' },
    } as any;
  }

  it('returns 401 when bearer token is missing', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when caller is not administrator', async () => {
    verifyMock.mockResolvedValue({ 'cognito:groups': ['operator'] });

    const response = await POST(makeRequest({ token: 'user-token' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden: admin access required' });
  });

  it('returns 400 when invoiceId is missing', async () => {
    const response = await POST(makeRequest({ token: 'admin-token', body: {} }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invoiceId is required' });
  });

  it('returns 404 when invoice is not found', async () => {
    invoiceGetMock.mockResolvedValue({ data: null, errors: undefined });

    const response = await POST(makeRequest({ token: 'admin-token' }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Invoice not found' });
  });

  it('returns 400 when invoice has no uploaded PDF', async () => {
    invoiceGetMock.mockResolvedValue({
      data: {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        totalAmount: 125,
        customerId: 'cust-1',
        pdfS3Key: null,
      },
      errors: undefined,
    });

    const response = await POST(makeRequest({ token: 'admin-token' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invoice PDF not uploaded' });
  });

  it('returns 400 when no recipient email can be resolved', async () => {
    getCustomerMock.mockResolvedValue({ data: { id: 'cust-1', name: 'Acme', email: null }, errors: undefined });
    listCustomerUsersMock.mockResolvedValue({ data: [], errors: undefined });

    const response = await POST(makeRequest({ token: 'admin-token' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'No recipient email available' });
  });

  it('sends invoice email successfully', async () => {
    const response = await POST(makeRequest({ token: 'admin-token' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      messageId: 'ses-message-id-1',
      sentTo: 'billing@acme.test',
      invoiceNumber: 'INV-001',
    });
    expect(sesSendMock).toHaveBeenCalledTimes(2);
    expect(updateInvoiceMock).toHaveBeenCalled();
  });
});

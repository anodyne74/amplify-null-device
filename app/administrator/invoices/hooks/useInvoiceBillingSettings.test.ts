import { renderHook, waitFor } from '@testing-library/react';
import { DEFAULT_COMPANY_BILLING_DETAILS } from '@/lib/companyBilling';
import { getOrganizationSettings } from '@/lib/queries/OrganizationSettings';
import { useInvoiceBillingSettings } from '@/app/administrator/invoices/hooks/useInvoiceBillingSettings';

jest.mock('@/lib/queries/OrganizationSettings', () => ({
  getOrganizationSettings: jest.fn(),
}));

const mockGetOrganizationSettings = getOrganizationSettings as jest.MockedFunction<typeof getOrganizationSettings>;

describe('useInvoiceBillingSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns defaults while organization settings are loading', () => {
    mockGetOrganizationSettings.mockReturnValue(new Promise(() => {}) as any);

    const { result } = renderHook(() => useInvoiceBillingSettings());

    expect(mockGetOrganizationSettings).toHaveBeenCalled();
    expect(result.current.billingCompanyName).toBe(DEFAULT_COMPANY_BILLING_DETAILS.companyName);
    expect(result.current.billingAbn).toBe(DEFAULT_COMPANY_BILLING_DETAILS.abn);
    expect(result.current.billingPhone).toBe(DEFAULT_COMPANY_BILLING_DETAILS.phone);
    expect(result.current.billingCompanyAddress).toBe(DEFAULT_COMPANY_BILLING_DETAILS.companyAddress);
    expect(result.current.billingPaymentAccountName).toBe(DEFAULT_COMPANY_BILLING_DETAILS.paymentAccountName);
    expect(result.current.billingBsb).toBe(DEFAULT_COMPANY_BILLING_DETAILS.bsb);
    expect(result.current.billingAccountNumber).toBe(DEFAULT_COMPANY_BILLING_DETAILS.accountNumber);
  });

  it('loads and trims organization settings, falling back to defaults for blank fields', async () => {
    mockGetOrganizationSettings.mockResolvedValue({
      data: {
        id: 'organization',
        companyName: '  New Co  ',
        abn: ' ',
        phone: '  0400 111 222  ',
        address: '  1 High St  ',
        paymentAccountName: '  New Co Pty Ltd  ',
        bsb: '',
        accountNumber: ' 123456789 ',
      },
      errors: [],
    } as any);

    const { result } = renderHook(() => useInvoiceBillingSettings());

    await waitFor(() => {
      expect(mockGetOrganizationSettings).toHaveBeenCalled();
      expect(result.current.billingCompanyName).toBe('New Co');
    });

    expect(result.current.billingAbn).toBe(DEFAULT_COMPANY_BILLING_DETAILS.abn);
    expect(result.current.billingPhone).toBe('0400 111 222');
    expect(result.current.billingCompanyAddress).toBe('1 High St');
    expect(result.current.billingPaymentAccountName).toBe('New Co Pty Ltd');
    expect(result.current.billingBsb).toBe(DEFAULT_COMPANY_BILLING_DETAILS.bsb);
    expect(result.current.billingAccountNumber).toBe('123456789');
  });

  it('keeps defaults when getOrganizationSettings fails', async () => {
    mockGetOrganizationSettings.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useInvoiceBillingSettings());

    await waitFor(() => {
      expect(mockGetOrganizationSettings).toHaveBeenCalled();
    });

    expect(result.current.billingCompanyName).toBe(DEFAULT_COMPANY_BILLING_DETAILS.companyName);
    expect(result.current.billingAbn).toBe(DEFAULT_COMPANY_BILLING_DETAILS.abn);
    expect(result.current.billingPhone).toBe(DEFAULT_COMPANY_BILLING_DETAILS.phone);
    expect(result.current.billingCompanyAddress).toBe(DEFAULT_COMPANY_BILLING_DETAILS.companyAddress);
    expect(result.current.billingPaymentAccountName).toBe(DEFAULT_COMPANY_BILLING_DETAILS.paymentAccountName);
    expect(result.current.billingBsb).toBe(DEFAULT_COMPANY_BILLING_DETAILS.bsb);
    expect(result.current.billingAccountNumber).toBe(DEFAULT_COMPANY_BILLING_DETAILS.accountNumber);
  });
});

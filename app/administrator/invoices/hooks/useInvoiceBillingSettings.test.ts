import { renderHook, waitFor } from '@testing-library/react';
import { DEFAULT_COMPANY_BILLING_DETAILS } from '@/lib/companyBilling';
import { getUserSettings } from '@/lib/queries';
import { useInvoiceBillingSettings } from '@/app/administrator/invoices/hooks/useInvoiceBillingSettings';

jest.mock('@/lib/queries', () => ({
  getUserSettings: jest.fn(),
}));

const mockGetUserSettings = getUserSettings as jest.MockedFunction<typeof getUserSettings>;

describe('useInvoiceBillingSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns defaults when no userId is provided', () => {
    const { result } = renderHook(() => useInvoiceBillingSettings({ userId: undefined }));

    expect(mockGetUserSettings).not.toHaveBeenCalled();
    expect(result.current.billingCompanyName).toBe(DEFAULT_COMPANY_BILLING_DETAILS.companyName);
    expect(result.current.billingAbn).toBe(DEFAULT_COMPANY_BILLING_DETAILS.abn);
    expect(result.current.billingPhone).toBe(DEFAULT_COMPANY_BILLING_DETAILS.phone);
    expect(result.current.billingCompanyAddress).toBe(DEFAULT_COMPANY_BILLING_DETAILS.companyAddress);
    expect(result.current.billingPaymentAccountName).toBe(DEFAULT_COMPANY_BILLING_DETAILS.paymentAccountName);
    expect(result.current.billingBsb).toBe(DEFAULT_COMPANY_BILLING_DETAILS.bsb);
    expect(result.current.billingAccountNumber).toBe(DEFAULT_COMPANY_BILLING_DETAILS.accountNumber);
  });

  it('loads and trims user settings, falling back to defaults for blank fields', async () => {
    mockGetUserSettings.mockResolvedValue({
      data: {
        billingCompanyName: '  New Co  ',
        billingAbn: ' ',
        billingPhone: '  0400 111 222  ',
        billingCompanyAddress: '  1 High St  ',
        billingPaymentAccountName: '  New Co Pty Ltd  ',
        billingBsb: '',
        billingAccountNumber: ' 123456789 ',
      },
      errors: [],
    } as any);

    const { result } = renderHook(() => useInvoiceBillingSettings({ userId: 'user-1' }));

    await waitFor(() => {
      expect(mockGetUserSettings).toHaveBeenCalledWith('user-1');
      expect(result.current.billingCompanyName).toBe('New Co');
    });

    expect(result.current.billingAbn).toBe(DEFAULT_COMPANY_BILLING_DETAILS.abn);
    expect(result.current.billingPhone).toBe('0400 111 222');
    expect(result.current.billingCompanyAddress).toBe('1 High St');
    expect(result.current.billingPaymentAccountName).toBe('New Co Pty Ltd');
    expect(result.current.billingBsb).toBe(DEFAULT_COMPANY_BILLING_DETAILS.bsb);
    expect(result.current.billingAccountNumber).toBe('123456789');
  });

  it('keeps defaults when getUserSettings fails', async () => {
    mockGetUserSettings.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useInvoiceBillingSettings({ userId: 'user-2' }));

    await waitFor(() => {
      expect(mockGetUserSettings).toHaveBeenCalledWith('user-2');
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

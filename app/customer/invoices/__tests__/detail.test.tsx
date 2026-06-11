import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import InvoiceDetailContent from '../[id]/_InvoiceDetailContent';
import { getInvoiceDetail } from '@/lib/queries/GetInvoiceDetail';
import { getCustomerPortalContext } from '@/lib/queries';

const replaceMock = jest.fn();
const backMock = jest.fn();
const routerMock = {
  replace: replaceMock,
  back: backMock,
};

jest.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    authStatus: 'authenticated',
    user: {
      userId: 'owner-sub-1',
      username: 'owner-sub-1',
    },
  }),
}));

jest.mock('@/lib/queries/GetInvoiceDetail', () => ({
  getInvoiceDetail: jest.fn(),
}));

jest.mock('@/lib/queries', () => ({
  getCustomerPortalContext: jest.fn(),
}));

describe('Customer invoice detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'cust-1',
    });
    (getInvoiceDetail as jest.Mock).mockResolvedValue({
      data: {
        id: 'inv-1',
        customerId: 'cust-1',
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-01-15T00:00:00Z',
        periodStartDate: '2024-01-01T00:00:00Z',
        periodEndDate: '2024-01-31T00:00:00Z',
        totalAmount: 500,
        status: 'paid',
        lineItems: [],
      },
      errors: undefined,
    });
  });

  it('loads invoice detail with the portal context customer ID', async () => {
    render(<InvoiceDetailContent params={{ id: 'inv-1' }} />);

    expect(await screen.findByRole('heading', { name: /invoice inv-001/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(getInvoiceDetail).toHaveBeenCalledWith({
        invoiceId: 'inv-1',
        customerId: 'cust-1',
        userSub: 'owner-sub-1',
      });
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

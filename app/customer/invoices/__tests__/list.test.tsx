'use client';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvoicesPage from '../page';
import { useAuthenticator } from '@aws-amplify/ui-react';
import * as listMyInvoicesModule from '@/lib/queries/ListMyInvoices';

// Mock the router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock the authenticator
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
}));

// Mock the LoadingSpinner
jest.mock('@/app/components/LoadingSpinner', () => {
  return function MockLoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});

// Mock the listMyInvoices function
jest.spyOn(listMyInvoicesModule, 'listMyInvoices');

describe('Invoice List Page Integration', () => {
  const mockInvoices = [
    {
      id: 'inv-1',
      customerId: 'cust-1',
      invoiceNumber: 'INV-2024-001',
      invoiceDate: '2024-01-15T00:00:00Z',
      periodStartDate: '2024-01-01T00:00:00Z',
      periodEndDate: '2024-01-31T00:00:00Z',
      totalAmount: 1500.00,
      status: 'paid',
      createdAt: '2024-01-15T10:00:00Z',
    },
    {
      id: 'inv-2',
      customerId: 'cust-1',
      invoiceNumber: 'INV-2024-002',
      invoiceDate: '2024-02-15T00:00:00Z',
      periodStartDate: '2024-02-01T00:00:00Z',
      periodEndDate: '2024-02-29T00:00:00Z',
      totalAmount: 2000.00,
      status: 'pending',
      createdAt: '2024-02-15T10:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
      user: {
        userId: 'cust-1',
      },
    });

    (listMyInvoicesModule.listMyInvoices as jest.Mock).mockResolvedValue({
      data: mockInvoices,
      errors: undefined,
      nextToken: undefined,
    });
  });

  it('loads and displays invoices on mount', async () => {
    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/INV-2024-001/i)).toBeInTheDocument();
      expect(screen.getByText(/INV-2024-002/i)).toBeInTheDocument();
    });
  });

  it('displays invoice list with correct data', async () => {
    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/1,500.00/i)).toBeInTheDocument();
      expect(screen.getByText(/2,000.00/i)).toBeInTheDocument();
    });
  });

  it('calls listMyInvoices with correct parameters', async () => {
    render(<InvoicesPage />);

    await waitFor(() => {
      expect(listMyInvoicesModule.listMyInvoices).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-1',
        })
      );
    });
  });

  it('shows empty state when no invoices found', async () => {
    (listMyInvoicesModule.listMyInvoices as jest.Mock).mockResolvedValueOnce({
      data: [],
      errors: undefined,
    });

    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/No invoices found/i)).toBeInTheDocument();
    });
  });

  it('displays error message on fetch failure', async () => {
    (listMyInvoicesModule.listMyInvoices as jest.Mock).mockResolvedValueOnce({
      data: [],
      errors: [new Error('API Error')],
    });

    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load invoices/i)).toBeInTheDocument();
    });
  });

  it('displays invoice count summary', async () => {
    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Showing 2 invoices/i)).toBeInTheDocument();
    });
  });
});

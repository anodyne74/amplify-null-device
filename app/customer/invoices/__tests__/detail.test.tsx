'use client';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvoiceDetailPage from '../[id]/page';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useRouter } from 'next/navigation';

// Mock the router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock the authenticator
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
}));

// Mock LoadingSpinner
jest.mock('@/app/components/LoadingSpinner', () => {
  return function MockLoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});

// Mock InvoiceLineItems component
jest.mock('@/app/customer/components/InvoiceLineItems', () => {
  return function MockInvoiceLineItems({ lineItems, totalAmount }: any) {
    return (
      <div data-testid="invoice-line-items">
        <p>Items: {lineItems?.length || 0}</p>
        <p>Total: {totalAmount}</p>
      </div>
    );
  };
});

// Mock GetInvoiceDetail query
jest.mock('@/lib/queries/GetInvoiceDetail', () => ({
  getInvoiceDetail: jest.fn(),
}));

const { getInvoiceDetail } = require('@/lib/queries/GetInvoiceDetail');

describe('Invoice Detail Page Integration', () => {
  const mockInvoiceDetail = {
    id: 'inv-1',
    customerId: 'cust-1',
    invoiceNumber: 'INV-2024-001',
    invoiceDate: '2024-01-15T00:00:00Z',
    periodStartDate: '2024-01-01T00:00:00Z',
    periodEndDate: '2024-01-31T00:00:00Z',
    totalAmount: 1500.00,
    status: 'paid',
    lineItems: [
      {
        id: 'line-1',
        invoiceId: 'inv-1',
        description: 'Delivery Service',
        quantity: 10,
        ratePerUnit: 100.00,
        amount: 1000.00,
      },
      {
        id: 'line-2',
        invoiceId: 'inv-1',
        description: 'Fuel Surcharge',
        quantity: 1,
        ratePerUnit: 500.00,
        amount: 500.00,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (useRouter as jest.Mock).mockReturnValue({
      back: jest.fn(),
    });

    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
      user: {
        userId: 'cust-1',
      },
    });

    getInvoiceDetail.mockResolvedValue({
      data: mockInvoiceDetail,
      errors: undefined,
    });

    // Mock the fetch API
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads and displays invoice details on mount', async () => {
    render(<InvoiceDetailPage params={{ id: 'inv-1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/Invoice INV-2024-001/i)).toBeInTheDocument();
    });
  });

  it('fetches invoice with correct parameters', async () => {
    render(<InvoiceDetailPage params={{ id: 'inv-1' }} />);

    await waitFor(() => {
      expect(getInvoiceDetail).toHaveBeenCalledWith({
        invoiceId: 'inv-1',
        customerId: 'cust-1',
      });
    });
  });

  it('displays invoice information and components', async () => {
    render(<InvoiceDetailPage params={{ id: 'inv-1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/Invoice INV-2024-001/i)).toBeInTheDocument();
      expect(screen.getByTestId('invoice-line-items')).toBeInTheDocument();
    });
  });

  it('displays line items component', async () => {
    render(<InvoiceDetailPage params={{ id: 'inv-1' }} />);

    await waitFor(() => {
      expect(screen.getByTestId('invoice-line-items')).toBeInTheDocument();
    });
  });

  it('shows download PDF button', async () => {
    render(<InvoiceDetailPage params={{ id: 'inv-1' }} />);

    await waitFor(() => {
      const downloadButton = screen.getByText(/Download PDF/i);
      expect(downloadButton).toBeInTheDocument();
    });
  });

  it('handles invoice fetch error', async () => {
    getInvoiceDetail.mockResolvedValueOnce({
      data: null,
      errors: ['Invoice not found'],
    });

    render(<InvoiceDetailPage params={{ id: 'invalid-id' }} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load invoice|Invoice not found/i)).toBeInTheDocument();
    });
  });

  it('shows back button', async () => {
    render(<InvoiceDetailPage params={{ id: 'inv-1' }} />);

    await waitFor(() => {
      const backButton = screen.getByText(/← Back/i);
      expect(backButton).toBeInTheDocument();
    });
  });
});


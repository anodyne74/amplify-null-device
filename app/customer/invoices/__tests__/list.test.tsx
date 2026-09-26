'use client';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InvoicesPage from '../page';
import * as listMyInvoicesModule from '@/lib/invoices';
import { getCustomerPortalContext, getCustomer } from '@/lib/customers';

// Mock the router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock the authentication
jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => 'owner-sub-1',
}));

// Mock the LoadingSpinner
jest.mock('@/app/components/LoadingSpinner', () => {
  return function MockLoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});

// Mock the listMyInvoices function
jest.spyOn(listMyInvoicesModule, 'listMyInvoices');
jest.mock('@/lib/customers', () => ({
  getCustomerPortalContext: jest.fn(),
  getCustomer: jest.fn(),
}));

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
      routeId: 'route-uuid-0001',
      routeCode: 'W03-24-001',
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
      routeId: 'abcdef1234567890',
      routeCode: null,
      createdAt: '2024-02-15T10:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'cust-1',
    });
    (getCustomer as jest.Mock).mockResolvedValue({
      data: { id: 'cust-1', name: 'Acme Corp' },
      errors: undefined,
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
          userSub: 'owner-sub-1',
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
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    (listMyInvoicesModule.listMyInvoices as jest.Mock).mockResolvedValueOnce({
      data: [],
      errors: [new Error('API Error')],
    });

    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load invoices/i)).toBeInTheDocument();
    });

    consoleErrorSpy.mockRestore();
  });

  it('shows an inline access message for read-only users instead of redirecting', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });

    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/invoices are available to account owners/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/contact your account owner for access/i)).toBeInTheDocument();
    expect(listMyInvoicesModule.listMyInvoices).not.toHaveBeenCalled();
  });

  it('displays invoice count summary', async () => {
    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByText('Showing 1–2 of 2 invoices')).toBeInTheDocument();
    });
  });

  it('filters the invoice list by status chip', async () => {
    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/INV-2024-001/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('Paid')[0]);

    expect(screen.getByText(/INV-2024-001/i)).toBeInTheDocument();
    expect(screen.queryByText(/INV-2024-002/i)).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1–1 of 1 invoices')).toBeInTheDocument();
  });

  it('exports the currently filtered invoices as a CSV download', async () => {
    const createObjectURL = jest.fn(() => 'blob:mock-url');
    const revokeObjectURL = jest.fn();
    (global as any).URL.createObjectURL = createObjectURL;
    (global as any).URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/INV-2024-001/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    clickSpy.mockRestore();
  });

  it('links each route by its Route Code, falling back to a short route ID', async () => {
    render(<InvoicesPage />);

    const coded = await screen.findByRole('link', { name: 'W03-24-001' });
    expect(coded).toHaveAttribute('href', '/customer/routes/route-uuid-0001');
    expect(screen.getByRole('link', { name: 'abcdef12' })).toHaveAttribute('href', '/customer/routes/abcdef1234567890');
    expect(screen.queryByText('View Route')).not.toBeInTheDocument();
  });

  it('lists the newest invoice first', async () => {
    render(<InvoicesPage />);

    await screen.findByText('INV-2024-001');
    const numbers = screen.getAllByText(/^INV-2024-00\d$/).map((cell) => cell.textContent);
    expect(numbers).toEqual(['INV-2024-002', 'INV-2024-001']);
  });

  describe('with more than one page of invoices', () => {
    const manyInvoices = Array.from({ length: 30 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0');
      return {
        id: `inv-${day}`,
        customerId: 'cust-1',
        invoiceNumber: `N-${day}`,
        invoiceDate: `2024-03-${day}T00:00:00Z`,
        totalAmount: 10,
        status: index % 2 === 0 ? 'paid' : 'sent',
      };
    });

    beforeEach(() => {
      (listMyInvoicesModule.listMyInvoices as jest.Mock).mockResolvedValue({ data: manyInvoices, errors: undefined });
    });

    it('shows 25 invoices per page with Previous/Next', async () => {
      render(<InvoicesPage />);

      await screen.findByText('Showing 1–25 of 30 invoices');
      expect(screen.getByText('N-30')).toBeInTheDocument();
      expect(screen.queryByText('N-05')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Previous page of invoices' })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Next page of invoices' }));

      expect(screen.getByText('Showing 26–30 of 30 invoices')).toBeInTheDocument();
      expect(screen.getByText('N-05')).toBeInTheDocument();
      expect(screen.queryByText('N-30')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next page of invoices' })).toBeDisabled();
    });

    it('returns to page 1 when a filter changes', async () => {
      render(<InvoicesPage />);

      await screen.findByText('Showing 1–25 of 30 invoices');
      fireEvent.click(screen.getByRole('button', { name: 'Next page of invoices' }));
      expect(screen.getByText('Showing 26–30 of 30 invoices')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2024-03-01' } });

      expect(await screen.findByText('Showing 1–25 of 30 invoices')).toBeInTheDocument();
    });

    it.each([
      ['a status chip', () => {
        fireEvent.click(screen.getAllByText('Paid')[0]);
        fireEvent.click(screen.getAllByText('All')[0]);
      }],
      ['the end date', () => fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2024-03-31' } })],
      ['Clear filters', () => fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))],
    ])('also returns to page 1 after %s', async (_label, changeFilter) => {
      render(<InvoicesPage />);

      await screen.findByText('Showing 1–25 of 30 invoices');
      fireEvent.click(screen.getByRole('button', { name: 'Next page of invoices' }));
      expect(screen.getByText('Showing 26–30 of 30 invoices')).toBeInTheDocument();

      changeFilter();

      expect(await screen.findByText('Showing 1–25 of 30 invoices')).toBeInTheDocument();
    });

    it('exports every filtered invoice, newest first, not just the visible page', async () => {
      const blobs: Blob[] = [];
      (global as any).URL.createObjectURL = jest.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:mock-url';
      });
      (global as any).URL.revokeObjectURL = jest.fn();
      const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      render(<InvoicesPage />);

      await screen.findByText('Showing 1–25 of 30 invoices');
      fireEvent.click(screen.getByRole('button', { name: 'Next page of invoices' }));
      fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

      // jsdom's Blob has no text(), so read it the FileReader way.
      const csv = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsText(blobs[0]);
      });
      const rows = csv.split('\r\n').slice(1);
      expect(rows).toHaveLength(30);
      expect(rows[0].startsWith('"N-30"')).toBe(true);
      expect(rows[29].startsWith('"N-01"')).toBe(true);

      clickSpy.mockRestore();
    });
  });
});

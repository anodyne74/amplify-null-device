import { render, screen } from '@testing-library/react';
import InvoiceListItem from '../InvoiceListItem';
import type { Invoice } from '@/amplify/types';

describe('InvoiceListItem', () => {
  const mockInvoice: Invoice = {
    id: 'invoice-1',
    customerId: 'customer-1',
    invoiceNumber: 'INV-2024-001',
    invoiceDate: '2024-01-15T00:00:00Z',
    periodStartDate: '2024-01-01T00:00:00Z',
    periodEndDate: '2024-01-31T00:00:00Z',
    totalAmount: 1500.00,
    status: 'paid',
    createdAt: '2024-01-15T10:00:00Z',
  };

  it('renders invoice data correctly', () => {
    render(<InvoiceListItem invoice={mockInvoice} />);

    expect(screen.getByText(/INV-2024-001/i)).toBeInTheDocument();
    expect(screen.getByText(/1,500.00/i)).toBeInTheDocument();
  });

  it('displays status badge', () => {
    render(<InvoiceListItem invoice={mockInvoice} />);

    expect(screen.getByText(/Paid/i)).toBeInTheDocument();
  });

  it('displays view button linking to invoice detail', () => {
    render(<InvoiceListItem invoice={mockInvoice} />);

    const link = screen.getByText(/View/i) as HTMLAnchorElement;
    expect(link).toHaveAttribute('href', '/customer/invoices/invoice-1');
  });

  it('formats currency correctly', () => {
    const invoiceWithAmount: Invoice = {
      ...mockInvoice,
      totalAmount: 2500.50,
    };

    render(<InvoiceListItem invoice={invoiceWithAmount} />);
    expect(screen.getByText(/2,500.50/i)).toBeInTheDocument();
  });

  it('handles pending status', () => {
    const pendingInvoice: Invoice = {
      ...mockInvoice,
      status: 'pending',
    };

    render(<InvoiceListItem invoice={pendingInvoice} />);
    expect(screen.getByText(/Pending/i)).toBeInTheDocument();
  });

  it('handles overdue status', () => {
    const overdueInvoice: Invoice = {
      ...mockInvoice,
      status: 'overdue',
    };

    render(<InvoiceListItem invoice={overdueInvoice} />);
    expect(screen.getByText(/Overdue/i)).toBeInTheDocument();
  });

  it('displays invoice number when available', () => {
    render(<InvoiceListItem invoice={mockInvoice} />);
    expect(screen.getByText(/INV-2024-001/i)).toBeInTheDocument();
  });

  it('handles missing invoice number gracefully', () => {
    const invoiceNoNumber: Invoice = {
      ...mockInvoice,
      invoiceNumber: undefined,
    };

    const { container } = render(<InvoiceListItem invoice={invoiceNoNumber} />);
    expect(container).toBeInTheDocument();
  });

  it('handles null amount', () => {
    const invoiceNullAmount: Invoice = {
      ...mockInvoice,
      totalAmount: null,
    };

    render(<InvoiceListItem invoice={invoiceNullAmount} />);
    expect(screen.getByText(/\$0.00/i)).toBeInTheDocument();
  });
});

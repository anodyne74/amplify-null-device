import { render, screen } from '@testing-library/react';
import { InvoiceStatusPill, InvoiceActions } from '../InvoiceListItem';

describe('InvoiceStatusPill', () => {
  it('displays a paid status', () => {
    render(<InvoiceStatusPill status="paid" />);
    expect(screen.getByText(/Paid/i)).toBeInTheDocument();
  });

  it('displays a sent status', () => {
    render(<InvoiceStatusPill status="sent" />);
    expect(screen.getByText(/Sent/i)).toBeInTheDocument();
  });

  it('displays an overdue status', () => {
    render(<InvoiceStatusPill status="overdue" />);
    expect(screen.getByText(/Overdue/i)).toBeInTheDocument();
  });
});

describe('InvoiceActions', () => {
  it('renders a View link to the invoice detail page when no PDF exists yet', () => {
    render(<InvoiceActions invoice={{ id: 'invoice-1', invoiceNumber: 'INV-2024-001' }} />);

    const link = screen.getByText(/View/i) as HTMLAnchorElement;
    expect(link).toHaveAttribute('href', '/customer/invoices/invoice-1');
  });

  it('renders View PDF and Download buttons when a PDF exists', () => {
    render(<InvoiceActions invoice={{ id: 'invoice-1', invoiceNumber: 'INV-2024-001', pdfS3Key: 'invoices/invoice-1.pdf' }} />);

    expect(screen.getByText(/View PDF/i)).toBeInTheDocument();
    expect(screen.getByText(/Download/i)).toBeInTheDocument();
  });
});

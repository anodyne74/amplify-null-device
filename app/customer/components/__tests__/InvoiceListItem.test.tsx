import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InvoiceStatusPill, InvoiceActions } from '../InvoiceListItem';
import { openInvoicePdf } from '@/lib/invoices';

jest.mock('@/lib/invoices', () => ({ openInvoicePdf: jest.fn() }));

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

  it('opens the PDF through the invoice PDF API, by invoice id', async () => {
    (openInvoicePdf as jest.Mock).mockResolvedValue('https://signed.example/invoices/invoice-1.pdf');
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    render(<InvoiceActions invoice={{ id: 'invoice-1', invoiceNumber: 'INV-2024-001', pdfS3Key: 'invoices/invoice-1.pdf' }} />);

    fireEvent.click(screen.getByText(/View PDF/i));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('https://signed.example/invoices/invoice-1.pdf', '_blank', 'noopener,noreferrer')
    );
    expect(openInvoicePdf).toHaveBeenCalledWith('invoice-1');
    open.mockRestore();
  });
});

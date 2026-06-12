import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { Route } from '@/amplify/types';
import type { Invoice } from '@/app/administrator/invoices/types';
import InvoiceListTable from '@/app/administrator/invoices/components/InvoiceListTable';

function createInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-001',
    customerId: 'cust-1',
    routeId: null,
    pdfS3Key: 'invoices/inv-1.pdf',
    totalAmount: 120,
    status: 'draft',
    ...overrides,
  };
}

function renderTable(invoices: Invoice[], overrides: Partial<ComponentProps<typeof InvoiceListTable>> = {}) {
  const routes: Route[] = [
    {
      id: 'route-1',
      customerId: 'cust-1',
      routeCode: 'R-101',
    },
  ];

  const props: ComponentProps<typeof InvoiceListTable> = {
    loading: false,
    invoices,
    routes,
    uploadingId: null,
    pdfActionLoadingId: null,
    emailingInvoiceId: null,
    customerName: () => 'Acme Customer',
    routeCode: () => 'R-101',
    isInvoicePaid: (status) => status === 'paid',
    onRouteLink: jest.fn(),
    onGeneratePdf: jest.fn(),
    onPdfAction: jest.fn(),
    onUploadClick: jest.fn(),
    onMarkPaid: jest.fn(),
    onEmailInvoiceToPrimary: jest.fn(),
    ...overrides,
  };

  return render(
    <InvoiceListTable
      {...props}
    />
  );
}

describe('InvoiceListTable', () => {
  it('applies expected variants to visible actions when PDF is attached', () => {
    renderTable([createInvoice()]);

    expect(screen.getByRole('button', { name: 'View PDF for invoice INV-001' })).toHaveClass('adminBtnGhost');
    expect(screen.getByRole('button', { name: 'Mark invoice INV-001 as paid' })).toHaveClass('adminBtnPrimary');
    expect(screen.getByRole('button', { name: 'Email invoice INV-001' })).toHaveClass('adminBtnSecondary');
  });

  it('shows generate action as primary and hides mark-paid when invoice is already paid', () => {
    renderTable([
      createInvoice({
        id: 'inv-2',
        invoiceNumber: 'INV-002',
        status: 'paid',
        pdfS3Key: null,
      }),
    ]);

    expect(screen.getByRole('button', { name: 'Generate PDF for invoice INV-002' })).toHaveClass('adminBtnPrimary');
    expect(screen.queryByRole('button', { name: 'Mark invoice INV-002 as paid' })).not.toBeInTheDocument();
  });

  it('requires confirmation before regenerating an attached invoice PDF', () => {
    const onGeneratePdf = jest.fn();

    renderTable([createInvoice()], { onGeneratePdf });

    expect(screen.queryByRole('button', { name: 'Regenerate PDF for invoice INV-001' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /more pdf actions for invoice inv-001/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate PDF for invoice INV-001' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Regenerate invoice PDF?' });
    expect(dialog).toHaveTextContent('Regenerate invoice INV-001? This will replace the attached PDF.');
    expect(onGeneratePdf).not.toHaveBeenCalled();

    // Cancelling does not regenerate.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onGeneratePdf).not.toHaveBeenCalled();

    // Confirming regenerates (row menu remains open after cancel).
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate PDF for invoice INV-001' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    expect(onGeneratePdf).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-1' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('requires confirmation before marking an invoice as paid', () => {
    const onMarkPaid = jest.fn();

    renderTable([createInvoice()], { onMarkPaid });

    fireEvent.click(screen.getByRole('button', { name: 'Mark invoice INV-001 as paid' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Mark invoice as paid?' });
    expect(dialog).toHaveTextContent('Mark invoice INV-001 as paid?');
    expect(onMarkPaid).not.toHaveBeenCalled();

    // Cancelling does not mark paid.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onMarkPaid).not.toHaveBeenCalled();

    // Confirming marks paid.
    fireEvent.click(screen.getByRole('button', { name: 'Mark invoice INV-001 as paid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }));

    expect(onMarkPaid).toHaveBeenCalledWith('inv-1');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps replacement and download PDF actions inside an accessible row menu', () => {
    renderTable([createInvoice()]);

    expect(screen.getByRole('button', { name: 'View PDF for invoice INV-001' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download PDF for invoice INV-001' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace PDF for invoice INV-001' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /more pdf actions for invoice inv-001/i }));

    expect(screen.getByRole('button', { name: 'Download PDF for invoice INV-001' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace PDF for invoice INV-001' })).toBeInTheDocument();
  });
});

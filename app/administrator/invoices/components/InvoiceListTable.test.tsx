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
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    renderTable([createInvoice()], { onGeneratePdf });

    expect(screen.queryByRole('button', { name: 'Regenerate PDF for invoice INV-001' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /more pdf actions for invoice inv-001/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate PDF for invoice INV-001' }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Regenerate invoice INV-001'));
    expect(onGeneratePdf).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate PDF for invoice INV-001' }));

    expect(onGeneratePdf).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-1' }));
    confirmSpy.mockRestore();
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

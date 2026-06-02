import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
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

function renderTable(invoices: Invoice[]) {
  const routes: Route[] = [
    {
      id: 'route-1',
      customerId: 'cust-1',
      routeCode: 'R-101',
    },
  ];

  return render(
    <InvoiceListTable
      loading={false}
      invoices={invoices}
      routes={routes}
      uploadingId={null}
      pdfActionLoadingId={null}
      emailingInvoiceId={null}
      customerName={() => 'Acme Customer'}
      routeCode={() => 'R-101'}
      isInvoicePaid={(status) => status === 'paid'}
      onRouteLink={jest.fn()}
      onSetStatus={jest.fn()}
      onGeneratePdf={jest.fn()}
      onPdfAction={jest.fn()}
      onUploadClick={jest.fn()}
      onMarkPaid={jest.fn()}
      onEmailInvoiceToPrimary={jest.fn()}
    />
  );
}

describe('InvoiceListTable', () => {
  it('applies expected variants to visible actions when PDF is attached', () => {
    renderTable([createInvoice()]);

    expect(screen.getByRole('button', { name: 'View PDF for invoice INV-001' })).toHaveClass('adminBtnGhost');
    expect(screen.getByRole('button', { name: 'Mark invoice INV-001 as paid' })).toHaveClass('adminBtnPrimary');
    expect(screen.getByRole('button', { name: 'Email invoice INV-001 to primary contact' })).toHaveClass('adminBtnSecondary');
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
});

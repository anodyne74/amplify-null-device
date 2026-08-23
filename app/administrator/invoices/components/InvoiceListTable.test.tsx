import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { Route } from '@/amplify/types';
import type { Invoice } from '@/app/administrator/invoices/types';
import InvoiceListTable from '@/app/administrator/invoices/components/InvoiceListTable';
import ToastProvider from '@/app/components/ToastProvider';

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
    onDeleteInvoice: jest.fn(),
    onEmailInvoiceToPrimary: jest.fn(),
    ...overrides,
  };

  return render(
    <ToastProvider>
      <InvoiceListTable
        {...props}
      />
    </ToastProvider>
  );
}

describe('InvoiceListTable', () => {
  it('applies expected variants to visible actions when PDF is attached', () => {
    renderTable([createInvoice()]);

    expect(screen.getByRole('button', { name: 'View PDF for invoice INV-001' })).toHaveClass('nd-btn--ghost');
    expect(screen.getByRole('button', { name: 'Mark invoice INV-001 as paid' })).toHaveClass('nd-btn--primary');
    expect(screen.getByRole('button', { name: 'Email invoice INV-001' })).toHaveClass('nd-btn--secondary');
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

    expect(screen.getByRole('button', { name: 'Generate PDF for invoice INV-002' })).toHaveClass('nd-btn--primary');
    expect(screen.queryByRole('button', { name: 'Mark invoice INV-002 as paid' })).not.toBeInTheDocument();
  });

  it('infers sent status from email timestamp', () => {
    renderTable([
      createInvoice({
        id: 'inv-4',
        invoiceNumber: 'INV-004',
        status: 'draft',
        emailSentAt: '2026-06-03T10:00:00.000Z',
      }),
    ]);

    const sentStatusChips = screen.getAllByText('Sent');
    expect(sentStatusChips.some((node) => node.className.includes('nd-badge--info'))).toBe(true);
  });

  it('does not render generate or regenerate actions for imported invoices', () => {
    renderTable([
      createInvoice({
        id: 'inv-5',
        invoiceNumber: 'INV-005',
        importedAt: '2026-06-03T10:00:00.000Z',
      }),
    ]);

    expect(screen.queryByRole('button', { name: 'Generate PDF for invoice INV-005' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /more pdf actions for invoice inv-005/i }));
    expect(screen.queryByRole('button', { name: 'Regenerate PDF for invoice INV-005' })).not.toBeInTheDocument();
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

  it('sorts rows when a sortable header is clicked and reflects aria-sort', () => {
    renderTable([
      createInvoice({ id: 'inv-2', invoiceNumber: 'INV-002' }),
      createInvoice({ id: 'inv-1', invoiceNumber: 'INV-001' }),
    ]);

    const header = screen.getByRole('button', { name: 'Sort by Invoice #' });
    expect(header.closest('th')).toHaveAttribute('aria-sort', 'none');

    // Default order matches the incoming invoice order.
    let rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('INV-002');

    fireEvent.click(header);
    expect(header.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('INV-001');
    expect(rows[1]).toHaveTextContent('INV-002');

    fireEvent.click(header);
    expect(header.closest('th')).toHaveAttribute('aria-sort', 'descending');
    rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('INV-002');

    // Third click returns to the default order.
    fireEvent.click(header);
    expect(header.closest('th')).toHaveAttribute('aria-sort', 'none');
    rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('INV-002');
  });

  it('paginates invoices 25 per page with boundary-aware controls', () => {
    const invoices = Array.from({ length: 26 }, (_, index) =>
      createInvoice({
        id: `inv-${index + 1}`,
        invoiceNumber: `INV-${String(index + 1).padStart(3, '0')}`,
      })
    );

    renderTable(invoices);

    expect(screen.getByText('Showing 1–25 of 26 invoices')).toBeInTheDocument();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.queryByText('INV-026')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page of invoices' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next page of invoices' }));

    expect(screen.getByText('Showing 26–26 of 26 invoices')).toBeInTheDocument();
    expect(screen.getByText('INV-026')).toBeInTheDocument();
    expect(screen.queryByText('INV-001')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page of invoices' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Previous page of invoices' }));
    expect(screen.getByText('Showing 1–25 of 26 invoices')).toBeInTheDocument();
  });

  it('supports select-all, indeterminate state, and bulk mark-paid through confirmation', async () => {
    const onBulkMarkPaidInvoice = jest.fn().mockResolvedValue(true);

    renderTable(
      [
        createInvoice({ id: 'inv-1', invoiceNumber: 'INV-001' }),
        createInvoice({ id: 'inv-2', invoiceNumber: 'INV-002' }),
        createInvoice({ id: 'inv-3', invoiceNumber: 'INV-003', status: 'paid' }),
      ],
      { onBulkMarkPaidInvoice }
    );

    const selectAll = screen.getByRole('checkbox', {
      name: 'Select all unpaid invoices on this page',
    }) as HTMLInputElement;

    // Paid invoices cannot be selected.
    expect(screen.getByRole('checkbox', { name: 'Select invoice INV-003' })).toBeDisabled();

    // Selecting one of two eligible rows puts the header checkbox in an indeterminate state.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select invoice INV-001' }));
    expect(selectAll.indeterminate).toBe(true);
    expect(screen.getByText('1 invoice selected')).toBeInTheDocument();

    // Select-all picks up every eligible row on the page.
    fireEvent.click(selectAll);
    expect(screen.getByRole('checkbox', { name: 'Select invoice INV-001' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select invoice INV-002' })).toBeChecked();
    expect(selectAll.indeterminate).toBe(false);
    expect(selectAll).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Mark 2 invoices paid' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Mark invoices as paid?' });
    expect(dialog).toHaveTextContent('Mark 2 invoices as paid? This cannot be undone from this screen.');
    expect(onBulkMarkPaidInvoice).not.toHaveBeenCalled();

    // Cancelling keeps the selection and does not mutate.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onBulkMarkPaidInvoice).not.toHaveBeenCalled();
    expect(screen.getByText('2 invoices selected')).toBeInTheDocument();

    // Confirming runs the mutation once per selected invoice.
    fireEvent.click(screen.getByRole('button', { name: 'Mark 2 invoices paid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }));

    await waitFor(() => {
      expect(onBulkMarkPaidInvoice).toHaveBeenCalledTimes(2);
    });
    expect(onBulkMarkPaidInvoice).toHaveBeenNthCalledWith(1, 'inv-1');
    expect(onBulkMarkPaidInvoice).toHaveBeenNthCalledWith(2, 'inv-2');

    expect(await screen.findByText('Marked 2 invoices as paid.')).toBeInTheDocument();
    // Selection is cleared after the bulk action completes.
    expect(screen.queryByText('2 invoices selected')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select invoice INV-001' })).not.toBeChecked();
  });

  it('reports partial bulk mark-paid failures in an error toast', async () => {
    const onBulkMarkPaidInvoice = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    renderTable(
      [
        createInvoice({ id: 'inv-1', invoiceNumber: 'INV-001' }),
        createInvoice({ id: 'inv-2', invoiceNumber: 'INV-002' }),
      ],
      { onBulkMarkPaidInvoice }
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all unpaid invoices on this page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark 2 invoices paid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }));

    expect(await screen.findByText('Marked 1 invoice as paid. 1 failed.')).toBeInTheDocument();
  });

  it('does not render selection controls when bulk mark-paid is not wired', () => {
    renderTable([createInvoice()]);

    expect(screen.queryByRole('checkbox', { name: /select/i })).not.toBeInTheDocument();
  });

  it('shows delete only for draft invoices, and requires confirmation (#63)', () => {
    const onDeleteInvoice = jest.fn();

    renderTable(
      [
        createInvoice({ id: 'inv-1', invoiceNumber: 'INV-001', status: 'draft' }),
        createInvoice({ id: 'inv-2', invoiceNumber: 'INV-002', status: 'sent', emailSentAt: '2026-06-03T10:00:00.000Z' }),
        createInvoice({ id: 'inv-3', invoiceNumber: 'INV-003', status: 'paid' }),
      ],
      { onDeleteInvoice }
    );

    expect(screen.getByRole('button', { name: 'Delete invoice INV-001' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete invoice INV-002' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete invoice INV-003' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete invoice INV-001' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Delete invoice?' });
    expect(dialog).toHaveTextContent('Permanently delete invoice INV-001? This cannot be undone.');
    expect(onDeleteInvoice).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onDeleteInvoice).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete invoice INV-001' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDeleteInvoice).toHaveBeenCalledWith('inv-1');
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

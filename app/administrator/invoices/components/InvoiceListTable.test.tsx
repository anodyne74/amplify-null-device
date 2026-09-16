import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
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
  const props: ComponentProps<typeof InvoiceListTable> = {
    loading: false,
    invoices,
    uploadingId: null,
    pdfActionLoadingId: null,
    emailingInvoiceId: null,
    customerName: () => 'Acme Customer',
    routeCode: () => 'R-101',
    isInvoicePaid: (status) => status === 'paid',
    paymentTermsDaysForCustomer: () => 14,
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

function openRowMenu(invoiceNumber: string) {
  fireEvent.click(screen.getByRole('button', { name: `More actions for invoice ${invoiceNumber}` }));
}

describe('InvoiceListTable', () => {
  it('shows a single primary View button plus a consolidated actions menu when PDF is attached', () => {
    renderTable([createInvoice()]);

    expect(screen.getByRole('button', { name: 'View invoice INV-001' })).toHaveClass('nd-btn--primary');
    expect(screen.queryByRole('button', { name: 'Mark invoice INV-001 as paid' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Email invoice INV-001' })).not.toBeInTheDocument();

    openRowMenu('INV-001');

    expect(screen.getByRole('button', { name: 'View PDF for invoice INV-001' })).toHaveClass('nd-btn--ghost');
    expect(screen.getByRole('button', { name: 'Upload PDF for invoice INV-001' })).toHaveClass('nd-btn--ghost');
    expect(screen.getByRole('button', { name: 'Email invoice INV-001' })).toHaveClass('nd-btn--ghost');
    expect(screen.getByRole('button', { name: 'Mark invoice INV-001 as paid' })).toHaveClass('nd-btn--primary');
  });

  it('shows Continue as the primary action (secondary variant) and hides mark-paid when invoice is already paid', () => {
    renderTable([
      createInvoice({
        id: 'inv-2',
        invoiceNumber: 'INV-002',
        status: 'paid',
        pdfS3Key: null,
      }),
    ]);

    expect(screen.getByRole('button', { name: 'Continue invoice INV-002' })).toHaveClass('nd-btn--secondary');

    openRowMenu('INV-002');
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

  it('renders no primary action for imported invoices with no PDF, and still allows uploading one', () => {
    renderTable([
      createInvoice({
        id: 'inv-5',
        invoiceNumber: 'INV-005',
        importedAt: '2026-06-03T10:00:00.000Z',
        pdfS3Key: null,
      }),
    ]);

    expect(screen.queryByRole('button', { name: 'Continue invoice INV-005' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View invoice INV-005' })).not.toBeInTheDocument();

    openRowMenu('INV-005');
    expect(screen.getByRole('button', { name: 'Upload PDF for invoice INV-005' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View PDF for invoice INV-005' })).toBeDisabled();
  });

  it('requires confirmation before marking an invoice as paid', () => {
    const onMarkPaid = jest.fn();

    renderTable([createInvoice()], { onMarkPaid });

    openRowMenu('INV-001');
    fireEvent.click(screen.getByRole('button', { name: 'Mark invoice INV-001 as paid' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Mark invoice as paid?' });
    expect(dialog).toHaveTextContent('Mark invoice INV-001 as paid?');
    expect(onMarkPaid).not.toHaveBeenCalled();

    // Cancelling does not mark paid. The row menu (independent state) stays open.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onMarkPaid).not.toHaveBeenCalled();

    // Confirming marks paid.
    fireEvent.click(screen.getByRole('button', { name: 'Mark invoice INV-001 as paid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }));

    expect(onMarkPaid).toHaveBeenCalledWith('inv-1');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
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

    openRowMenu('INV-001');
    expect(screen.getByRole('button', { name: 'Delete invoice INV-001' })).toBeInTheDocument();

    openRowMenu('INV-002');
    expect(screen.queryByRole('button', { name: 'Delete invoice INV-002' })).not.toBeInTheDocument();

    openRowMenu('INV-003');
    expect(screen.queryByRole('button', { name: 'Delete invoice INV-003' })).not.toBeInTheDocument();

    // INV-001's menu is still open (row menus close only on outside-click, not on other rows opening).
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

  it('consolidates PDF view/upload/email/mark-paid/delete into a single accessible row menu', () => {
    renderTable([createInvoice()]);

    expect(screen.queryByRole('button', { name: 'View PDF for invoice INV-001' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload PDF for invoice INV-001' })).not.toBeInTheDocument();

    openRowMenu('INV-001');

    expect(screen.getByRole('button', { name: 'View PDF for invoice INV-001' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload PDF for invoice INV-001' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Email invoice INV-001' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark invoice INV-001 as paid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete invoice INV-001' })).toBeInTheDocument();
  });
});

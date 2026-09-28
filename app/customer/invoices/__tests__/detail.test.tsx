import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import InvoiceDetailContent from '../[id]/_InvoiceDetailContent';
import ToastProvider from '@/app/components/ToastProvider';
import { getCustomerPortalContext } from '@/lib/customers';
import { getInvoiceDetail } from '@/lib/invoices';
import { listCustomerRouteRequests } from '@/lib/customerRouteRequests';

const renderWithToast = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const replaceMock = jest.fn();
const backMock = jest.fn();
const routerMock = {
  replace: replaceMock,
  back: backMock,
};

jest.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => 'owner-sub-1',
}));

jest.mock('@/lib/invoices', () => ({
  getInvoiceDetail: jest.fn(),
}));

jest.mock('@/lib/customerRouteRequests', () => ({
  listCustomerRouteRequests: jest.fn(),
}));

jest.mock('@/lib/customers', () => ({
  getCustomerPortalContext: jest.fn(),
}));

describe('Customer invoice detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'cust-1',
    });
    (getInvoiceDetail as jest.Mock).mockResolvedValue({
        id: 'inv-1',
        customerId: 'cust-1',
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-01-15T00:00:00Z',
        periodStartDate: '2024-01-01T00:00:00Z',
        periodEndDate: '2024-01-31T00:00:00Z',
        totalAmount: 500,
        status: 'paid',
        lineItems: [],
      });
    (listCustomerRouteRequests as jest.Mock).mockResolvedValue([]);
  });

  it('loads invoice detail with the portal context customer ID', async () => {
    renderWithToast(<InvoiceDetailContent params={{ id: 'inv-1' }} />);

    expect(await screen.findByRole('heading', { name: /invoice inv-001/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(getInvoiceDetail).toHaveBeenCalledWith({
        invoiceId: 'inv-1',
        customerId: 'cust-1',
        userSub: 'owner-sub-1',
      });
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows an inline access message for read-only users instead of redirecting', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });

    renderWithToast(<InvoiceDetailContent params={{ id: 'inv-1' }} />);

    expect(
      await screen.findByText(/invoices are available to account owners/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/contact your account owner for access/i)).toBeInTheDocument();

    // Breadcrumbs still render above the access-restricted panel
    const breadcrumbs = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(breadcrumbs).getByRole('link', { name: 'Invoices' })).toHaveAttribute(
      'href',
      '/customer/invoices'
    );

    expect(replaceMock).not.toHaveBeenCalled();
    expect(getInvoiceDetail).not.toHaveBeenCalled();
  });

  it('links the route by its Route Code', async () => {
    (getInvoiceDetail as jest.Mock).mockResolvedValue({ id: 'inv-1', customerId: 'cust-1', invoiceNumber: 'INV-001', routeId: 'route-uuid-0001', routeCode: 'W03-24-001', lineItems: [] });

    renderWithToast(<InvoiceDetailContent params={{ id: 'inv-1' }} />);

    const link = await screen.findByRole('link', { name: /W03-24-001/ });
    expect(link).toHaveAttribute('href', '/customer/routes/route-uuid-0001');
    expect(screen.queryByText(/View Route/)).not.toBeInTheDocument();
  });

  it('falls back to a short route ID when the route has no code', async () => {
    (getInvoiceDetail as jest.Mock).mockResolvedValue({ id: 'inv-1', customerId: 'cust-1', invoiceNumber: 'INV-001', routeId: 'abcdef1234567890', lineItems: [] });

    renderWithToast(<InvoiceDetailContent params={{ id: 'inv-1' }} />);

    expect(await screen.findByRole('link', { name: /abcdef12/ })).toHaveAttribute('href', '/customer/routes/abcdef1234567890');
  });

  it("summarises the Route's Route Request and links to its Requests section (#360)", async () => {
    (getInvoiceDetail as jest.Mock).mockResolvedValue({ id: 'inv-1', customerId: 'cust-1', invoiceNumber: 'INV-001', routeId: 'route-1', routeCode: 'W03-24-001', lineItems: [] });
    const sent = { requesterName: 'Ann Agent', requesterEmail: 'ann@agency.test', recordedByNullDevice: false, attachments: [] };
    (listCustomerRouteRequests as jest.Mock).mockResolvedValue([
      { ...sent, id: 'req', role: 'request', sentAt: '2026-09-27T12:00:00.000Z' },
      { ...sent, id: 'a1', role: 'amendment', sentAt: '2026-09-28T02:00:00.000Z' },
      { ...sent, id: 'a2', role: 'amendment', sentAt: '2026-09-29T02:00:00.000Z' },
    ]);

    renderWithToast(<InvoiceDetailContent params={{ id: 'inv-1' }} />);

    const link = await screen.findByRole('link', { name: /Requested by Ann Agent on September 27, 2026, 2 amendments/ });
    expect(link).toHaveAttribute('href', '/customer/routes/route-1#requests');
    expect(listCustomerRouteRequests).toHaveBeenCalledWith('route-1');
  });

  it('says there is no request on file when the Route has no Route Request', async () => {
    (getInvoiceDetail as jest.Mock).mockResolvedValue({ id: 'inv-1', customerId: 'cust-1', invoiceNumber: 'INV-001', routeId: 'route-1', lineItems: [] });

    renderWithToast(<InvoiceDetailContent params={{ id: 'inv-1' }} />);

    expect(await screen.findByRole('link', { name: /No request on file/ })).toHaveAttribute('href', '/customer/routes/route-1#requests');
  });
});

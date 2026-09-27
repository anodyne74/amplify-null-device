import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CustomerPropertyHistoryPage from '../page';
import { getCustomerPortalContext } from '@/lib/customers';
import {
  deletePropertyHistoryReport,
  listPropertyHistoryReports,
  listTypeaheadOptions,
  searchPropertyHistory,
} from '@/lib/propertyHistorySearch';
import { buildTypeaheadOptions } from '@/lib/propertyHistoryTypeahead';
import { FeatureFlagsProvider } from '@/lib/useFeatureFlags';

const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/customer/property-history',
}));

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => 'user-sub-1',
}));

jest.mock('@/lib/customers', () => ({
  getCustomerPortalContext: jest.fn(),
}));

jest.mock('@/lib/propertyHistorySearch', () => ({
  listTypeaheadOptions: jest.fn(),
  searchPropertyHistory: jest.fn(),
  listRouteProperties: jest.fn(),
  generatePropertyHistoryReport: jest.fn(),
  listPropertyHistoryReports: jest.fn(),
  openPropertyHistoryReport: jest.fn(),
  deletePropertyHistoryReport: jest.fn(),
}));

let mockOnFlags: string[] = [];

// The real provider, fed flags by a mocked /api/customer/feature-flags.
jest.mock('@/lib/apiClient', () => ({
  callApi: jest.fn(async () => ({ flags: mockOnFlags })),
}));

function renderPage() {
  return render(
    <FeatureFlagsProvider>
      <CustomerPropertyHistoryPage />
    </FeatureFlagsProvider>
  );
}

const CLIFF_14 = 'epping|2121|cliff road|14';

const RESULT = {
  level: 'address' as const,
  property: {
    propertyKey: CLIFF_14,
    address: '14 Cliff Rd, Epping',
    visitCount: 1,
    visits: [
      {
        stopId: 's1',
        routeId: 'r1',
        date: '2026-08-01',
        routeCode: 'W26-08-101',
        agent: 'Betty',
        auction: false,
        signsPlaced: 2,
        invoices: [{ id: 'i1', invoiceNumber: 'INV-0001' }],
        status: 'completed' as const,
      },
    ],
    scheduled: [],
  },
};

async function searchCliffRoad() {
  fireEvent.change(await screen.findByRole('combobox', { name: 'Suburb, street or address' }), { target: { value: '14 cliff' } });
  fireEvent.click(await screen.findByRole('option', { name: /14 Cliff Rd/ }));
  return screen.findByRole('group', { name: /14 Cliff Rd, Epping/ });
}

const REPORT = {
  id: 'rep1',
  referenceNumber: 'PHR-20260927-ABC123',
  audience: 'customer' as const,
  customerId: 'cust-1',
  customerName: 'Harcourts Epping',
  generatedByName: 'Olivia Owner',
  generatedAt: '2026-09-27T03:04:05.000Z',
  searchLabel: 'Suburb: Epping 2121',
  filterLabels: ['No filters'],
  propertyCount: 2,
  visitCount: 3,
  state: 'active' as const,
  activeUntil: '2026-10-27T03:04:05.000Z',
  purgeAfter: '2026-11-26T03:04:05.000Z',
};

describe('Customer Property History page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnFlags = ['property-history'];
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });
    (listTypeaheadOptions as jest.Mock).mockResolvedValue({ data: buildTypeaheadOptions([{ propertyKey: CLIFF_14, address: '14 Cliff Rd, Epping' }]) });
    (searchPropertyHistory as jest.Mock).mockResolvedValue(RESULT);
  });

  it('searches without a Customer filter and shows no staff columns', async () => {
    renderPage();
    const property = await searchCliffRoad();

    expect(searchPropertyHistory).toHaveBeenCalledWith({ level: 'address', propertyKey: CLIFF_14 }, {});
    expect(screen.queryByLabelText('Customer')).not.toBeInTheDocument();
    const headers = within(property).getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(['Date', 'Route', 'Agent', 'Auction', 'Signs Placed', 'Invoice(s)', 'Status', '']);
    expect(within(property).getByRole('link', { name: 'W26-08-101' })).toHaveAttribute('href', '/customer/routes/r1');
  });

  it('links invoices for an Account Owner', async () => {
    renderPage();
    const property = await searchCliffRoad();

    expect(within(property).getByRole('link', { name: 'INV-0001' })).toHaveAttribute('href', '/customer/invoices/i1');
  });

  it('shows invoice numbers without links for a read-only user', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });
    renderPage();
    const property = await searchCliffRoad();

    expect(within(property).getByText('INV-0001')).toBeInTheDocument();
    expect(within(property).queryByRole('link', { name: 'INV-0001' })).not.toBeInTheDocument();
  });

  it('gives an Account Owner Export and the Reports tab', async () => {
    (listPropertyHistoryReports as jest.Mock).mockResolvedValue([]);
    renderPage();
    await searchCliffRoad();

    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Reports' }));
    expect(await screen.findByText(/No reports yet/)).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Customer' })).not.toBeInTheDocument();
  });

  it('lets an Account Owner delete a report after confirming, with no State column or Restore', async () => {
    (listPropertyHistoryReports as jest.Mock).mockResolvedValue([REPORT]);
    (deletePropertyHistoryReport as jest.Mock).mockResolvedValue({ ...REPORT, state: 'deleted' });
    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: 'Reports' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete PHR-20260927-ABC123' }));
    expect(screen.getByText('Delete PHR-20260927-ABC123?')).toBeInTheDocument();
    expect(deletePropertyHistoryReport).not.toHaveBeenCalled();
    expect(screen.queryByRole('columnheader', { name: 'State' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/No reports yet/)).toBeInTheDocument();
    expect(deletePropertyHistoryReport).toHaveBeenCalledWith('rep1');
  });

  it('keeps a report when the delete is cancelled', async () => {
    (listPropertyHistoryReports as jest.Mock).mockResolvedValue([REPORT]);
    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: 'Reports' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete PHR-20260927-ABC123' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Open PHR-20260927-ABC123' })).toBeInTheDocument();
    expect(deletePropertyHistoryReport).not.toHaveBeenCalled();
  });

  it('gives a read-only user neither Export nor reports', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });
    renderPage();
    await searchCliffRoad();

    expect(screen.queryByRole('button', { name: 'Export PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Reports' })).not.toBeInTheDocument();
    expect(listPropertyHistoryReports).not.toHaveBeenCalled();
  });

  it('shows nothing and sends the user to the dashboard while the flag is off', async () => {
    mockOnFlags = [];
    const { container } = renderPage();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/customer/dashboard'));
    expect(container).toBeEmptyDOMElement();
    expect(listTypeaheadOptions).not.toHaveBeenCalled();
  });
});

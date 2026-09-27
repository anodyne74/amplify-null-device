import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CustomerPropertyHistoryPage from '../page';
import { getCustomerPortalContext } from '@/lib/customers';
import { listTypeaheadOptions, searchPropertyHistory } from '@/lib/propertyHistorySearch';
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

  it('shows nothing and sends the user to the dashboard while the flag is off', async () => {
    mockOnFlags = [];
    const { container } = renderPage();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/customer/dashboard'));
    expect(container).toBeEmptyDOMElement();
    expect(listTypeaheadOptions).not.toHaveBeenCalled();
  });
});

import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RoutesPage from '../page';
import { useLiveAllRoutes } from '@/lib/useLiveRoutes';
import * as listAllCustomersModule from '@/lib/customers';
import { listAllStops } from '@/lib/routes';
import type { Route, Stop } from '@/amplify/types';

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    authStatus: 'authenticated',
    user: {
      userId: 'op-1',
      signInUserSession: {
        idToken: { payload: { email: 'op@example.com', 'cognito:groups': ['operator'] } },
      },
    },
  }),
}));

jest.mock('@/lib/amplify-config', () => ({
  isOperator: () => true,
  isCustomer: () => false,
  isAdmin: () => true,
}));

const operatorRouteMock = jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>);

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: (props: { children: React.ReactNode; requireAdmin?: boolean }) => operatorRouteMock(props),
}));

jest.mock('@/lib/useLiveRoutes', () => ({
  useLiveAllRoutes: jest.fn(),
}));
jest.mock('@/lib/customers');
jest.mock('@/lib/routes', () => ({
  listAllStops: jest.fn(),
}));

const mockRoutes: Route[] = [
  {
    id: 'route-aaaa-1111',
    routeCode: 'W19-26-001',
    customerId: 'cust-bbbb-2222',
    status: 'planned',
    createdAt: '2024-03-01T10:00:00Z',
  },
  {
    id: 'route-cccc-3333',
    routeCode: 'W19-26-002',
    customerId: 'cust-dddd-4444',
    status: 'signs_placed',
    createdAt: '2024-03-02T11:00:00Z',
  },
];

const mockStops: Stop[] = [
  {
    id: 'stop-1',
    routeId: 'route-aaaa-1111',
    customerId: 'cust-bbbb-2222',
    address: '14 Cliff Rd, Epping NSW 2121',
    agent: "Betty O'Shea",
    numberOfSigns: 3,
  },
  {
    id: 'stop-2',
    routeId: 'route-cccc-3333',
    customerId: 'cust-dddd-4444',
    address: '14 Cliff Rd, Epping NSW 2121',
    agent: "Betty O'Shea",
    numberOfSigns: 3,
  },
  {
    id: 'stop-3',
    routeId: 'route-aaaa-1111',
    customerId: 'cust-bbbb-2222',
    address: '19 Ryedale Rd, Eastwood NSW 2122',
    agent: 'Sam Whitton',
    numberOfSigns: 4,
  },
];

describe('Operator Routes List Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    operatorRouteMock.mockImplementation(({ children }: { children: React.ReactNode }) => <>{children}</>);
    (listAllCustomersModule.listAllCustomers as jest.Mock).mockResolvedValue([
      { id: 'cust-bbbb-2222', name: 'Acme Corp', email: 'acme@example.com' },
      { id: 'cust-dddd-4444', name: 'Globex Inc', email: 'globex@example.com' },
    ]);
    (listAllStops as jest.Mock).mockResolvedValue(mockStops);
  });

  it('renders loading spinner initially', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: true, error: null });
    render(<RoutesPage />);
    expect(screen.getByText(/loading routes/i)).toBeInTheDocument();
  });

  it('renders routes list after data loads', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading routes/i)).not.toBeInTheDocument();
    });

    // Route codes
    expect(screen.getByText('W19-26-001')).toBeInTheDocument();
    expect(screen.getByText('W19-26-002')).toBeInTheDocument();

    // Customer names
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Globex Inc')).toBeInTheDocument();
  });

  it('shows each Route\'s Placement Date, Pickup Date, Stops and Signs, and Operator', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({
      routes: [
        {
          ...mockRoutes[0],
          scheduledDate: '2026-05-08',
          pickupDate: '2026-05-09',
          assignedOperatorName: 'Pat Lee',
        },
        mockRoutes[1],
      ],
      loading: false,
      error: null,
    });

    render(<RoutesPage />);

    const row = (await screen.findByText('W19-26-001')).closest('tr') as HTMLElement;
    expect(within(row).getByText('May 8, 2026')).toBeInTheDocument();
    expect(within(row).getByText('May 9, 2026')).toBeInTheDocument();
    await waitFor(() => expect(within(row).getByText('2 stops · 7 signs')).toBeInTheDocument());
    expect(within(row).getByText('Pat Lee')).toBeInTheDocument();
  });

  it('shows an unassigned Route and a Route with no dates plainly, not blank', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [mockRoutes[1]], loading: false, error: null });

    render(<RoutesPage />);

    const row = (await screen.findByText('W19-26-002')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Unassigned')).toBeInTheDocument();
    expect(within(row).getAllByText('—')).toHaveLength(2);
  });

  it('lists the latest Placement Date first, and Routes with no Placement Date last', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({
      routes: [
        mockRoutes[1],
        { ...mockRoutes[0], scheduledDate: '2026-05-08' },
        { ...mockRoutes[0], id: 'route-eeee-5555', routeCode: 'W20-26-001', scheduledDate: '2026-05-15' },
      ],
      loading: false,
      error: null,
    });

    render(<RoutesPage />);

    await screen.findByText('W20-26-001');
    const codes = screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('link')[0].textContent);
    expect(codes).toEqual(['W20-26-001', 'W19-26-001', 'W19-26-002']);
  });

  it('heads the first column Route Code and no longer lists Created or Duration', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);

    await screen.findByText('W19-26-001');
    expect(screen.getByRole('columnheader', { name: 'Route Code' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Created' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Duration' })).not.toBeInTheDocument();
  });

  describe('why a Route needs attention', () => {
    it('flags an overdue Pickup Date with the word Overdue, and an Unassigned Route with a badge', async () => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({
        routes: [
          { ...mockRoutes[0], assignedOperatorName: 'Pat Lee', pickupDate: '2000-01-01' },
          { ...mockRoutes[1], pickupDate: '2999-01-01' },
        ],
        loading: false,
        error: null,
      });
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');

      const overdueRow = screen.getByText('W19-26-001').closest('tr') as HTMLElement;
      expect(within(overdueRow).getByText('Overdue')).toBeInTheDocument();
      expect(within(overdueRow).queryByText('Unassigned')).not.toBeInTheDocument();

      const futureRow = screen.getByText('W19-26-002').closest('tr') as HTMLElement;
      expect(within(futureRow).queryByText('Overdue')).not.toBeInTheDocument();
      expect(within(futureRow).getByText('Unassigned')).toBeInTheDocument();
    });

    it('states the Needs attention rule beside the toggle and ties it to the toggle', async () => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');

      const toggle = screen.getByRole('button', { name: /needs attention/i });
      expect(toggle).toHaveAccessibleDescription(/no operator assigned, or pickup date passed and route not finished/i);
    });
  });

  describe('Needs attention filter', () => {
    const staffed = { assignedOperatorName: 'Pat Lee' };
    const routes: Route[] = [
      { ...mockRoutes[0], id: 'unassigned', routeCode: 'W19-26-001', pickupDate: '2999-01-01' },
      { ...mockRoutes[0], ...staffed, id: 'overdue', routeCode: 'W19-26-002', pickupDate: '2000-01-01' },
      { ...mockRoutes[0], ...staffed, id: 'fine', routeCode: 'W19-26-003', pickupDate: '2999-01-01' },
      { ...mockRoutes[0], ...staffed, id: 'no-pickup', routeCode: 'W19-26-004' },
      { ...mockRoutes[0], id: 'done', routeCode: 'W19-26-005', status: 'completed', pickupDate: '2000-01-01' },
    ];
    const listed = () => within(screen.getByRole('table')).getAllByRole('link').map((link) => link.textContent).filter((t) => t?.startsWith('W'));

    async function renderRoutes() {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes, loading: false, error: null });
      render(<RoutesPage />);
      await screen.findByText('W19-26-003');
    }

    it('shows only unassigned and overdue Routes, leaving out finished ones and ones with no Pickup Date', async () => {
      await renderRoutes();

      fireEvent.click(screen.getByRole('button', { name: /needs attention/i }));

      expect(listed().sort()).toEqual(['W19-26-001', 'W19-26-002']);
    });

    it('announces the result count like the other filters, and is pressed while on', async () => {
      await renderRoutes();
      const toggle = screen.getByRole('button', { name: /needs attention/i });

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText(/showing 2 of 5 routes/i)).toBeInTheDocument();
    });

    it('combines with search and the status filter', async () => {
      await renderRoutes();

      fireEvent.click(screen.getByRole('button', { name: /needs attention/i }));
      fireEvent.change(screen.getByLabelText(/^search$/i), { target: { value: '002' } });

      expect(listed()).toEqual(['W19-26-002']);
    });

    it('turns off with Clear filters', async () => {
      await renderRoutes();

      fireEvent.click(screen.getByRole('button', { name: /needs attention/i }));
      fireEvent.click(screen.getByRole('button', { name: /^clear filters$/i }));

      expect(listed()).toHaveLength(5);
    });
  });

  describe('sorting by column header', () => {
    const dated: Route[] = [
      { ...mockRoutes[0], scheduledDate: '2026-05-08', pickupDate: '2026-05-30' },
      { ...mockRoutes[1], scheduledDate: '2026-05-15', pickupDate: '2026-05-20' },
    ];
    const codes = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('link')[0].textContent);

    async function renderDated() {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: dated, loading: false, error: null });
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');
    }

    it('starts in the default order with no header marked as sorted', async () => {
      await renderDated();

      expect(codes()).toEqual(['W19-26-002', 'W19-26-001']);
      expect(screen.getAllByRole('columnheader').filter((th) => th.getAttribute('aria-sort') !== null && th.getAttribute('aria-sort') !== 'none')).toHaveLength(0);
    });

    it('sorts by Pickup, then reverses, then returns to the default order', async () => {
      await renderDated();
      const pickup = () => screen.getByRole('columnheader', { name: /pickup/i });

      fireEvent.click(within(pickup()).getByRole('button'));
      expect(codes()).toEqual(['W19-26-002', 'W19-26-001']);
      expect(pickup()).toHaveAttribute('aria-sort', 'ascending');

      fireEvent.click(within(pickup()).getByRole('button'));
      expect(codes()).toEqual(['W19-26-001', 'W19-26-002']);
      expect(pickup()).toHaveAttribute('aria-sort', 'descending');

      fireEvent.click(within(pickup()).getByRole('button'));
      expect(pickup()).toHaveAttribute('aria-sort', 'none');
    });

    it.each(['Placement', 'Customer', 'Status'])('makes the %s header sortable', async (name) => {
      await renderDated();

      const header = screen.getByRole('columnheader', { name: new RegExp(name, 'i') });
      fireEvent.click(within(header).getByRole('button'));

      expect(header).toHaveAttribute('aria-sort', 'ascending');
    });

    it('keeps the sort while the search narrows the list', async () => {
      await renderDated();

      fireEvent.click(within(screen.getByRole('columnheader', { name: /customer/i })).getByRole('button'));
      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'W19' } });

      expect(codes()).toEqual(['W19-26-001', 'W19-26-002']);
      expect(screen.getByRole('columnheader', { name: /customer/i })).toHaveAttribute('aria-sort', 'ascending');
    });
  });

  describe('row actions menu', () => {
    beforeEach(() => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });
    });

    it('keeps Edit and Delete out of the row until the menu is opened', async () => {
      render(<RoutesPage />);

      await screen.findByText('W19-26-001');
      expect(screen.queryByRole('button', { name: /^Delete route/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /^Edit route/ })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Actions for route W19-26-001' }));

      expect(screen.getByRole('link', { name: 'Edit route W19-26-001' })).toHaveAttribute(
        'href',
        '/administrator/routes/edit?id=route-aaaa-1111'
      );
      expect(screen.getByRole('button', { name: 'Delete route W19-26-001' })).toBeInTheDocument();
    });

    it('still asks which Route will be deleted before deleting it', async () => {
      render(<RoutesPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Actions for route W19-26-001' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete route W19-26-001' }));

      expect(await screen.findByText(/delete route W19-26-001\?/i)).toBeInTheDocument();
    });
  });

  describe('opening a Route from its row', () => {
    beforeEach(() => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });
    });

    it('opens the Route when its row is clicked, with no separate View button', async () => {
      render(<RoutesPage />);

      const row = (await screen.findByText('Acme Corp')).closest('tr') as HTMLElement;
      fireEvent.click(row);

      expect(pushMock).toHaveBeenCalledWith('/administrator/routes/detail?id=route-aaaa-1111');
      expect(screen.queryByRole('link', { name: 'View' })).not.toBeInTheDocument();
    });

    it('makes the Route Code a link to the Route, the keyboard route in', async () => {
      render(<RoutesPage />);

      const link = await screen.findByRole('link', { name: 'W19-26-001' });
      expect(link).toHaveAttribute('href', '/administrator/routes/detail?id=route-aaaa-1111');
    });

    it('does not navigate when a control inside the row is used', async () => {
      render(<RoutesPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Actions for route W19-26-001' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete route W19-26-001' }));
      fireEvent.click(screen.getByRole('link', { name: 'Edit route W19-26-001' }));
      fireEvent.click(screen.getByRole('link', { name: 'W19-26-001' }));

      expect(pushMock).not.toHaveBeenCalled();
    });
  });

  it('flags a Route whose customer said something was off (#467)', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({
      routes: [
        { ...mockRoutes[0], status: 'completed', customerFeedbackTone: 'issue', customerFeedbackNote: 'Missing sign' },
        { ...mockRoutes[1], status: 'completed', customerFeedbackTone: 'good' },
      ],
      loading: false,
      error: null,
    });

    render(<RoutesPage />);

    expect(await screen.findByText('Feedback: something was off')).toBeInTheDocument();
    expect(screen.getAllByText(/^Feedback:/)).toHaveLength(1);
  });

  it('shows "Create New Route" link', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading routes/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/create new route/i)).toBeInTheDocument();
    // #62: was missing a size modifier class, leaving the pill with no horizontal padding.
    expect(screen.getByText(/create new route/i)).toHaveClass('nd-btn--md');
  });

  it('shows empty state when no routes', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/no routes found/i)).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: 'Network error' });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load routes/i)).toBeInTheDocument();
    });
  });

  it('shows a Retry button on fetch error and refetches when clicked', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: 'Network error' });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load routes/i)).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();

    // Retry remounts the list section, which re-subscribes via useLiveAllRoutes.
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
    });

    expect(screen.queryByText(/failed to load routes/i)).not.toBeInTheDocument();
  });

  it('shows a create CTA in the empty state linking to the new route page', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/no routes found/i)).toBeInTheDocument();
    });

    const cta = screen.getByRole('link', { name: /create your first route/i });
    expect(cta).toHaveAttribute('href', '/administrator/routes/new');
  });

  it('shows which status filter chip is pressed', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);
    await screen.findByText('W19-26-001');

    expect(screen.getByRole('button', { name: /^all$/i })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /^signs placed$/i }));

    expect(screen.getByRole('button', { name: /^signs placed$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^all$/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the status filter visible when a filtered status has no routes', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^signs picked up$/i }));

    expect(screen.getByText(/no routes found/i)).toBeInTheDocument();
    // The filter row stays so the user can switch back.
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
    // The full-page empty CTA is reserved for a truly empty route list.
    expect(screen.queryByRole('link', { name: /create your first route/i })).not.toBeInTheDocument();
  });

  describe('search and date filters', () => {
    // Placement Dates 2024-03-01 and 2024-03-02, matching the fixtures' createdAt days.
    async function renderWithRoutes(routes: Route[] = [
      { ...mockRoutes[0], scheduledDate: '2024-03-01' },
      { ...mockRoutes[1], scheduledDate: '2024-03-02' },
    ]) {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes, loading: false, error: null });

      render(<RoutesPage />);

      await waitFor(() => {
        expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      });
    }

    it('narrows results by customer name search (case-insensitive)', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'ACME' } });

      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      expect(screen.queryByText('W19-26-002')).not.toBeInTheDocument();
      expect(screen.getByText(/showing 1 of 2 routes/i)).toBeInTheDocument();
    });

    it('narrows results by route code search', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: '26-002' } });

      expect(screen.getByText('W19-26-002')).toBeInTheDocument();
      expect(screen.queryByText('W19-26-001')).not.toBeInTheDocument();
    });

    it('shows the filtered empty message when search matches nothing', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'no-such-route' } });

      expect(screen.getByText(/no routes found/i)).toBeInTheDocument();
      expect(screen.getByText(/showing 0 of 2 routes/i)).toBeInTheDocument();
      // Full-page empty CTA stays reserved for a truly empty list.
      expect(screen.queryByRole('link', { name: /create your first route/i })).not.toBeInTheDocument();
    });

    it('narrows results by Placement Date range with inclusive bounds', async () => {
      await renderWithRoutes();

      // From-only bound: 2024-03-02 keeps the second route, drops the first.
      fireEvent.change(screen.getByLabelText(/placement from/i), { target: { value: '2024-03-02' } });

      expect(screen.queryByText('W19-26-001')).not.toBeInTheDocument();
      expect(screen.getByText('W19-26-002')).toBeInTheDocument();

      // Inclusive To bound on the same day keeps the route visible.
      fireEvent.change(screen.getByLabelText(/placement to/i), { target: { value: '2024-03-02' } });

      expect(screen.getByText('W19-26-002')).toBeInTheDocument();
      expect(screen.getByText(/showing 1 of 2 routes/i)).toBeInTheDocument();
    });

    it('says how many Routes with no Placement Date the date range hides', async () => {
      await renderWithRoutes([
        { ...mockRoutes[0], scheduledDate: '2024-03-01' },
        mockRoutes[1],
      ]);

      fireEvent.change(screen.getByLabelText(/placement from/i), { target: { value: '2024-03-01' } });

      expect(screen.getByText(/showing 1 of 2 routes \(1 without a placement date is hidden/i)).toBeInTheDocument();
    });

    it('names the active filters when nothing matches, and Clear filters restores the list', async () => {
      await renderWithRoutes();

      fireEvent.click(screen.getByRole('button', { name: 'Planned' }));
      fireEvent.change(screen.getByLabelText(/placement from/i), { target: { value: '2024-03-02' } });

      const empty = screen.getByText(/no routes found for/i);
      expect(empty).toHaveTextContent('status planned');
      expect(empty).toHaveTextContent('Placement from Mar 2, 2024');

      fireEvent.click(screen.getAllByRole('button', { name: /clear filters/i }).slice(-1)[0]);

      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      expect(screen.getByText('W19-26-002')).toBeInTheDocument();
      expect(screen.getByLabelText(/placement from/i)).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Planned' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('filters by To date only', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/placement to/i), { target: { value: '2024-03-01' } });

      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      expect(screen.queryByText('W19-26-002')).not.toBeInTheDocument();
    });

    it('clears search and dates together via Clear filters', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'globex' } });
      fireEvent.change(screen.getByLabelText(/placement from/i), { target: { value: '2024-03-02' } });

      expect(screen.queryByText('W19-26-001')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));

      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      expect(screen.getByText('W19-26-002')).toBeInTheDocument();
      expect(screen.getByLabelText(/search/i)).toHaveValue('');
      expect(screen.getByLabelText(/placement from/i)).toHaveValue('');
      expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
    });

    it('composes search with the status filter', async () => {
      await renderWithRoutes();

      // Both routes match the shared "W19" prefix.
      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'W19' } });

      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      expect(screen.getByText('W19-26-002')).toBeInTheDocument();

      // Status filter narrows to the signs_placed route only.
      fireEvent.click(screen.getByRole('button', { name: /^signs placed$/i }));

      expect(screen.queryByText('W19-26-001')).not.toBeInTheDocument();
      expect(screen.getByText('W19-26-002')).toBeInTheDocument();
      expect(screen.getByText(/showing 1 of 1 routes/i)).toBeInTheDocument();
    });
  });

  describe('filter toolbar', () => {
    beforeEach(() => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });
    });

    it('puts search, the date range and the status filter in one toolbar', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');

      const toolbar = screen.getByRole('group', { name: /filter routes/i });
      expect(within(toolbar).getByLabelText(/^search$/i)).toBeInTheDocument();
      expect(within(toolbar).getByLabelText(/placement from/i)).toBeInTheDocument();
      expect(within(toolbar).getByLabelText(/placement to/i)).toBeInTheDocument();
      expect(within(toolbar).getByRole('group', { name: 'Status' })).toBeInTheDocument();
      expect(within(toolbar).getByRole('button', { name: /find a property/i })).toBeInTheDocument();
    });

    it('keeps Find a property collapsed until it is opened, then closes it again', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');
      const toggle = screen.getByRole('button', { name: /find a property/i });

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByLabelText(/property address, street, or suburb/i)).not.toBeInTheDocument();

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByLabelText(/property address, street, or suburb/i)).toBeInTheDocument();

      fireEvent.click(toggle);
      expect(screen.queryByLabelText(/property address, street, or suburb/i)).not.toBeInTheDocument();
    });

    it('keeps a property match and its way out visible after the search is collapsed', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');
      const toggle = screen.getByRole('button', { name: /find a property/i });

      fireEvent.click(toggle);
      fireEvent.change(screen.getByLabelText(/property address, street, or suburb/i), { target: { value: 'ryedale' } });
      fireEvent.click(toggle);

      expect(screen.getByText(/showing 1 of 2 routes with a property match/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /show all routes/i }));
      expect(within(screen.getByRole('table')).getByText('W19-26-002')).toBeInTheDocument();
    });
  });

  describe('find a property', () => {
    async function renderWithRoutes() {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

      render(<RoutesPage />);

      await waitFor(() => {
        expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /find a property/i }));
    }

    it('links to the full Property History', async () => {
      await renderWithRoutes();

      expect(screen.getByRole('link', { name: /view full history/i })).toHaveAttribute('href', '/administrator/property-history');
    });

    it('shows the idle prompt before two characters are typed', async () => {
      await renderWithRoutes();

      expect(screen.getByText(/type at least two characters/i)).toBeInTheDocument();
    });

    it('narrows the routes table to routes containing a matched property', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/property address, street, or suburb/i), {
        target: { value: 'ryedale' },
      });

      const table = within(screen.getByRole('table'));
      expect(table.getByText('W19-26-001')).toBeInTheDocument();
      expect(table.queryByText('W19-26-002')).not.toBeInTheDocument();
      expect(screen.getByText(/showing 1 of 2 routes with a property match/i)).toBeInTheDocument();
    });

    it('shows an amber no-results note when nothing matches', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/property address, street, or suburb/i), {
        target: { value: 'nonexistent street' },
      });

      expect(screen.getByText(/no property matches/i)).toBeInTheDocument();
    });

    it('isolates a single route when its chip is clicked, and restores it via Show all routes', async () => {
      await renderWithRoutes();

      // "14 Cliff Rd" is on both mock routes, so both stay visible after the search.
      fireEvent.change(screen.getByLabelText(/property address, street, or suburb/i), {
        target: { value: 'cliff' },
      });

      const table = () => within(screen.getByRole('table'));
      expect(table().getByText('W19-26-001')).toBeInTheDocument();
      expect(table().getByText('W19-26-002')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Focus route W19-26-001' }));

      expect(screen.getByText(/showing w19-26-001 only/i)).toBeInTheDocument();
      expect(table().getByText('W19-26-001')).toBeInTheDocument();
      expect(table().queryByText('W19-26-002')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /show all routes/i }));

      expect(table().getByText('W19-26-001')).toBeInTheDocument();
      expect(table().getByText('W19-26-002')).toBeInTheDocument();
      expect(screen.queryByText(/showing w19-26-001 only/i)).not.toBeInTheDocument();
    });

    it('resets via Clear search in the property card', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/property address, street, or suburb/i), {
        target: { value: 'ryedale' },
      });
      expect(screen.queryByText('W19-26-002')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /clear search/i }));

      expect(screen.getByLabelText(/property address, street, or suburb/i)).toHaveValue('');
      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      expect(screen.getByText('W19-26-002')).toBeInTheDocument();
    });

    it('composes with the status filter', async () => {
      await renderWithRoutes();

      // Both routes carry a stop at "14 Cliff Rd", so the property filter alone keeps both.
      fireEvent.change(screen.getByLabelText(/property address, street, or suburb/i), {
        target: { value: 'cliff' },
      });
      const table = () => within(screen.getByRole('table'));
      expect(table().getByText('W19-26-001')).toBeInTheDocument();
      expect(table().getByText('W19-26-002')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^signs placed$/i }));

      expect(table().queryByText('W19-26-001')).not.toBeInTheDocument();
      expect(table().getByText('W19-26-002')).toBeInTheDocument();
    });
  });

  it('uses the admin-only guard on the routes page', () => {
    // Keep data requests pending so this assertion-only test does not race async state updates.
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: true, error: null });
    (listAllCustomersModule.listAllCustomers as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<RoutesPage />);

    expect(operatorRouteMock).toHaveBeenCalled();
    expect(operatorRouteMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        requireAdmin: true,
      })
    );
  });
});

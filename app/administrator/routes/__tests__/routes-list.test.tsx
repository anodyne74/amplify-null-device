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
jest.mock('@/lib/apiClient', () => ({ callApi: jest.fn().mockResolvedValue({ users: [] }) }));
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

  describe('Stops and signs column', () => {
    const row = async (code: string) => (await screen.findByText(code)).closest('tr') as HTMLElement;

    it('says "No stops yet" for a Route with no Stops, not a dash', async () => {
      const noStops = { ...mockRoutes[0], id: 'route-none-0000', routeCode: 'W19-26-009' };
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [noStops], loading: false, error: null });
      render(<RoutesPage />);

      await waitFor(() => expect(within(screen.getByText('W19-26-009').closest('tr') as HTMLElement).getByText('No stops yet')).toBeInTheDocument());
    });

    it('shows a placeholder, not repeated words, while Stops load', async () => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });
      (listAllStops as jest.Mock).mockReturnValue(new Promise(() => {}));
      render(<RoutesPage />);

      const first = await row('W19-26-001');
      expect(within(first).queryByText(/loading/i)).not.toBeInTheDocument();
      expect(within(first).queryByText('No stops yet')).not.toBeInTheDocument();
    });

    it('says Unavailable, explains why, and retries when the Stop list fails to load', async () => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });
      (listAllStops as jest.Mock).mockRejectedValueOnce(new Error('network')).mockResolvedValue(mockStops);
      render(<RoutesPage />);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/stop and sign totals couldn.t be loaded/i);
      expect(within(await row('W19-26-001')).getByText('Unavailable')).toBeInTheDocument();
      expect(within(await row('W19-26-001')).queryByText('No stops yet')).not.toBeInTheDocument();

      fireEvent.click(within(alert).getByRole('button', { name: /try again/i }));

      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(within(await row('W19-26-001')).getByText('2 stops · 7 signs')).toBeInTheDocument();
    });
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

  describe('applied filters', () => {
    beforeEach(() => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });
    });

    it('shows nothing until a filter is on', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');

      expect(screen.queryByRole('group', { name: /applied filters/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
    });

    it("leaves out tags for filters the toolbar already shows as set", async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');

      fireEvent.change(screen.getByLabelText(/^search$/i), { target: { value: 'acme' } });
      fireEvent.change(screen.getByLabelText(/placement from/i), { target: { value: '2024-01-01' } });
      fireEvent.click(screen.getByRole('button', { name: /needs attention/i }));
      fireEvent.click(screen.getByRole('radio', { name: 'Planned' }));

      const applied = within(screen.getByRole('group', { name: /applied filters/i }));
      expect(applied.queryByText(/Search:|Status:|Placement from|Needs attention/)).not.toBeInTheDocument();
      expect(applied.queryByRole('button', { name: /^Remove filter/ })).not.toBeInTheDocument();
      expect(applied.getByRole('button', { name: /^clear filters$/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/^search$/i)).toHaveValue('acme');
      expect(screen.getByRole('radio', { name: 'Planned' })).toHaveAttribute('aria-checked', 'true');
    });

    it('keeps a removable tag for the property match, which the toolbar does not show', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');
      fireEvent.click(screen.getByRole('button', { name: /find a property/i }));
      fireEvent.change(screen.getByLabelText(/property address, street, or suburb/i), { target: { value: 'ryedale' } });

      const applied = within(screen.getByRole('group', { name: /applied filters/i }));
      expect(applied.getByText('Property match')).toBeInTheDocument();

      fireEvent.click(applied.getByRole('button', { name: 'Remove filter Property match' }));

      expect(screen.queryByRole('group', { name: /applied filters/i })).not.toBeInTheDocument();
    });

    it('has one Clear filters that clears search, dates, Needs attention, Status and the property match together', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');
      fireEvent.click(screen.getByRole('button', { name: /find a property/i }));

      fireEvent.change(screen.getByLabelText(/^search$/i), { target: { value: 'w19' } });
      fireEvent.change(screen.getByLabelText(/placement from/i), { target: { value: '2024-01-01' } });
      fireEvent.click(screen.getByRole('button', { name: /needs attention/i }));
      fireEvent.click(screen.getByRole('radio', { name: 'Planned' }));
      fireEvent.change(screen.getByLabelText(/property address, street, or suburb/i), { target: { value: 'ryedale' } });

      fireEvent.click(screen.getByRole('button', { name: /^clear filters$/i }));

      expect(screen.getByLabelText(/^search$/i)).toHaveValue('');
      expect(screen.getByLabelText(/placement from/i)).toHaveValue('');
      expect(screen.getByRole('button', { name: /needs attention/i })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('radio', { name: /^all$/i })).toHaveAttribute('aria-checked', 'true');
      expect(screen.queryByRole('group', { name: /applied filters/i })).not.toBeInTheDocument();
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

    it('sits outside the Status group, with a count of Routes that need attention', async () => {
      await renderRoutes();

      const toggle = screen.getByRole('button', { name: /needs attention/i });
      expect(toggle).toHaveTextContent('Needs attention · 2');
      expect(within(screen.getByRole('radiogroup', { name: 'Status' })).queryByText(/needs attention/i)).not.toBeInTheDocument();
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

    it('starts in the default order and marks Placement as the descending sort', async () => {
      await renderDated();

      expect(codes()).toEqual(['W19-26-002', 'W19-26-001']);
      expect(screen.getByRole('columnheader', { name: /placement/i })).toHaveAttribute('aria-sort', 'descending');
      expect(screen.getByRole('columnheader', { name: /pickup/i })).toHaveAttribute('aria-sort', 'none');
      expect(screen.getByText('Sorted by Placement, latest first')).toBeInTheDocument();
    });

    it('announces a changed sort in a status region', async () => {
      await renderDated();

      fireEvent.click(within(screen.getByRole('columnheader', { name: /customer/i })).getByRole('button'));
      expect(screen.getByText('Sorted by Customer, ascending')).toBeInTheDocument();

      fireEvent.click(within(screen.getByRole('columnheader', { name: /customer/i })).getByRole('button'));
      expect(screen.getByText('Sorted by Customer, descending')).toBeInTheDocument();
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
      expect(screen.getByRole('columnheader', { name: /placement/i })).toHaveAttribute('aria-sort', 'descending');
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

  describe('selecting Routes', () => {
    const live = (routes: Route[]) =>
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes, loading: false, error: null });
    const rowBox = (code: string) => screen.getByRole('checkbox', { name: `Select route ${code}` }) as HTMLInputElement;
    const headerBox = (n: number) => screen.getByRole('checkbox', { name: `Select all ${n} ${n === 1 ? 'route' : 'routes'} shown` }) as HTMLInputElement;

    beforeEach(() => live(mockRoutes));

    it('shows no selection bar until a Route is selected, then counts, announces and clears', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');
      expect(screen.queryByText(/\d+ selected/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Assign Operator' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();

      fireEvent.click(rowBox('W19-26-001'));
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(screen.getByText('1 Route selected').closest('[role="status"]')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
      expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Assign Operator' })).not.toBeInTheDocument();
      expect(rowBox('W19-26-001').checked).toBe(false);
    });

    it('puts the selection bar after the table, so selecting does not move a row', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');

      fireEvent.click(rowBox('W19-26-001'));

      const table = screen.getByRole('table');
      const bar = screen.getByText('1 selected').parentElement as HTMLElement;
      expect(table.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('opens Assign Operator for the selected Routes', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');

      fireEvent.click(rowBox('W19-26-001'));
      fireEvent.click(screen.getByRole('button', { name: 'Assign Operator' }));

      expect(await screen.findByRole('dialog')).toHaveTextContent('1 Route selected');
    });

    it('selects exactly the shown rows from the header, and shows a partial selection as indeterminate', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');

      fireEvent.click(rowBox('W19-26-001'));
      expect(headerBox(2).indeterminate).toBe(true);
      expect(headerBox(2).checked).toBe(false);

      fireEvent.click(headerBox(2));
      expect(screen.getByText('2 selected')).toBeInTheDocument();
      expect(headerBox(2).checked).toBe(true);
      expect(headerBox(2).indeterminate).toBe(false);

      fireEvent.click(headerBox(2));
      expect(screen.queryByText(/\d+ selected/)).not.toBeInTheDocument();
    });

    it('selects only the Routes left after a filter', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');

      fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Acme' } });
      fireEvent.click(headerBox(1));

      expect(screen.getByText('1 selected')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Search'), { target: { value: '' } });
      expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    });

    it.each([
      ['a status filter', () => fireEvent.click(screen.getByRole('radio', { name: 'Planned' }))],
      ['a date range', () => fireEvent.change(screen.getByLabelText('Placement from'), { target: { value: '2020-01-01' } })],
      ['Needs attention', () => fireEvent.click(screen.getByRole('button', { name: /Needs attention/ }))],
    ])('clears the selection when %s changes, and says so', async (_name, change) => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');
      fireEvent.click(rowBox('W19-26-001'));
      expect(screen.getByText('1 selected')).toBeInTheDocument();

      change();

      expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
      expect(screen.getByText('Selection cleared because the filters changed.')).toBeInTheDocument();

      const remaining = screen.queryAllByRole('checkbox', { name: /^Select route/ });
      if (remaining.length > 0) {
        fireEvent.click(remaining[0]);
        expect(screen.queryByText('Selection cleared because the filters changed.')).not.toBeInTheDocument();
      }
    });

    it('puts a jump to the selection actions right after a ticked Route, and it focuses Assign Operator', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');
      expect(screen.queryByRole('button', { name: 'Go to selection actions' })).not.toBeInTheDocument();

      fireEvent.click(rowBox('W19-26-001'));
      const jump = screen.getByRole('button', { name: 'Go to selection actions' });
      expect(rowBox('W19-26-001').closest('div')).toContainElement(jump);

      fireEvent.click(jump);
      expect(screen.getByRole('button', { name: 'Assign Operator' })).toHaveFocus();
    });

    it('keeps the selection when the list is sorted', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');
      fireEvent.click(rowBox('W19-26-001'));

      fireEvent.click(screen.getByRole('button', { name: /^Customer/ }));

      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(rowBox('W19-26-001').checked).toBe(true);
      expect(screen.queryByText('Selection cleared because the filters changed.')).not.toBeInTheDocument();
    });

    it('says nothing when a filter changes with nothing selected', async () => {
      render(<RoutesPage />);
      await screen.findByText('W19-26-001');

      fireEvent.click(screen.getByRole('radio', { name: 'Planned' }));

      expect(screen.queryByText('Selection cleared because the filters changed.')).not.toBeInTheDocument();
    });

    it('does not open the Route when a checkbox is clicked, but still does for the rest of the row', async () => {
      render(<RoutesPage />);
      const row = (await screen.findByText('Acme Corp')).closest('tr') as HTMLElement;

      fireEvent.click(rowBox('W19-26-001'));
      expect(pushMock).not.toHaveBeenCalled();

      fireEvent.click(row);
      expect(pushMock).toHaveBeenCalledWith('/administrator/routes/detail?id=route-aaaa-1111');
    });

    it('drops a Route that goes away from the selection', async () => {
      const { rerender } = render(<RoutesPage />);
      await screen.findByText('W19-26-001');
      fireEvent.click(rowBox('W19-26-001'));
      fireEvent.click(rowBox('W19-26-002'));
      expect(screen.getByText('2 selected')).toBeInTheDocument();

      live([mockRoutes[1]]);
      rerender(<RoutesPage />);

      await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());
    });
  });

  describe('when Customers cannot be loaded', () => {
    const customers = listAllCustomersModule.listAllCustomers as jest.Mock;
    const customerRows = [
      { id: 'cust-bbbb-2222', name: 'Acme Corp', email: 'acme@example.com' },
      { id: 'cust-dddd-4444', name: 'Globex Inc', email: 'globex@example.com' },
    ];

    beforeEach(() => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });
    });

    it('says so with a way to retry, and shows no row as an unknown Customer', async () => {
      customers.mockRejectedValueOnce(new Error('network'));
      render(<RoutesPage />);

      expect(await screen.findByRole('alert')).toHaveTextContent('Customer names couldn’t be loaded');
      expect(screen.queryByText('Unknown customer')).not.toBeInTheDocument();

      customers.mockResolvedValueOnce(customerRows);
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('still reads Unknown customer for a Route whose Customer is missing after a successful load', async () => {
      customers.mockResolvedValueOnce([customerRows[1]]);
      render(<RoutesPage />);

      expect(await screen.findByText('Unknown customer')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('on a narrow screen', () => {
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });
    });
    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    it('moves Stops and signs under the Route Code instead of its own column', async () => {
      window.matchMedia = jest.fn().mockImplementation(() => ({
        matches: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })) as unknown as typeof window.matchMedia;
      render(<RoutesPage />);

      const row = (await screen.findByText('W19-26-001')).closest('tr') as HTMLElement;
      expect(screen.queryByRole('columnheader', { name: 'Stops and signs' })).not.toBeInTheDocument();
      await waitFor(() => expect(within(row).getByText('2 stops · 7 signs')).toBeInTheDocument());
      expect(within(row).getByText('2 stops · 7 signs').closest('td')).toContainElement(within(row).getByText('W19-26-001'));
    });

    it('shows Placement and Pickup in one Dates cell, with both sorts still in its header', async () => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({
        routes: [
          { ...mockRoutes[0], pickupDate: '2999-01-01' },
          { ...mockRoutes[1], pickupDate: '2000-01-01' },
        ],
        loading: false,
        error: null,
      });
      window.matchMedia = jest.fn().mockImplementation(() => ({
        matches: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })) as unknown as typeof window.matchMedia;
      render(<RoutesPage />);

      await screen.findByText('W19-26-001');
      expect(screen.queryByRole('columnheader', { name: 'Pickup' })).not.toBeInTheDocument();
      const header = screen.getByRole('columnheader', { name: /Placement.*Pickup/ });
      const overdueRow = screen.getByText('W19-26-002').closest('tr') as HTMLElement;
      expect(within(overdueRow).getByText('Overdue')).toBeInTheDocument();
      expect(within(overdueRow).getByText('Placement')).toBeInTheDocument();
      expect(within(overdueRow).getByText('Pickup')).toBeInTheDocument();

      const order = () => screen.getAllByRole('link', { name: /^W19-26-00/ }).map((link) => link.textContent);
      fireEvent.click(within(header).getByRole('button', { name: 'Pickup' }));
      expect(order()).toEqual(['W19-26-002', 'W19-26-001']);
      fireEvent.click(within(header).getByRole('button', { name: 'Pickup' }));
      expect(order()).toEqual(['W19-26-001', 'W19-26-002']);
    });

    it('keeps the Stops and signs column on a wide screen', async () => {
      render(<RoutesPage />);

      await screen.findByText('W19-26-001');
      expect(screen.getByRole('columnheader', { name: 'Stops and signs' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Pickup' })).toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: /Placement.*Pickup/ })).not.toBeInTheDocument();
    });
  });

  describe('a Route with no Route Code', () => {
    it('is named the same way in the list, its checkbox and its actions', async () => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({
        routes: [{ ...mockRoutes[0], routeCode: undefined }],
        loading: false,
        error: null,
      });
      render(<RoutesPage />);

      expect(await screen.findByRole('link', { name: 'route-aa' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Select route route-aa' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Edit route route-aa' })).toBeInTheDocument();
    });
  });

  describe('row actions menu', () => {
    beforeEach(() => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });
    });

    it('shows Edit in the row and keeps Delete in the menu until it is opened', async () => {
      render(<RoutesPage />);

      await screen.findByText('W19-26-001');
      expect(screen.getByRole('link', { name: 'Edit route W19-26-001' })).toHaveAttribute(
        'href',
        '/administrator/routes/edit?id=route-aaaa-1111'
      );
      expect(screen.queryByRole('button', { name: /^Delete route/ })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Actions for route W19-26-001' }));

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

    expect(screen.getByRole('radio', { name: /^all$/i })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: /^signs placed$/i }));

    expect(screen.getByRole('radio', { name: /^signs placed$/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /^all$/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps the status filter visible when a filtered status has no routes', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /^signs picked up$/i }));

    expect(screen.getByText(/no routes found/i)).toBeInTheDocument();
    // The filter row stays so the user can switch back.
    expect(screen.getByRole('radio', { name: /^all$/i })).toBeInTheDocument();
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

      fireEvent.click(screen.getByRole('radio', { name: 'Planned' }));
      fireEvent.change(screen.getByLabelText(/placement from/i), { target: { value: '2024-03-02' } });

      const empty = screen.getByText(/no routes found for/i);
      expect(empty).toHaveTextContent('Status: Planned');
      expect(empty).toHaveTextContent('Placement from Mar 2, 2024');

      fireEvent.click(screen.getByRole('button', { name: /^clear filters$/i }));

      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      expect(screen.getByText('W19-26-002')).toBeInTheDocument();
      expect(screen.getByLabelText(/placement from/i)).toHaveValue('');
      expect(screen.getByRole('radio', { name: 'Planned' })).toHaveAttribute('aria-checked', 'false');
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
      fireEvent.click(screen.getByRole('radio', { name: /^signs placed$/i }));

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
      expect(within(toolbar).getByRole('radiogroup', { name: 'Status' })).toBeInTheDocument();
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
      expect(toggle).toHaveTextContent('Find a property · filtering');
      fireEvent.click(screen.getByRole('button', { name: /remove filter property match/i }));
      expect(within(screen.getByRole('table')).getByText('W19-26-002')).toBeInTheDocument();
      expect(toggle).toHaveTextContent(/^Find a property$/);
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

    it('isolates a single route when its chip is clicked, and restores it by removing the Property match filter', async () => {
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

      fireEvent.click(screen.getByRole('button', { name: /remove filter property match/i }));

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

      fireEvent.click(screen.getByRole('radio', { name: /^signs placed$/i }));

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

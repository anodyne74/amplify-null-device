import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RouteForm } from '../RouteForm';
import { STOP_NEEDS_SUBURB } from '@/lib/routes';

// Mock toast hook (provider lives in the root layout, not in this tree)
jest.mock('@/app/components/ToastProvider', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToast: () => ({ showToast: jest.fn() }),
}));

// A Stop with a Property key looks up its Confirmed pin; there is none here
jest.mock('@/lib/propertyLocations', () => ({
  getConfirmedPin: jest.fn().mockResolvedValue(null),
}));

const mockCustomers = [
  { id: 'cust-1', name: 'Acme Corp', email: 'acme@example.com' },
  { id: 'cust-2', name: 'Globex Inc', email: 'globex@example.com' },
];

const noop = jest.fn();

describe('RouteForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all fields (customer dropdown, notes, submit/cancel buttons)', () => {
    render(
      <RouteForm customers={mockCustomers} onSubmit={noop} onCancel={noop} />
    );

    expect(screen.getByLabelText(/customer/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create route/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('submit button is labeled "Create Route"', () => {
    render(
      <RouteForm customers={mockCustomers} onSubmit={noop} onCancel={noop} />
    );
    expect(screen.getByRole('button', { name: /create route/i })).toBeInTheDocument();
  });

  it('shows validation error when customer is not selected and form submitted', async () => {
    render(
      <RouteForm customers={mockCustomers} onSubmit={noop} onCancel={noop} />
    );

    fireEvent.click(screen.getByRole('button', { name: /create route/i }));

    await waitFor(() => {
      expect(screen.getByText(/please select a customer/i)).toBeInTheDocument();
    });
    expect(noop).not.toHaveBeenCalled();
  });

  it('calls onSubmit with correct values when form is valid', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <RouteForm
        customers={mockCustomers}
        initialRouteCode="W20-26-001"
        onSubmit={onSubmit}
        onCancel={noop}
      />
    );

    // Select customer
    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'cust-1' } });
    // Set notes
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: 'Test note' } });
    fireEvent.change(screen.getByLabelText(/placement date/i), { target: { value: '2026-10-09' } });

    // Add one stop via mocked StopForm
    fireEvent.click(screen.getByRole('button', { name: /add stop/i }));
    fireEvent.change(screen.getByLabelText(/^address/i), { target: { value: '123 Main St, Epping' } });
    fireEvent.click(screen.getByRole('button', { name: /add stop to route/i }));

    await waitFor(() => {
      expect(screen.getByText('123 Main St, Epping')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /create route/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        routeCode: 'W20-26-001',
        customerId: 'cust-1',
        scheduledDate: '2026-10-09',
        pickupDate: '2026-10-10',
        notes: 'Test note',
        stops: [
          expect.objectContaining({
            address: expect.any(String),
            serviceType: expect.any(String),
          }),
        ],
      });
    });
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = jest.fn();
    render(
      <RouteForm customers={mockCustomers} onSubmit={noop} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows external error prop when provided', () => {
    render(
      <RouteForm
        customers={mockCustomers}
        onSubmit={noop}
        onCancel={noop}
        error="Server error occurred"
      />
    );
    expect(screen.getByText(/server error occurred/i)).toBeInTheDocument();
  });

  it('populates customer dropdown with provided customers', () => {
    render(
      <RouteForm customers={mockCustomers} onSubmit={noop} onCancel={noop} />
    );
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
    expect(screen.getByText(/Globex Inc/)).toBeInTheDocument();
  });

  it('copies stops from a previous route and submits them', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const onCopyStopsFromSource = jest.fn().mockResolvedValue([
      {
        address: '123 Sample St',
        serviceType: 'delivery',
        numberOfSigns: 2,
      },
    ]);

    render(
      <RouteForm
        customers={mockCustomers}
        initialRouteCode="W20-26-001"
        onSubmit={onSubmit}
        onCancel={noop}
        copyStopSources={[
          { id: 'route-1', customerId: 'cust-1', label: 'W19-26-003' },
        ]}
        onCopyStopsFromSource={onCopyStopsFromSource}
      />
    );

    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'cust-1' } });
    fireEvent.change(screen.getByLabelText(/copy stops from previous route/i), { target: { value: 'route-1' } });
    fireEvent.click(screen.getByRole('button', { name: /copy stops/i }));

    await waitFor(() => {
      expect(onCopyStopsFromSource).toHaveBeenCalledWith('route-1');
    });

    fireEvent.click(screen.getByRole('button', { name: /create route/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        routeCode: 'W20-26-001',
        customerId: 'cust-1',
        scheduledDate: expect.any(String),
        pickupDate: expect.any(String),
        notes: '',
        stops: [
          expect.objectContaining({
            address: '123 Sample St',
            serviceType: 'delivery',
            numberOfSigns: 2,
          }),
        ],
      });
    });
  });

  it('threads customer standing instructions and defaults into stop form', async () => {
    render(
      <RouteForm
        customers={[
          {
            id: 'cust-1',
            name: 'Acme Corp',
            email: 'acme@example.com',
            standingInstructions: 'Call before arriving.',
            defaultNumberOfSigns: 3,
            defaultAgentInitials: 'Jamie Lee',
            agentOptions: ['Jamie Lee', 'Pat Doe'],
          },
        ]}
        initialRouteCode="W20-26-001"
        onSubmit={noop}
        onCancel={noop}
      />
    );

    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'cust-1' } });
    fireEvent.click(screen.getByRole('button', { name: /add stop/i }));

    expect(await screen.findByText(/call before arriving/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/number of signs/i)).toHaveValue(3);
    expect(screen.getByRole('button', { name: /jamie lee/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('defaults the placement date field to today', () => {
    render(<RouteForm customers={mockCustomers} onSubmit={noop} onCancel={noop} />);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(screen.getByLabelText(/placement date/i)).toHaveValue(today);
  });

  it('starts the pickup date on the day after the placement date, and keeps it there as that changes', () => {
    render(<RouteForm customers={mockCustomers} onSubmit={noop} onCancel={noop} />);

    fireEvent.change(screen.getByLabelText(/placement date/i), { target: { value: '2026-10-09' } });
    expect(screen.getByLabelText(/pickup date/i)).toHaveValue('2026-10-10');

    fireEvent.change(screen.getByLabelText(/placement date/i), { target: { value: '2026-10-08' } });
    expect(screen.getByLabelText(/pickup date/i)).toHaveValue('2026-10-09');
  });

  it('keeps a pickup date the user chose when the placement date changes', () => {
    render(<RouteForm customers={mockCustomers} onSubmit={noop} onCancel={noop} />);

    fireEvent.change(screen.getByLabelText(/placement date/i), { target: { value: '2026-10-09' } });
    fireEvent.change(screen.getByLabelText(/pickup date/i), { target: { value: '2026-10-12' } });
    fireEvent.change(screen.getByLabelText(/placement date/i), { target: { value: '2026-10-08' } });

    expect(screen.getByLabelText(/pickup date/i)).toHaveValue('2026-10-12');
  });

  it('refuses a pickup date before the placement date', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<RouteForm customers={mockCustomers} initialRouteCode="W20-26-001" onSubmit={onSubmit} onCancel={noop} />);

    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'cust-1' } });
    fireEvent.change(screen.getByLabelText(/placement date/i), { target: { value: '2026-10-09' } });
    fireEvent.change(screen.getByLabelText(/pickup date/i), { target: { value: '2026-10-08' } });
    fireEvent.click(screen.getByRole('button', { name: /add stop/i }));
    fireEvent.change(screen.getByLabelText(/^address/i), { target: { value: '123 Main St, Epping' } });
    fireEvent.click(screen.getByRole('button', { name: /add stop to route/i }));
    await screen.findByText('123 Main St, Epping');

    fireEvent.click(screen.getByRole('button', { name: /create route/i }));

    expect(await screen.findByText(/pickup date must be on or after the placement date/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks submission and shows a reason when the service calendar has no drivers that day', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const onCheckDateBlock = jest.fn().mockResolvedValue({ blocked: true, type: 'no_drivers', reason: 'Driver on leave' });

    render(
      <RouteForm
        customers={mockCustomers}
        initialRouteCode="W20-26-001"
        onSubmit={onSubmit}
        onCancel={noop}
        onCheckDateBlock={onCheckDateBlock}
      />
    );

    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'cust-1' } });

    await waitFor(() => {
      expect(onCheckDateBlock).toHaveBeenCalledWith('cust-1', expect.any(String));
    });

    expect(await screen.findByText(/no operators available.*driver on leave.*choose another date/i)).toBeInTheDocument();

    const submitButton = screen.getByRole('button', { name: /create route/i });
    expect(submitButton).toBeDisabled();

    fireEvent.click(submitButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks submission when the customer agency is closed that day', async () => {
    const onCheckDateBlock = jest.fn().mockResolvedValue({ blocked: true, type: 'closed', reason: 'Christmas shutdown' });

    render(
      <RouteForm
        customers={mockCustomers}
        onSubmit={noop}
        onCancel={noop}
        onCheckDateBlock={onCheckDateBlock}
      />
    );

    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'cust-1' } });

    expect(await screen.findByText(/acme corp.*closed/i)).toBeInTheDocument();
    expect(screen.getByText(/christmas shutdown/i)).toBeInTheDocument();
  });

  it('allows submission once the calendar reports the date is clear', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const onCheckDateBlock = jest.fn().mockResolvedValue({ blocked: false });

    render(
      <RouteForm
        customers={mockCustomers}
        initialRouteCode="W20-26-001"
        onSubmit={onSubmit}
        onCancel={noop}
        onCheckDateBlock={onCheckDateBlock}
      />
    );

    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'cust-1' } });
    await waitFor(() => expect(onCheckDateBlock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /add stop/i }));
    fireEvent.change(screen.getByLabelText(/^address/i), { target: { value: '123 Main St, Epping' } });
    fireEvent.click(screen.getByRole('button', { name: /add stop to route/i }));
    await waitFor(() => {
      expect(screen.getByText('123 Main St, Epping')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /create route/i })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /create route/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  it('warns, without blocking, when no operators are available on the pickup date', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const onCheckDateBlock = jest.fn(async (_customerId: string, date: string) =>
      date === '2026-10-10' ? { blocked: true, type: 'no_drivers' as const, reason: 'Driver on leave' } : { blocked: false }
    );
    render(
      <RouteForm
        customers={mockCustomers}
        initialRouteCode="W20-26-001"
        onSubmit={onSubmit}
        onCancel={noop}
        onCheckDateBlock={onCheckDateBlock}
      />
    );

    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'cust-1' } });
    fireEvent.change(screen.getByLabelText(/placement date/i), { target: { value: '2026-10-09' } });

    expect(await screen.findByText(/no operators available on 2026-10-10 \(driver on leave\)\. the route can still be created/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add stop/i }));
    fireEvent.change(screen.getByLabelText(/^address/i), { target: { value: '123 Main St, Epping' } });
    fireEvent.click(screen.getByRole('button', { name: /add stop to route/i }));
    await screen.findByText('123 Main St, Epping');
    fireEvent.click(screen.getByRole('button', { name: /create route/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ pickupDate: '2026-10-10' })));
  });

  it("doesn't warn when only the customer's agency is closed on the pickup date", async () => {
    const onCheckDateBlock = jest.fn(async (_customerId: string, date: string) =>
      date === '2026-10-10' ? { blocked: true, type: 'closed' as const } : { blocked: false }
    );
    render(<RouteForm customers={mockCustomers} onSubmit={noop} onCancel={noop} onCheckDateBlock={onCheckDateBlock} />);

    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'cust-1' } });
    fireEvent.change(screen.getByLabelText(/placement date/i), { target: { value: '2026-10-09' } });

    await waitFor(() => expect(onCheckDateBlock).toHaveBeenCalledWith('cust-1', '2026-10-10'));
    expect(screen.queryByText(/closed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no operators available/i)).not.toBeInTheDocument();
  });

  it("refuses a Stop with no suburb that couldn't be found on the map", async () => {
    render(<RouteForm customers={mockCustomers} onSubmit={noop} onCancel={noop} />);

    fireEvent.click(screen.getByRole('button', { name: /add stop/i }));
    fireEvent.change(screen.getByLabelText(/^address/i), { target: { value: '123 Main St' } });
    fireEvent.click(screen.getByRole('button', { name: /add stop to route/i }));

    expect(await screen.findByText(STOP_NEEDS_SUBURB)).toBeInTheDocument();
    expect(screen.getByText('No stops added yet.')).toBeInTheDocument();
  });
});

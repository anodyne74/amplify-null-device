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
    // A draft stop shows no service type.
    expect(screen.queryByText(/^delivery$/i)).not.toBeInTheDocument();

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
            numberOfSigns: 2,
          }),
        ],
      });
    });
    expect(onSubmit.mock.calls[0][0].stops[0]).not.toHaveProperty('serviceType');
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

  describe('Stop notes in the list (#475)', () => {
    async function renderWithCopiedStops(onSubmit = jest.fn().mockResolvedValue(undefined)) {
      const onCopyStopsFromSource = jest.fn().mockResolvedValue([
        { address: '1409/26 Cambridge St, Epping', notes: 'Late addition to list' },
        { address: '20 Gloucester Road, Epping', notes: 'Gate code 1234' },
        { address: '9 Grayson Rd, North Epping' },
      ]);
      render(
        <RouteForm
          customers={mockCustomers}
          initialRouteCode="W20-26-001"
          onSubmit={onSubmit}
          onCancel={noop}
          copyStopSources={[{ id: 'route-1', customerId: 'cust-1', label: 'W19-26-003' }]}
          onCopyStopsFromSource={onCopyStopsFromSource}
        />
      );
      fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'cust-1' } });
      fireEvent.change(screen.getByLabelText(/copy stops from previous route/i), { target: { value: 'route-1' } });
      fireEvent.click(screen.getByRole('button', { name: /copy stops/i }));
      await screen.findByLabelText('Notes for stop 1, 1409/26 Cambridge St, Epping');
      return onSubmit;
    }

    async function submittedStops(onSubmit: jest.Mock) {
      fireEvent.click(screen.getByRole('button', { name: /create route/i }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      return onSubmit.mock.calls[0][0].stops as Array<{ address: string; notes?: string }>;
    }

    it("shows each copied Stop's note", async () => {
      await renderWithCopiedStops();

      expect(screen.getByLabelText('Notes for stop 1, 1409/26 Cambridge St, Epping')).toHaveValue('Late addition to list');
      expect(screen.getByLabelText('Notes for stop 2, 20 Gloucester Road, Epping')).toHaveValue('Gate code 1234');
      expect(screen.getByLabelText('Notes for stop 3, 9 Grayson Rd, North Epping')).toHaveValue('');
    });

    it('submits the notes as edited, cleared or left as copied', async () => {
      const onSubmit = await renderWithCopiedStops();

      fireEvent.change(screen.getByLabelText('Notes for stop 1, 1409/26 Cambridge St, Epping'), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText('Notes for stop 3, 9 Grayson Rd, North Epping'), { target: { value: '   ' } });

      const [cambridge, gloucester, grayson] = await submittedStops(onSubmit);
      expect(cambridge.notes).toBeUndefined();
      expect(gloucester.notes).toBe('Gate code 1234');
      // Only spaces counts as cleared.
      expect(grayson.notes).toBeUndefined();
    });

    it('submits an edited note', async () => {
      const onSubmit = await renderWithCopiedStops();

      fireEvent.change(screen.getByLabelText('Notes for stop 2, 20 Gloucester Road, Epping'), { target: { value: 'Gate code 5678' } });

      expect((await submittedStops(onSubmit))[1].notes).toBe('Gate code 5678');
    });

    it('edits the right note after a Stop above it is removed', async () => {
      const onSubmit = await renderWithCopiedStops();

      fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
      fireEvent.change(screen.getByLabelText('Notes for stop 2, 9 Grayson Rd, North Epping'), { target: { value: 'Beware of dog' } });

      const stops = await submittedStops(onSubmit);
      expect(stops.map((stop) => [stop.address, stop.notes])).toEqual([
        ['20 Gloucester Road, Epping', 'Gate code 1234'],
        ['9 Grayson Rd, North Epping', 'Beware of dog'],
      ]);
    });

    it('starts over from the source notes when the Stops are copied again', async () => {
      await renderWithCopiedStops();
      fireEvent.change(screen.getByLabelText('Notes for stop 2, 20 Gloucester Road, Epping'), { target: { value: 'Changed' } });

      fireEvent.click(screen.getByRole('button', { name: /copy stops/i }));

      await waitFor(() => expect(screen.getByLabelText('Notes for stop 2, 20 Gloucester Road, Epping')).toHaveValue('Gate code 1234'));
    });

    it('locks the notes while the Route is being created', async () => {
      const props = {
        customers: mockCustomers,
        onSubmit: noop,
        onCancel: noop,
        copyStopSources: [{ id: 'route-1', customerId: 'cust-1', label: 'W19-26-003' }],
        onCopyStopsFromSource: jest.fn().mockResolvedValue([{ address: '20 Gloucester Road, Epping', notes: 'Gate code 1234' }]),
      };
      const { rerender } = render(<RouteForm {...props} />);
      fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'cust-1' } });
      fireEvent.change(screen.getByLabelText(/copy stops from previous route/i), { target: { value: 'route-1' } });
      fireEvent.click(screen.getByRole('button', { name: /copy stops/i }));
      const note = await screen.findByLabelText('Notes for stop 1, 20 Gloucester Road, Epping');
      expect(note).toBeEnabled();

      rerender(<RouteForm {...props} isSubmitting />);

      expect(note).toBeDisabled();
    });

    it('shows, and lets you edit, a note given when the Stop was added', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      render(<RouteForm customers={mockCustomers} initialRouteCode="W20-26-001" onSubmit={onSubmit} onCancel={noop} />);
      fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'cust-1' } });

      fireEvent.click(screen.getByRole('button', { name: /add stop/i }));
      fireEvent.change(screen.getByLabelText(/^address/i), { target: { value: '123 Main St, Epping' } });
      // The Stop form's own Notes field, not the Route's.
      fireEvent.change(document.getElementById('stopNotes')!, { target: { value: 'Side gate' } });
      fireEvent.click(screen.getByRole('button', { name: /add stop to route/i }));

      const note = await screen.findByLabelText('Notes for stop 1, 123 Main St, Epping');
      expect(note).toHaveValue('Side gate');
      fireEvent.change(note, { target: { value: 'Side gate, left' } });

      expect((await submittedStops(onSubmit))[0].notes).toBe('Side gate, left');
    });
  });
});

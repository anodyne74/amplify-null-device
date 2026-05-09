import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouteForm } from '../RouteForm';

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

    // Add one stop via mocked StopForm
    fireEvent.click(screen.getByRole('button', { name: /add stop/i }));
    fireEvent.change(screen.getByLabelText(/^address/i), { target: { value: '123 Main St' } });
    fireEvent.click(screen.getByRole('button', { name: /add stop to route/i }));

    await waitFor(() => {
      expect(screen.getByText('123 Main St')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /create route/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        routeCode: 'W20-26-001',
        customerId: 'cust-1',
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
});

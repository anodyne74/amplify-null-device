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

  it('renders all fields (customer dropdown, estimated duration, notes, submit/cancel buttons)', () => {
    render(
      <RouteForm customers={mockCustomers} onSubmit={noop} onCancel={noop} />
    );

    expect(screen.getByLabelText(/customer/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/estimated duration/i)).toBeInTheDocument();
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
      <RouteForm customers={mockCustomers} onSubmit={onSubmit} onCancel={noop} />
    );

    // Select customer
    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'cust-1' } });
    // Set duration
    fireEvent.change(screen.getByLabelText(/estimated duration/i), { target: { value: '90' } });
    // Set notes
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: 'Test note' } });

    fireEvent.click(screen.getByRole('button', { name: /create route/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        customerId: 'cust-1',
        estimatedDurationMinutes: 90,
        notes: 'Test note',
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
});

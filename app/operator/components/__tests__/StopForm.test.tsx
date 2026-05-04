import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StopForm } from '../StopForm';

const noop = jest.fn();

describe('StopForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all fields (address, service type, notes, submit/cancel)', () => {
    render(<StopForm onSubmit={noop} onCancel={noop} />);

    expect(screen.getByLabelText(/address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/service type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add stop/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('default submit label is "Add Stop"', () => {
    render(<StopForm onSubmit={noop} onCancel={noop} />);
    expect(screen.getByRole('button', { name: /add stop/i })).toBeInTheDocument();
  });

  it('custom submitLabel prop is used when provided', () => {
    render(<StopForm onSubmit={noop} onCancel={noop} submitLabel="Save Changes" />);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('shows error when address is empty on submit', async () => {
    render(<StopForm onSubmit={noop} onCancel={noop} />);

    fireEvent.click(screen.getByRole('button', { name: /add stop/i }));

    await waitFor(() => {
      expect(screen.getByText(/address is required/i)).toBeInTheDocument();
    });
    expect(noop).not.toHaveBeenCalled();
  });

  it('calls onSubmit with correct values when form is valid', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<StopForm onSubmit={onSubmit} onCancel={noop} />);

    fireEvent.change(screen.getByLabelText(/address/i), {
      target: { value: '123 Main St' },
    });
    fireEvent.change(screen.getByLabelText(/service type/i), {
      target: { value: 'pickup' },
    });

    fireEvent.click(screen.getByRole('button', { name: /add stop/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          address: '123 Main St',
          serviceType: 'pickup',
        })
      );
    });
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = jest.fn();
    render(<StopForm onSubmit={noop} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('populates initialValues when provided', () => {
    render(
      <StopForm
        initialValues={{
          address: '456 Elm Ave',
          serviceType: 'inspection',
          notes: 'Pre-filled note',
        }}
        onSubmit={noop}
        onCancel={noop}
      />
    );

    expect(screen.getByLabelText(/address/i)).toHaveValue('456 Elm Ave');
    expect(screen.getByLabelText(/service type/i)).toHaveValue('inspection');
    expect(screen.getByLabelText(/notes/i)).toHaveValue('Pre-filled note');
  });

  it('shows external error prop when provided', () => {
    render(<StopForm onSubmit={noop} onCancel={noop} error="Something went wrong" />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});

import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Route } from '@/amplify/types';
import { BilledTimeCorrectionPanel } from '../BilledTimeCorrectionPanel';
import { correctBilledTime } from '@/lib/administratorRouteActions';
import { listRouteInvoices } from '@/lib/invoices';

jest.mock('@/lib/administratorRouteActions', () => ({ correctBilledTime: jest.fn() }));
jest.mock('@/lib/invoices', () => ({ listRouteInvoices: jest.fn() }));

const correct = correctBilledTime as jest.Mock;
const listInvoices = listRouteInvoices as jest.Mock;

const FINALISED = {
  id: 'route-1',
  customerId: 'cust-1',
  status: 'completed',
  billedLoadMinutes: 15,
  billedPlacementMinutes: 20,
  billedPickupMinutes: 10,
  billedUnloadMinutes: 30,
  overrideDurationMinutes: 75,
  overrideDistanceKm: 37.5,
} as Route;

const LEGACY = { id: 'route-2', customerId: 'cust-1', status: 'archived', actualDurationMinutes: 165 } as Route;

beforeEach(() => {
  jest.clearAllMocks();
  listInvoices.mockResolvedValue([]);
});

describe('BilledTimeCorrectionPanel', () => {
  it('corrects a finalised Route phase by phase, with the Finalise adjusters', async () => {
    correct.mockResolvedValue({ ok: true });
    const onSaved = jest.fn();
    render(<BilledTimeCorrectionPanel route={FINALISED} onSaved={onSaved} />);

    // Nothing to save until something changes.
    expect(screen.getByRole('button', { name: 'Save Billed Time · 1h 15m' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Increase Placement minutes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase Placement minutes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase Placement minutes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Billed Time · 1h 30m' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(correct).toHaveBeenCalledWith(FINALISED, {
      billedMinutes: { load: 15, placement: 35, pickup: 10, unload: 30 },
      distanceKm: 37.5,
    });
  });

  it('won’t save a total off a 15 min increment', () => {
    render(<BilledTimeCorrectionPanel route={FINALISED} onSaved={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Increase Pickup minutes' }));

    expect(screen.getByRole('button', { name: 'Save Billed Time · 1h 20m' })).toBeDisabled();
  });

  it('corrects a total-only Route by its total', async () => {
    correct.mockResolvedValue({ ok: true });
    const onSaved = jest.fn();
    render(<BilledTimeCorrectionPanel route={LEGACY} onSaved={onSaved} />);

    expect(screen.queryByRole('button', { name: /increase placement minutes/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Total charged (minutes)'), { target: { value: '180' } });
    fireEvent.change(screen.getByLabelText('Distance (km)'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Billed Time · 3h 0m' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(correct).toHaveBeenCalledWith(LEGACY, { totalMinutes: 180, distanceKm: 12 });
  });

  it('flags a total that isn’t a 15 min increment', () => {
    render(<BilledTimeCorrectionPanel route={LEGACY} onSaved={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Total charged (minutes)'), { target: { value: '170' } });

    expect(screen.getByText('Enter a total of 15 min or more, in 15 min increments.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Billed Time' })).toBeDisabled();
  });

  it('keeps what was entered and shows why when the save fails', async () => {
    correct.mockResolvedValue({ ok: false, error: 'Could not save the Billed Time. Nothing was changed.', saved: false });
    const onSaved = jest.fn();
    render(<BilledTimeCorrectionPanel route={LEGACY} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('Total charged (minutes)'), { target: { value: '180' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Billed Time · 3h 0m' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the Billed Time. Nothing was changed.');
    expect(screen.getByLabelText('Total charged (minutes)')).toHaveValue('180');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('warns, without blocking, when the Route has already been invoiced', async () => {
    listInvoices.mockResolvedValue([{ invoiceNumber: 'ND-INV-128' }]);
    render(<BilledTimeCorrectionPanel route={LEGACY} onSaved={jest.fn()} />);

    expect(await screen.findByText(/Already invoiced on ND-INV-128/)).toHaveTextContent("won't change that invoice");
    fireEvent.change(screen.getByLabelText('Total charged (minutes)'), { target: { value: '180' } });
    expect(screen.getByRole('button', { name: 'Save Billed Time · 3h 0m' })).toBeEnabled();
  });
});

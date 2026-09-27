import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdministratorLocationReviewPage from '../page';
import { confirmPropertyLocation, dismissSuburbMismatch, listLocationReviewQueue } from '@/lib/propertyLocations';
import { correctPropertyAddress } from '@/lib/propertyAddressCorrection';
import type { PropertyReview } from '@/lib/locationReview';

jest.mock('@/lib/propertyLocations', () => ({
  listLocationReviewQueue: jest.fn(),
  confirmPropertyLocation: jest.fn(),
  dismissSuburbMismatch: jest.fn(),
}));

jest.mock('@/lib/propertyAddressCorrection', () => ({
  correctPropertyAddress: jest.fn(),
}));

// Leaflet needs a real DOM layout; stand in with a button that "drags" the pin.
jest.mock('next/dynamic', () => () => {
  const MockPropertyPinMap = ({ pin, onPinChange }: { pin: { latitude: number; longitude: number }; onPinChange: (pin: object) => void }) => (
    <button type="button" onClick={() => onPinChange({ latitude: -33.5, longitude: 151.5 })}>
      Drag pin from {pin.latitude},{pin.longitude}
    </button>
  );
  return MockPropertyPinMap;
});

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const CLIFF_ROAD: PropertyReview = {
  propertyKey: 'epping|2121|cliff road|14',
  stops: [
    { id: 's1', address: '14 Cliff Rd, Epping', locationPrecision: 'approximate' },
    { id: 's2', address: '14 Cliff Road, Epping NSW 2121', locationPrecision: 'precise' },
  ],
  approximate: true,
  suburbMismatch: null,
  currentPin: { latitude: -33.7, longitude: 151.0 },
  suggestedPin: { latitude: -33.8, longitude: 151.1, accuracyMeters: 9, recordedAt: '2026-09-20T00:00:00Z' },
};

const PENNANT_STREET: PropertyReview = {
  propertyKey: 'epping|2121|pennant street|3',
  stops: [{ id: 's3', address: '3 Pennant St, Epping', locationPrecision: 'precise' }],
  approximate: false,
  suburbMismatch: { geocodedSuburb: 'Carlingford' },
  currentPin: { latitude: -33.9, longitude: 151.2 },
  suggestedPin: null,
};

describe('Administrator Location review page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listLocationReviewQueue as jest.Mock).mockResolvedValue({ data: [CLIFF_ROAD, PENNANT_STREET] });
    (confirmPropertyLocation as jest.Mock).mockResolvedValue({ ok: true });
    (dismissSuburbMismatch as jest.Mock).mockResolvedValue({ ok: true });
    (correctPropertyAddress as jest.Mock).mockResolvedValue({ ok: true });
  });

  it('lists each Property with why it needs review', async () => {
    render(<AdministratorLocationReviewPage />);

    expect(await screen.findByText('2 Properties to review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /14 Cliff Rd, Epping.*Approximate.*2 Stops/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3 Pennant St, Epping.*Suburb mismatch.*1 Stop/ })).toBeInTheDocument();
  });

  it('accepts the suggested pin, and the Property leaves the queue', async () => {
    render(<AdministratorLocationReviewPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Accept suggested pin' }));

    await waitFor(() =>
      expect(confirmPropertyLocation).toHaveBeenCalledWith(CLIFF_ROAD.propertyKey, { latitude: -33.8, longitude: 151.1 }, 'suggestion')
    );
    expect(await screen.findByText('1 Property to review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /14 Cliff Rd/ })).not.toBeInTheDocument();
  });

  it('confirms a dragged pin', async () => {
    render(<AdministratorLocationReviewPage />);

    // The pin to confirm starts on the suggestion.
    fireEvent.click(await screen.findByRole('button', { name: 'Drag pin from -33.8,151.1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm pin' }));

    await waitFor(() =>
      expect(confirmPropertyLocation).toHaveBeenCalledWith(CLIFF_ROAD.propertyKey, { latitude: -33.5, longitude: 151.5 }, 'manual')
    );
  });

  it('keeps the Property in the queue and shows why when confirming fails', async () => {
    (confirmPropertyLocation as jest.Mock).mockResolvedValue({ ok: false, error: '1 of 2 Stops could not be moved; try again.' });
    render(<AdministratorLocationReviewPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Accept suggested pin' }));

    expect(await screen.findByText('1 of 2 Stops could not be moved; try again.')).toBeInTheDocument();
    expect(screen.getByText('2 Properties to review')).toBeInTheDocument();
  });

  it('dismisses a suburb mismatch', async () => {
    render(<AdministratorLocationReviewPage />);
    fireEvent.click(await screen.findByRole('button', { name: /3 Pennant St/ }));

    expect(screen.getByText('Carlingford')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss flag' }));

    await waitFor(() => expect(dismissSuburbMismatch).toHaveBeenCalledWith(PENNANT_STREET.propertyKey));
    expect(await screen.findByText('1 Property to review')).toBeInTheDocument();
  });

  it('corrects the address on every Stop at the Property, then reloads the queue', async () => {
    render(<AdministratorLocationReviewPage />);
    fireEvent.click(await screen.findByRole('button', { name: /3 Pennant St/ }));

    fireEvent.change(screen.getByLabelText('Corrected address'), { target: { value: '3 Pennant St, Carlingford' } });
    fireEvent.click(screen.getByRole('button', { name: 'Correct address' }));

    await waitFor(() => expect(correctPropertyAddress).toHaveBeenCalledWith(PENNANT_STREET.stops, '3 Pennant St, Carlingford'));
    await waitFor(() => expect(listLocationReviewQueue).toHaveBeenCalledTimes(2));
  });

  it('says so when nothing needs review', async () => {
    (listLocationReviewQueue as jest.Mock).mockResolvedValue({ data: [] });
    render(<AdministratorLocationReviewPage />);

    expect(await screen.findByText(/No Properties need review/)).toBeInTheDocument();
  });
});

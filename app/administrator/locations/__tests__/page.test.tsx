import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdministratorLocationReviewPage from '../page';
import { confirmPropertyLocation, dismissSuburbMismatch, listLocationReviewQueue } from '@/lib/propertyLocations';
import { correctPropertyAddress, locateUnpinnedStops } from '@/lib/propertyAddressCorrection';
import type { PropertyReview } from '@/lib/locationReview';

jest.mock('@/lib/propertyLocations', () => ({
  listLocationReviewQueue: jest.fn(),
  confirmPropertyLocation: jest.fn(),
  dismissSuburbMismatch: jest.fn(),
}));

jest.mock('@/lib/propertyAddressCorrection', () => ({
  correctPropertyAddress: jest.fn(),
  locateUnpinnedStops: jest.fn(),
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

// Stand in for Places autocomplete: a plain input, plus a button that picks a suggestion.
const PICKED = { formattedAddress: '3 Pennant St, Carlingford NSW 2118, Australia', latitude: -33.78, longitude: 151.05 };
jest.mock('@/app/operator/components/AddressAutocompleteInput', () => ({
  AddressAutocompleteInput: ({
    id,
    value,
    onChange,
    onResolved,
  }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    onResolved: (resolved: object | null) => void;
  }) => (
    <>
      <input
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          onResolved(null);
        }}
      />
      <button type="button" onClick={() => onResolved(PICKED)}>
        Pick suggestion
      </button>
    </>
  ),
}));

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
  noPin: false,
  confirmedElsewhere: false,
  suburbMismatch: null,
  currentPin: { latitude: -33.7, longitude: 151.0 },
  suggestedPin: { latitude: -33.8, longitude: 151.1, accuracyMeters: 9, recordedAt: '2026-09-20T00:00:00Z' },
};

const BEECROFT_ROAD: PropertyReview = {
  propertyKey: 'beecroft||beecroft road|2',
  stops: [{ id: 's4', address: '2 Beecroft Rd, Beecroft' }],
  approximate: false,
  noPin: true,
  confirmedElsewhere: false,
  suburbMismatch: null,
  currentPin: null,
  suggestedPin: null,
};

const PENNANT_STREET: PropertyReview = {
  propertyKey: 'epping|2121|pennant street|3',
  stops: [{ id: 's3', address: '3 Pennant St, Epping', locationPrecision: 'precise' }],
  approximate: false,
  noPin: false,
  confirmedElsewhere: false,
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
    (locateUnpinnedStops as jest.Mock).mockResolvedValue({ ok: true });
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

    await waitFor(() => expect(correctPropertyAddress).toHaveBeenCalledWith(PENNANT_STREET.stops, '3 Pennant St, Carlingford', null));
    await waitFor(() => expect(listLocationReviewQueue).toHaveBeenCalledTimes(2));
  });

  it('corrects to an address picked from the suggestions, as picked', async () => {
    render(<AdministratorLocationReviewPage />);
    fireEvent.click(await screen.findByRole('button', { name: /3 Pennant St/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Pick suggestion' }));
    expect(screen.getByLabelText('Corrected address')).toHaveValue(PICKED.formattedAddress);
    fireEvent.click(screen.getByRole('button', { name: 'Correct address' }));

    await waitFor(() =>
      expect(correctPropertyAddress).toHaveBeenCalledWith(PENNANT_STREET.stops, PICKED.formattedAddress, PICKED)
    );
  });

  describe('a Property with a Stop that has no pin (#344)', () => {
    beforeEach(() => {
      (listLocationReviewQueue as jest.Mock).mockResolvedValue({ data: [BEECROFT_ROAD] });
    });

    it('is listed as having no pin, with nothing to confirm yet', async () => {
      render(<AdministratorLocationReviewPage />);

      expect(await screen.findByRole('button', { name: /2 Beecroft Rd.*No pin.*1 Stop/ })).toBeInTheDocument();
      expect(screen.getByText(/1 of 1 Stop here has no map pin/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirm pin' })).not.toBeInTheDocument();
    });

    it('finds its Stops on the map, then reloads the queue', async () => {
      render(<AdministratorLocationReviewPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Find on map' }));

      await waitFor(() => expect(locateUnpinnedStops).toHaveBeenCalledWith(BEECROFT_ROAD.stops));
      await waitFor(() => expect(listLocationReviewQueue).toHaveBeenCalledTimes(2));
    });

    it("says so when they still can't be found", async () => {
      (locateUnpinnedStops as jest.Mock).mockResolvedValue({ ok: false, error: "1 of 1 Stops still couldn't be found on the map." });
      render(<AdministratorLocationReviewPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Find on map' }));

      expect(await screen.findByText("1 of 1 Stops still couldn't be found on the map.")).toBeInTheDocument();
    });

    it('can have its address corrected', async () => {
      render(<AdministratorLocationReviewPage />);

      fireEvent.change(await screen.findByLabelText('Corrected address'), { target: { value: '2 Beecroft Rd, Beecroft NSW 2119' } });
      fireEvent.click(screen.getByRole('button', { name: 'Correct address' }));

      await waitFor(() =>
        expect(correctPropertyAddress).toHaveBeenCalledWith(BEECROFT_ROAD.stops, '2 Beecroft Rd, Beecroft NSW 2119', null)
      );
    });

    it('stays in the queue when a suburb mismatch at it is dismissed', async () => {
      (listLocationReviewQueue as jest.Mock).mockResolvedValue({
        data: [{ ...BEECROFT_ROAD, suburbMismatch: { geocodedSuburb: 'Pennant Hills' } }],
      });
      render(<AdministratorLocationReviewPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Dismiss flag' }));

      await waitFor(() => expect(dismissSuburbMismatch).toHaveBeenCalled());
      expect(await screen.findByText('1 Property to review')).toBeInTheDocument();
      expect(screen.queryByText('Pennant Hills')).not.toBeInTheDocument();
    });
  });

  it('lists a Property whose Stop kept a pin Confirmed for its old address, and says why', async () => {
    (listLocationReviewQueue as jest.Mock).mockResolvedValue({
      data: [{ ...PENNANT_STREET, suburbMismatch: null, confirmedElsewhere: true }],
    });
    render(<AdministratorLocationReviewPage />);

    expect(
      await screen.findByRole('button', { name: /3 Pennant St.*Confirmed pin from another address.*1 Stop/ })
    ).toBeInTheDocument();
    expect(screen.getByText(/still has the pin that was Confirmed for its old address/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm pin' })).toBeInTheDocument();
  });

  it('says so when nothing needs review', async () => {
    (listLocationReviewQueue as jest.Mock).mockResolvedValue({ data: [] });
    render(<AdministratorLocationReviewPage />);

    expect(await screen.findByText(/No Properties need review/)).toBeInTheDocument();
  });
});

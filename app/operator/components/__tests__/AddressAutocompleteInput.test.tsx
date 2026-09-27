import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddressAutocompleteInput } from '../AddressAutocompleteInput';
import { geocodePlaceId } from '@/lib/googleMaps';

jest.mock('@/lib/googleMaps', () => ({
  geocodePlaceId: jest.fn(),
}));

const GEOCODED = {
  formattedAddress: '12 Smith St, Fitzroy VIC 3065, Australia',
  latitude: -37.8,
  longitude: 144.98,
  locationPrecision: 'interpolated',
  locationType: 'RANGE_INTERPOLATED',
  resultTypes: ['street_address'],
  partialMatch: false,
  addressComponents: { streetNumber: '12', street: 'Smith Street', suburb: 'Fitzroy', postcode: '3065' },
};

describe('AddressAutocompleteInput', () => {
  const originalEnv = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [{ placePrediction: { placeId: 'place-123', text: { text: '12 Smith St, Fitzroy VIC' } } }],
      }),
    }) as unknown as typeof fetch;
    (geocodePlaceId as jest.Mock).mockReset();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalEnv;
    global.fetch = originalFetch;
  });

  function Harness({ onResolved }: { onResolved: jest.Mock }) {
    const [value, setValue] = React.useState('');
    return <AddressAutocompleteInput id="address" value={value} onChange={setValue} onResolved={onResolved} />;
  }

  it('geocodes a picked suggestion by place ID so it carries its Location Precision (#283)', async () => {
    (geocodePlaceId as jest.Mock).mockResolvedValue(GEOCODED);
    const onResolved = jest.fn();
    render(<Harness onResolved={onResolved} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '12 Smith' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: '12 Smith St, Fitzroy VIC' }));

    await waitFor(() => expect(onResolved).toHaveBeenLastCalledWith(GEOCODED));
    expect(geocodePlaceId).toHaveBeenCalledWith('place-123');
  });

  it('resolves nothing and shows the error when the place cannot be geocoded', async () => {
    (geocodePlaceId as jest.Mock).mockRejectedValue(new Error('Address could not be validated. ZERO_RESULTS'));
    const onResolved = jest.fn();
    render(<Harness onResolved={onResolved} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '12 Smith' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: '12 Smith St, Fitzroy VIC' }));

    expect(await screen.findByText(/ZERO_RESULTS/)).toBeInTheDocument();
    expect(onResolved).toHaveBeenLastCalledWith(null);
  });
});

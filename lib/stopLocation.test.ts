import { locateDraftStops, locateEditedStop, locateNewStop } from './stopLocation';
import { geocodeAddress } from './googleMaps';
import { stopLocationFields, type GeocodedLocation } from './locationPrecision';
import { getConfirmedPin } from './propertyLocations';

jest.mock('./googleMaps', () => ({
  geocodeAddress: jest.fn(),
}));

jest.mock('./propertyLocations', () => ({
  getConfirmedPin: jest.fn(),
}));

const PICKED: GeocodedLocation = {
  formattedAddress: '12 Smith St, Fitzroy VIC 3065, Australia',
  latitude: -37.8,
  longitude: 144.98,
  locationPrecision: 'precise',
  locationType: 'ROOFTOP',
  resultTypes: ['street_address'],
  partialMatch: false,
  addressComponents: { streetNumber: '12', street: 'Smith Street', suburb: 'Fitzroy', postcode: '3065' },
};

const GEOCODED: GeocodedLocation = {
  ...PICKED,
  formattedAddress: '14 Smith St, Fitzroy VIC 3065, Australia',
  latitude: -37.81,
  locationPrecision: 'approximate',
  locationType: 'GEOMETRIC_CENTER',
  addressComponents: { streetNumber: '14', street: 'Smith Street', suburb: 'Fitzroy', postcode: '3065' },
};

/** What a Stop located by this geocode should get. */
function locatedBy(geocoded: GeocodedLocation) {
  return { fields: stopLocationFields(geocoded), pinned: true };
}

let consoleWarn: jest.SpyInstance;

beforeEach(() => {
  (geocodeAddress as jest.Mock).mockReset().mockResolvedValue(GEOCODED);
  (getConfirmedPin as jest.Mock).mockReset().mockResolvedValue(null);
  consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => consoleWarn.mockRestore());

describe('locateNewStop', () => {
  it('uses the autocomplete pick without geocoding again', async () => {
    await expect(locateNewStop({ address: '12 Smith St', resolvedLocation: PICKED })).resolves.toEqual(locatedBy(PICKED));
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it('geocodes a typed address, recording its precision and address components', async () => {
    await expect(locateNewStop({ address: '14 Smith St' })).resolves.toEqual(locatedBy(GEOCODED));
    expect(geocodeAddress).toHaveBeenCalledWith('14 Smith St');
  });

  it("locates a Stop whose address can't be geocoded as having no pin", async () => {
    (geocodeAddress as jest.Mock).mockRejectedValue(new Error('ZERO_RESULTS'));

    await expect(locateNewStop({ address: '14 Smith St' })).resolves.toEqual({ fields: {}, pinned: false });
  });
});

describe('locateEditedStop', () => {
  const located = { address: '12 Smith St', latitude: -37.8, longitude: 144.98, locationPrecision: 'precise' };

  it('changes nothing about the location when the address is unchanged (#58)', async () => {
    await expect(locateEditedStop(located, { address: ' 12 Smith St ' })).resolves.toEqual({ fields: {}, pinned: true });
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it('re-geocodes a changed address', async () => {
    await expect(locateEditedStop(located, { address: '14 Smith St' })).resolves.toEqual(locatedBy(GEOCODED));
  });

  it('geocodes an unchanged address that never had coordinates', async () => {
    await expect(locateEditedStop({ address: '14 Smith St' }, { address: '14 Smith St' })).resolves.toEqual(
      locatedBy(GEOCODED)
    );
  });

  it('applies a new autocomplete pick', async () => {
    await expect(locateEditedStop(located, { address: '12 Smith St', resolvedLocation: PICKED })).resolves.toEqual(
      locatedBy(PICKED)
    );
  });

  it("doesn't keep a Confirmed Stop's pin once it's saved at a Property that isn't Confirmed", async () => {
    const confirmed = { ...located, locationPrecision: 'confirmed' };

    await expect(locateEditedStop(confirmed, { address: '14 Smith St' })).resolves.toEqual(locatedBy(GEOCODED));
    await expect(locateEditedStop(confirmed, { address: '12 Smith St', resolvedLocation: PICKED })).resolves.toEqual(
      locatedBy(PICKED)
    );
  });

  describe("when the new address can't be geocoded", () => {
    beforeEach(() => {
      (geocodeAddress as jest.Mock).mockRejectedValue(new Error('ZERO_RESULTS'));
    });

    it("clears the old address's pin, precision and address components", async () => {
      const { fields, pinned } = await locateEditedStop(located, { address: '14 Smith St' });

      expect(pinned).toBe(false);
      expect(fields).toMatchObject({
        latitude: null,
        longitude: null,
        formattedAddress: null,
        locationPrecision: null,
        addressStreetNumber: null,
        addressSuburb: null,
      });
    });

    it("clears a Confirmed Stop's pin too: it was Confirmed for the old address", async () => {
      const { fields, pinned } = await locateEditedStop({ ...located, locationPrecision: 'confirmed' }, { address: '14 Smith St' });

      expect(pinned).toBe(false);
      expect(fields).toMatchObject({ latitude: null, longitude: null, locationPrecision: null });
    });

    it('changes nothing for an unchanged address that never had coordinates', async () => {
      await expect(locateEditedStop({ address: '14 Smith St' }, { address: '14 Smith St' })).resolves.toEqual({
        fields: {},
        pinned: false,
      });
    });
  });
});

describe('a Confirmed Property (#286)', () => {
  const CONFIRMED_PIN = { latitude: -37.9, longitude: 145.0 };

  beforeEach(() => {
    (getConfirmedPin as jest.Mock).mockResolvedValue(CONFIRMED_PIN);
  });

  it("gives a new Stop at the address the Property's Confirmed pin, not the geocode", async () => {
    const { fields, pinned } = await locateNewStop({ address: '14 Smith St, Fitzroy VIC 3065' });

    expect(getConfirmedPin).toHaveBeenCalledWith('fitzroy|3065|smith street|14');
    expect(fields).toMatchObject({ ...CONFIRMED_PIN, locationPrecision: 'confirmed' });
    expect(pinned).toBe(true);
  });

  it('looks the Property up by its geocoded components, as the write keys it', async () => {
    await locateNewStop({ address: '14 Smith St, Fitzroy' });

    expect(getConfirmedPin).toHaveBeenCalledWith('fitzroy|3065|smith street|14');
  });

  it('gives an edited Stop moved to the address the Confirmed pin too', async () => {
    const located = { address: '12 Smith St', latitude: -37.8, longitude: 144.98, locationPrecision: 'precise' };

    await expect(locateEditedStop(located, { address: '14 Smith St, Fitzroy' })).resolves.toMatchObject({
      fields: { ...CONFIRMED_PIN, locationPrecision: 'confirmed' },
      pinned: true,
    });
  });

  it("pins a Stop whose address can't be geocoded, by its entered address", async () => {
    (geocodeAddress as jest.Mock).mockRejectedValue(new Error('ZERO_RESULTS'));

    await expect(locateNewStop({ address: '14 Smith St, Fitzroy VIC 3065' })).resolves.toEqual({
      fields: { ...CONFIRMED_PIN, locationPrecision: 'confirmed' },
      pinned: true,
    });
    expect(getConfirmedPin).toHaveBeenCalledWith('fitzroy|3065|smith street|14');
  });

  it("doesn't look up a Stop with no Property key", async () => {
    (geocodeAddress as jest.Mock).mockResolvedValue({ formattedAddress: 'x', latitude: 1, longitude: 2 });

    await expect(locateNewStop({ address: 'Smith St' })).resolves.toMatchObject({ fields: { latitude: 1, longitude: 2 } });
    expect(getConfirmedPin).not.toHaveBeenCalled();
  });

  it('fails the write when the lookup fails', async () => {
    (getConfirmedPin as jest.Mock).mockRejectedValue(new Error('offline'));

    await expect(locateNewStop({ address: '14 Smith St, Fitzroy' })).rejects.toThrow('offline');
  });
});

describe('locateDraftStops (#343)', () => {
  const drafts = [
    { address: '12 Smith St, Epping', serviceType: 'delivery' as const },
    { address: '9 Lost Rd, Eastwood', serviceType: 'delivery' as const },
    { address: '14 Smith St, Epping', serviceType: 'pickup' as const },
  ];

  beforeEach(() => {
    (geocodeAddress as jest.Mock).mockImplementation(async (address: string) => {
      if (address.includes('Lost') || address === 'Nowhere') throw new Error('ZERO_RESULTS');
      return address === '12 Smith St, Epping' ? PICKED : GEOCODED;
    });
  });

  it('locates each draft in order as a hand-added Stop would be, keeping its details', async () => {
    const { stops, unpinned, leftOut } = await locateDraftStops(drafts, undefined, 0);

    expect(stops).toEqual([
      { ...drafts[0], ...stopLocationFields(PICKED) },
      drafts[1],
      { ...drafts[2], ...stopLocationFields(GEOCODED) },
    ]);
    expect(unpinned).toBe(1);
    expect(leftOut).toEqual([]);
    expect((geocodeAddress as jest.Mock).mock.calls.map(([address]) => address)).toEqual([
      '12 Smith St, Epping',
      '9 Lost Rd, Eastwood',
      '14 Smith St, Epping',
    ]);
  });

  it("leaves out a draft with no suburb that couldn't be found on the map, which would have no Property", async () => {
    const { stops, unpinned, leftOut } = await locateDraftStops(
      [drafts[0], { address: 'Nowhere', serviceType: 'delivery' as const }],
      undefined,
      0
    );

    expect(stops).toEqual([{ ...drafts[0], ...stopLocationFields(PICKED) }]);
    expect(unpinned).toBe(0);
    expect(leftOut).toEqual(['Nowhere']);
  });

  it("applies a Property's Confirmed pin", async () => {
    (getConfirmedPin as jest.Mock).mockResolvedValue({ latitude: -37.9, longitude: 145.0 });

    const { stops } = await locateDraftStops([drafts[2]], undefined, 0);

    expect(stops[0]).toMatchObject({ latitude: -37.9, longitude: 145.0, locationPrecision: 'confirmed' });
  });

  it("leaves a draft without a pin when its Confirmed-pin lookup fails, and carries on", async () => {
    (getConfirmedPin as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    const { stops, unpinned } = await locateDraftStops([drafts[0], drafts[2]], undefined, 0);

    expect(stops[0]).toEqual(drafts[0]);
    expect(stops[1]).toMatchObject({ latitude: GEOCODED.latitude });
    expect(unpinned).toBe(1);
  });

  it('reports progress after each draft', async () => {
    const onProgress = jest.fn();

    await locateDraftStops(drafts, onProgress, 0);

    expect(onProgress.mock.calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('spaces out geocodes to stay under the Maps rate limit', async () => {
    jest.useFakeTimers();
    try {
      const done = locateDraftStops([drafts[0], drafts[2]], undefined, 200);
      await jest.advanceTimersByTimeAsync(0);
      expect(geocodeAddress).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(200);
      await done;
      expect(geocodeAddress).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

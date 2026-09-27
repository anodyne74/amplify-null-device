import { correctPropertyAddress } from './propertyAddressCorrection';
import { geocodeAddress } from './googleMaps';
import { locateEditedStop } from './stopLocation';
import { updateStop } from './routes';

jest.mock('./googleMaps', () => ({ geocodeAddress: jest.fn() }));
jest.mock('./stopLocation', () => ({ locateEditedStop: jest.fn() }));
jest.mock('./routes', () => ({ updateStop: jest.fn() }));

const GEOCODED = { formattedAddress: '14 Cliff Rd, Epping NSW 2121, Australia', latitude: -33.77, longitude: 151.08 };
const STOPS = [
  { id: 's1', address: '14 Cliff Rd, Carlingford', locationPrecision: 'approximate' },
  { id: 's2', address: '14 Cliff Road, Carlingford', locationPrecision: 'confirmed' },
];

beforeEach(() => {
  jest.clearAllMocks();
  (geocodeAddress as jest.Mock).mockResolvedValue(GEOCODED);
  (locateEditedStop as jest.Mock).mockImplementation(async (stop) => ({ propertyKey: `key-for-${stop.id}` }));
  (updateStop as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
});

describe('correctPropertyAddress', () => {
  it('geocodes the corrected address once and re-locates every Stop at the Property with it', async () => {
    await expect(correctPropertyAddress(STOPS, ' 14 Cliff Rd, Epping NSW 2121 ')).resolves.toEqual({ ok: true });

    expect(geocodeAddress).toHaveBeenCalledTimes(1);
    for (const stop of STOPS) {
      expect(locateEditedStop).toHaveBeenCalledWith(stop, { address: '14 Cliff Rd, Epping NSW 2121', resolvedLocation: GEOCODED });
    }
    expect(updateStop).toHaveBeenCalledWith({ id: 's1', address: '14 Cliff Rd, Epping NSW 2121', propertyKey: 'key-for-s1' });
    expect(updateStop).toHaveBeenCalledWith({ id: 's2', address: '14 Cliff Rd, Epping NSW 2121', propertyKey: 'key-for-s2' });
  });

  it('reports an address the geocoder cannot find, changing nothing', async () => {
    (geocodeAddress as jest.Mock).mockRejectedValue(new Error('Address could not be validated.'));

    await expect(correctPropertyAddress(STOPS, 'nowhere')).resolves.toEqual({ ok: false, error: 'Address could not be validated.' });
    expect(updateStop).not.toHaveBeenCalled();
  });

  it('reports Stops that could not be updated', async () => {
    (updateStop as jest.Mock).mockResolvedValueOnce({ data: null, errors: [new Error('nope')] });

    await expect(correctPropertyAddress(STOPS, '14 Cliff Rd, Epping')).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('1 of 2'),
    });
  });

  it('refuses a blank address', async () => {
    await expect(correctPropertyAddress(STOPS, '  ')).resolves.toEqual({ ok: false, error: expect.any(String) });
    expect(geocodeAddress).not.toHaveBeenCalled();
  });
});

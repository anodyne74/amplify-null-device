import { resolveHomeBasePin } from './operatorHomeBase';

const geocode = jest.fn();

beforeEach(() => geocode.mockReset());

describe('resolveHomeBasePin', () => {
  it('geocodes a new home base and returns its pin', async () => {
    geocode.mockResolvedValue({ latitude: -33.8, longitude: 151.1 });

    const result = await resolveHomeBasePin({ text: ' 1 Main St, Ryde ', saved: { text: '', pin: null } }, geocode);

    expect(geocode).toHaveBeenCalledWith('1 Main St, Ryde');
    expect(result).toEqual({ pin: { latitude: -33.8, longitude: 151.1 } });
  });

  it('re-geocodes when the text has changed', async () => {
    geocode.mockResolvedValue({ latitude: 1, longitude: 2 });

    const result = await resolveHomeBasePin(
      { text: 'Epping', saved: { text: 'Ryde', pin: { latitude: -33.8, longitude: 151.1 } } },
      geocode
    );

    expect(result.pin).toEqual({ latitude: 1, longitude: 2 });
  });

  it('keeps the saved pin when the text is unchanged', async () => {
    const pin = { latitude: -33.8, longitude: 151.1 };

    const result = await resolveHomeBasePin({ text: 'Ryde', saved: { text: 'Ryde', pin } }, geocode);

    expect(geocode).not.toHaveBeenCalled();
    expect(result).toEqual({ pin });
  });

  it('geocodes unchanged text when there is no pin yet (existing Operators)', async () => {
    geocode.mockResolvedValue({ latitude: 1, longitude: 2 });

    const result = await resolveHomeBasePin({ text: 'Ryde', saved: { text: 'Ryde', pin: null } }, geocode);

    expect(result.pin).toEqual({ latitude: 1, longitude: 2 });
  });

  it('clears the pin when the text is cleared', async () => {
    const result = await resolveHomeBasePin(
      { text: '  ', saved: { text: 'Ryde', pin: { latitude: 1, longitude: 2 } } },
      geocode
    );

    expect(geocode).not.toHaveBeenCalled();
    expect(result).toEqual({ pin: null });
  });

  it('returns no pin and a warning when the geocode fails', async () => {
    geocode.mockRejectedValue(new Error('ZERO_RESULTS'));

    const result = await resolveHomeBasePin(
      { text: 'Nowhere', saved: { text: 'Ryde', pin: { latitude: 1, longitude: 2 } } },
      geocode
    );

    expect(result.pin).toBeNull();
    expect(result.warning).toMatch(/couldn't find/i);
  });
});

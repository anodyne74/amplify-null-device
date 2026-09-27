import { readDevicePosition, recordPlacementPosition } from './placementPosition';
import { updateStopExecution } from './routes';

jest.mock('./routes', () => ({
  updateStopExecution: jest.fn(),
}));

function geolocationReturning(
  outcome: { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number } | { code: number }
): Geolocation {
  return {
    getCurrentPosition: jest.fn((onSuccess, onError) => {
      if ('coords' in outcome) onSuccess(outcome as GeolocationPosition);
      else onError?.(outcome as GeolocationPositionError);
    }),
    watchPosition: jest.fn(),
    clearWatch: jest.fn(),
  } as unknown as Geolocation;
}

const FIX = { coords: { latitude: -37.8, longitude: 144.98, accuracy: 12.4 }, timestamp: Date.parse('2026-09-27T01:00:00Z') };

describe('readDevicePosition', () => {
  it('reads the position, accuracy and fix time', async () => {
    await expect(readDevicePosition(geolocationReturning(FIX))).resolves.toEqual({
      placedLatitude: -37.8,
      placedLongitude: 144.98,
      placedAccuracyMeters: 12.4,
      placedPositionAt: '2026-09-27T01:00:00.000Z',
    });
  });

  it('resolves null when permission is denied or the fix fails', async () => {
    await expect(readDevicePosition(geolocationReturning({ code: 1 }))).resolves.toBeNull();
  });

  it('resolves null when the device has no geolocation', async () => {
    await expect(readDevicePosition(undefined)).resolves.toBeNull();
  });

  it('resolves null rather than waiting forever for a fix', async () => {
    jest.useFakeTimers();
    const silent = { getCurrentPosition: jest.fn() } as unknown as Geolocation;
    const read = readDevicePosition(silent, 5000);
    jest.advanceTimersByTime(5000);
    await expect(read).resolves.toBeNull();
    jest.useRealTimers();
  });
});

describe('recordPlacementPosition', () => {
  beforeEach(() => {
    (updateStopExecution as jest.Mock).mockReset().mockResolvedValue({ data: {}, errors: undefined });
  });

  it('saves the position on the Stop and returns what it saved', async () => {
    const fields = await recordPlacementPosition('stop-1', geolocationReturning(FIX));

    expect(updateStopExecution).toHaveBeenCalledWith('stop-1', fields);
    expect(fields).toMatchObject({ placedLatitude: -37.8, placedLongitude: 144.98 });
  });

  it('never touches the Stop map pin', async () => {
    await recordPlacementPosition('stop-1', geolocationReturning(FIX));

    const written = (updateStopExecution as jest.Mock).mock.calls[0][1];
    expect(written).not.toHaveProperty('latitude');
    expect(written).not.toHaveProperty('longitude');
  });

  it('writes nothing without a position', async () => {
    await expect(recordPlacementPosition('stop-1', geolocationReturning({ code: 1 }))).resolves.toBeNull();
    expect(updateStopExecution).not.toHaveBeenCalled();
  });

  it('resolves null, never throws, when the write fails', async () => {
    (updateStopExecution as jest.Mock).mockResolvedValue({ data: null, errors: [new Error('boom')] });
    await expect(recordPlacementPosition('stop-1', geolocationReturning(FIX))).resolves.toBeNull();

    (updateStopExecution as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(recordPlacementPosition('stop-1', geolocationReturning(FIX))).resolves.toBeNull();
  });
});

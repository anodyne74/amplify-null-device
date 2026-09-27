const mockStopList = jest.fn();
const mockStopUpdate = jest.fn();
const mockListStopsByPropertyKey = jest.fn();
const mockPropertyLocationGet = jest.fn();
const mockPropertyLocationList = jest.fn();
const mockPropertyLocationCreate = jest.fn();
const mockPropertyLocationUpdate = jest.fn();
const mockAuditLogCreate = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Stop: { list: mockStopList, update: mockStopUpdate, listStopsByPropertyKey: mockListStopsByPropertyKey },
      PropertyLocation: {
        get: mockPropertyLocationGet,
        list: mockPropertyLocationList,
        create: mockPropertyLocationCreate,
        update: mockPropertyLocationUpdate,
      },
      AuditLog: { create: mockAuditLogCreate },
    },
  }),
}));

jest.mock('./amplify-config', () => ({
  configureAmplify: jest.fn(),
  fetchUserId: jest.fn().mockResolvedValue('admin-sub'),
}));

import {
  confirmPropertyLocation,
  dismissSuburbMismatch,
  getConfirmedPin,
  listLocationReviewQueue,
} from './propertyLocations';

const KEY = 'epping|2121|cliff road|14';
const PIN = { latitude: -33.77, longitude: 151.08 };

beforeEach(() => {
  jest.clearAllMocks();
  mockPropertyLocationGet.mockResolvedValue({ data: null });
  mockPropertyLocationCreate.mockResolvedValue({ data: {} });
  mockPropertyLocationUpdate.mockResolvedValue({ data: {} });
  mockStopUpdate.mockResolvedValue({ data: {} });
  mockAuditLogCreate.mockResolvedValue({ data: {} });
  mockListStopsByPropertyKey.mockResolvedValue({ data: [{ id: 's1' }, { id: 's2' }], nextToken: null });
});

describe('getConfirmedPin', () => {
  it("returns a Confirmed Property's pin", async () => {
    mockPropertyLocationGet.mockResolvedValue({ data: { propertyKey: KEY, ...PIN, confirmedAt: '2026-09-27T00:00:00Z' } });

    await expect(getConfirmedPin(KEY)).resolves.toEqual(PIN);
    expect(mockPropertyLocationGet).toHaveBeenCalledWith({ propertyKey: KEY });
  });

  it('returns null for a Property never confirmed, or only dismissed', async () => {
    await expect(getConfirmedPin(KEY)).resolves.toBeNull();

    mockPropertyLocationGet.mockResolvedValue({ data: { propertyKey: KEY, suburbMismatchDismissedAt: '2026-09-27T00:00:00Z' } });
    await expect(getConfirmedPin(KEY)).resolves.toBeNull();
  });

  it('throws when the lookup fails, so a Stop is never written with a pin that ignores a confirmation', async () => {
    mockPropertyLocationGet.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });

    await expect(getConfirmedPin(KEY)).rejects.toThrow('boom');
  });
});

describe('confirmPropertyLocation', () => {
  it('moves every Stop at the Property, including other pages of them, to the Confirmed pin', async () => {
    mockListStopsByPropertyKey
      .mockResolvedValueOnce({ data: [{ id: 's1' }], nextToken: 't' })
      .mockResolvedValueOnce({ data: [{ id: 's2' }], nextToken: null });

    await expect(confirmPropertyLocation(KEY, PIN, 'suggestion')).resolves.toEqual({ ok: true });

    expect(mockListStopsByPropertyKey).toHaveBeenLastCalledWith({ propertyKey: KEY }, expect.objectContaining({ nextToken: 't' }));
    expect(mockStopUpdate).toHaveBeenCalledWith({ id: 's1', ...PIN, locationPrecision: 'confirmed' });
    expect(mockStopUpdate).toHaveBeenCalledWith({ id: 's2', ...PIN, locationPrecision: 'confirmed' });
  });

  it('records the Confirmed pin on the Property, so it leaves the queue and new Stops use it', async () => {
    await confirmPropertyLocation(KEY, PIN, 'manual');

    expect(mockPropertyLocationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ propertyKey: KEY, ...PIN, confirmedBy: 'admin-sub', confirmedAt: expect.any(String) })
    );
  });

  it('updates an existing PropertyLocation rather than creating a second', async () => {
    mockPropertyLocationGet.mockResolvedValue({ data: { propertyKey: KEY, suburbMismatchDismissedAt: '2026-09-01T00:00:00Z' } });

    await confirmPropertyLocation(KEY, PIN, 'manual');

    expect(mockPropertyLocationCreate).not.toHaveBeenCalled();
    expect(mockPropertyLocationUpdate).toHaveBeenCalledWith(expect.objectContaining({ propertyKey: KEY, ...PIN }));
  });

  it('writes one AuditLog entry for the confirmation', async () => {
    await confirmPropertyLocation(KEY, PIN, 'suggestion');

    expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditLogCreate.mock.calls[0][0];
    expect(entry).toMatchObject({
      operatorId: 'admin-sub',
      eventType: 'data_modification',
      resourceType: 'property',
      resourceId: KEY,
      action: 'property.confirm_location',
      status: 'success',
    });
    expect(JSON.parse(entry.details)).toEqual({ propertyKey: KEY, ...PIN, source: 'suggestion', stopIds: ['s1', 's2'] });
  });

  it("doesn't mark the Property Confirmed when a Stop couldn't be moved, so it stays in the queue to retry", async () => {
    mockStopUpdate.mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: null, errors: [{ message: 'nope' }] });

    await expect(confirmPropertyLocation(KEY, PIN, 'manual')).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('1 of 2'),
    });
    expect(mockPropertyLocationCreate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failure' }));
  });

  it('reports a confirmation whose audit entry could not be written', async () => {
    mockAuditLogCreate.mockResolvedValue({ data: null, errors: [{ message: 'audit down' }] });

    await expect(confirmPropertyLocation(KEY, PIN, 'manual')).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('audit'),
    });
  });
});

describe('dismissSuburbMismatch', () => {
  it('records the dismissal on the Property', async () => {
    await expect(dismissSuburbMismatch(KEY)).resolves.toEqual({ ok: true });

    expect(mockPropertyLocationCreate).toHaveBeenCalledWith({
      propertyKey: KEY,
      suburbMismatchDismissedAt: expect.any(String),
      suburbMismatchDismissedBy: 'admin-sub',
    });
  });
});

describe('listLocationReviewQueue', () => {
  it('builds the queue from every Stop and every Property decision', async () => {
    mockStopList.mockResolvedValue({
      data: [{ id: 's1', address: '14 Cliff Rd, Epping', locationPrecision: 'approximate', propertyKey: KEY }],
      nextToken: null,
    });
    mockPropertyLocationList.mockResolvedValue({ data: [], nextToken: null });

    const { data, error } = await listLocationReviewQueue();

    expect(error).toBeUndefined();
    expect(data.map((review) => review.propertyKey)).toEqual([KEY]);
  });

  it("reports an error rather than a short queue when Stops can't all be read", async () => {
    mockStopList.mockResolvedValue({ data: [], errors: [{ message: 'boom' }], nextToken: null });
    mockPropertyLocationList.mockResolvedValue({ data: [], nextToken: null });

    await expect(listLocationReviewQueue()).resolves.toEqual({ data: [], error: expect.any(String) });
  });
});

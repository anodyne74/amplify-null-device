// Mock the Amplify client BEFORE importing lib/queries
const mockOrganizationSettingsGet = jest.fn();
const mockOrganizationSettingsCreate = jest.fn();
const mockOrganizationSettingsUpdate = jest.fn();
const mockRateLineList = jest.fn();
const mockRateLineDelete = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      OrganizationSettings: {
        get: mockOrganizationSettingsGet,
        create: mockOrganizationSettingsCreate,
        update: mockOrganizationSettingsUpdate,
      },
      RateLine: {
        list: mockRateLineList,
        delete: mockRateLineDelete,
      },
    },
  }),
}));

import { getOrganizationSettings, upsertOrganizationSettings } from './OrganizationSettings';
import { listRateLines } from './ListRateLines';
import { deleteRateLine } from './DeleteRateLine';

describe('lib/queries', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('getOrganizationSettings', () => {
    it('returns the singleton row', async () => {
      mockOrganizationSettingsGet.mockResolvedValue({ data: { id: 'organization', companyName: 'Null Device' } });

      await expect(getOrganizationSettings()).resolves.toEqual({ id: 'organization', companyName: 'Null Device' });
    });

    it('returns null when nothing has been saved yet', async () => {
      mockOrganizationSettingsGet.mockResolvedValue({ data: null });

      await expect(getOrganizationSettings()).resolves.toBeNull();
    });

    it('throws a DataError when the read fails', async () => {
      mockOrganizationSettingsGet.mockResolvedValue({ data: null, errors: [{ message: 'denied' }] });

      await expect(getOrganizationSettings()).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to load pay-to details.',
      });
    });
  });

  describe('upsertOrganizationSettings', () => {
    it('creates the singleton when there is none', async () => {
      mockOrganizationSettingsGet.mockResolvedValue({ data: null });
      mockOrganizationSettingsCreate.mockResolvedValue({ data: { id: 'organization', bsb: '000-000' } });

      await expect(upsertOrganizationSettings({ bsb: '000-000' })).resolves.toEqual({ id: 'organization', bsb: '000-000' });
      expect(mockOrganizationSettingsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'organization', bsb: '000-000' })
      );
      expect(mockOrganizationSettingsUpdate).not.toHaveBeenCalled();
    });

    it('updates the singleton when it exists', async () => {
      mockOrganizationSettingsGet.mockResolvedValue({ data: { id: 'organization' } });
      mockOrganizationSettingsUpdate.mockResolvedValue({ data: { id: 'organization', bsb: '000-000' } });

      await upsertOrganizationSettings({ bsb: '000-000' });

      expect(mockOrganizationSettingsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'organization', bsb: '000-000' })
      );
      expect(mockOrganizationSettingsCreate).not.toHaveBeenCalled();
    });

    it('fails with the save message, not the load message, when the existing row cannot be read', async () => {
      mockOrganizationSettingsGet.mockResolvedValue({ data: null, errors: [{ message: 'denied' }] });

      await expect(upsertOrganizationSettings({ bsb: '000-000' })).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to save pay-to details.',
      });
      expect(mockOrganizationSettingsCreate).not.toHaveBeenCalled();
    });
  });

  describe('listRateLines', () => {
    it('returns the lines ordered by sortOrder', async () => {
      mockRateLineList.mockResolvedValue({
        data: [
          { id: 'b', sortOrder: 1 },
          { id: 'a', sortOrder: 0 },
        ],
      });

      const lines = await listRateLines('cust-1');

      expect(lines.map((line) => line.id)).toEqual(['a', 'b']);
    });

    it('throws a DataError when the read fails', async () => {
      mockRateLineList.mockResolvedValue({ data: [], errors: [{ message: 'denied' }] });

      await expect(listRateLines('cust-1')).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to load rate lines.',
      });
    });
  });

  describe('deleteRateLine', () => {
    it('resolves with nothing', async () => {
      mockRateLineDelete.mockResolvedValue({ data: { id: 'line-1' } });

      await expect(deleteRateLine('line-1')).resolves.toBeUndefined();
    });

    it('throws a DataError when the delete fails', async () => {
      mockRateLineDelete.mockResolvedValue({ data: null, errors: [{ message: 'denied' }] });

      await expect(deleteRateLine('line-1')).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to remove rate line.',
      });
    });
  });
});

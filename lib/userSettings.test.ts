// Mock the Amplify client BEFORE importing lib/userSettings
const mockUserSettingsList = jest.fn();
const mockUserSettingsCreate = jest.fn();
const mockUserSettingsUpdate = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      UserSettings: {
        list: mockUserSettingsList,
        create: mockUserSettingsCreate,
        update: mockUserSettingsUpdate,
      },
    },
  }),
}));

import {
  getUserSettings,
  upsertUserSettings,
} from './userSettings';
import { DataError } from './graphqlResult';

describe('userSettings', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('getUserSettings', () => {
    it('should return first settings row for the user', async () => {
      mockUserSettingsList.mockResolvedValue({
        data: [
          { id: 'settings-1', userSub: 'user-1', defaultTheme: 'dark' },
          { id: 'settings-2', userSub: 'user-1', defaultTheme: 'light' },
        ],
        errors: undefined,
      });

      const result = await getUserSettings('user-1');

      expect(mockUserSettingsList).toHaveBeenCalledWith({
        filter: { userSub: { eq: 'user-1' } },
        limit: 1000,
        nextToken: undefined,
      });
      expect(result).toEqual({ id: 'settings-1', userSub: 'user-1', defaultTheme: 'dark' });
    });

    it('returns null when the user has no saved settings', async () => {
      mockUserSettingsList.mockResolvedValue({ data: [], errors: undefined });

      await expect(getUserSettings('user-1')).resolves.toBeNull();
    });

    it('throws a DataError when the list fails', async () => {
      mockUserSettingsList.mockRejectedValue(new Error('settings failure'));

      await expect(getUserSettings('user-1')).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to load settings.',
      });
    });
  });

  describe('upsertUserSettings', () => {
    it('should update settings when an existing row is found', async () => {
      mockUserSettingsList.mockResolvedValue({
        data: [{ id: 'settings-1', userSub: 'user-1' }],
        errors: undefined,
      });
      mockUserSettingsUpdate.mockResolvedValue({ data: { id: 'settings-1' }, errors: undefined });

      const result = await upsertUserSettings('user-1', { defaultTheme: 'dark' });

      expect(mockUserSettingsUpdate).toHaveBeenCalled();
      expect(result).toEqual({ id: 'settings-1' });
    });

    it('should create settings when no existing row is found', async () => {
      mockUserSettingsList.mockResolvedValue({
        data: [],
        errors: undefined,
      });
      mockUserSettingsCreate.mockResolvedValue({ data: { id: 'settings-new' }, errors: undefined });

      const result = await upsertUserSettings('user-2', { mapTheme: 'dark' as any });

      expect(mockUserSettingsCreate).toHaveBeenCalled();
      expect(result).toEqual({ id: 'settings-new' });
    });

    it('stores light when a row is created without an explicit theme (#307)', async () => {
      mockUserSettingsList.mockResolvedValue({ data: [], errors: undefined });
      mockUserSettingsCreate.mockResolvedValue({ data: { id: 'settings-new' }, errors: undefined });

      await upsertUserSettings('user-2', { name: 'New User' });

      expect(mockUserSettingsCreate).toHaveBeenCalledWith(expect.objectContaining({ defaultTheme: 'light' }));
    });

    it("doesn't write when the current settings can't be read", async () => {
      mockUserSettingsList.mockResolvedValue({ data: [], errors: [{ message: 'Not Authorized' }] });

      await expect(upsertUserSettings('user-1', { name: 'X' })).rejects.toBeInstanceOf(DataError);
      expect(mockUserSettingsCreate).not.toHaveBeenCalled();
      expect(mockUserSettingsUpdate).not.toHaveBeenCalled();
    });

    it('throws a DataError when the write fails', async () => {
      mockUserSettingsList.mockResolvedValue({ data: [{ id: 'settings-1', userSub: 'user-1' }], errors: undefined });
      mockUserSettingsUpdate.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });

      await expect(upsertUserSettings('user-1', { name: 'X' })).rejects.toMatchObject({
        name: 'DataError',
        message: 'Failed to save settings.',
      });
    });
  });

});

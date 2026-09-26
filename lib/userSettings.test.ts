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

describe('userSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      expect(result.data).toEqual({ id: 'settings-1', userSub: 'user-1', defaultTheme: 'dark' });
    });

    it('should return wrapped error when list throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockUserSettingsList.mockRejectedValue(new Error('settings failure'));

      const result = await getUserSettings('user-1');

      expect(result.data).toBeNull();
      expect(result.errors).toBeDefined();
      consoleErrorSpy.mockRestore();
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
      expect(result.data).toEqual({ id: 'settings-1' });
    });

    it('should create settings when no existing row is found', async () => {
      mockUserSettingsList.mockResolvedValue({
        data: [],
        errors: undefined,
      });
      mockUserSettingsCreate.mockResolvedValue({ data: { id: 'settings-new' }, errors: undefined });

      const result = await upsertUserSettings('user-2', { mapTheme: 'dark' as any });

      expect(mockUserSettingsCreate).toHaveBeenCalled();
      expect(result.data).toEqual({ id: 'settings-new' });
    });
  });

});

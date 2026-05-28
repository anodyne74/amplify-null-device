import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const useAuthenticatorMock = jest.fn();
const setModeMock = jest.fn();
const getUserDisplayNameMock = jest.fn();
const getUserSettingsMock = jest.fn();
const upsertUserSettingsMock = jest.fn();

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => useAuthenticatorMock(),
}));

jest.mock('@/app/components/AmplifyThemeProvider', () => ({
  useThemeMode: () => ({ mode: 'system', setMode: setModeMock }),
}));

jest.mock('@/lib/amplify-config', () => ({
  getUserDisplayName: (...args: unknown[]) => getUserDisplayNameMock(...args),
}));

jest.mock('@/lib/queries', () => ({
  getUserSettings: (...args: unknown[]) => getUserSettingsMock(...args),
  upsertUserSettings: (...args: unknown[]) => upsertUserSettingsMock(...args),
}));

import UserSettingsPage from '@/app/components/UserSettingsPage';

describe('UserSettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthenticatorMock.mockReturnValue({ user: { userId: 'user-1' } });
    getUserDisplayNameMock.mockReturnValue('Fallback Name');
    getUserSettingsMock.mockResolvedValue({ data: null, errors: undefined });
    upsertUserSettingsMock.mockResolvedValue({ data: { id: 'settings-1' }, errors: undefined });
  });

  it('loads and displays persisted settings for administrator', async () => {
    getUserSettingsMock.mockResolvedValue({
      data: {
        name: 'Saved Name',
        defaultTheme: 'dark',
        mapTheme: 'satellite',
        billingCompanyName: 'Acme Pty Ltd',
      },
      errors: undefined,
    });

    render(<UserSettingsPage title="Settings" roleVariant="administrator" />);

    expect(await screen.findByDisplayValue('Saved Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Default Theme')).toHaveValue('dark');
    expect(screen.getByLabelText('Map Theme')).toHaveValue('satellite');
    expect(screen.getByDisplayValue('Acme Pty Ltd')).toBeInTheDocument();
  });

  it('hides admin billing fields for operator', async () => {
    render(<UserSettingsPage title="Settings" roleVariant="operator" />);

    await screen.findByDisplayValue('Fallback Name');

    expect(screen.queryByLabelText('Billing Company Name')).not.toBeInTheDocument();
    expect(screen.getByText('Operator profile and preferences.')).toBeInTheDocument();
  });

  it('shows auth error when trying to save without a user', async () => {
    useAuthenticatorMock.mockReturnValue({ user: null });

    render(<UserSettingsPage title="Settings" roleVariant="customer" />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    expect(await screen.findByText('Unable to save settings. Please sign in again.')).toBeInTheDocument();
    expect(upsertUserSettingsMock).not.toHaveBeenCalled();
  });

  it('handles save success and save failure paths', async () => {
    upsertUserSettingsMock
      .mockResolvedValueOnce({ data: null, errors: [{ message: 'boom' }] })
      .mockResolvedValueOnce({ data: { id: 'settings-1' }, errors: undefined });

    render(<UserSettingsPage title="Settings" roleVariant="administrator" />);

    fireEvent.change(screen.getByLabelText('Default Theme'), { target: { value: 'dark' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    expect(await screen.findByText('Failed to save settings. Please try again.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();

    await waitFor(() => {
      expect(setModeMock).toHaveBeenCalledWith('dark');
    });
  });
});

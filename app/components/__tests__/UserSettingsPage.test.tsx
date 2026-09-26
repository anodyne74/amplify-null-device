import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const useCurrentUserIdMock = jest.fn();
const setModeMock = jest.fn();
const fetchUserDisplayNameMock = jest.fn();
const getUserSettingsMock = jest.fn();
const upsertUserSettingsMock = jest.fn();
const getCustomerPortalContextMock = jest.fn();
const getCustomerMock = jest.fn();

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => useCurrentUserIdMock(),
}));

jest.mock('@/app/components/AmplifyThemeProvider', () => ({
  useThemeMode: () => ({ mode: 'system', setMode: setModeMock }),
}));

jest.mock('@/lib/amplify-config', () => ({
  fetchUserDisplayName: (...args: unknown[]) => fetchUserDisplayNameMock(...args),
}));

jest.mock('@/lib/customers', () => ({
  getCustomer: (...args: unknown[]) => getCustomerMock(...args),
  getCustomerPortalContext: (...args: unknown[]) => getCustomerPortalContextMock(...args),
}));

jest.mock('@/lib/userSettings', () => ({
  getUserSettings: (...args: unknown[]) => getUserSettingsMock(...args),
  upsertUserSettings: (...args: unknown[]) => upsertUserSettingsMock(...args),
}));

import UserSettingsPage from '@/app/components/UserSettingsPage';

describe('UserSettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCurrentUserIdMock.mockReturnValue('user-1');
    fetchUserDisplayNameMock.mockResolvedValue('Fallback Name');
    getUserSettingsMock.mockResolvedValue({ data: null, errors: undefined });
    upsertUserSettingsMock.mockResolvedValue({ data: { id: 'settings-1' }, errors: undefined });
  });

  it('loads and displays persisted settings for administrator', async () => {
    getUserSettingsMock.mockResolvedValue({
      data: {
        name: 'Saved Name',
        defaultTheme: 'dark',
        mapTheme: 'satellite',
      },
      errors: undefined,
    });

    render(<UserSettingsPage title="Settings" roleVariant="administrator" />);

    expect(await screen.findByDisplayValue('Saved Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Default Theme')).toBeChecked();
    expect(screen.getByLabelText('Map Theme')).toHaveValue('satellite');
  });

  it("leaves applying the saved default theme to the theme provider, so an in-session change isn't undone (#307)", async () => {
    getUserSettingsMock.mockResolvedValue({
      data: { name: 'Saved Name', defaultTheme: 'dark', mapTheme: 'light' },
      errors: undefined,
    });

    render(<UserSettingsPage title="Settings" roleVariant="operator" />);

    await screen.findByDisplayValue('Saved Name');
    expect(screen.getByLabelText('Default Theme')).toBeChecked();
    expect(setModeMock).not.toHaveBeenCalled();
  });

  it('does not force a theme mode when no settings have been saved yet', async () => {
    getUserSettingsMock.mockResolvedValue({ data: null, errors: undefined });

    render(<UserSettingsPage title="Settings" roleVariant="operator" />);

    await screen.findByDisplayValue('Fallback Name');
    expect(setModeMock).not.toHaveBeenCalled();
  });

  it('hides tabs for operator, who has no other settings sections', async () => {
    render(<UserSettingsPage title="Settings" roleVariant="operator" />);

    await screen.findByDisplayValue('Fallback Name');

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('Operator profile and preferences.')).toBeInTheDocument();
  });

  it('hides tabs for administrator, who has no other settings sections', async () => {
    render(<UserSettingsPage title="Settings" roleVariant="administrator" />);

    await screen.findByDisplayValue('Fallback Name');

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('Administrator profile and preferences.')).toBeInTheDocument();
  });

  it('replaces the theme dropdown with a light/dark toggle, no System option (#56)', async () => {
    render(<UserSettingsPage title="Settings" roleVariant="administrator" />);

    await screen.findByDisplayValue('Fallback Name');

    const toggle = screen.getByLabelText('Default Theme');
    expect(toggle).toHaveAttribute('role', 'switch');
    expect(toggle).not.toBeChecked(); // defaults to light (#307)
    expect(screen.getByText('Light', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText('System')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it('shows account owners only their user settings, with no Customer settings tab (#306)', async () => {
    getCustomerPortalContextMock.mockResolvedValue({ role: 'account_owner', customerId: 'customer-1', errors: undefined });

    render(<UserSettingsPage title="Settings" roleVariant="customer" />);

    await screen.findByDisplayValue('Fallback Name');

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /customer settings/i })).not.toBeInTheDocument();
    expect(screen.getByText('Customer profile and preferences.')).toBeInTheDocument();
    expect(getCustomerPortalContextMock).not.toHaveBeenCalled();
    expect(getCustomerMock).not.toHaveBeenCalled();
  });

  it.each(['customer', 'operator'] as const)('saves settings for %s', async (roleVariant) => {
    render(<UserSettingsPage title="Settings" roleVariant={roleVariant} />);

    await screen.findByDisplayValue('Fallback Name');
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
    expect(upsertUserSettingsMock).toHaveBeenCalledWith('user-1', {
      name: 'Fallback Name',
      defaultTheme: 'light',
      mapTheme: 'light',
    });
  });

  it('shows auth error when trying to save without a user', async () => {
    useCurrentUserIdMock.mockReturnValue(undefined);

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

    // Defaults to light (unchecked); toggling it on selects dark.
    expect(screen.getByLabelText('Default Theme')).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('Default Theme'));
    expect(screen.getByLabelText('Default Theme')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    expect(await screen.findByText('Failed to save settings. Please try again.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();

    await waitFor(() => {
      expect(setModeMock).toHaveBeenCalledWith('dark');
    });
  });
});

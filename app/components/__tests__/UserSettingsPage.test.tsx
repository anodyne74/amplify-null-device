import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const useAuthenticatorMock = jest.fn();
const setModeMock = jest.fn();
const getUserDisplayNameMock = jest.fn();
const getUserSettingsMock = jest.fn();
const upsertUserSettingsMock = jest.fn();
const getCustomerPortalContextMock = jest.fn();
const getCustomerMock = jest.fn();

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
  getCustomer: (...args: unknown[]) => getCustomerMock(...args),
  getCustomerPortalContext: (...args: unknown[]) => getCustomerPortalContextMock(...args),
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
    getCustomerPortalContextMock.mockResolvedValue({ role: 'read_only', customerId: 'customer-1', errors: undefined });
    getCustomerMock.mockResolvedValue({ data: null, errors: undefined });
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

  it('applies the saved default theme on load, not just after saving (#80)', async () => {
    getUserSettingsMock.mockResolvedValue({
      data: { name: 'Saved Name', defaultTheme: 'light', mapTheme: 'light' },
      errors: undefined,
    });

    render(<UserSettingsPage title="Settings" roleVariant="operator" />);

    await screen.findByDisplayValue('Saved Name');
    expect(setModeMock).toHaveBeenCalledWith('light');
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
    expect(toggle).toBeChecked(); // defaults to dark
    expect(screen.queryByText('System')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
  });

  it('shows customer settings only for account owners', async () => {
    getCustomerPortalContextMock.mockResolvedValue({ role: 'account_owner', customerId: 'customer-1', errors: undefined });
    getCustomerMock.mockResolvedValue({
      data: {
        name: 'Acme Corp',
        companyName: 'Acme Holdings',
        email: 'accounts@acme.test',
        addressLine1: '100 Main St',
        standingInstructions: 'Place signs near the front gate.',
      },
      errors: undefined,
    });

    render(<UserSettingsPage title="Settings" roleVariant="customer" />);

    expect(await screen.findByRole('tab', { name: /customer settings/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /customer settings/i }));

    expect(screen.getByText('Place signs near the front gate.')).toBeInTheDocument();
    expect(screen.getByText('Acme Holdings')).toBeInTheDocument();
    expect(screen.getByText('accounts@acme.test')).toBeInTheDocument();
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

    // Defaults to dark (checked); toggling it off selects light.
    expect(screen.getByLabelText('Default Theme')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Default Theme'));
    expect(screen.getByLabelText('Default Theme')).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    expect(await screen.findByText('Failed to save settings. Please try again.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();

    await waitFor(() => {
      expect(setModeMock).toHaveBeenCalledWith('light');
    });
  });
});

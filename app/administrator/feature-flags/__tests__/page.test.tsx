import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdministratorFeatureFlagsPage from '../page';
import { changeFeatureFlag, listFeatureFlagSettings } from '@/lib/queries/FeatureFlagSettings';
import { listAllCustomers } from '@/lib/customers';

// Tests register their own flags: the page must work for zero or many.
const mockRegistry: { FEATURE_FLAGS: Record<string, { label: string; description: string }> } = {
  FEATURE_FLAGS: {},
};

jest.mock('@/lib/featureFlags', () => ({
  get FEATURE_FLAGS() {
    return mockRegistry.FEATURE_FLAGS;
  },
  get FEATURE_FLAG_NAMES() {
    return Object.keys(mockRegistry.FEATURE_FLAGS);
  },
}));

jest.mock('@/lib/queries/FeatureFlagSettings', () => ({
  listFeatureFlagSettings: jest.fn(),
  changeFeatureFlag: jest.fn(),
}));

jest.mock('@/lib/customers', () => ({
  listAllCustomers: jest.fn(),
}));

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('Administrator Feature Flags page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistry.FEATURE_FLAGS = {
      alpha: { label: 'Alpha feature', description: 'Lets customers do alpha things.' },
      beta: { label: 'Beta feature', description: 'Lets customers do beta things.' },
    };
    (listAllCustomers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'c2', name: 'Ray White Eastwood' },
        { id: 'c1', name: 'Harcourts Epping' },
      ],
    });
    (listFeatureFlagSettings as jest.Mock).mockResolvedValue({
      data: [
        { id: 'alpha', state: 'selected', selectedCustomerIds: ['c1'] },
        { id: 'beta', state: 'everyone', everyoneSince: '2026-09-01T02:00:00.000Z' },
        { id: 'retired', state: 'everyone' },
      ],
    });
  });

  it('shows an empty state when no flags are registered', () => {
    mockRegistry.FEATURE_FLAGS = {};
    render(<AdministratorFeatureFlagsPage />);

    expect(screen.getByText(/No feature flags right now/)).toBeInTheDocument();
    expect(listFeatureFlagSettings).not.toHaveBeenCalled();
  });

  it('lists each registered flag with its state, and never a retired one', async () => {
    render(<AdministratorFeatureFlagsPage />);

    expect(await screen.findByText('Alpha feature')).toBeInTheDocument();
    expect(screen.getByText('Beta feature')).toBeInTheDocument();
    expect(screen.queryByText(/retired/)).not.toBeInTheDocument();

    const [alphaState, betaState] = screen.getAllByLabelText('State') as HTMLSelectElement[];
    expect(alphaState.value).toBe('selected');
    expect(betaState.value).toBe('everyone');
    expect(screen.getByText('Everyone since 1 Sept 2026')).toBeInTheDocument();
  });

  it('treats a flag with no stored setting as Off', async () => {
    (listFeatureFlagSettings as jest.Mock).mockResolvedValue({ data: [] });
    render(<AdministratorFeatureFlagsPage />);

    const states = (await screen.findAllByLabelText('State')) as HTMLSelectElement[];
    expect(states.map((select) => select.value)).toEqual(['off', 'off']);
  });

  it('shows the Customer picker in Selected mode and saves the edited list', async () => {
    (changeFeatureFlag as jest.Mock).mockResolvedValue({ id: 'alpha', state: 'selected', selectedCustomerIds: ['c1', 'c2'] });
    render(<AdministratorFeatureFlagsPage />);

    const picker = await screen.findByRole('group', { name: 'Selected Customers' });
    expect(picker).toHaveTextContent('Harcourts Epping');
    expect(screen.getByLabelText('Harcourts Epping')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save Customers' })).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Ray White Eastwood'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Customers' }));

    await waitFor(() =>
      expect(changeFeatureFlag).toHaveBeenCalledWith('alpha', { action: 'set-customers', customerIds: ['c1', 'c2'] })
    );
    expect(await screen.findByText('On for 2 Customers.')).toBeInTheDocument();
  });

  it('changes the state through the admin route', async () => {
    (changeFeatureFlag as jest.Mock).mockResolvedValue({ id: 'alpha', state: 'off', selectedCustomerIds: ['c1'] });
    render(<AdministratorFeatureFlagsPage />);

    const [alphaState] = (await screen.findAllByLabelText('State')) as HTMLSelectElement[];
    fireEvent.change(alphaState, { target: { value: 'off' } });

    await waitFor(() => expect(changeFeatureFlag).toHaveBeenCalledWith('alpha', { action: 'set-state', state: 'off' }));
    expect(await screen.findByText(/1 Selected Customer is kept/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Selected Customers' })).not.toBeInTheDocument();
  });

  it('clears the list as its own action', async () => {
    (changeFeatureFlag as jest.Mock).mockResolvedValue({ id: 'alpha', state: 'selected', selectedCustomerIds: [] });
    render(<AdministratorFeatureFlagsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Clear list' }));

    await waitFor(() => expect(changeFeatureFlag).toHaveBeenCalledWith('alpha', { action: 'clear-customers' }));
  });

  it('shows the route error when a change fails', async () => {
    (changeFeatureFlag as jest.Mock).mockRejectedValue(new Error('Could not record the change, so it was not saved'));
    render(<AdministratorFeatureFlagsPage />);

    const [alphaState] = (await screen.findAllByLabelText('State')) as HTMLSelectElement[];
    fireEvent.change(alphaState, { target: { value: 'everyone' } });

    expect(await screen.findByText('Could not record the change, so it was not saved')).toBeInTheDocument();
  });

  it('shows an error when flags cannot be loaded', async () => {
    (listFeatureFlagSettings as jest.Mock).mockResolvedValue({ data: [], errors: [new Error('boom')] });
    render(<AdministratorFeatureFlagsPage />);

    expect(await screen.findByText(/Could not load feature flags/)).toBeInTheDocument();
  });
});

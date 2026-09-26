import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CustomerStandingOrdersPage from '../page';
import { getCustomer, getCustomerPortalContext, updateCustomer } from '@/lib/customers';
import { getAgentBadgeTone } from '@/lib/customerDefaults';

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => 'user-sub-1',
}));

jest.mock('@/lib/customers', () => ({
  getCustomer: jest.fn(),
  getCustomerPortalContext: jest.fn(),
  updateCustomer: jest.fn(),
}));

describe('Customer Standing Orders page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCustomer as jest.Mock).mockResolvedValue({
      data: {
        id: 'cust-1',
        standingInstructions: 'Call before arrival',
        defaultNumberOfSigns: 3,
        standingPickupDay: 'saturday',
        sendMissingSignsReport: true,
        agentOptions: ['BO', 'Jamie Lee', 'Pat Doe'],
        updatedAt: '2026-08-12T00:00:00Z',
      },
      errors: undefined,
    });
    (updateCustomer as jest.Mock).mockResolvedValue({ data: { id: 'cust-1' }, errors: undefined });
  });

  it('allows the account owner to save standing order preferences', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });

    render(<CustomerStandingOrdersPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Call before arrival')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Default signs per stop'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Standing sign collection day'), { target: { value: 'sunday' } });
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith('cust-1', {
        standingInstructions: 'Call before arrival',
        defaultNumberOfSigns: 6,
        standingPickupDay: 'sunday',
        sendMissingSignsReport: true,
      });
    });

    expect(await screen.findByText(/preferences saved/i)).toBeInTheDocument();
  });

  it('validates non-negative default signs before save', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });

    render(<CustomerStandingOrdersPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Default signs per stop')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Default signs per stop'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    expect(await screen.findByText(/default signs per stop must be 0 or greater/i)).toBeInTheDocument();
    expect(updateCustomer).not.toHaveBeenCalled();
  });

  it('shows a read-only summary for the read_only role', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });

    render(<CustomerStandingOrdersPage />);

    expect(await screen.findByText(/call before arrival/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save preferences/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only your account owner can change these/i)).toBeInTheDocument();
  });

  it('names the day "sign collection day" and drops the low-signs switch', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });

    render(<CustomerStandingOrdersPage />);

    expect(await screen.findByLabelText('Standing sign collection day')).toBeInTheDocument();
    expect(screen.getByText('Send a list of missing signs after every sign collection')).toBeInTheDocument();
    expect(screen.queryByText(/run short of signs/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pickup/i)).not.toBeInTheDocument();
  });

  it('labels the read-only day "Sign collection day"', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });

    render(<CustomerStandingOrdersPage />);

    expect(await screen.findByText('Sign collection day')).toBeInTheDocument();
    expect(screen.queryByText(/pickup/i)).not.toBeInTheDocument();
  });

  it('shows each agent as a coloured initials badge, with only the default starred', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });

    render(<CustomerStandingOrdersPage />);

    const list = await screen.findByRole('list', { name: 'Agents on this account' });
    const badges = within(list).getAllByRole('img');
    expect(badges.map((badge) => badge.textContent)).toEqual(['BO', 'JL', 'PD']);
    expect(badges.map((badge) => badge.getAttribute('aria-label'))).toEqual([
      'BO (default agent)',
      'Jamie Lee',
      'Pat Doe',
    ]);
    expect(badges[1]).toHaveAttribute('title', 'Jamie Lee');
    expect(within(list).getAllByTestId('default-agent-star')).toHaveLength(1);
    expect(within(badges[0]).getByTestId('default-agent-star')).toBeInTheDocument();
    const tone = getAgentBadgeTone('Jamie Lee');
    expect(badges[1].style.getPropertyValue('--nd-agent-badge-bg')).toBe(tone.backgroundColor);
    expect(badges[1].style.getPropertyValue('--nd-agent-badge-fg')).toBe(tone.color);
    expect(screen.queryByText('Jamie Lee')).not.toBeInTheDocument();
  });

  it('stars the legacy default agent when the customer has no agent list', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });
    (getCustomer as jest.Mock).mockResolvedValue({
      data: { id: 'cust-1', agentOptions: null, defaultAgentName: 'Kim Park' },
      errors: undefined,
    });

    render(<CustomerStandingOrdersPage />);

    const list = await screen.findByRole('list', { name: 'Agents on this account' });
    expect(within(list).getByRole('img', { name: 'Kim Park (default agent)' })).toHaveTextContent('KP');
  });

  it('stars the first agent in the list even when a stale defaultAgentName names another', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });
    (getCustomer as jest.Mock).mockResolvedValue({
      data: { id: 'cust-1', agentOptions: ['DM', 'KP'], defaultAgentName: 'KP' },
      errors: undefined,
    });

    render(<CustomerStandingOrdersPage />);

    const list = await screen.findByRole('list', { name: 'Agents on this account' });
    expect(within(list).getAllByRole('img').map((badge) => badge.getAttribute('aria-label'))).toEqual([
      'DM (default agent)',
      'KP',
    ]);
  });

  it('shows the empty state when no agents are configured', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });
    (getCustomer as jest.Mock).mockResolvedValue({ data: { id: 'cust-1', agentOptions: [] }, errors: undefined });

    render(<CustomerStandingOrdersPage />);

    expect(await screen.findByText('No agents configured yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Agents on this account' })).not.toBeInTheDocument();
  });
});

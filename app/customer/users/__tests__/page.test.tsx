import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CustomerTeamPage from '../page';
import { ApiError, callApi } from '@/lib/apiClient';
import { getCustomer, getCustomerPortalContext, listCustomerUsers } from '@/lib/customers';

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => 'user-sub-1',
}));

jest.mock('@/lib/apiClient', () => ({
  ...jest.requireActual('@/lib/apiClient'),
  callApi: jest.fn(),
}));

jest.mock('@/lib/customers', () => ({
  getCustomer: jest.fn(),
  getCustomerPortalContext: jest.fn(),
  listCustomerUsers: jest.fn(),
}));

let mockOnFlags: string[] = [];

jest.mock('@/lib/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ isOn: (name: string) => mockOnFlags.includes(name), loading: false }),
}));

describe('Customer Team page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnFlags = ['account-owner-invite'];
    (getCustomer as jest.Mock).mockResolvedValue({
      data: { id: 'cust-1', email: 'owner@rangeproperty.com.au', restrictInvitesToOwnDomain: false },
      errors: undefined,
    });
    (listCustomerUsers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'cu-1', name: 'Priya Owner', email: 'owner@rangeproperty.com.au', role: 'account_owner' },
      ],
      errors: undefined,
    });
  });

  it('shows the invite form and current team for an account owner', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });

    render(<CustomerTeamPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Priya Owner')).toBeInTheDocument();
  });

  it('hides the invite form for a read_only teammate', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });

    render(<CustomerTeamPage />);

    expect(await screen.findByText(/only your account owner can invite teammates/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
  });

  it('shows the required domain hint when restriction is on', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });
    (getCustomer as jest.Mock).mockResolvedValue({
      data: { id: 'cust-1', email: 'owner@rangeproperty.com.au', restrictInvitesToOwnDomain: true },
      errors: undefined,
    });

    render(<CustomerTeamPage />);

    expect(await screen.findByText(/must be an @rangeproperty\.com\.au address/i)).toBeInTheDocument();
  });

  it('sends an invite and shows a success message', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });
    (callApi as jest.Mock).mockResolvedValue({ success: true, user: { sub: 'sub-new' }, emailSent: true });

    render(<CustomerTeamPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'teammate@rangeproperty.com.au' } });
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }));

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledWith('/api/customer/invite-user', {
        email: 'teammate@rangeproperty.com.au',
        name: undefined,
      });
    });

    expect(await screen.findByText(/invited teammate@rangeproperty\.com\.au/i)).toBeInTheDocument();
  });

  it('shows an error message when the invite fails', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });
    (callApi as jest.Mock).mockRejectedValue(
      new ApiError('Invited emails must use the @rangeproperty.com.au domain.', 400)
    );

    render(<CustomerTeamPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'teammate@other.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }));

    expect(await screen.findByText(/must use the @rangeproperty\.com\.au domain/i)).toBeInTheDocument();
  });

  it('tells the account owner when the invite email could not be sent', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });
    (callApi as jest.Mock).mockResolvedValue({ success: true, user: { sub: 'sub-new' }, emailSent: false });

    render(<CustomerTeamPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'teammate@rangeproperty.com.au' } });
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }));

    expect(await screen.findByText(/invitation email could not be sent/i)).toBeInTheDocument();
  });

  it("keeps today's invite wording while account-owner-invite is on", async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });

    render(<CustomerTeamPage />);

    expect(await screen.findByText("Invite teammates into your company's portal access.")).toBeInTheDocument();
  });

  describe('while account-owner-invite is off (or flags are loading or failed)', () => {
    beforeEach(() => {
      mockOnFlags = [];
    });

    it('shows an account owner no invite card or invite wording, but still the team list', async () => {
      (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });

      render(<CustomerTeamPage />);

      expect(await screen.findByText('Priya Owner')).toBeInTheDocument();
      expect(screen.getByText("People with access to your company's portal.")).toBeInTheDocument();
      expect(screen.queryByText(/invite/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    });

    it('shows a read_only teammate no "Only your account owner" card', async () => {
      (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });

      render(<CustomerTeamPage />);

      expect(await screen.findByText('Priya Owner')).toBeInTheDocument();
      expect(screen.queryByText(/only your account owner/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/invite/i)).not.toBeInTheDocument();
    });
  });
});

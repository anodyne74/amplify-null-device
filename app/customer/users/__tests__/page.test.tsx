import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CustomerTeamPage from '../page';
import { getCustomer, getCustomerPortalContext, listCustomerUsers } from '@/lib/queries';

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    user: { userId: 'user-sub-1' },
  }),
}));

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn().mockResolvedValue({ tokens: { idToken: { toString: () => 'id-token-value' } } }),
}));

jest.mock('@/lib/queries', () => ({
  getCustomer: jest.fn(),
  getCustomerPortalContext: jest.fn(),
  listCustomerUsers: jest.fn(),
}));

const originalFetch = global.fetch;

describe('Customer Team page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
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
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, user: { sub: 'sub-new' }, emailSent: true }),
    });

    render(<CustomerTeamPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'teammate@rangeproperty.com.au' } });
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/customer/invite-user',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer id-token-value' }),
        })
      );
    });

    expect(await screen.findByText(/invited teammate@rangeproperty\.com\.au/i)).toBeInTheDocument();
  });

  it('shows an error message when the invite fails', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invited emails must use the @rangeproperty.com.au domain.' }),
    });

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
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, user: { sub: 'sub-new' }, emailSent: false }),
    });

    render(<CustomerTeamPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'teammate@rangeproperty.com.au' } });
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }));

    expect(await screen.findByText(/invitation email could not be sent/i)).toBeInTheDocument();
  });
});

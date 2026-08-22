import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { signOut } from 'aws-amplify/auth';
import PendingApprovalPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(async () => ({
    tokens: { idToken: { toString: () => 'test-token' } },
  })),
  signOut: jest.fn(),
}));

function mockFetchOnce(payload: unknown, ok = true) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    json: async () => payload,
  });
}

describe('PendingApprovalPage', () => {
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push });
    global.fetch = jest.fn();
  });

  it('shows the request form with the customer picker when no request exists yet', async () => {
    mockFetchOnce({
      request: null,
      customers: [
        { id: 'cust-1', name: 'Range Property' },
        { id: 'cust-2', name: 'Harcourts Epping' },
      ],
    });

    render(<PendingApprovalPage />);

    expect(await screen.findByText('Request access')).toBeInTheDocument();
    expect(screen.getByLabelText('Company')).toBeInTheDocument();
    expect(screen.getByText('Range Property')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send request/i })).toBeInTheDocument();
  });

  it('submits the request with the selected company, role, and name', async () => {
    mockFetchOnce({
      request: null,
      customers: [{ id: 'cust-1', name: 'Range Property' }],
    });

    render(<PendingApprovalPage />);
    await screen.findByText('Request access');

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Priya Shah' } });
    fireEvent.change(screen.getByLabelText('Access level'), { target: { value: 'account_owner' } });

    mockFetchOnce({
      request: {
        id: 'req-1',
        requesterSub: 'sub-1',
        email: 'priya@rangeproperty.com.au',
        customerId: 'cust-1',
        role: 'account_owner',
        status: 'pending',
        requestedAt: '2026-02-01T00:00:00Z',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /send request/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/account-requests',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ customerId: 'cust-1', role: 'account_owner', name: 'Priya Shah' }),
        })
      );
    });

    expect(await screen.findByRole('heading', { name: 'Request sent' })).toBeInTheDocument();
  });

  it('shows the waiting-on-approval status with a timeline and the account owner name', async () => {
    mockFetchOnce({
      request: {
        id: 'req-1',
        status: 'pending',
        requestedAt: '2026-02-01T00:00:00Z',
        customerName: 'Range Property',
        accountOwnerName: 'Jordan Lee',
      },
      customers: [],
    });

    render(<PendingApprovalPage />);

    expect(await screen.findByText('Waiting on approval')).toBeInTheDocument();
    expect(screen.getAllByText('Request sent').length).toBeGreaterThan(0);
    expect(screen.getByText(/Jordan Lee for Range Property has been notified/)).toBeInTheDocument();
    expect(screen.getByText('Reviewed by Jordan Lee')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /chase it up/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Company')).not.toBeInTheDocument();
  });

  it('shows the approved status', async () => {
    mockFetchOnce({
      request: { id: 'req-1', status: 'approved', requestedAt: '2026-02-01T00:00:00Z', decidedAt: '2026-02-02T00:00:00Z' },
      customers: [],
    });

    render(<PendingApprovalPage />);

    expect(await screen.findByText('Access is ready')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /chase it up/i })).not.toBeInTheDocument();
  });

  it('shows the rejected status with a decision note', async () => {
    mockFetchOnce({
      request: {
        id: 'req-1',
        status: 'rejected',
        requestedAt: '2026-02-01T00:00:00Z',
        decidedAt: '2026-02-02T00:00:00Z',
        decisionNote: 'Could not verify this company.',
      },
      customers: [],
    });

    render(<PendingApprovalPage />);

    expect(await screen.findByText('Request not approved')).toBeInTheDocument();
    expect(screen.getByText('Could not verify this company.')).toBeInTheDocument();
    expect(screen.getAllByText('Not approved').length).toBeGreaterThan(0);
  });

  it('resends the notification when "Chase it up" is clicked', async () => {
    mockFetchOnce({
      request: { id: 'req-1', status: 'pending', requestedAt: '2026-02-01T00:00:00Z' },
      customers: [],
    });

    render(<PendingApprovalPage />);
    await screen.findByText('Waiting on approval');

    mockFetchOnce({ request: { id: 'req-1', status: 'pending', lastNotifiedAt: '2026-02-01T01:00:00Z' } });

    fireEvent.click(screen.getByRole('button', { name: /chase it up/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith('/api/account-requests/resend', expect.objectContaining({ method: 'POST' }));
    });
    expect(await screen.findByText(/nudged them again/i)).toBeInTheDocument();
  });

  it('shows an error when the resend is rate-limited', async () => {
    mockFetchOnce({
      request: { id: 'req-1', status: 'pending', requestedAt: '2026-02-01T00:00:00Z' },
      customers: [],
    });

    render(<PendingApprovalPage />);
    await screen.findByText('Waiting on approval');

    mockFetchOnce({ error: 'Please wait 12 more minutes before chasing this up again.' }, false);

    fireEvent.click(screen.getByRole('button', { name: /chase it up/i }));

    expect(await screen.findByText(/please wait 12 more minutes/i)).toBeInTheDocument();
  });

  it('signs out and redirects home', async () => {
    mockFetchOnce({ request: { id: 'req-1', status: 'pending', requestedAt: '2026-02-01T00:00:00Z' }, customers: [] });

    render(<PendingApprovalPage />);
    await screen.findByText('Waiting on approval');

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith('/');
    });
  });

  it('shows an error if loading the request fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'nope' }),
    });

    render(<PendingApprovalPage />);

    expect(await screen.findByText(/could not load your request/i)).toBeInTheDocument();
  });
});

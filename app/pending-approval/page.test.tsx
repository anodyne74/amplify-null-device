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

    expect(await screen.findByText('Request sent — nothing more to do')).toBeInTheDocument();
  });

  it('shows the waiting-on-approval status when a pending request already exists', async () => {
    mockFetchOnce({
      request: { id: 'req-1', status: 'pending' },
      customers: [],
    });

    render(<PendingApprovalPage />);

    expect(await screen.findByText('Waiting on approval')).toBeInTheDocument();
    expect(screen.getByText('Request sent — nothing more to do')).toBeInTheDocument();
    expect(screen.queryByLabelText('Company')).not.toBeInTheDocument();
  });

  it('shows the approved status', async () => {
    mockFetchOnce({
      request: { id: 'req-1', status: 'approved' },
      customers: [],
    });

    render(<PendingApprovalPage />);

    expect(await screen.findByText('Access is ready')).toBeInTheDocument();
  });

  it('shows the rejected status with a decision note', async () => {
    mockFetchOnce({
      request: { id: 'req-1', status: 'rejected', decisionNote: 'Could not verify this company.' },
      customers: [],
    });

    render(<PendingApprovalPage />);

    expect(await screen.findByText('Request not approved')).toBeInTheDocument();
    expect(screen.getByText('Could not verify this company.')).toBeInTheDocument();
  });

  it('signs out and redirects home', async () => {
    mockFetchOnce({ request: { id: 'req-1', status: 'pending' }, customers: [] });

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

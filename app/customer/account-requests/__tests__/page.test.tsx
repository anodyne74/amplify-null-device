import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getCustomerPortalContext } from '@/lib/queries';
import AccountRequestsQueuePage from '../page';

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ user: { userId: 'owner-sub' } }),
}));

jest.mock('@/lib/queries', () => ({
  getCustomerPortalContext: jest.fn(),
}));

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(async () => ({
    tokens: { idToken: { toString: () => 'test-token' } },
  })),
}));

function mockFetchOnce(payload: unknown, ok = true) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok, json: async () => payload });
}

const pendingRow = {
  id: 'req-1',
  email: 'priya@rangeproperty.com.au',
  name: 'Priya Shah',
  customerId: 'cust-1',
  customerName: 'Range Property',
  role: 'read_only',
  status: 'pending',
  requestedAt: '2026-02-01T00:00:00Z',
};

describe('AccountRequestsQueuePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });
    global.fetch = jest.fn();
  });

  it('shows an access-denied message for read-only users', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });
    mockFetchOnce({ requests: [] });

    render(<AccountRequestsQueuePage />);

    expect(await screen.findByText(/only the account owner/i)).toBeInTheDocument();
  });

  it('lists pending requests with approve/reject actions', async () => {
    mockFetchOnce({ requests: [pendingRow] });

    render(<AccountRequestsQueuePage />);

    expect(await screen.findByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText(/priya@rangeproperty.com.au/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
  });

  it('shows an empty state when there are no pending requests', async () => {
    mockFetchOnce({ requests: [] });

    render(<AccountRequestsQueuePage />);

    expect(await screen.findByText(/no pending requests/i)).toBeInTheDocument();
  });

  it('approves a request and refreshes the list', async () => {
    mockFetchOnce({ requests: [pendingRow] });

    render(<AccountRequestsQueuePage />);
    await screen.findByText('Priya Shah');

    mockFetchOnce({ request: { ...pendingRow, status: 'approved' } });
    mockFetchOnce({ requests: [{ ...pendingRow, status: 'approved' }] });

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/account-requests/decide',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ requestId: 'req-1', decision: 'approve' }),
        })
      );
    });
  });

  it('expands a note field and rejects a request', async () => {
    mockFetchOnce({ requests: [pendingRow] });

    render(<AccountRequestsQueuePage />);
    await screen.findByText('Priya Shah');

    fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    const textarea = await screen.findByPlaceholderText(/optional note/i);
    fireEvent.change(textarea, { target: { value: 'Could not verify this company.' } });

    mockFetchOnce({ request: { ...pendingRow, status: 'rejected' } });
    mockFetchOnce({ requests: [] });

    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/account-requests/decide',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ requestId: 'req-1', decision: 'reject', note: 'Could not verify this company.' }),
        })
      );
    });
  });

  it('shows an action error when a decision fails', async () => {
    mockFetchOnce({ requests: [pendingRow] });

    render(<AccountRequestsQueuePage />);
    await screen.findByText('Priya Shah');

    mockFetchOnce({ error: 'This company already has an account owner.' }, false);

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(await screen.findByText(/already has an account owner/i)).toBeInTheDocument();
  });
});

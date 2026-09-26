import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import UsersAdminPage from '@/app/administrator/users/page';
import {
  createCustomerUser,
  deleteCustomerUser,
  updateCustomerUser,
  listAllCustomerUsers,
  listCustomers,
} from '@/lib/queries';
import { ApiError, callApi } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({
  ...jest.requireActual('@/lib/apiClient'),
  callApi: jest.fn(),
}));

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/queries', () => ({
  createCustomerUser: jest.fn(),
  deleteCustomerUser: jest.fn(),
  updateCustomerUser: jest.fn(),
  listAllCustomerUsers: jest.fn(),
  listCustomers: jest.fn(),
}));

const mockListCustomers = listCustomers as jest.MockedFunction<typeof listCustomers>;
const mockListAllCustomerUsers = listAllCustomerUsers as jest.MockedFunction<typeof listAllCustomerUsers>;
const mockCreateCustomerUser = createCustomerUser as jest.MockedFunction<typeof createCustomerUser>;
const mockUpdateCustomerUser = updateCustomerUser as jest.MockedFunction<typeof updateCustomerUser>;
const mockDeleteCustomerUser = deleteCustomerUser as jest.MockedFunction<typeof deleteCustomerUser>;
const mockCallApi = callApi as jest.Mock;

describe('UsersAdminPage customer access actions', () => {
  beforeEach(() => {
    mockListCustomers.mockResolvedValue({
      data: [{ id: 'cust-1', name: 'Acme Customer' }],
      nextToken: null,
      errors: [],
    } as any);

    mockListAllCustomerUsers.mockResolvedValue({
      data: [
        {
          id: 'cu-1',
          customerId: 'cust-1',
          userSub: 'sub-1',
          accountOwnerSub: 'sub-owner',
          name: 'Read User',
          email: 'read@example.com',
          role: 'read_only',
        },
      ],
      errors: [],
    } as any);

    mockCreateCustomerUser.mockResolvedValue({ data: { id: 'new-cu' }, errors: [] } as any);
    mockUpdateCustomerUser.mockResolvedValue({ data: {}, errors: [] } as any);
    mockDeleteCustomerUser.mockResolvedValue({ data: {}, errors: [] } as any);

    mockCallApi.mockResolvedValue({ users: [] });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the invite button as primary and revoke access as danger inside the edit dialog', async () => {
    render(<UsersAdminPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add customer user' })).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: 'Add customer user' });
    expect(addButton).toHaveClass('nd-btn--primary');

    await waitFor(() => {
      expect(screen.getByText('Read User')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Revoke Access' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Change role for Read User' }));

    const revokeButton = screen.getByRole('button', { name: 'Revoke Access' });
    expect(revokeButton).toHaveClass('nd-btn--danger');
  });

  it('requires confirmation before revoking a customer user from the table row', async () => {
    render(<UsersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Read User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Revoke access for Read User' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Revoke customer access?' });
    expect(dialog).toHaveTextContent("Revoke Read User's customer access?");
    expect(mockDeleteCustomerUser).not.toHaveBeenCalled();

    // Cancelling closes the dialog without removing.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockDeleteCustomerUser).not.toHaveBeenCalled();

    // Confirming performs the removal.
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access for Read User' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Access' }));

    await waitFor(() => {
      expect(mockDeleteCustomerUser).toHaveBeenCalledWith('cu-1');
    });
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    // Access is revoked server-side, with the removed sub as a hint so an
    // eventually-consistent read can't leave it behind.
    expect(mockCallApi).toHaveBeenCalledWith('/api/admin/sync-customer-access', { customerId: 'cust-1', removed: 'sub-1' });
  });

  it('tells the admin when the user was removed but revoking their access failed', async () => {
    mockCallApi.mockImplementation(async (path: string) => {
      if (path === '/api/admin/sync-customer-access') throw new ApiError('Access sync finished with 2 error(s).', 500);
      return { users: [] };
    });

    render(<UsersAdminPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke access for Read User' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Access' }));

    expect(await screen.findByText(/revoking their access failed \(Access sync finished with 2 error\(s\)\.\)/)).toBeInTheDocument();
    expect(screen.queryByText(/access revoked from all/i)).not.toBeInTheDocument();
  });

  it('edits display name and role from the edit dialog', async () => {
    render(<UsersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Read User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Change role for Read User' }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Display Name'), { target: { value: 'Renamed User' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockUpdateCustomerUser).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cu-1', name: 'Renamed User', role: 'read_only' })
      );
    });
  });

  it('shows summary stat tiles computed from the loaded data', async () => {
    render(<UsersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Read User')).toBeInTheDocument();
    });

    expect(screen.getByText('Customer users')).toBeInTheDocument();
    expect(screen.getByText('Account owners')).toBeInTheDocument();
    expect(screen.getByText('Invites pending')).toBeInTheDocument();
    expect(screen.getByText('Signed in past 7d')).toBeInTheDocument();
  });

  it('creates a real Cognito login (instead of a pending placeholder) when the invited email has no existing account', async () => {
    mockCallApi.mockImplementation(async (_path: string, body: { action: string }) => {
      if (body.action === 'getUserByEmail') throw new ApiError('No user found.', 404);
      if (body.action === 'createUser') {
        return { user: { sub: 'brand-new-sub', username: 'new@agency.com.au' }, created: true, emailSent: true };
      }
      return {};
    });

    render(<UsersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Read User')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Email for new customer user'), {
      target: { value: 'new@agency.com.au' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add customer user' }));

    await waitFor(() => {
      expect(mockCreateCustomerUser).toHaveBeenCalledWith(
        expect.objectContaining({ userSub: 'brand-new-sub', email: 'new@agency.com.au' })
      );
    });

    expect(await screen.findByText(/branded invitation/i)).toBeInTheDocument();
    expect(mockCallApi).toHaveBeenCalledWith('/api/admin/sync-customer-access', {
      customerId: 'cust-1',
      added: 'brand-new-sub',
    });
    expect(mockCallApi).toHaveBeenCalledWith(
      '/api/admin/users',
      expect.objectContaining({
        action: 'createUser',
        email: 'new@agency.com.au',
        groupName: 'customer',
        customerName: 'Acme Customer',
      })
    );
  });

  it('tells the admin when the login was created but the invitation email failed to send', async () => {
    mockCallApi.mockImplementation(async (_path: string, body: { action: string }) => {
      if (body.action === 'getUserByEmail') throw new ApiError('No user found.', 404);
      if (body.action === 'createUser') {
        return { user: { sub: 'brand-new-sub', username: 'new@agency.com.au' }, created: true, emailSent: false };
      }
      return {};
    });

    render(<UsersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Read User')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Email for new customer user'), {
      target: { value: 'new@agency.com.au' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add customer user' }));

    expect(await screen.findByText(/invitation email could not be sent/i)).toBeInTheDocument();
  });

  it('shows a Resend action for a pending invite and resends it', async () => {
    mockCallApi.mockImplementation(async (_path: string, body: { action: string; groupName?: string }) => {
      if (body.action === 'listUsersInGroup' && body.groupName === 'customer') {
        return { users: [{ sub: 'sub-1', status: 'FORCE_CHANGE_PASSWORD' }] };
      }
      if (body.action === 'resendInvite') return { emailSent: true };
      return {};
    });

    render(<UsersAdminPage />);

    const resendButton = await screen.findByRole('button', { name: 'Resend invite to Read User' });
    fireEvent.click(resendButton);

    await waitFor(() => {
      expect(screen.getByText('Invitation resent to read@example.com.')).toBeInTheDocument();
    });

    expect(mockCallApi).toHaveBeenCalledWith(
      '/api/admin/users',
      expect.objectContaining({ action: 'resendInvite', email: 'read@example.com', groupName: 'customer' })
    );
  });
});

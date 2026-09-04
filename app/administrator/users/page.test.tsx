import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import UsersAdminPage from '@/app/administrator/users/page';
import {
  createCustomerUser,
  deleteCustomerUser,
  updateCustomerUser,
  listAllCustomerUsers,
  listCustomers,
  syncViewerSubsForCustomer,
} from '@/lib/queries';

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(async () => ({
    tokens: {
      idToken: {
        toString: () => 'test-token',
      },
    },
  })),
}));

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/app/administrator/users/components/UserSelectorControl', () => ({
  __esModule: true,
  default: () => <div>User Selector</div>,
}));

jest.mock('@/app/administrator/users/components/GroupMembershipSection', () => ({
  __esModule: true,
  default: () => <div>Group Membership</div>,
}));

jest.mock('@/lib/queries', () => ({
  createCustomerUser: jest.fn(),
  deleteCustomerUser: jest.fn(),
  updateCustomerUser: jest.fn(),
  listAllCustomerUsers: jest.fn(),
  listCustomers: jest.fn(),
  syncViewerSubsForCustomer: jest.fn(),
}));

const mockListCustomers = listCustomers as jest.MockedFunction<typeof listCustomers>;
const mockListAllCustomerUsers = listAllCustomerUsers as jest.MockedFunction<typeof listAllCustomerUsers>;
const mockCreateCustomerUser = createCustomerUser as jest.MockedFunction<typeof createCustomerUser>;
const mockUpdateCustomerUser = updateCustomerUser as jest.MockedFunction<typeof updateCustomerUser>;
const mockDeleteCustomerUser = deleteCustomerUser as jest.MockedFunction<typeof deleteCustomerUser>;
const mockSyncViewerSubsForCustomer = syncViewerSubsForCustomer as jest.MockedFunction<typeof syncViewerSubsForCustomer>;

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
    mockSyncViewerSubsForCustomer.mockResolvedValue({ data: {}, errors: [] } as any);

    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ users: [] }),
    })) as jest.Mock;
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

    fireEvent.click(screen.getByRole('button', { name: 'Edit Read User' }));

    const revokeButton = screen.getByRole('button', { name: 'Revoke Access' });
    expect(revokeButton).toHaveClass('nd-btn--danger');
  });

  it('requires confirmation before revoking a customer user from the edit dialog', async () => {
    render(<UsersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Read User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Read User' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Access' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Revoke customer access?' });
    expect(dialog).toHaveTextContent("Revoke Read User's customer access?");
    expect(mockDeleteCustomerUser).not.toHaveBeenCalled();

    // Cancelling closes the dialog without removing.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockDeleteCustomerUser).not.toHaveBeenCalled();

    // Confirming performs the removal.
    fireEvent.click(screen.getByRole('button', { name: 'Edit Read User' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Access' }));

    await waitFor(() => {
      expect(mockDeleteCustomerUser).toHaveBeenCalledWith('cu-1');
    });
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(mockSyncViewerSubsForCustomer).toHaveBeenCalledWith('cust-1', []);
  });

  it('edits display name and role from the edit dialog', async () => {
    render(<UsersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Read User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Read User' }));

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

    expect(screen.getByText('Client users')).toBeInTheDocument();
    expect(screen.getByText('Account owners')).toBeInTheDocument();
    expect(screen.getByText('Invites pending')).toBeInTheDocument();
    expect(screen.getByText('Signed in (7d)')).toBeInTheDocument();
  });

  it('creates a real Cognito login (instead of a pending placeholder) when the invited email has no existing account', async () => {
    global.fetch = jest.fn(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as { action: string };
      if (body.action === 'getUserByEmail') {
        return { ok: false, json: async () => ({ error: 'No user found.' }) };
      }
      if (body.action === 'createUser') {
        return {
          ok: true,
          json: async () => ({ user: { sub: 'brand-new-sub', username: 'new@agency.com.au' }, created: true }),
        };
      }
      return { ok: true, json: async () => ({}) };
    }) as jest.Mock;

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

    expect(screen.getByText(/branded invitation/i)).toBeInTheDocument();

    const calls = (global.fetch as jest.Mock).mock.calls;
    const createUserCall = calls.find(([, init]) => JSON.parse(init.body).action === 'createUser');
    expect(createUserCall).toBeTruthy();
    expect(JSON.parse(createUserCall![1].body)).toMatchObject({
      action: 'createUser',
      email: 'new@agency.com.au',
      groupName: 'customer',
      customerName: 'Acme Customer',
    });
  });
});

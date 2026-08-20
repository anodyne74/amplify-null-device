import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import UsersAdminPage from '@/app/administrator/users/page';
import {
  createCustomerUser,
  deleteCustomerUser,
  listCustomerUsers,
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
  listCustomerUsers: jest.fn(),
  listCustomers: jest.fn(),
  syncViewerSubsForCustomer: jest.fn(),
}));

const mockListCustomers = listCustomers as jest.MockedFunction<typeof listCustomers>;
const mockListCustomerUsers = listCustomerUsers as jest.MockedFunction<typeof listCustomerUsers>;
const mockCreateCustomerUser = createCustomerUser as jest.MockedFunction<typeof createCustomerUser>;
const mockDeleteCustomerUser = deleteCustomerUser as jest.MockedFunction<typeof deleteCustomerUser>;
const mockSyncViewerSubsForCustomer = syncViewerSubsForCustomer as jest.MockedFunction<typeof syncViewerSubsForCustomer>;

describe('UsersAdminPage customer access actions', () => {
  beforeEach(() => {
    mockListCustomers.mockResolvedValue({
      data: [{ id: 'cust-1', name: 'Acme Customer' }],
      nextToken: null,
      errors: [],
    } as any);

    mockListCustomerUsers.mockResolvedValue({
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

  it('renders add as primary and remove as danger in customer access section', async () => {
    render(<UsersAdminPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add customer user' })).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: 'Add customer user' });
    expect(addButton).toHaveClass('nd-btn--primary');

    await waitFor(() => {
      expect(screen.getByText('Read User')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Remove Read User from customer access' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /more customer access actions for read user/i }));

    const removeButton = screen.getByRole('button', { name: 'Remove Read User from customer access' });
    expect(removeButton).toHaveClass('nd-btn--danger');
  });

  it('requires confirmation before removing a customer user', async () => {
    render(<UsersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Read User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /more customer access actions for read user/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Read User from customer access' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Remove customer access?' });
    expect(dialog).toHaveTextContent('Remove Read User from customer access?');
    expect(mockDeleteCustomerUser).not.toHaveBeenCalled();

    // Cancelling closes the dialog without removing.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockDeleteCustomerUser).not.toHaveBeenCalled();

    // Confirming performs the removal (row menu remains open after cancel).
    fireEvent.click(screen.getByRole('button', { name: 'Remove Read User from customer access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove User' }));

    await waitFor(() => {
      expect(mockDeleteCustomerUser).toHaveBeenCalledWith('cu-1');
    });
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(mockSyncViewerSubsForCustomer).toHaveBeenCalledWith('cust-1', []);
  });
});

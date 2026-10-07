import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CustomersAdminPage from '../page';
import { geocodeAddress } from '@/lib/googleMaps';
import { createCustomer, listAllCustomerUsers, listAllCustomers, updateCustomer } from '@/lib/customers';
import { listFeatureFlagSettings } from '@/lib/queries/FeatureFlagSettings';
import { callApi } from '@/lib/apiClient';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ user: { signInDetails: { loginId: 'admin@nulldevice.test' } } }),
}));

jest.mock('@/app/components/ToastProvider', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/app/operator/components/AddressAutocompleteInput', () => ({
  AddressAutocompleteInput: ({
    value,
    onChange,
    placeholder,
    disabled,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  ),
}));

jest.mock('@/lib/googleMaps', () => ({
  geocodeAddress: jest.fn(),
}));

jest.mock('@/lib/routes', () => ({
  listCustomerRoutes: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/lib/customers', () => ({
  createCustomer: jest.fn(),
  createCustomerUser: jest.fn(),
  listAllCustomerUsers: jest.fn().mockResolvedValue({ data: [], errors: undefined }),
  listCustomerUsers: jest.fn().mockResolvedValue([]),
  listAllCustomers: jest.fn(),
  updateCustomer: jest.fn(),
}));

jest.mock('@/lib/apiClient', () => ({
  callApi: jest.fn(),
}));

jest.mock('@/lib/invoices', () => ({
  listCustomerInvoices: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/lib/queries/FeatureFlagSettings', () => ({
  listFeatureFlagSettings: jest.fn(),
}));

describe('Operator Customers Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (geocodeAddress as jest.Mock).mockResolvedValue({
      latitude: 32,
      longitude: -97,
      formattedAddress: '100 Main St, Fort Worth, TX',
    });
    (createCustomer as jest.Mock).mockResolvedValue({ id: 'c-new' });
    (updateCustomer as jest.Mock).mockResolvedValue({ id: 'c-1' });
    (listAllCustomerUsers as jest.Mock).mockResolvedValue([]);
    (listFeatureFlagSettings as jest.Mock).mockResolvedValue([]);
    (callApi as jest.Mock).mockResolvedValue({ users: [] });
  });

  it('submits create customer with standing instructions and defaults', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue([]);

    render(<CustomersAdminPage />);

    fireEvent.click(screen.getByRole('button', { name: /new customer/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Acme Corp' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'acme@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Billing rate per hour'), { target: { value: '120' } });
    fireEvent.change(screen.getByPlaceholderText('Default number of signs'), { target: { value: '4' } });
    fireEvent.change(screen.getByPlaceholderText('Address'), { target: { value: '100 Main St' } });
    fireEvent.change(screen.getByLabelText('Add agent'), { target: { value: 'Jamie Lee' } });
    fireEvent.click(screen.getByRole('button', { name: /^add agent$/i }));
    fireEvent.change(screen.getByLabelText('Add agent'), { target: { value: 'Pat Doe' } });
    fireEvent.click(screen.getByRole('button', { name: /^add agent$/i }));
    fireEvent.change(screen.getByPlaceholderText('Standing instructions for operators'), {
      target: { value: 'Call customer before placing signs.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create customer/i }));

    await waitFor(() => {
      expect(createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Acme Corp',
          email: 'acme@example.com',
          billingRatePerHour: 120,
          addressLine1: '100 Main St, Fort Worth, TX',
          standingInstructions: 'Call customer before placing signs.',
          defaultNumberOfSigns: 4,
          agentOptions: ['Jamie Lee', 'Pat Doe'],
        })
      );
    });
  });

  it('saves edited defaults from the configure panel', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue([
      {
        id: 'c-1',
        name: 'Acme Corp',
        email: 'acme@example.com',
        billingRatePerHour: 95,
        status: 'active',
        addressLine1: '11 Old St',
        standingInstructions: 'Legacy instructions',
        defaultNumberOfSigns: 2,
        defaultAgentName: 'Pat Doe',
        defaultAgentInitials: 'PD',
        agentOptions: ['Pat Doe', 'Jamie Lee'],
      },
    ]);

    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    const customerRow = screen.getByText('Acme Corp').closest('tr');
    expect(customerRow).not.toBeNull();
    const rowScope = within(customerRow as HTMLElement);

    expect(rowScope.getByText('Active')).toBeInTheDocument();

    fireEvent.click(rowScope.getByRole('button', { name: /configure customer acme corp/i }));

    const editPanelHeading = await screen.findByRole('heading', { name: /configure: acme corp/i });
    const editPanel = editPanelHeading.closest('.nd-card');
    expect(editPanel).not.toBeNull();
    const scoped = within(editPanel as HTMLElement);

    fireEvent.change(scoped.getByPlaceholderText('Default number of signs'), { target: { value: '6' } });

    // Remove the "Pat Doe" agent chip and add "Alex Roe" via the tag-chip editor.
    const patDoeChip = scoped.getByText('Pat Doe').closest('span') as HTMLElement;
    fireEvent.click(within(patDoeChip).getByRole('button', { name: /remove/i }));
    fireEvent.change(scoped.getByLabelText('Add agent'), { target: { value: 'Alex Roe' } });
    fireEvent.click(scoped.getByRole('button', { name: /^add agent$/i }));

    fireEvent.change(scoped.getByPlaceholderText('Standing instructions for operators'), {
      target: { value: 'Updated standing instructions.' },
    });

    fireEvent.click(scoped.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith(
        'c-1',
        expect.objectContaining({
          standingInstructions: 'Updated standing instructions.',
          defaultNumberOfSigns: 6,
          agentOptions: ['Jamie Lee', 'Alex Roe'],
        })
      );
    });

    // The configure panel stays open showing the success message until the user closes it.
    expect(await screen.findByText('Customer updated.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /configure: acme corp/i })).toBeInTheDocument();
  });

  it('switches Missing Signs reports on for a customer (#468)', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue([
      { id: 'c-1', name: 'Acme Corp', email: 'acme@example.com', billingRatePerHour: 95, status: 'active', addressLine1: '11 Old St' },
    ]);

    render(<CustomersAdminPage />);
    const customerRow = (await screen.findByText('Acme Corp')).closest('tr') as HTMLElement;
    fireEvent.click(within(customerRow).getByRole('button', { name: /configure customer acme corp/i }));
    const panel = (await screen.findByRole('heading', { name: /configure: acme corp/i })).closest('.nd-card') as HTMLElement;
    const scoped = within(panel);

    const reports = scoped.getByRole('checkbox', { name: /^Email Missing Signs reports/ });
    expect(reports).not.toBeChecked();
    fireEvent.click(reports);
    fireEvent.click(scoped.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateCustomer).toHaveBeenCalledWith('c-1', expect.objectContaining({ missingSignsReportEnabled: true }))
    );
  });

  it('sets an agent as the default by clicking its tag', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue([
      {
        id: 'c-1',
        name: 'Acme Corp',
        email: 'acme@example.com',
        billingRatePerHour: 95,
        status: 'active',
        addressLine1: '11 Old St',
        agentOptions: ['Pat Doe', 'Jamie Lee'],
      },
    ]);

    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /configure customer acme corp/i }));
    await screen.findByRole('heading', { name: /configure: acme corp/i });

    fireEvent.click(screen.getByText('Jamie Lee'));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith(
        'c-1',
        expect.objectContaining({ agentOptions: ['Jamie Lee', 'Pat Doe'] })
      );
    });
  });

  it('suspends and reactivates a customer account from the configure panel', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue([
      {
        id: 'c-1',
        name: 'Acme Corp',
        email: 'acme@example.com',
        billingRatePerHour: 95,
        status: 'active',
        addressLine1: '11 Old St',
      },
    ]);

    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /configure customer acme corp/i }));
    await screen.findByRole('heading', { name: /configure: acme corp/i });

    fireEvent.click(screen.getByRole('button', { name: /suspend account acme corp/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith('c-1', expect.objectContaining({ status: 'suspended' }));
    });

    expect(await screen.findByText('Customer suspended.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reactivate account acme corp/i })).toBeInTheDocument();
  });

  it('does not re-geocode an unchanged address when saving other edits (#58)', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue([
      {
        id: 'c-1',
        name: 'Acme Corp',
        email: 'acme@example.com',
        billingRatePerHour: 95,
        status: 'active',
        addressLine1: '11 Old St',
        standingInstructions: 'Legacy instructions',
        defaultNumberOfSigns: 2,
        defaultAgentName: 'Pat Doe',
        defaultAgentInitials: 'PD',
        agentOptions: ['Pat Doe', 'Jamie Lee'],
      },
    ]);

    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /configure customer acme corp/i }));

    const editPanelHeading = await screen.findByRole('heading', { name: /configure: acme corp/i });
    const scoped = within(editPanelHeading.closest('.nd-card') as HTMLElement);

    // Only touch a non-address field — the address input is left exactly as loaded.
    fireEvent.change(scoped.getByPlaceholderText('Default number of signs'), { target: { value: '6' } });

    fireEvent.click(scoped.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith(
        'c-1',
        expect.objectContaining({ addressLine1: '11 Old St', defaultNumberOfSigns: 6 })
      );
    });

    // A genuine live re-validation of an unchanged address was the hang vector in #58.
    expect(geocodeAddress).not.toHaveBeenCalled();
    expect(await screen.findByText('Customer updated.')).toBeInTheDocument();
  });

  it('navigates to payment details for the selected customer', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue([
      {
        id: 'c-1',
        name: 'Acme Corp',
        email: 'acme@example.com',
        billingRatePerHour: 95,
        status: 'active',
      },
    ]);

    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /payment details for acme corp/i }));

    expect(mockPush).toHaveBeenCalledWith('/administrator/payment-details?customerId=c-1');
  });

  it('shows a per-customer user count from listAllCustomerUsers', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue([
      { id: 'c-1', name: 'Acme Corp', email: 'a@example.com', billingRatePerHour: 95, status: 'active' },
    ]);
    (listAllCustomerUsers as jest.Mock).mockResolvedValue([
      { id: 'u-1', customerId: 'c-1' },
      { id: 'u-2', customerId: 'c-1' },
      { id: 'u-3', customerId: 'c-2' },
    ]);

    render(<CustomersAdminPage />);

    const customerRow = await screen.findByText('Acme Corp').then((el) => el.closest('tr') as HTMLElement);
    await waitFor(() => {
      expect(within(customerRow).getByText('2')).toBeInTheDocument();
    });
  });

  it('sorts the customer list by name', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue([
      { id: 'c-1', name: 'Zenith Co', email: 'z@example.com', billingRatePerHour: 95, status: 'active' },
      { id: 'c-2', name: 'Acme Corp', email: 'a@example.com', billingRatePerHour: 95, status: 'inactive' },
    ]);

    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Zenith Co')).toBeInTheDocument();
    });

    const firstDataRow = () => screen.getAllByRole('row')[1];

    // Default order matches the fetched order.
    expect(firstDataRow()).toHaveTextContent('Zenith Co');

    const sortByName = screen.getByRole('button', { name: 'Sort by Customer' });
    fireEvent.click(sortByName);
    expect(sortByName.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    expect(firstDataRow()).toHaveTextContent('Acme Corp');

    fireEvent.click(sortByName);
    expect(sortByName.closest('th')).toHaveAttribute('aria-sort', 'descending');
    expect(firstDataRow()).toHaveTextContent('Zenith Co');

    // Status is sortable as well.
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Status' }));
    expect(firstDataRow()).toHaveTextContent('Zenith Co'); // active < inactive
  });

  it('uses the shared sortable header for every sortable column (#442)', async () => {
    // The shared AdminSortableHeader carries the themed header treatment; a
    // page-local copy drifts from it.
    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByRole('table', { name: 'Customer list' })).toBeInTheDocument();
    });

    for (const label of ['Customer', 'Status']) {
      expect(screen.getByRole('button', { name: `Sort by ${label}` })).toHaveClass('sortHeaderButton');
    }
  });

  it('offers a retry action when loading customers fails', async () => {
    (listAllCustomers as jest.Mock)
      .mockRejectedValueOnce(new Error('customer read failed'))
      .mockResolvedValueOnce([
        {
          id: 'c-1',
          name: 'Acme Corp',
          email: 'acme@example.com',
          billingRatePerHour: 95,
          status: 'active',
        },
      ]);

    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load customers.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading customers' }));

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });
    expect(screen.queryByText('Failed to load customers.')).not.toBeInTheDocument();
  });
  describe('Customer Users (#502)', () => {
    async function openAcme() {
      (listAllCustomers as jest.Mock).mockResolvedValue([
        { id: 'c-1', name: 'Acme Corp', email: 'acme@example.com', status: 'active', addressLine1: '1 St' },
      ]);
      (listAllCustomerUsers as jest.Mock).mockResolvedValue([
        { id: 'u-1', customerId: 'c-1', userSub: 'sub-1', name: 'Pat Owner', email: 'pat@acme.test', role: 'account_owner' },
        { id: 'u-2', customerId: 'c-1', userSub: 'sub-2', name: 'Kim Lee', email: 'kim@acme.test', role: 'read_only' },
        { id: 'u-3', customerId: 'c-2', userSub: 'sub-3', name: 'Other Person', email: 'o@other.test', role: 'read_only' },
      ]);
      render(<CustomersAdminPage />);
      fireEvent.click(await screen.findByRole('button', { name: /configure customer acme corp/i }));
      return screen.findByRole('table', { name: 'Customer Users' });
    }

    it("lists only this Customer's users, with Resend invite for those who haven't signed in", async () => {
      (callApi as jest.Mock).mockResolvedValue({
        users: [
          { sub: 'sub-1', status: 'CONFIRMED' },
          { sub: 'sub-2', status: 'FORCE_CHANGE_PASSWORD' },
        ],
      });
      const table = await openAcme();

      expect(callApi).toHaveBeenCalledWith('/api/admin/users', { action: 'listUsersInGroup', groupName: 'customer' });
      expect(within(table).getByText('Pat Owner')).toBeInTheDocument();
      expect(within(table).getByText('Kim Lee')).toBeInTheDocument();
      expect(within(table).queryByText('Other Person')).not.toBeInTheDocument();
      expect(await within(table).findByRole('button', { name: 'Resend invite to Kim Lee' })).toBeInTheDocument();
      expect(within(table).queryByRole('button', { name: 'Resend invite to Pat Owner' })).not.toBeInTheDocument();
    });

    it('shows statuses as unknown, with no Resend invite, when they cannot be read', async () => {
      (callApi as jest.Mock).mockRejectedValue(new Error('denied'));
      const table = await openAcme();

      expect(within(table).getAllByText('unknown')).toHaveLength(2);
      expect(within(table).queryByRole('button', { name: /Resend invite/ })).not.toBeInTheDocument();
    });
  });

  describe('feature flags', () => {
    async function openAcme() {
      (listAllCustomers as jest.Mock).mockResolvedValue([{ id: 'c-1', name: 'Acme Corp', email: 'acme@example.com', status: 'active', addressLine1: '1 St' }]);
      render(<CustomersAdminPage />);
      fireEvent.click(await screen.findByRole('button', { name: /configure customer acme corp/i }));
      await screen.findByRole('heading', { name: /configure: acme corp/i });
    }

    it('lists the flags on for the Customer and keeps "First user invited" in the checklist', async () => {
      (listFeatureFlagSettings as jest.Mock).mockResolvedValue([
        { id: 'account-owner-invite', state: 'selected', selectedCustomerIds: ['c-1'] },
        { id: 'retired', state: 'everyone' },
      ]);
      await openAcme();

      const list = await screen.findByRole('list', { name: 'Feature flags on' });
      expect(within(list).getByText('Account Owner invites users')).toBeInTheDocument();
      expect(within(list).queryByText('retired')).not.toBeInTheDocument();
      expect(screen.getByText('First user invited')).toBeInTheDocument();
    });

    it('omits "First user invited" and says no flags are on when account-owner-invite is off', async () => {
      (listFeatureFlagSettings as jest.Mock).mockResolvedValue([{ id: 'account-owner-invite', state: 'selected', selectedCustomerIds: ['c-2'] }]);
      await openAcme();

      expect(await screen.findByText(/This Customer sees no flagged features/)).toBeInTheDocument();
      expect(screen.getByText('First route built')).toBeInTheDocument();
      expect(screen.queryByText('First user invited')).not.toBeInTheDocument();
    });

    it('says so, and omits the user-invited item, when the flags cannot be read', async () => {
      (listFeatureFlagSettings as jest.Mock).mockRejectedValue(new Error('read failed'));
      await openAcme();

      expect(await screen.findByText('Could not load feature flags.')).toBeInTheDocument();
      expect(screen.queryByText('First user invited')).not.toBeInTheDocument();
    });
  });
});

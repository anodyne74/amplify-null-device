import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CustomersAdminPage from '../page';
import { createCustomer, listAllCustomerUsers, listCustomers, updateCustomer } from '@/lib/queries';
import { geocodeAddress } from '@/lib/googleMaps';

jest.mock('@/app/dashboard.module.css', () => ({}));

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

jest.mock('@/lib/queries', () => ({
  createCustomer: jest.fn(),
  createCustomerUser: jest.fn(),
  listAllCustomerUsers: jest.fn().mockResolvedValue({ data: [], errors: undefined }),
  listCustomerUsers: jest.fn().mockResolvedValue({ data: [], errors: undefined }),
  listCustomerRoutes: jest.fn().mockResolvedValue({ data: [], errors: undefined }),
  listCustomerInvoices: jest.fn().mockResolvedValue({ data: [], errors: undefined }),
  listCustomers: jest.fn(),
  syncViewerSubsForCustomer: jest.fn(),
  updateCustomer: jest.fn(),
}));

describe('Operator Customers Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (geocodeAddress as jest.Mock).mockResolvedValue({
      latitude: 32,
      longitude: -97,
      formattedAddress: '100 Main St, Fort Worth, TX',
    });
    (createCustomer as jest.Mock).mockResolvedValue({ data: { id: 'c-new' }, errors: undefined });
    (updateCustomer as jest.Mock).mockResolvedValue({ data: { id: 'c-1' }, errors: undefined });
    (listAllCustomerUsers as jest.Mock).mockResolvedValue({ data: [], errors: undefined });
  });

  it('submits create customer with standing instructions and defaults', async () => {
    (listCustomers as jest.Mock).mockResolvedValue({ data: [], errors: undefined });

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
    (listCustomers as jest.Mock).mockResolvedValue({
      data: [
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
      ],
      errors: undefined,
    });

    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    const customerRow = screen.getByText('Acme Corp').closest('tr');
    expect(customerRow).not.toBeNull();
    const rowScope = within(customerRow as HTMLElement);

    expect(rowScope.getByText('Active')).toBeInTheDocument();

    fireEvent.click(rowScope.getByRole('button', { name: /configure customer acme corp/i }));

    const editPanelHeading = await screen.findByRole('heading', { name: /configure — acme corp/i });
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
    expect(screen.getByRole('heading', { name: /configure — acme corp/i })).toBeInTheDocument();
  });

  it('sets an agent as the default by clicking its tag', async () => {
    (listCustomers as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'c-1',
          name: 'Acme Corp',
          email: 'acme@example.com',
          billingRatePerHour: 95,
          status: 'active',
          addressLine1: '11 Old St',
          agentOptions: ['Pat Doe', 'Jamie Lee'],
        },
      ],
      errors: undefined,
    });

    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /configure customer acme corp/i }));
    await screen.findByRole('heading', { name: /configure — acme corp/i });

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
    (listCustomers as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'c-1',
          name: 'Acme Corp',
          email: 'acme@example.com',
          billingRatePerHour: 95,
          status: 'active',
          addressLine1: '11 Old St',
        },
      ],
      errors: undefined,
    });

    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /configure customer acme corp/i }));
    await screen.findByRole('heading', { name: /configure — acme corp/i });

    fireEvent.click(screen.getByRole('button', { name: /suspend account acme corp/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith('c-1', expect.objectContaining({ status: 'suspended' }));
    });

    expect(await screen.findByText('Customer suspended.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reactivate account acme corp/i })).toBeInTheDocument();
  });

  it('does not re-geocode an unchanged address when saving other edits (#58)', async () => {
    (listCustomers as jest.Mock).mockResolvedValue({
      data: [
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
      ],
      errors: undefined,
    });

    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /configure customer acme corp/i }));

    const editPanelHeading = await screen.findByRole('heading', { name: /configure — acme corp/i });
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
    (listCustomers as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'c-1',
          name: 'Acme Corp',
          email: 'acme@example.com',
          billingRatePerHour: 95,
          status: 'active',
        },
      ],
      errors: undefined,
    });

    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /payment details for acme corp/i }));

    expect(mockPush).toHaveBeenCalledWith('/administrator/payment-details?customerId=c-1');
  });

  it('shows a per-customer user count from listAllCustomerUsers', async () => {
    (listCustomers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'c-1', name: 'Acme Corp', email: 'a@example.com', billingRatePerHour: 95, status: 'active' },
      ],
      errors: undefined,
    });
    (listAllCustomerUsers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'u-1', customerId: 'c-1' },
        { id: 'u-2', customerId: 'c-1' },
        { id: 'u-3', customerId: 'c-2' },
      ],
      errors: undefined,
    });

    render(<CustomersAdminPage />);

    const customerRow = await screen.findByText('Acme Corp').then((el) => el.closest('tr') as HTMLElement);
    await waitFor(() => {
      expect(within(customerRow).getByText('2')).toBeInTheDocument();
    });
  });

  it('sorts the customer list by name and shows the pagination summary', async () => {
    (listCustomers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'c-1', name: 'Zenith Co', email: 'z@example.com', billingRatePerHour: 95, status: 'active' },
        { id: 'c-2', name: 'Acme Corp', email: 'a@example.com', billingRatePerHour: 95, status: 'inactive' },
      ],
      errors: undefined,
    });

    render(<CustomersAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Zenith Co')).toBeInTheDocument();
    });

    expect(screen.getByText('Showing 1–2 of 2 customers')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page of customers' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page of customers' })).toBeDisabled();

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

  it('offers a retry action when loading customers fails', async () => {
    (listCustomers as jest.Mock)
      .mockResolvedValueOnce({ data: null, errors: [new Error('network')] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'c-1',
            name: 'Acme Corp',
            email: 'acme@example.com',
            billingRatePerHour: 95,
            status: 'active',
          },
        ],
        errors: undefined,
      });

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
});

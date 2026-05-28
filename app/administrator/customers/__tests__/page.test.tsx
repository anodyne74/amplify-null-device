import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CustomersAdminPage from '../page';
import { createCustomer, listCustomers, updateCustomer } from '@/lib/queries';
import { geocodeAddress } from '@/lib/googleMaps';

jest.mock('@/app/dashboard.module.css', () => ({}));

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
  listCustomerUsers: jest.fn(),
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
    fireEvent.change(screen.getByPlaceholderText('Default agent name'), { target: { value: 'Jamie Lee' } });
    fireEvent.change(screen.getByPlaceholderText('Address'), { target: { value: '100 Main St' } });
    fireEvent.change(screen.getByPlaceholderText('Agent options, one per line'), {
      target: { value: 'Jamie Lee\nPat Doe' },
    });
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
          defaultAgentName: 'Jamie Lee',
          agentOptions: ['Jamie Lee', 'Pat Doe'],
        })
      );
    });
  });

  it('saves edited defaults from the customer edit panel', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    const editPanelHeading = await screen.findByText(/edit customer/i);
    const editPanel = editPanelHeading.closest('div');
    expect(editPanel).not.toBeNull();
    const scoped = within(editPanel as HTMLElement);

    fireEvent.change(scoped.getByPlaceholderText('Default number of signs'), { target: { value: '6' } });
    fireEvent.change(scoped.getByPlaceholderText('Default agent name'), { target: { value: 'Jamie Lee' } });
    fireEvent.change(scoped.getByPlaceholderText('Agent options, one per line'), {
      target: { value: 'Jamie Lee\nAlex Roe' },
    });
    fireEvent.change(scoped.getByPlaceholderText('Standing instructions for operators'), {
      target: { value: 'Updated standing instructions.' },
    });

    fireEvent.click(scoped.getByRole('button', { name: /save customer/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith(
        'c-1',
        expect.objectContaining({
          standingInstructions: 'Updated standing instructions.',
          defaultNumberOfSigns: 6,
          defaultAgentName: 'Jamie Lee',
          agentOptions: ['Jamie Lee', 'Alex Roe'],
        })
      );
    });
  });
});

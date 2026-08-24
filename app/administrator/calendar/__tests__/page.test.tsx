import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import AdministratorCalendarPage from '../page';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ user: { userId: 'admin-sub-1' } }),
}));

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/queries/ListAllCustomers', () => ({
  listAllCustomers: jest.fn(),
}));

jest.mock('@/app/components/ServiceCalendar', () => ({
  ServiceCalendar: ({ customerId, role }: { customerId: string; role: string }) => (
    <div data-testid="service-calendar">{role}:{customerId}</div>
  ),
}));

describe('Administrator Calendar page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listAllCustomers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'cust-1', name: 'Harcourts Epping', viewerSubs: ['sub-a'] },
        { id: 'cust-2', name: 'Ray White Eastwood', viewerSubs: ['sub-b'] },
      ],
      errors: undefined,
    });
  });

  it('loads customers and renders the calendar for the first one in staff role', async () => {
    render(<AdministratorCalendarPage />);

    await waitFor(() => {
      expect(screen.getByTestId('service-calendar')).toHaveTextContent('staff:cust-1');
    });

    expect(screen.getByRole('option', { name: 'Harcourts Epping' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ray White Eastwood' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no customers', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue({ data: [], errors: undefined });

    render(<AdministratorCalendarPage />);

    expect(await screen.findByText(/no customers found/i)).toBeInTheDocument();
  });
});

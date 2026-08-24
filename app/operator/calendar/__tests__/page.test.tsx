import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import OperatorCalendarPage from '../page';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ user: { userId: 'operator-sub-1' } }),
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

describe('Operator Calendar page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listAllCustomers as jest.Mock).mockResolvedValue({
      data: [{ id: 'cust-1', name: 'Harcourts Epping', viewerSubs: ['sub-a'] }],
      errors: undefined,
    });
  });

  it('loads customers and renders the calendar in staff role', async () => {
    render(<OperatorCalendarPage />);

    await waitFor(() => {
      expect(screen.getByTestId('service-calendar')).toHaveTextContent('staff:cust-1');
    });
  });
});

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import CustomerCalendarPage from '../page';
import { getCustomer, getCustomerPortalContext } from '@/lib/queries';

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ user: { userId: 'reviewer-sub' } }),
}));

jest.mock('@/app/components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/queries', () => ({
  getCustomer: jest.fn(),
  getCustomerPortalContext: jest.fn(),
}));

jest.mock('@/app/components/ServiceCalendar', () => ({
  ServiceCalendar: ({ customerId, role, viewerSubs }: { customerId: string; role: string; viewerSubs: string[] }) => (
    <div data-testid="service-calendar">{role}:{customerId}:{viewerSubs.join(',')}</div>
  ),
}));

describe('Customer Calendar page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCustomer as jest.Mock).mockResolvedValue({
      data: { id: 'cust-1', viewerSubs: ['owner-sub', 'reviewer-sub'] },
      errors: undefined,
    });
  });

  it('maps account_owner role to customer-admin', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });

    render(<CustomerCalendarPage />);

    await waitFor(() => {
      expect(screen.getByTestId('service-calendar')).toHaveTextContent('customer-admin:cust-1:owner-sub,reviewer-sub');
    });
  });

  it('maps read_only role to customer-readonly', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });

    render(<CustomerCalendarPage />);

    await waitFor(() => {
      expect(screen.getByTestId('service-calendar')).toHaveTextContent('customer-readonly:cust-1:owner-sub,reviewer-sub');
    });
  });
});

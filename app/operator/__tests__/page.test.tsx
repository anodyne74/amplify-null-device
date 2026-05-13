import { render, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';
import OperatorPage from '@/app/operator/page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
}));

jest.mock('@/lib/use-user-groups', () => ({
  useUserGroups: jest.fn(),
}));

describe('OperatorPage', () => {
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push });
  });

  it('redirects administrator-only users to administrator portal', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({ authStatus: 'authenticated' });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['administrator'],
      loading: false,
      isAdmin: true,
      isOperator: false,
      isCustomer: false,
    });

    render(<OperatorPage />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/administrator');
    });
  });

  it('redirects operator users to operator dashboard', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({ authStatus: 'authenticated' });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['operator'],
      loading: false,
      isAdmin: false,
      isOperator: true,
      isCustomer: false,
    });
    render(<OperatorPage />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/operator/dashboard');
    });
  });

  it('redirects dual-role users to operator dashboard', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({ authStatus: 'authenticated' });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['administrator', 'operator'],
      loading: false,
      isAdmin: true,
      isOperator: true,
      isCustomer: false,
    });

    render(<OperatorPage />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/operator/dashboard');
    });
  });

  it('redirects customers to customer dashboard', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({ authStatus: 'authenticated' });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['customer'],
      loading: false,
      isAdmin: false,
      isOperator: false,
      isCustomer: true,
    });

    render(<OperatorPage />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/customer/dashboard');
    });
  });
});
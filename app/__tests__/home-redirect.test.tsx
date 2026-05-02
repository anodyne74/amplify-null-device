import { render, waitFor } from '@testing-library/react';
import Home from '@/app/page';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
}));

jest.mock('@/lib/use-user-groups', () => ({
  useUserGroups: jest.fn(),
}));

describe('Home Redirect', () => {
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push });
  });

  it('redirects administrators to /operator/admin', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: false,
      isAdmin: true,
      isOperator: true,
      isCustomer: false,
    });

    render(<Home />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/operator/admin');
    });
  });

  it('redirects operators to /operator/dashboard', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: false,
      isAdmin: false,
      isOperator: true,
      isCustomer: false,
    });

    render(<Home />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/operator/dashboard');
    });
  });

  it('redirects customers to /customer/dashboard', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: false,
      isAdmin: false,
      isOperator: false,
      isCustomer: true,
    });

    render(<Home />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/customer/dashboard');
    });
  });

  it('redirects pending users to /pending-approval', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: false,
      isAdmin: false,
      isOperator: false,
      isCustomer: false,
    });

    render(<Home />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/pending-approval');
    });
  });
});

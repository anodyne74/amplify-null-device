import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';
import OperatorRoute from '@/app/components/OperatorRoute';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
}));

jest.mock('@/lib/use-user-groups', () => ({
  useUserGroups: jest.fn(),
}));

describe('OperatorRoute', () => {
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push });
  });

  it('allows operator role users to access non-admin routes', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: false,
      isAdmin: false,
      isOperator: true,
      isCustomer: false,
    });

    render(
      <OperatorRoute>
        <div>Protected content</div>
      </OperatorRoute>
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('redirects administrators away from operator routes', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: false,
      isAdmin: true,
      isOperator: false,
      isCustomer: false,
    });

    render(
      <OperatorRoute>
        <div>Protected content</div>
      </OperatorRoute>
    );

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/administrator');
    });
  });

  it('allows dual-role users to access operator routes', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: false,
      isAdmin: true,
      isOperator: true,
      isCustomer: false,
    });

    render(
      <OperatorRoute>
        <div>Operator content</div>
      </OperatorRoute>
    );

    expect(screen.getByText('Operator content')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('allows administrators to access admin-only routes', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: false,
      isAdmin: true,
      isOperator: false,
      isCustomer: false,
    });

    render(
      <OperatorRoute requireAdmin>
        <div>Admin content</div>
      </OperatorRoute>
    );

    expect(screen.getByText('Admin content')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('redirects operator-mode users away from admin-only routes', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: false,
      isAdmin: false,
      isOperator: true,
      isCustomer: false,
    });

    render(
      <OperatorRoute requireAdmin>
        <div>Admin content</div>
      </OperatorRoute>
    );

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/operator/dashboard');
    });
  });

  it('redirects non-operator users to customer portal', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: false,
      isAdmin: false,
      isOperator: false,
      isCustomer: true,
    });

    render(
      <OperatorRoute>
        <div>Operator content</div>
      </OperatorRoute>
    );

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/customer/dashboard');
    });
  });

  it('redirects unauthenticated users to home', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'unauthenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: false,
      isAdmin: false,
      isOperator: false,
      isCustomer: false,
    });

    render(
      <OperatorRoute>
        <div>Protected content</div>
      </OperatorRoute>
    );

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/');
    });
  });

  it('shows loading spinner while authenticating', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'configuring',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: true,
      isAdmin: false,
      isOperator: false,
      isCustomer: false,
    });

    render(
      <OperatorRoute>
        <div>Protected content</div>
      </OperatorRoute>
    );

    expect(screen.getByText(/verifying operator access/i)).toBeInTheDocument();
  });

  it('shows admin-specific loading message for admin routes', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'configuring',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: true,
      isAdmin: false,
      isOperator: false,
      isCustomer: false,
    });

    render(
      <OperatorRoute requireAdmin>
        <div>Admin content</div>
      </OperatorRoute>
    );

    expect(screen.getByText(/verifying administrator access/i)).toBeInTheDocument();
  });
});

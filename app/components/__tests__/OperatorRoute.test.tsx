import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';
import { useActiveOperatorRole } from '@/lib/useActiveOperatorRole';
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

jest.mock('@/lib/useActiveOperatorRole', () => ({
  useActiveOperatorRole: jest.fn(),
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
    (useActiveOperatorRole as jest.Mock).mockReturnValue({
      activeRole: 'operator',
      isOperatorMode: true,
    });

    const { container } = render(
      <OperatorRoute>
        <div>Protected content</div>
      </OperatorRoute>
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('allows administrator role users to access non-admin routes', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: false,
      isAdmin: true,
      isOperator: true,
      isCustomer: false,
    });
    (useActiveOperatorRole as jest.Mock).mockReturnValue({
      activeRole: 'administrator',
      isOperatorMode: false,
    });

    render(
      <OperatorRoute>
        <div>Protected content</div>
      </OperatorRoute>
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('allows administrator role users to access admin-only routes', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      loading: false,
      isAdmin: true,
      isOperator: true,
      isCustomer: false,
    });
    (useActiveOperatorRole as jest.Mock).mockReturnValue({
      activeRole: 'administrator',
      isOperatorMode: false,
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
      isAdmin: true,
      isOperator: true,
      isCustomer: false,
    });
    (useActiveOperatorRole as jest.Mock).mockReturnValue({
      activeRole: 'operator',
      isOperatorMode: true,
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
    (useActiveOperatorRole as jest.Mock).mockReturnValue({
      activeRole: null,
      isOperatorMode: false,
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
    (useActiveOperatorRole as jest.Mock).mockReturnValue({
      activeRole: null,
      isOperatorMode: false,
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
    (useActiveOperatorRole as jest.Mock).mockReturnValue({
      activeRole: null,
      isOperatorMode: false,
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
    (useActiveOperatorRole as jest.Mock).mockReturnValue({
      activeRole: null,
      isOperatorMode: false,
    });

    render(
      <OperatorRoute requireAdmin>
        <div>Admin content</div>
      </OperatorRoute>
    );

    expect(screen.getByText(/verifying administrator access/i)).toBeInTheDocument();
  });
});

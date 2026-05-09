import { render, screen, waitFor } from '@testing-library/react';
import OperatorRoute from '@/app/components/OperatorRoute';
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

jest.mock('@/app/components/LoadingSpinner', () => ({
  __esModule: true,
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

describe('OperatorRoute requireAdmin', () => {
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push });
  });

  it('renders children for administrator', () => {
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
  });

  it('redirects non-admin operator to operator dashboard', async () => {
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
});

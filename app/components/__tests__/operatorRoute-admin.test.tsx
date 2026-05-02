import { render, screen, waitFor } from '@testing-library/react';
import OperatorRoute from '@/app/components/OperatorRoute';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { isAdmin, isOperator } from '@/lib/amplify-config';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
}));

jest.mock('@/lib/amplify-config', () => ({
  isAdmin: jest.fn(),
  isOperator: jest.fn(),
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
      user: { username: 'admin-user' },
    });
    (isAdmin as jest.Mock).mockReturnValue(true);
    (isOperator as jest.Mock).mockReturnValue(true);

    render(
      <OperatorRoute requireAdmin>
        <div>Admin content</div>
      </OperatorRoute>
    );

    expect(screen.getByText('Admin content')).toBeInTheDocument();
  });

  it('redirects non-admin operator to customer dashboard', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
      user: { username: 'operator-user' },
    });
    (isAdmin as jest.Mock).mockReturnValue(false);
    (isOperator as jest.Mock).mockReturnValue(true);

    render(
      <OperatorRoute requireAdmin>
        <div>Admin content</div>
      </OperatorRoute>
    );

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/customer/dashboard');
    });
  });
});

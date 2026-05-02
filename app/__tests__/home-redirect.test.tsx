import { render, waitFor } from '@testing-library/react';
import Home from '@/app/page';
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

describe('Home Redirect', () => {
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push });
  });

  it('redirects administrators to /operator/admin', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
      user: { username: 'admin-user' },
    });
    (isAdmin as jest.Mock).mockReturnValue(true);
    (isOperator as jest.Mock).mockReturnValue(true);

    render(<Home />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/operator/admin');
    });
  });

  it('redirects operators to /operator/dashboard', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
      user: { username: 'operator-user' },
    });
    (isAdmin as jest.Mock).mockReturnValue(false);
    (isOperator as jest.Mock).mockReturnValue(true);

    render(<Home />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/operator/dashboard');
    });
  });

  it('redirects customers to /customer/dashboard', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
      user: { username: 'customer-user' },
    });
    (isAdmin as jest.Mock).mockReturnValue(false);
    (isOperator as jest.Mock).mockReturnValue(false);

    render(<Home />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/customer/dashboard');
    });
  });
});

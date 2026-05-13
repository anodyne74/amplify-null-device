import { render, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';
import Home from '@/app/page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
}));

jest.mock('@/lib/use-user-groups', () => ({
  useUserGroups: jest.fn(),
}));

describe('Home Administrator Redirect', () => {
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push });
  });

  it('redirects administrator-only users to administrator root', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({ authStatus: 'authenticated' });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['administrator'],
      loading: false,
      isAdmin: true,
      isOperator: false,
      isCustomer: false,
    });

    render(<Home />);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/administrator');
    });
  });

  it('shows administrator and customer options when both roles exist', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({ authStatus: 'authenticated' });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['administrator', 'customer'],
      loading: false,
      isAdmin: true,
      isOperator: false,
      isCustomer: true,
    });

    render(<Home />);

    expect(push).not.toHaveBeenCalled();
  });

  it('offers operator portal when administrator group is present', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({ authStatus: 'authenticated' });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['administrator', 'operator', 'customer'],
      loading: false,
      isAdmin: true,
      isOperator: true,
      isCustomer: true,
    });

    const { queryByRole } = render(<Home />);

    expect(queryByRole('button', { name: 'Operator Portal' })).toBeInTheDocument();
  });
});
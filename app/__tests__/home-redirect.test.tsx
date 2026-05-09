import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    localStorage.clear();
    (useRouter as jest.Mock).mockReturnValue({ push });
  });

  it('redirects administrators to /administrator', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
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

  it('redirects operators to /operator/dashboard', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['operator'],
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
      groups: ['customer'],
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
      groups: [],
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

  it('shows role selector when user has administrator and customer roles', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['administrator', 'customer'],
      loading: false,
      isAdmin: true,
      isOperator: false,
      isCustomer: true,
    });

    render(<Home />);

    expect(screen.getByText(/choose portal role/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Administrator Portal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Customer Portal' })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('navigates to selected role from selector', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['administrator', 'customer'],
      loading: false,
      isAdmin: true,
      isOperator: false,
      isCustomer: true,
    });

    render(<Home />);

    fireEvent.click(screen.getByRole('button', { name: 'Administrator Portal' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/administrator');
    });
  });

  it('shows all portal role options in expected order when user has all roles', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['administrator', 'operator', 'customer'],
      loading: false,
      isAdmin: true,
      isOperator: true,
      isCustomer: true,
    });

    render(<Home />);

    const roleButtons = screen.getAllByRole('button');
    expect(roleButtons.map((button) => button.textContent)).toEqual([
      'Administrator Portal',
      'Customer Portal',
    ]);
  });

  it('still allows operator-only users to choose operator portal', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['operator', 'customer'],
      loading: false,
      isAdmin: false,
      isOperator: true,
      isCustomer: true,
    });

    render(<Home />);

    fireEvent.click(screen.getByRole('button', { name: 'Operator Portal' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/operator/dashboard');
    });
  });

  it('navigates to administrator root when clicking Administrator Portal', async () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['administrator', 'customer'],
      loading: false,
      isAdmin: true,
      isOperator: false,
      isCustomer: true,
    });

    render(<Home />);

    fireEvent.click(screen.getByRole('button', { name: 'Administrator Portal' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/administrator');
    });
  });

  it('does not show operator portal when administrator is also present', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['administrator', 'operator', 'customer'],
      loading: false,
      isAdmin: true,
      isOperator: true,
      isCustomer: true,
    });

    render(<Home />);

    expect(screen.queryByRole('button', { name: 'Operator Portal' })).not.toBeInTheDocument();
  });
});

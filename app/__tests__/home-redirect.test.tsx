import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Home from '@/app/page';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { signIn } from 'aws-amplify/auth';
import { useUserGroups } from '@/lib/use-user-groups';
import { confirmSignIn } from 'aws-amplify/auth';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockToForgotPassword = jest.fn();
const mockToSignIn = jest.fn();

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
  Authenticator: () => <div data-testid="authenticator">Authenticator</div>,
}));

jest.mock('aws-amplify/auth', () => ({
  signIn: jest.fn(),
  confirmSignIn: jest.fn(),
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
    expect(screen.getByRole('button', { name: /^Administrator Portal/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Customer Portal/ })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /^Administrator Portal/ }));

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
    expect(roleButtons.map((button) => button.querySelector('span')?.textContent)).toEqual([
      'Administrator Portal',
      'Operator Portal',
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

    fireEvent.click(screen.getByRole('button', { name: /^Operator Portal/ }));

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

    fireEvent.click(screen.getByRole('button', { name: /^Administrator Portal/ }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/administrator');
    });
  });

  it('shows operator portal when administrator is also present', () => {
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

    expect(screen.getByRole('button', { name: /^Operator Portal/ })).toBeInTheDocument();
  });

  it('renders login branding with an icon mark and visible wordmark text', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'unauthenticated',
    });
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: [],
      loading: false,
      isAdmin: false,
      isOperator: false,
      isCustomer: false,
    });

    const { container } = render(<Home />);

    expect(screen.getAllByText('null device').length).toBeGreaterThan(0);
    expect(container.querySelector('img[src="/icon.svg"]')).toBeInTheDocument();
    expect(container.querySelector('img[src="/logo.svg"]')).not.toBeInTheDocument();
  });

  describe('custom sign-in form', () => {
    beforeEach(() => {
      (useAuthenticator as jest.Mock).mockReturnValue({
        authStatus: 'unauthenticated',
        toForgotPassword: mockToForgotPassword,
        toSignIn: mockToSignIn,
      });
      (useUserGroups as jest.Mock).mockReturnValue({
        groups: [],
        loading: false,
        isAdmin: false,
        isOperator: false,
        isCustomer: false,
      });
    });

    it('renders the sign-in form, with the embedded Authenticator mounted but hidden', () => {
      render(<Home />);

      expect(screen.getByLabelText('Work email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      // Mounted unconditionally (rather than only once "Forgot password?" is
      // clicked) so the shared Authenticator machine's one-time INIT event
      // resolves before the user's first click instead of racing against it
      // -- see app/page.tsx and project_amplify_authenticator_pattern memory.
      expect(screen.getByTestId('authenticator')).toBeInTheDocument();
      expect(screen.getByTestId('authenticator')).not.toBeVisible();
    });

    it('calls signIn with the entered email and password', async () => {
      (signIn as jest.Mock).mockResolvedValue({ isSignedIn: true });

      render(<Home />);

      fireEvent.change(screen.getByLabelText('Work email'), { target: { value: '  priya@rangeproperty.com.au  ' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => {
        expect(signIn).toHaveBeenCalledWith({ username: 'priya@rangeproperty.com.au', password: 'hunter2' });
      });
    });

    it('shows an inline error on the password field when sign-in fails', async () => {
      (signIn as jest.Mock).mockRejectedValue({ name: 'NotAuthorizedException' });

      render(<Home />);

      fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'priya@rangeproperty.com.au' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(
        await screen.findByText("That email or password doesn't match. Try again, or reset your password.")
      ).toBeInTheDocument();
    });

    it('reveals the embedded Authenticator on forgot password, and hides it again on back', () => {
      render(<Home />);

      fireEvent.click(screen.getByRole('link', { name: /forgot password/i }));

      expect(screen.getByTestId('authenticator')).toBeVisible();
      expect(mockToForgotPassword).toHaveBeenCalledTimes(1);
      expect(screen.queryByLabelText('Work email')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /back to sign in/i }));

      expect(mockToSignIn).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('Work email')).toBeInTheDocument();
      // Still mounted (never unmounted), just hidden again.
      expect(screen.getByTestId('authenticator')).toBeInTheDocument();
      expect(screen.getByTestId('authenticator')).not.toBeVisible();
    });

    describe('temporary password (admin-created account)', () => {
      it('shows a set-new-password form when Cognito challenges for a new password', async () => {
        (signIn as jest.Mock).mockResolvedValue({
          isSignedIn: false,
          nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
        });

        render(<Home />);

        fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'priya@rangeproperty.com.au' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'TempPass123!' } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

        expect(await screen.findByText(/set a new password/i)).toBeInTheDocument();
        expect(screen.getByLabelText('New password')).toBeInTheDocument();
        expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
      });

      it('calls confirmSignIn with the new password once both fields match', async () => {
        (signIn as jest.Mock).mockResolvedValue({
          isSignedIn: false,
          nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
        });
        (confirmSignIn as jest.Mock).mockResolvedValue({ isSignedIn: true });

        render(<Home />);

        fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'priya@rangeproperty.com.au' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'TempPass123!' } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

        await screen.findByText(/set a new password/i);

        fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewSecurePass1!' } });
        fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewSecurePass1!' } });
        fireEvent.click(screen.getByRole('button', { name: /set password and sign in/i }));

        await waitFor(() => {
          expect(confirmSignIn).toHaveBeenCalledWith({ challengeResponse: 'NewSecurePass1!' });
        });
      });

      it('shows an error and does not call confirmSignIn when the passwords do not match', async () => {
        (signIn as jest.Mock).mockResolvedValue({
          isSignedIn: false,
          nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
        });

        render(<Home />);

        fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'priya@rangeproperty.com.au' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'TempPass123!' } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

        await screen.findByText(/set a new password/i);

        fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewSecurePass1!' } });
        fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Mismatch1!' } });
        fireEvent.click(screen.getByRole('button', { name: /set password and sign in/i }));

        expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
        expect(confirmSignIn).not.toHaveBeenCalled();
      });
    });
  });
});

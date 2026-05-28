'use client';

import { render, screen } from '@testing-library/react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useRouter } from 'next/navigation';

// Mock the router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock Authenticator
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
}));

// Mock amplify config
jest.mock('@/lib/amplify-config', () => ({
  configureAmplify: jest.fn(),
}));

/**
 * Test component that simulates the customer login flow
 */
function LoginFlow() {
  const { user, authStatus } = useAuthenticator();

  if (authStatus !== 'authenticated') {
    return <div data-testid="login-form">Login Form - Sign in with email</div>;
  }

  // Cast to any to access Cognito token structure
  const userAny = user as any;

  return (
    <div data-testid="dashboard">
      <h1>Welcome, {userAny?.signInUserSession?.idToken?.payload?.email}</h1>
      <p>Customer ID: {user?.userId}</p>
      <button onClick={() => {}}>Logout</button>
    </div>
  );
}

describe('Customer Login Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  });

  it('shows login form when unauthenticated', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'unauthenticated',
      user: null,
    });

    render(<LoginFlow />);
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
    expect(screen.getByText(/Sign in with email/i)).toBeInTheDocument();
  });

  it('shows dashboard when authenticated', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
      user: {
        userId: 'customer-123',
        signInUserSession: {
          idToken: {
            payload: {
              email: 'test@example.com',
            },
          },
        },
      },
    });

    render(<LoginFlow />);
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    expect(screen.getByText(/Welcome, test@example.com/i)).toBeInTheDocument();
  });

  it('displays customer ID after successful login', () => {
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
      user: {
        userId: 'customer-456',
        signInUserSession: {
          idToken: {
            payload: {
              email: 'customer@company.com',
            },
          },
        },
      },
    });

    render(<LoginFlow />);
    expect(screen.getByText(/Customer ID: customer-456/i)).toBeInTheDocument();
  });

  it('transitions from login to authenticated state', () => {
    // Start unauthenticated
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'unauthenticated',
      user: null,
    });

    const { rerender } = render(<LoginFlow />);
    expect(screen.getByTestId('login-form')).toBeInTheDocument();

    // Simulate login
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
      user: {
        userId: 'customer-789',
        signInUserSession: {
          idToken: {
            payload: {
              email: 'newuser@example.com',
            },
          },
        },
      },
    });

    rerender(<LoginFlow />);
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    expect(screen.getByText(/Welcome, newuser@example.com/i)).toBeInTheDocument();
  });

  it('provides user email after successful authentication', () => {
    const testEmail = 'test.customer@delivery.com';
    (useAuthenticator as jest.Mock).mockReturnValue({
      authStatus: 'authenticated',
      user: {
        userId: 'cust-001',
        signInUserSession: {
          idToken: {
            payload: {
              email: testEmail,
            },
          },
        },
      },
    });

    render(<LoginFlow />);
    expect(screen.getByText(new RegExp(`Welcome, ${testEmail}`))).toBeInTheDocument();
  });
});


'use client';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomerLayout from '../layout';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getCustomerPortalContext } from '@/lib/queries';

// Mock the router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock the authenticator
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
  Authenticator: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock the ProtectedRoute component
jest.mock('@/app/components/ProtectedRoute', () => {
  return function MockProtectedRoute({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  };
});

// Mock utilities
jest.mock('@/lib/amplify-config', () => ({
  getUserEmail: jest.fn(() => 'test@example.com'),
  getUserDisplayName: jest.fn(() => 'test@example.com'),
  getUserGroups: jest.fn(() => ['customer']),
}));

jest.mock('@/lib/queries', () => ({
  getCustomerPortalContext: jest.fn(),
}));

jest.mock('@/app/components/ThemeModeSelect', () => {
  return function MockThemeModeSelect() {
    return null;
  };
});

describe('Customer Session Management Integration', () => {
  let mockPush: jest.Mock;
  let mockSignOut: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPush = jest.fn();
    mockSignOut = jest.fn().mockResolvedValue(undefined);

    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });

    (useAuthenticator as jest.Mock).mockReturnValue({
      signOut: mockSignOut,
      user: {
        userId: 'test-user-id',
        signInUserSession: {
          idToken: {
            payload: {
              email: 'test@example.com',
            },
          },
        },
      },
    });

    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'customer-1',
    });
  });

  it('shows Customer Portal in the sidebar title', () => {
    render(
      <CustomerLayout>
        <div>Test Content</div>
      </CustomerLayout>
    );

    expect(screen.getByText('Customer Portal')).toBeInTheDocument();
  });

  it('displays logout button in sidebar', () => {
    render(
      <CustomerLayout>
        <div>Test Content</div>
      </CustomerLayout>
    );

    expect(screen.getByText(/Logout/)).toBeInTheDocument();
  });

  it('shows logout confirmation dialog when logout is clicked', async () => {
    const user = userEvent.setup();

    render(
      <CustomerLayout>
        <div>Test Content</div>
      </CustomerLayout>
    );

    const logoutButton = screen.getByText(/Logout/);
    await act(async () => {
      await user.click(logoutButton);
    });

    expect(screen.getByText(/Are you sure you want to logout/i)).toBeInTheDocument();
  });

  it('confirms logout and calls signOut', async () => {
    const user = userEvent.setup();

    render(
      <CustomerLayout>
        <div>Test Content</div>
      </CustomerLayout>
    );

    // Click logout
    const logoutButton = screen.getByText(/Logout/);
    await act(async () => {
      await user.click(logoutButton);
    });

    // Click confirm
    const confirmButton = screen.getByText(/Yes, Logout/);
    await act(async () => {
      await user.click(confirmButton);
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  it('cancels logout when cancel is clicked', async () => {
    const user = userEvent.setup();

    render(
      <CustomerLayout>
        <div>Test Content</div>
      </CustomerLayout>
    );

    // Click logout
    let logoutButton = screen.getByText(/Logout/);
    await act(async () => {
      await user.click(logoutButton);
    });

    // Click cancel
    const cancelButton = screen.getByText(/Cancel/);
    await act(async () => {
      await user.click(cancelButton);
    });

    // Logout button should be visible again
    await waitFor(() => {
      logoutButton = screen.getByText(/Logout/);
      expect(logoutButton).toBeInTheDocument();
    });

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('displays user email in sidebar', () => {
    render(
      <CustomerLayout>
        <div>Test Content</div>
      </CustomerLayout>
    );

    expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
  });

  it('shows navigation links', () => {
    render(
      <CustomerLayout>
        <div>Test Content</div>
      </CustomerLayout>
    );

    expect(screen.getByTitle(/Dashboard/)).toBeInTheDocument();
    expect(screen.getByTitle(/Routes/)).toBeInTheDocument();
    expect(screen.getByTitle(/Invoices/)).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(
      <CustomerLayout>
        <div>Test Content Here</div>
      </CustomerLayout>
    );

    expect(screen.getByText(/Test Content Here/)).toBeInTheDocument();
  });

  it('initializes session timeout monitoring', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');

    render(
      <CustomerLayout>
        <div>Test Content</div>
      </CustomerLayout>
    );

    expect(setIntervalSpy).toHaveBeenCalled();

    setIntervalSpy.mockRestore();
  });

  it('sets up activity event listeners', () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

    render(
      <CustomerLayout>
        <div>Test Content</div>
      </CustomerLayout>
    );

    expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));

    addEventListenerSpy.mockRestore();
  });
});

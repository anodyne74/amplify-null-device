import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useRouter } from 'next/navigation';
import { useUserGroups } from '@/lib/use-user-groups';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import OperatorRoute from '@/app/components/OperatorRoute';
import ErrorBoundary from '@/app/components/ErrorBoundary';
import LoadingSpinner from '@/app/components/LoadingSpinner';

// Mock dependencies
jest.mock('@aws-amplify/ui-react');
jest.mock('next/navigation');
jest.mock('@/lib/use-user-groups');

const mockUseAuthenticator = useAuthenticator as jest.MockedFunction<typeof useAuthenticator>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseUserGroups = useUserGroups as jest.MockedFunction<typeof useUserGroups>;

// Helper function to create a mock user with groups
const createMockUser = (email: string, groups: string[] = []) => ({
  signInUserSession: {
    idToken: {
      payload: {
        email,
        'cognito:groups': groups,
      },
    },
  },
  signInDetails: {
    loginId: email,
  },
  attributes: {
    email,
  },
});

describe('Authentication Components', () => {
  let mockPush: jest.Mock;

  beforeEach(() => {
    mockPush = jest.fn();
    mockUseRouter.mockReturnValue({
      push: mockPush,
    } as any);
    mockUseUserGroups.mockReturnValue({
      groups: [],
      loading: false,
      isPending: false,
      isAdmin: false,
      isOperator: false,
      isCustomer: true,
    });
  });

  describe('LoadingSpinner', () => {
    it('renders loading message', () => {
      render(<LoadingSpinner message="Testing..." />);
      expect(screen.getByText('Testing...')).toBeInTheDocument();
    });

    it('renders default message when not provided', () => {
      render(<LoadingSpinner />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('ErrorBoundary', () => {
    it('renders children when no error', () => {
      render(
        <ErrorBoundary>
          <div>Test Content</div>
        </ErrorBoundary>
      );
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('renders error message when child component throws', () => {
      const ThrowError = () => {
        throw new Error('Test error');
      };

      jest.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

      jest.restoreAllMocks();
    });

    it('renders refresh button', () => {
      const ThrowError = () => {
        throw new Error('Test error');
      };

      jest.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const refreshButton = screen.getByText('Refresh Page');
      expect(refreshButton).toBeInTheDocument();

      jest.restoreAllMocks();
    });
  });

  describe('ProtectedRoute', () => {
    it('shows loading spinner while configuring', () => {
      mockUseAuthenticator.mockReturnValue({
        authStatus: 'configuring',
        user: undefined,
      } as any);

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('renders children when authenticated as customer', () => {
      mockUseAuthenticator.mockReturnValue({
        authStatus: 'authenticated',
        user: createMockUser('test@example.com', ['customer']),
      } as any);

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('does not redirect dual-role operator+customer users away from customer route', async () => {
      mockUseAuthenticator.mockReturnValue({
        authStatus: 'authenticated',
        user: createMockUser('dual@example.com', ['operator', 'customer']),
      } as any);
      mockUseUserGroups.mockReturnValue({
        groups: ['operator', 'customer'],
        loading: false,
        isPending: false,
        isAdmin: false,
        isOperator: true,
        isCustomer: true,
      });

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
      await waitFor(() => {
        expect(mockPush).not.toHaveBeenCalled();
      });
    });

    it('shows redirect message when unauthenticated', () => {
      mockUseAuthenticator.mockReturnValue({
        authStatus: 'unauthenticated',
        user: undefined,
      } as any);

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Redirecting...')).toBeInTheDocument();
    });
  });

  describe('OperatorRoute', () => {
    it('shows loading spinner while configuring', () => {
      mockUseAuthenticator.mockReturnValue({
        authStatus: 'configuring',
        user: undefined,
      } as any);

      render(
        <OperatorRoute>
          <div>Operator Content</div>
        </OperatorRoute>
      );

      expect(screen.getByText('Verifying operator access...')).toBeInTheDocument();
    });

    it('renders children when authenticated as operator', () => {
      mockUseAuthenticator.mockReturnValue({
        authStatus: 'authenticated',
        user: createMockUser('operator@example.com', ['operator']),
      } as any);
      mockUseUserGroups.mockReturnValue({
        groups: ['operator'],
        loading: false,
        isPending: false,
        isAdmin: false,
        isOperator: true,
        isCustomer: false,
      });

      render(
        <OperatorRoute>
          <div>Operator Content</div>
        </OperatorRoute>
      );

      expect(screen.getByText('Operator Content')).toBeInTheDocument();
    });

    it('shows redirect message when customer accesses operator route', () => {
      mockUseAuthenticator.mockReturnValue({
        authStatus: 'authenticated',
        user: createMockUser('customer@example.com', ['customer']),
      } as any);
      mockUseUserGroups.mockReturnValue({
        groups: ['customer'],
        loading: false,
        isPending: false,
        isAdmin: false,
        isOperator: false,
        isCustomer: true,
      });

      render(
        <OperatorRoute>
          <div>Operator Content</div>
        </OperatorRoute>
      );

      expect(screen.getByText('Redirecting to authorized portal...')).toBeInTheDocument();
    });

    it('shows redirect message when unauthenticated', () => {
      mockUseAuthenticator.mockReturnValue({
        authStatus: 'unauthenticated',
        user: undefined,
      } as any);

      render(
        <OperatorRoute>
          <div>Operator Content</div>
        </OperatorRoute>
      );

      expect(screen.getByText('Redirecting to login...')).toBeInTheDocument();
    });
  });
});

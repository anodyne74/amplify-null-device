import { renderHook, act, waitFor } from '@testing-library/react';
import { useSessionTimeout, useLogout } from '../sessionManager';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock @aws-amplify/ui-react
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
}));

describe('Session Management', () => {
  let mockPush: jest.Mock;
  let mockSignOut: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockPush = jest.fn();
    mockSignOut = jest.fn().mockResolvedValue(undefined);

    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });

    (useAuthenticator as jest.Mock).mockReturnValue({
      signOut: mockSignOut,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('useSessionTimeout', () => {
    it('initializes without errors', () => {
      const { result } = renderHook(() => useSessionTimeout());
      expect(result.current).toBeDefined();
      expect(result.current.handleSessionTimeout).toBeDefined();
      expect(result.current.updateActivity).toBeDefined();
    });

    it('updates activity on user action', () => {
      const { result } = renderHook(() => useSessionTimeout());

      act(() => {
        result.current.updateActivity();
      });

      expect(result.current.updateActivity).toBeDefined();
    });

    it('calls signOut and navigates to home on session timeout', async () => {
      renderHook(() => useSessionTimeout());

      // Fast-forward time by 31 minutes (timeout is 30 minutes)
      act(() => {
        jest.advanceTimersByTime(31 * 60 * 1000);
      });

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled();
      });

      expect(mockPush).toHaveBeenCalledWith('/');
    });

    it('does not timeout if activity occurs within timeout period', async () => {
      const { result } = renderHook(() => useSessionTimeout());

      // Update activity after 15 minutes
      act(() => {
        jest.advanceTimersByTime(15 * 60 * 1000);
        result.current.updateActivity();
      });

      // Fast-forward another 14 minutes (total 29 minutes)
      act(() => {
        jest.advanceTimersByTime(14 * 60 * 1000);
      });

      // Should not have timed out yet
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('resets activity timer on user action', async () => {
      const { result } = renderHook(() => useSessionTimeout());

      // Fast-forward time by 25 minutes
      act(() => {
        jest.advanceTimersByTime(25 * 60 * 1000);
      });

      // Update activity
      act(() => {
        result.current.updateActivity();
      });

      // Fast-forward 5 more minutes (30 total, but activity was reset)
      act(() => {
        jest.advanceTimersByTime(5 * 60 * 1000);
      });

      // Should not have timed out because activity was reset
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('cleans up event listeners on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useSessionTimeout());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });

  describe('useLogout', () => {
    it('calls signOut and navigates to home', async () => {
      const { result } = renderHook(() => useLogout());

      await act(async () => {
        await result.current.logout();
      });

      expect(mockSignOut).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/');
    });

    it('handles signOut errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSignOut.mockRejectedValueOnce(new Error('Logout failed'));

      const { result } = renderHook(() => useLogout());

      // Should not throw
      await act(async () => {
        await result.current.logout();
      });

      expect(mockSignOut).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('logs console error on failure', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSignOut.mockRejectedValueOnce(new Error('Logout failed'));

      const { result } = renderHook(() => useLogout());

      await act(async () => {
        await result.current.logout();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error during logout:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Session Timeout Integration', () => {
    it('tracks multiple user activities', async () => {
      const { result } = renderHook(() => useSessionTimeout());

      // Simulate mouse movement
      act(() => {
        jest.advanceTimersByTime(10 * 60 * 1000);
        result.current.updateActivity();
      });

      // Simulate keyboard input
      act(() => {
        jest.advanceTimersByTime(10 * 60 * 1000);
        result.current.updateActivity();
      });

      // Simulate scroll
      act(() => {
        jest.advanceTimersByTime(10 * 60 * 1000);
        result.current.updateActivity();
      });

      // Total 30 minutes but activity was reset
      expect(mockSignOut).not.toHaveBeenCalled();

      // Now let it timeout
      act(() => {
        jest.advanceTimersByTime(31 * 60 * 1000);
      });

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled();
      });
    });
  });
});

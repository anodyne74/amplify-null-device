import { renderHook, waitFor } from '@testing-library/react';
import { usePortalUser } from '@/lib/usePortalUser';
import { useCurrentUserId } from '@/lib/use-user-groups';
import { fetchUserDisplayName } from '@/lib/amplify-config';
import { getUserSettings } from '@/lib/userSettings';

jest.mock('@/lib/use-user-groups', () => ({ useCurrentUserId: jest.fn() }));
jest.mock('@/lib/amplify-config', () => ({ fetchUserDisplayName: jest.fn() }));
jest.mock('@/lib/userSettings', () => ({ getUserSettings: jest.fn() }));
jest.mock('@/app/auth/sessionManager', () => ({ useLogout: () => ({ logout: jest.fn() }) }));

describe('usePortalUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useCurrentUserId as jest.Mock).mockReturnValue('user-1');
    (fetchUserDisplayName as jest.Mock).mockResolvedValue('Token Name');
    (getUserSettings as jest.Mock).mockResolvedValue({ name: '  Saved Name ' });
  });

  it('shows the name saved in Settings over the token name', async () => {
    const { result } = renderHook(() => usePortalUser());

    await waitFor(() => expect(result.current.displayName).toBe('Saved Name'));
    expect(result.current.userId).toBe('user-1');
    expect(getUserSettings).toHaveBeenCalledWith('user-1');
  });

  it('falls back to the token name when no name is saved', async () => {
    (getUserSettings as jest.Mock).mockResolvedValue({ name: ' ' });
    const { result } = renderHook(() => usePortalUser());

    await waitFor(() => expect(result.current.displayName).toBe('Token Name'));
  });

  it('falls back to the token name when Settings cannot be read', async () => {
    (getUserSettings as jest.Mock).mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => usePortalUser());

    await waitFor(() => expect(result.current.displayName).toBe('Token Name'));
  });

  it('reads nothing before the session has a user', () => {
    (useCurrentUserId as jest.Mock).mockReturnValue(undefined);
    const { result } = renderHook(() => usePortalUser());

    expect(result.current.displayName).toBe('');
    expect(getUserSettings).not.toHaveBeenCalled();
    expect(fetchUserDisplayName).not.toHaveBeenCalled();
  });
});

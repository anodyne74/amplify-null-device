import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AmplifyThemeProvider, { useThemeMode } from '@/app/components/AmplifyThemeProvider';

jest.mock('@aws-amplify/ui-react', () => ({
  ThemeProvider: ({ children, colorMode }: { children: React.ReactNode; colorMode?: string }) => (
    <div data-testid="amplify-theme-provider" data-color-mode={colorMode}>
      {children}
    </div>
  ),
}));

const fetchUserIdMock = jest.fn();

jest.mock('@/lib/amplify-config', () => ({
  fetchUserId: (...args: unknown[]) => fetchUserIdMock(...args),
}));

const getUserSettingsMock = jest.fn();

jest.mock('@/lib/userSettings', () => ({
  getUserSettings: (...args: unknown[]) => getUserSettingsMock(...args),
}));

let emitAuthEvent: (event: string) => void = () => {};

jest.mock('aws-amplify/utils', () => ({
  ...jest.requireActual('aws-amplify/utils'),
  Hub: {
    listen: (_channel: string, callback: (capsule: { payload: { event: string } }) => void) => {
      emitAuthEvent = (event) => callback({ payload: { event } });
      return () => {
        emitAuthEvent = () => {};
      };
    },
  },
}));

function renderProvider() {
  return render(
    <AmplifyThemeProvider>
      <ThemeModeProbe />
    </AmplifyThemeProvider>
  );
}

function expectColorMode(mode: string) {
  return waitFor(() => {
    expect(screen.getByTestId('amplify-theme-provider')).toHaveAttribute('data-color-mode', mode);
  });
}

function ThemeModeProbe() {
  const { mode, setMode } = useThemeMode();

  return (
    <select
      aria-label="Theme"
      value={mode}
      onChange={(event) => {
        setMode(event.target.value as 'system' | 'light' | 'dark');
      }}
    >
      <option value="system">System</option>
      <option value="dark">Dark</option>
      <option value="light">Light</option>
    </select>
  );
}

describe('AmplifyThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    fetchUserIdMock.mockReset().mockResolvedValue(undefined);
    getUserSettingsMock.mockReset().mockResolvedValue({ data: null, errors: undefined });

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-color-scheme: light)',
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  it('hydrates saved theme mode and syncs document + provider', async () => {
    localStorage.setItem('nd-theme-mode', 'light');

    render(
      <AmplifyThemeProvider>
        <ThemeModeProbe />
      </AmplifyThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('amplify-theme-provider')).toHaveAttribute('data-color-mode', 'light');
    });

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect((screen.getByLabelText('Theme') as HTMLSelectElement).value).toBe('light');
  });

  it('updates storage and document when user switches mode', async () => {
    render(
      <AmplifyThemeProvider>
        <ThemeModeProbe />
      </AmplifyThemeProvider>
    );
    // Let the (signed-out) session resolve and its bucket load first.
    await waitFor(() => {
      expect(localStorage.getItem('nd-theme-mode')).toBe('light');
    });

    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });

    await waitFor(() => {
      expect(screen.getByTestId('amplify-theme-provider')).toHaveAttribute('data-color-mode', 'dark');
    });

    await waitFor(() => {
      expect(localStorage.getItem('nd-theme-mode')).toBe('dark');
    });
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it("scopes the saved theme to the signed-in user's sub, not a shared bucket (#88)", async () => {
    fetchUserIdMock.mockResolvedValue('user-a-sub');

    render(
      <AmplifyThemeProvider>
        <ThemeModeProbe />
      </AmplifyThemeProvider>
    );
    // Let the saved-default pass finish first so it can't override the change.
    await waitFor(() => {
      expect(sessionStorage.getItem('nd-theme-default-applied')).toBe('user-a-sub');
    });

    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });

    await waitFor(() => {
      expect(localStorage.getItem('nd-theme-mode:user-a-sub')).toBe('dark');
    });
    // Never falls back to writing the unscoped bucket once a user is known.
    expect(localStorage.getItem('nd-theme-mode')).toBeNull();
  });

  it("does not apply another user's saved theme to a different signed-in user", async () => {
    localStorage.setItem('nd-theme-mode:user-a-sub', 'dark');
    fetchUserIdMock.mockResolvedValue('user-b-sub');

    render(
      <AmplifyThemeProvider>
        <ThemeModeProbe />
      </AmplifyThemeProvider>
    );

    // Once user-b's own (empty) bucket has been read and re-written, the load
    // pass is guaranteed to have already run without picking up user-a's key.
    await waitFor(() => {
      expect(localStorage.getItem('nd-theme-mode:user-b-sub')).toBe('light');
    });

    expect((screen.getByLabelText('Theme') as HTMLSelectElement).value).toBe('light');
    expect(screen.getByTestId('amplify-theme-provider')).toHaveAttribute('data-color-mode', 'light');
  });

  it('defaults to light, not the OS preference, when nothing is saved (#307)', async () => {
    // matchMedia reports no light preference, i.e. an OS in dark mode.
    fetchUserIdMock.mockResolvedValue('new-user-sub');

    renderProvider();

    await waitFor(() => {
      expect(getUserSettingsMock).toHaveBeenCalledWith('new-user-sub');
    });
    await expectColorMode('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it("applies the user's saved default theme over this browser's last-used mode (#307)", async () => {
    localStorage.setItem('nd-theme-mode:user-a-sub', 'light');
    fetchUserIdMock.mockResolvedValue('user-a-sub');
    getUserSettingsMock.mockResolvedValue({ data: { defaultTheme: 'dark' }, errors: undefined });

    renderProvider();

    await expectColorMode('dark');
    await waitFor(() => {
      expect(localStorage.getItem('nd-theme-mode:user-a-sub')).toBe('dark');
    });
  });

  it("keeps the browser's last-used mode when settings can't be loaded", async () => {
    localStorage.setItem('nd-theme-mode:user-a-sub', 'dark');
    fetchUserIdMock.mockResolvedValue('user-a-sub');
    getUserSettingsMock.mockResolvedValue({ data: null, errors: [new Error('boom')] });

    renderProvider();

    await waitFor(() => {
      expect(getUserSettingsMock).toHaveBeenCalled();
    });
    await expectColorMode('dark');
  });

  it('picks up the user who signs in without a page reload (#307)', async () => {
    renderProvider();
    await waitFor(() => {
      expect(fetchUserIdMock).toHaveBeenCalledTimes(1);
    });
    expect(getUserSettingsMock).not.toHaveBeenCalled();

    fetchUserIdMock.mockResolvedValue('user-a-sub');
    getUserSettingsMock.mockResolvedValue({ data: { defaultTheme: 'dark' }, errors: undefined });
    act(() => emitAuthEvent('signedIn'));

    await expectColorMode('dark');
    expect(getUserSettingsMock).toHaveBeenCalledWith('user-a-sub');
  });

  it("applies the next user's saved theme after a sign-out and sign-in (#307)", async () => {
    fetchUserIdMock.mockResolvedValue('user-a-sub');
    getUserSettingsMock.mockResolvedValue({ data: { defaultTheme: 'dark' }, errors: undefined });
    renderProvider();
    await expectColorMode('dark');

    act(() => emitAuthEvent('signedOut'));
    await expectColorMode('light');

    fetchUserIdMock.mockResolvedValue('user-b-sub');
    getUserSettingsMock.mockResolvedValue({ data: { defaultTheme: 'light' }, errors: undefined });
    act(() => emitAuthEvent('signedIn'));

    await waitFor(() => {
      expect(getUserSettingsMock).toHaveBeenCalledWith('user-b-sub');
    });
    await expectColorMode('light');
  });

  it('keeps an in-session theme change across a full page load (#307)', async () => {
    fetchUserIdMock.mockResolvedValue('user-a-sub');
    getUserSettingsMock.mockResolvedValue({ data: { defaultTheme: 'dark' }, errors: undefined });
    const { unmount } = renderProvider();
    await expectColorMode('dark');

    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'light' } });
    await waitFor(() => {
      expect(localStorage.getItem('nd-theme-mode:user-a-sub')).toBe('light');
    });

    // Opening a route is a full page load: the provider mounts afresh.
    unmount();
    renderProvider();

    await waitFor(() => {
      expect(fetchUserIdMock).toHaveBeenCalledTimes(2);
    });
    await expectColorMode('light');
    expect(getUserSettingsMock).toHaveBeenCalledTimes(1);
  });
});

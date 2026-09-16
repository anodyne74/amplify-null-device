import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    fetchUserIdMock.mockReset().mockResolvedValue(undefined);

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
      expect(localStorage.getItem('nd-theme-mode:user-b-sub')).toBe('system');
    });

    expect((screen.getByLabelText('Theme') as HTMLSelectElement).value).toBe('system');
    expect(screen.getByTestId('amplify-theme-provider')).toHaveAttribute('data-color-mode', 'system');
  });
});

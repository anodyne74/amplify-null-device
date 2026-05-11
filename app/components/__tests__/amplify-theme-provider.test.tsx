import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AmplifyThemeProvider, { useThemeMode } from '@/app/components/AmplifyThemeProvider';

jest.mock('@aws-amplify/ui-react', () => ({
  ThemeProvider: ({ children, colorMode }: { children: React.ReactNode; colorMode?: string }) => (
    <div data-testid="amplify-theme-provider" data-color-mode={colorMode}>
      {children}
    </div>
  ),
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

    expect(localStorage.getItem('nd-theme-mode')).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});

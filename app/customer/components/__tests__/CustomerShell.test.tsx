import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import CustomerShell from '@/app/customer/components/CustomerShell';

const useThemeModeMock = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/customer/dashboard',
}));

jest.mock('@/app/components/AmplifyThemeProvider', () => ({
  useThemeMode: () => useThemeModeMock(),
}));

const NAV_ITEMS = [{ href: '/customer/dashboard', label: 'Dashboard', icon: 'layout-dashboard' }];

describe('CustomerShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the white wordmark logo in dark mode', () => {
    useThemeModeMock.mockReturnValue({ mode: 'dark', resolvedMode: 'dark', setMode: jest.fn() });

    render(
      <CustomerShell navItems={NAV_ITEMS} userEmail="test@example.com" onLogout={jest.fn()}>
        <div>Content</div>
      </CustomerShell>
    );

    expect(screen.getByAltText('Null Device')).toHaveAttribute('src', expect.stringContaining('logo-full-light.svg'));
  });

  it('shows the dark wordmark logo in light mode', () => {
    useThemeModeMock.mockReturnValue({ mode: 'light', resolvedMode: 'light', setMode: jest.fn() });

    render(
      <CustomerShell navItems={NAV_ITEMS} userEmail="test@example.com" onLogout={jest.fn()}>
        <div>Content</div>
      </CustomerShell>
    );

    expect(screen.getByAltText('Null Device')).toHaveAttribute('src', expect.stringContaining('logo-full-dark.svg'));
  });

  it('does not show a theme toggle in the side nav', () => {
    useThemeModeMock.mockReturnValue({ mode: 'dark', resolvedMode: 'dark', setMode: jest.fn() });

    render(
      <CustomerShell navItems={NAV_ITEMS} userEmail="test@example.com" onLogout={jest.fn()}>
        <div>Content</div>
      </CustomerShell>
    );

    expect(screen.queryByText(/^Theme/)).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

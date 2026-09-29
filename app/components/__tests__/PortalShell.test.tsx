import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import PortalShell, { type PortalVariant } from '@/app/components/PortalShell';

const useThemeModeMock = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/portal/routes/route-1',
}));

jest.mock('@/app/components/AmplifyThemeProvider', () => ({
  useThemeMode: () => useThemeModeMock(),
}));

const NAV_ITEMS = [
  { href: '/portal', label: 'Home', icon: 'layout-dashboard' },
  { href: '/portal/routes', label: 'Routes', icon: 'route' },
];

function renderShell(variant: PortalVariant, onLogout = jest.fn()) {
  render(
    <PortalShell variant={variant} navItems={NAV_ITEMS} userName="Sam Rivera" onLogout={onLogout}>
      <div>Content</div>
    </PortalShell>
  );
  return { onLogout };
}

describe('PortalShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useThemeModeMock.mockReturnValue({ mode: 'light', resolvedMode: 'light', setMode: jest.fn() });
  });

  it.each([
    ['administrator', 'Administrator Portal'],
    ['operator', 'Operator Portal'],
    ['customer', 'Customer Portal'],
  ] as const)('titles the %s portal', (variant, title) => {
    renderShell(variant);

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText('Sam Rivera')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('marks the nav item for the current page, including its sub-pages', () => {
    renderShell('operator');

    expect(screen.getByRole('link', { name: 'Routes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('asks before logging out, naming the portal', () => {
    const { onLogout } = renderShell('administrator');

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(screen.getByText("You'll need to sign in again to access the administrator portal.")).toBeInTheDocument();
    expect(onLogout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, logout' }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('shows a status and warns before logging out when given a warning', () => {
    const onLogout = jest.fn();
    render(
      <PortalShell
        variant="operator"
        navItems={NAV_ITEMS}
        userName="Sam Rivera"
        onLogout={onLogout}
        status={<span>2 unsaved</span>}
        logoutWarning="2 actions aren't saved yet. Stay signed in until they are?"
      >
        <div>Content</div>
      </PortalShell>
    );

    expect(screen.getByText('2 unsaved')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(screen.getByText("2 actions aren't saved yet. Stay signed in until they are?")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stay signed in' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Log out anyway' }));
    expect(onLogout).toHaveBeenCalled();
  });

  it.each(['administrator', 'operator'] as const)('gives the %s portal the navy staff chrome in any theme', (variant) => {
    renderShell(variant);

    expect(screen.getByRole('complementary')).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByAltText('Null Device')).toHaveAttribute('src', expect.stringContaining('logo-full-light.svg'));
  });

  it('lets the customer sidebar follow the theme', () => {
    renderShell('customer');

    expect(screen.getByRole('complementary')).not.toHaveAttribute('data-theme');
  });

  it('shows the white wordmark logo to a customer in dark mode', () => {
    useThemeModeMock.mockReturnValue({ mode: 'dark', resolvedMode: 'dark', setMode: jest.fn() });
    renderShell('customer');

    expect(screen.getByAltText('Null Device')).toHaveAttribute('src', expect.stringContaining('logo-full-light.svg'));
  });

  it('shows the dark wordmark logo to a customer in light mode', () => {
    renderShell('customer');

    expect(screen.getByAltText('Null Device')).toHaveAttribute('src', expect.stringContaining('logo-full-dark.svg'));
  });

  it('does not show a theme toggle in the side nav', () => {
    renderShell('customer');

    expect(screen.queryByText(/^Theme/)).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

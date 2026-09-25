import { render, screen } from '@testing-library/react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorLayout from '@/app/operator/layout';
import { useOperatorRouteNotifications } from '@/lib/useOperatorRouteNotifications';

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
}));

jest.mock('@/lib/amplify-config', () => ({
  fetchUserDisplayName: jest.fn(() => Promise.resolve('test@example.com')),
}));

jest.mock('@/app/components/AmplifyThemeProvider', () => ({
  useThemeMode: () => ({ mode: 'system', resolvedMode: 'dark', setMode: jest.fn() }),
}));

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => 'op-1',
}));

jest.mock('@/lib/useOperatorRouteNotifications', () => ({
  useOperatorRouteNotifications: jest.fn(),
}));

jest.mock('@/app/components/OperatorRoute', () => {
  return function MockOperatorRoute({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  };
});

jest.mock('@/app/operator/components/OperatorShell', () => {
  return function MockOperatorShell({
    navItems,
    userEmail,
    children,
  }: {
    navItems: Array<{ href: string; label: string; icon: unknown }>;
    userEmail: string;
    children: React.ReactNode;
  }) {
    return (
      <div>
        <div data-testid="user-email">{userEmail}</div>
        <nav data-testid="nav">
          {navItems.map((item) => (
            <div key={item.href} data-testid={`nav-item-${item.label}`}>
              {item.label}
            </div>
          ))}
        </nav>
        {children}
      </div>
    );
  };
});

describe('OperatorLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthenticator as jest.Mock).mockReturnValue({
      signOut: jest.fn(),
      user: null,
    });
  });

  it('shows operator navigation only', () => {
    render(
      <OperatorLayout>
        <div>Test content</div>
      </OperatorLayout>
    );

    expect(screen.getByTestId('nav-item-Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Routes')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Service Calendar')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Settings')).toBeInTheDocument();
    expect(screen.getByTestId('nav').children).toHaveLength(4);
  });

  it('wires up route-assignment notifications for the signed-in operator, app-wide', () => {
    render(
      <OperatorLayout>
        <div>Test content</div>
      </OperatorLayout>
    );

    expect(useOperatorRouteNotifications).toHaveBeenCalledWith('op-1');
  });
});

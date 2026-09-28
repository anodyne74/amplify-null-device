import { render, screen } from '@testing-library/react';
import OperatorLayout from '@/app/operator/layout';
import { useOperatorRouteNotifications } from '@/lib/useOperatorRouteNotifications';

jest.mock('@/lib/usePortalUser', () => ({
  usePortalUser: () => ({ userId: 'op-1', displayName: 'Sam Rivera', logout: jest.fn() }),
}));

jest.mock('@/lib/useOperatorRouteNotifications', () => ({
  useOperatorRouteNotifications: jest.fn(),
}));

jest.mock('@/app/components/OperatorRoute', () => {
  return function MockOperatorRoute({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  };
});

jest.mock('@/app/components/PortalShell', () => {
  return function MockPortalShell({
    navItems,
    userName,
    children,
  }: {
    navItems: Array<{ href: string; label: string; icon: unknown }>;
    userName: string;
    children: React.ReactNode;
  }) {
    return (
      <div>
        <div data-testid="user-email">{userName}</div>
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

  it('shows the signed-in operator by name', () => {
    render(
      <OperatorLayout>
        <div>Test content</div>
      </OperatorLayout>
    );

    expect(screen.getByTestId('user-email')).toHaveTextContent('Sam Rivera');
  });
});

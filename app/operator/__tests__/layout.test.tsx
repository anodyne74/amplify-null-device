import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OperatorLayout from '@/app/operator/layout';
import { useOperatorRouteNotifications } from '@/lib/useOperatorRouteNotifications';
import { signRunOutbox, useSignRunOutbox, useSignRunOutboxSender } from '@/lib/signRunOutbox';

const mockLogout = jest.fn();

jest.mock('@/lib/usePortalUser', () => ({
  usePortalUser: () => ({ userId: 'op-1', displayName: 'Sam Rivera', logout: mockLogout }),
}));

jest.mock('@/lib/useSessionRefresh', () => ({ useSessionRefresh: jest.fn() }));

jest.mock('@/lib/signRunOutbox', () => ({
  signRunOutbox: { discardAll: jest.fn().mockResolvedValue(undefined) },
  useSignRunOutbox: jest.fn(() => ({ entries: [], saved: {} })),
  useSignRunOutboxSender: jest.fn(),
}));

jest.mock('@/app/operator/components/UnsavedWritesIndicator', () => ({
  ...jest.requireActual('@/app/operator/components/UnsavedWritesIndicator'),
  UnsavedWritesIndicator: () => <div data-testid="unsaved-indicator" />,
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
    onLogout,
    status,
    logoutWarning,
    children,
  }: {
    navItems: Array<{ href: string; label: string; icon: unknown }>;
    userName: string;
    onLogout: () => void;
    status: React.ReactNode;
    logoutWarning: string | null;
    children: React.ReactNode;
  }) {
    return (
      <div>
        <div data-testid="user-email">{userName}</div>
        {status}
        <div data-testid="logout-warning">{logoutWarning}</div>
        <button onClick={onLogout}>Log out anyway</button>
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

  it('sends the Sign Run outbox for the signed-in operator and shows its status', () => {
    render(
      <OperatorLayout>
        <div>Test content</div>
      </OperatorLayout>
    );

    expect(useSignRunOutboxSender).toHaveBeenCalledWith('op-1');
    expect(screen.getByTestId('unsaved-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('logout-warning')).toBeEmptyDOMElement();
  });

  it('warns before logging out with unsaved actions, and discards them on a forced logout', async () => {
    (useSignRunOutbox as jest.Mock).mockReturnValue({ entries: [{ id: 'e1' }, { id: 'e2' }], saved: {} });
    render(
      <OperatorLayout>
        <div>Test content</div>
      </OperatorLayout>
    );

    expect(screen.getByTestId('logout-warning')).toHaveTextContent(
      "2 actions aren't saved yet. Stay signed in until they are?"
    );

    fireEvent.click(screen.getByRole('button', { name: 'Log out anyway' }));
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(signRunOutbox.discardAll).toHaveBeenCalled();
  });
});

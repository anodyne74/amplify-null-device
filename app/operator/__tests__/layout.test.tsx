import { render, screen } from '@testing-library/react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorLayout from '@/app/operator/layout';

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
}));

jest.mock('@/lib/amplify-config', () => ({
  getUserDisplayName: jest.fn(() => 'test@example.com'),
}));

jest.mock('@/app/components/AmplifyThemeProvider', () => ({
  useThemeMode: () => ({ mode: 'system', resolvedMode: 'dark', setMode: jest.fn() }),
}));

jest.mock('@/app/components/OperatorRoute', () => {
  return function MockOperatorRoute({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  };
});

jest.mock('@/app/components/PortalLayout', () => {
  return function MockPortalLayout({
    portalTitle,
    navItems,
    userEmail,
    children,
  }: {
    portalTitle: string;
    navItems: Array<{ href: string; label: string; icon: unknown }>;
    userEmail: string;
    children: React.ReactNode;
  }) {
    return (
      <div>
        <div data-testid="portal-title">{portalTitle}</div>
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

  it('renders operator portal title', () => {
    render(
      <OperatorLayout>
        <div>Test content</div>
      </OperatorLayout>
    );

    expect(screen.getByTestId('portal-title')).toHaveTextContent('Operator Portal');
  });

  it('shows operator navigation only', () => {
    render(
      <OperatorLayout>
        <div>Test content</div>
      </OperatorLayout>
    );

    expect(screen.getByTestId('nav-item-Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Routes')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Settings')).toBeInTheDocument();
    expect(screen.getByTestId('nav').children).toHaveLength(3);
  });
});

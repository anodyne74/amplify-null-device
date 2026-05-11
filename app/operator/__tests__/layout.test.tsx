import { render, screen } from '@testing-library/react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorLayout from '@/app/operator/layout';

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
}));

jest.mock('@/lib/amplify-config', () => ({
  getUserDisplayName: jest.fn(() => 'test@example.com'),
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
    children,
  }: {
    portalTitle: string;
    navItems: Array<{ href: string; label: string; icon: any }>;
    children: React.ReactNode;
  }) {
    return (
      <div>
        <div data-testid="portal-title">{portalTitle}</div>
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

  it('shows only Dashboard and Routes nav when in operator mode', () => {
    render(
      <OperatorLayout>
        <div>Test content</div>
      </OperatorLayout>
    );

    expect(screen.getByTestId('nav-item-Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Routes')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-item-Admin Home')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-item-Customers')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-item-Invoices')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-item-Users')).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';
import { useActiveOperatorRole } from '@/lib/useActiveOperatorRole';
import OperatorLayout from '@/app/operator/layout';

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn(),
}));

jest.mock('@/lib/use-user-groups', () => ({
  useUserGroups: jest.fn(),
}));

jest.mock('@/lib/useActiveOperatorRole', () => ({
  useActiveOperatorRole: jest.fn(),
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
    navItems: Array<{ href: string; label: string; icon: string }>;
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

  it('renders operator portal when activeRole is operator', () => {
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['operator'],
      loading: false,
      isAdmin: false,
      isOperator: true,
      isCustomer: false,
    });

    (useActiveOperatorRole as jest.Mock).mockReturnValue({
      activeRole: 'operator',
      isOperatorMode: true,
    });

    render(
      <OperatorLayout>
        <div>Test content</div>
      </OperatorLayout>
    );

    expect(screen.getByTestId('portal-title')).toHaveTextContent('Operator Portal');
  });

  it('shows only Dashboard and Routes nav when in operator mode', () => {
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['operator'],
      loading: false,
      isAdmin: false,
      isOperator: true,
      isCustomer: false,
    });

    (useActiveOperatorRole as jest.Mock).mockReturnValue({
      activeRole: 'operator',
      isOperatorMode: true,
    });

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

  it('renders administrator portal when activeRole is administrator', () => {
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['administrator'],
      loading: false,
      isAdmin: true,
      isOperator: true,
      isCustomer: false,
    });

    (useActiveOperatorRole as jest.Mock).mockReturnValue({
      activeRole: 'administrator',
      isOperatorMode: false,
    });

    render(
      <OperatorLayout>
        <div>Test content</div>
      </OperatorLayout>
    );

    expect(screen.getByTestId('portal-title')).toHaveTextContent('Administrator Portal');
  });

  it('shows all navigation items when in administrator mode', () => {
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['administrator'],
      loading: false,
      isAdmin: true,
      isOperator: true,
      isCustomer: false,
    });

    (useActiveOperatorRole as jest.Mock).mockReturnValue({
      activeRole: 'administrator',
      isOperatorMode: false,
    });

    render(
      <OperatorLayout>
        <div>Test content</div>
      </OperatorLayout>
    );

    expect(screen.getByTestId('nav-item-Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Routes')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Admin Home')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Customers')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Invoices')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Users')).toBeInTheDocument();
  });

  it('hides admin items when dual-role user selects operator mode', () => {
    (useUserGroups as jest.Mock).mockReturnValue({
      groups: ['administrator', 'operator'],
      loading: false,
      isAdmin: true,
      isOperator: true,
      isCustomer: false,
    });

    (useActiveOperatorRole as jest.Mock).mockReturnValue({
      activeRole: 'operator',
      isOperatorMode: true,
    });

    render(
      <OperatorLayout>
        <div>Test content</div>
      </OperatorLayout>
    );

    expect(screen.getByTestId('portal-title')).toHaveTextContent('Operator Portal');
    expect(screen.getByTestId('nav-item-Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Routes')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-item-Admin Home')).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import AdministratorLayout from '@/app/administrator/layout';

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

describe('AdministratorLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthenticator as jest.Mock).mockReturnValue({
      signOut: jest.fn(),
      user: null,
    });
  });

  it('renders administrator portal title', () => {
    render(
      <AdministratorLayout>
        <div>Test content</div>
      </AdministratorLayout>
    );

    expect(screen.getByTestId('portal-title')).toHaveTextContent('Administrator Portal');
  });

  it('shows administrator navigation only', () => {
    render(
      <AdministratorLayout>
        <div>Test content</div>
      </AdministratorLayout>
    );

    expect(screen.getByTestId('nav-item-Admin Home')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Routes')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Customers')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Invoices')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-Users')).toBeInTheDocument();
  });
});

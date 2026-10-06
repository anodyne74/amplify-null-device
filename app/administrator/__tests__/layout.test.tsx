import { render, screen } from '@testing-library/react';
import AdministratorLayout from '@/app/administrator/layout';

jest.mock('@/lib/usePortalUser', () => ({
  usePortalUser: () => ({ userId: 'op-1', displayName: 'Sam Rivera', logout: jest.fn() }),
}));

jest.mock('@/app/components/OperatorRoute', () => {
  return function MockOperatorRoute({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  };
});

jest.mock('@/app/components/PortalShell', () => {
  return function MockPortalShell({
    navItems,
    children,
  }: {
    navItems: Array<{ href: string; label: string; icon: unknown }>;
    children: React.ReactNode;
  }) {
    return (
      <div>
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

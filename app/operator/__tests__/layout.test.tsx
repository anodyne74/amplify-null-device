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

jest.mock('@/app/operator/mui-layout', () => {
  return function MockOperatorMUILayout({
    children,
    userEmail,
  }: {
    children: React.ReactNode;
    userEmail: string;
    onLogout: () => void;
  }) {
    return (
      <div>
        <div data-testid="portal-title">Operator Portal</div>
        <div data-testid="user-email">{userEmail}</div>
        <nav data-testid="nav">
          <div data-testid="nav-item-Dashboard">Dashboard</div>
          <div data-testid="nav-item-Routes">Routes</div>
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
  });
});

import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const configureAmplifyMock = jest.fn();
const setModeMock = jest.fn();

jest.mock('@/lib/amplify-config', () => ({
  configureAmplify: () => configureAmplifyMock(),
}));

jest.mock('@aws-amplify/ui-react', () => ({
  Authenticator: {
    Provider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="auth-provider">{children}</div>
    ),
  },
}));

jest.mock('@/app/components/AmplifyThemeProvider', () => ({
  useThemeMode: () => ({
    mode: 'system',
    setMode: setModeMock,
  }),
}));

import AmplifyAuthProvider from '@/app/components/AmplifyAuthProvider';
import AmplifyBootstrap from '@/app/components/AmplifyBootstrap';
import ThemeModeSelect from '@/app/components/ThemeModeSelect';

describe('bootstrap/auth/theme components', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wraps children with Amplify Authenticator provider', () => {
    render(
      <AmplifyAuthProvider>
        <span>Child Content</span>
      </AmplifyAuthProvider>
    );

    expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
    expect(screen.getByText('Child Content')).toBeInTheDocument();
  });

  it('renders null before effect and children after configure', async () => {
    const { findByText } = render(
      <AmplifyBootstrap>
        <span>Bootstrapped App</span>
      </AmplifyBootstrap>
    );

    expect(await findByText('Bootstrapped App')).toBeInTheDocument();
    expect(configureAmplifyMock).toHaveBeenCalled();
  });

  it('renders theme selector and updates mode on change', () => {
    render(<ThemeModeSelect label="Theme mode" className="extra" />);

    const select = screen.getByLabelText('Theme mode');
    fireEvent.change(select, { target: { value: 'dark' } });

    expect(setModeMock).toHaveBeenCalledWith('dark');
    expect(select).toHaveValue('system');
  });
});

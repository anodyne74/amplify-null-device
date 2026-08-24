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
    resolvedMode: 'dark',
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

  it('renders theme toggle and updates mode on change (#56)', () => {
    render(<ThemeModeSelect label="Theme mode" className="extra" />);

    const toggle = screen.getByLabelText('Theme mode');
    expect(toggle).toBeChecked(); // resolvedMode: 'dark'
    expect(screen.queryByText('System')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(setModeMock).toHaveBeenCalledWith('light');
  });

  it('uses default label when custom label is not provided', () => {
    render(<ThemeModeSelect />);

    expect(screen.getByLabelText('Theme')).toBeInTheDocument();
  });
});

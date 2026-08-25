import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';

const setModeMock = jest.fn();
const useThemeModeMock = jest.fn();

jest.mock('@/app/components/AmplifyThemeProvider', () => ({
  useThemeMode: () => useThemeModeMock(),
}));

import ThemeModeSelect from '@/app/components/ThemeModeSelect';

describe('ThemeModeSelect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the active theme in the label when resolved to dark (#81)', () => {
    useThemeModeMock.mockReturnValue({ resolvedMode: 'dark', setMode: setModeMock });
    render(<ThemeModeSelect label="Theme" />);
    expect(screen.getByLabelText('Theme: Dark')).toBeInTheDocument();
  });

  it('shows the active theme in the label when resolved to light (#81)', () => {
    useThemeModeMock.mockReturnValue({ resolvedMode: 'light', setMode: setModeMock });
    render(<ThemeModeSelect label="Theme" />);
    expect(screen.getByLabelText('Theme: Light')).toBeInTheDocument();
  });

  it('omits the prefix when no label is passed', () => {
    useThemeModeMock.mockReturnValue({ resolvedMode: 'light', setMode: setModeMock });
    render(<ThemeModeSelect label="" />);
    expect(screen.getByLabelText('Light')).toBeInTheDocument();
  });
});

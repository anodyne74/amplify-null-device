import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import HelpLink from '../HelpLink';
import PageHeader from '../PageHeader';

let mockPathname = '/customer/routes';
let mockOnFlags: string[] = ['customer-help'];
let mockFlagsLoading = false;
let mockRole: 'account_owner' | 'read_only' = 'account_owner';
let mockRoleLoading = false;
const mockPortalContext = jest.fn();

jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
jest.mock('@/lib/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ isOn: (name: string) => mockOnFlags.includes(name), loading: mockFlagsLoading }),
}));
jest.mock('@/lib/useCustomerPortalContext', () => ({
  useCustomerPortalContext: () => {
    mockPortalContext();
    return { role: mockRole, loading: mockRoleLoading };
  },
}));

describe('HelpLink', () => {
  beforeEach(() => {
    mockPathname = '/customer/routes';
    mockOnFlags = ['customer-help'];
    mockFlagsLoading = false;
    mockRole = 'account_owner';
    mockRoleLoading = false;
    mockPortalContext.mockClear();
  });

  it("opens the screen's help page, including from the screens beneath it", () => {
    mockPathname = '/customer/routes/route-1';
    render(<HelpLink />);
    expect(screen.getByRole('link', { name: 'Help: Follow a Route' })).toHaveAttribute('href', '/customer/help/follow-a-route');
  });

  it('is on every PageHeader', () => {
    mockPathname = '/customer/settings';
    render(<PageHeader title="Settings" />);
    expect(screen.getByRole('link', { name: 'Help: Settings' })).toBeInTheDocument();
  });

  it('is hidden on a screen no help page covers', () => {
    mockPathname = '/customer/help';
    render(<HelpLink />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it("is hidden from a read-only user when the screen's help page is for Account Owners", () => {
    mockPathname = '/customer/invoices';
    mockRole = 'read_only';
    render(<HelpLink />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it("is hidden when the help page's flag is off", () => {
    mockPathname = '/customer/property-history';
    render(<HelpLink />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    mockOnFlags = ['customer-help', 'property-history'];
    render(<HelpLink />);
    expect(screen.getByRole('link', { name: 'Help: Property History' })).toBeInTheDocument();
  });

  it('shows nothing, and never asks who the user is, while customer-help is off', () => {
    mockOnFlags = [];
    render(<HelpLink />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(mockPortalContext).not.toHaveBeenCalled();
  });

  it('shows nothing until the role and flags are known', () => {
    mockRoleLoading = true;
    const { unmount } = render(<HelpLink />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    unmount();

    mockRoleLoading = false;
    mockFlagsLoading = true;
    render(<HelpLink />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

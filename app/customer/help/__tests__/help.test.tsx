import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import CustomerHelpPage from '../page';
import HelpArticle from '../_HelpArticle';
import { REQUESTS_EMAIL } from '@/lib/publicAppConfig';

let mockOnFlags: string[] = ['customer-help'];
let mockRole: 'account_owner' | 'read_only' = 'account_owner';

jest.mock('next/navigation', () => ({ usePathname: () => '/customer/help' }));
jest.mock('@/lib/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ isOn: (name: string) => mockOnFlags.includes(name), loading: false }),
  RequireFeature: ({ flag, children }: { flag: string; children: React.ReactNode }) =>
    mockOnFlags.includes(flag) ? <>{children}</> : null,
}));
jest.mock('@/lib/useCustomerPortalContext', () => ({
  useCustomerPortalContext: () => ({ role: mockRole, loading: false }),
}));

const ACCOUNT_OWNER_PAGES = ['Invoices and Billed Time', 'Route Defaults', 'Users'];

describe('customer help', () => {
  beforeEach(() => {
    mockOnFlags = ['customer-help'];
    mockRole = 'account_owner';
  });

  describe('the help index', () => {
    it('lists every page an Account Owner may see, each linked', () => {
      render(<CustomerHelpPage />);

      for (const title of ['Getting started', 'Request a Route', ...ACCOUNT_OWNER_PAGES, 'Settings', 'Glossary']) {
        expect(screen.getByRole('link', { name: title })).toBeInTheDocument();
      }
      expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/customer/help/users');
    });

    it('never lists the Account Owner pages to a read-only user', () => {
      mockRole = 'read_only';
      render(<CustomerHelpPage />);

      for (const title of ACCOUNT_OWNER_PAGES) {
        expect(screen.queryByRole('link', { name: title })).not.toBeInTheDocument();
      }
      expect(screen.getByRole('link', { name: 'Follow a Route' })).toBeInTheDocument();
    });

    it('lists Property History only while its flag is on', () => {
      const { unmount } = render(<CustomerHelpPage />);
      expect(screen.queryByRole('link', { name: 'Property History' })).not.toBeInTheDocument();
      unmount();

      mockOnFlags = ['customer-help', 'property-history'];
      render(<CustomerHelpPage />);
      expect(screen.getByRole('link', { name: 'Property History' })).toBeInTheDocument();
    });

    it('is not there at all while customer-help is off', () => {
      mockOnFlags = [];
      const { container } = render(<CustomerHelpPage />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('a help page', () => {
    it("shows the page with this branch's addresses filled in", () => {
      render(<HelpArticle slug="request-a-route" />);

      expect(screen.getByRole('heading', { level: 1, name: 'Request a Route' })).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: REQUESTS_EMAIL })[0]).toHaveAttribute('href', `mailto:${REQUESTS_EMAIL}`);
      expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();
    });

    it('is not found for a read-only user when it is for Account Owners', () => {
      mockRole = 'read_only';
      render(<HelpArticle slug="users" />);

      expect(screen.getByText('This page could not be found.')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Users' })).not.toBeInTheDocument();
    });

    it('is not found while its flag is off', () => {
      render(<HelpArticle slug="property-history" />);
      expect(screen.getByText('This page could not be found.')).toBeInTheDocument();
    });

    it("doesn't link a read-only user to pages they can't see", () => {
      mockRole = 'read_only';
      render(<HelpArticle slug="getting-started" />);

      expect(screen.getByRole('link', { name: 'Request a Route' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Invoices and Billed Time' })).not.toBeInTheDocument();
    });

    it('shows only the text for flags that are on', () => {
      render(<HelpArticle slug="users" />);
      expect(screen.queryByText(/Send invite/)).not.toBeInTheDocument();
      expect(screen.getByText(/with their name and email address/)).toBeInTheDocument();
    });

    it('shows the invite steps while account-owner-invite is on', () => {
      mockOnFlags = ['customer-help', 'account-owner-invite'];
      render(<HelpArticle slug="users" />);
      expect(screen.getByText(/Send invite/)).toBeInTheDocument();
    });

    it('links back to the help index', () => {
      render(<HelpArticle slug="glossary" />);
      expect(screen.getByRole('link', { name: 'All help' })).toHaveAttribute('href', '/customer/help');
    });
  });
});

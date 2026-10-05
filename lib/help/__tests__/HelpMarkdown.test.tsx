import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { HelpMarkdown } from '@/lib/help/HelpMarkdown';

const visible = (...slugs: string[]) => (slug: string) => slugs.includes(slug);

describe('HelpMarkdown', () => {
  it('renders headings, paragraphs and lists', () => {
    const { container } = render(
      <HelpMarkdown
        source={'## Before you start\n\nSome text\nthat wraps.\n\n- One\n- Two\n\n1. First\n2. Second'}
        canSeeHelpPage={visible()}
      />
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Before you start' })).toBeInTheDocument();
    expect(screen.getByText('Some text that wraps.')).toBeInTheDocument();
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
  });

  it('renders bold text and email links', () => {
    render(<HelpMarkdown source={'Send it to **[r@x.test](mailto:r@x.test)** today.'} canSeeHelpPage={visible()} />);

    expect(screen.getByRole('link', { name: 'r@x.test' })).toHaveAttribute('href', 'mailto:r@x.test');
    expect(screen.getByRole('link', { name: 'r@x.test' }).closest('strong')).toBeInTheDocument();
  });

  it('links to a help page the reader can see, and leaves one they cannot as plain text', () => {
    render(
      <HelpMarkdown
        source={'See [Users](/customer/help/users) and [Invoices](/customer/help/invoices-and-billed-time).'}
        canSeeHelpPage={visible('users')}
      />
    );

    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/customer/help/users');
    expect(screen.queryByRole('link', { name: 'Invoices' })).not.toBeInTheDocument();
    expect(screen.getByText(/Invoices/)).toBeInTheDocument();
  });

  it('only links to email, https and help pages, leaving anything else as plain text', () => {
    render(
      <HelpMarkdown
        source={'[Bad](javascript:alert(1)) [Elsewhere](/customer/routes) [Site](https://example.test)'}
        canSeeHelpPage={visible()}
      />
    );

    expect(screen.queryByRole('link', { name: 'Bad' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Elsewhere' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Site' })).toHaveAttribute('href', 'https://example.test');
  });

  it('never renders HTML written into the source', () => {
    const { container } = render(<HelpMarkdown source={'<img src=x onerror=alert(1)> text'} canSeeHelpPage={visible()} />);
    expect(container.querySelector('img')).toBeNull();
  });
});

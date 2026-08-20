import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Breadcrumbs from '../Breadcrumbs';

describe('Breadcrumbs', () => {
  it('renders a breadcrumb nav with an ordered list', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Routes', href: '/operator/routes' },
          { label: 'Route W19-26-001' },
        ]}
      />
    );

    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders ancestors as links with their href', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Invoices', href: '/customer/invoices' },
          { label: 'Invoice INV-001' },
        ]}
      />
    );

    const link = screen.getByRole('link', { name: 'Invoices' });
    expect(link).toHaveAttribute('href', '/customer/invoices');
  });

  it('marks the last item with aria-current="page" and does not link it', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Routes', href: '/customer/routes' },
          { label: 'Route abc12345', href: '/customer/routes/abc12345' },
        ]}
      />
    );

    const leaf = screen.getByText('Route abc12345');
    expect(leaf).toHaveAttribute('aria-current', 'page');
    expect(leaf.tagName).not.toBe('A');
    expect(screen.queryByRole('link', { name: 'Route abc12345' })).not.toBeInTheDocument();
  });

  it('renders an ancestor without href as plain text, not a link', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Routes' },
          { label: 'Route W19-26-001' },
        ]}
      />
    );

    const ancestor = screen.getByText('Routes');
    expect(ancestor.tagName).not.toBe('A');
    expect(ancestor).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders nothing when items is empty', () => {
    const { container } = render(<Breadcrumbs items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

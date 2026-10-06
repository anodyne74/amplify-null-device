import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import CustomerPagination from '../CustomerPagination';

function PaginationHarness({ totalItems }: { totalItems: number }) {
  const [page, setPage] = useState(1);
  return <CustomerPagination page={page} totalItems={totalItems} onPageChange={setPage} itemsLabel="invoices" />;
}

describe('CustomerPagination', () => {
  it('renders nothing when there are no items', () => {
    const { container } = render(<CustomerPagination page={1} totalItems={0} onPageChange={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a navigation landmark with a polite summary', () => {
    render(<PaginationHarness totalItems={60} />);

    expect(screen.getByRole('navigation', { name: 'invoices pagination' })).toBeInTheDocument();
    const summary = screen.getByText('Showing 1–25 of 60 invoices');
    expect(summary).toHaveAttribute('aria-live', 'polite');
  });

  it('moves between pages and disables the buttons at either end', () => {
    render(<PaginationHarness totalItems={60} />);
    const previous = () => screen.getByRole('button', { name: 'Previous page of invoices' });
    const next = () => screen.getByRole('button', { name: 'Next page of invoices' });

    expect(previous()).toBeDisabled();
    fireEvent.click(next());
    expect(screen.getByText('Showing 26–50 of 60 invoices')).toBeInTheDocument();
    fireEvent.click(next());
    expect(screen.getByText('Showing 51–60 of 60 invoices')).toBeInTheDocument();
    expect(next()).toBeDisabled();
    fireEvent.click(previous());
    expect(screen.getByText('Showing 26–50 of 60 invoices')).toBeInTheDocument();
  });

  it('disables both buttons when everything fits on one page', () => {
    render(<PaginationHarness totalItems={3} />);

    expect(screen.getByText('Showing 1–3 of 3 invoices')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page of invoices' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page of invoices' })).toBeDisabled();
  });
});

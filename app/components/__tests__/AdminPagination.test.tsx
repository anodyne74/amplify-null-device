import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import AdminPagination, { getPageSlice } from '@/app/components/AdminPagination';

function PaginationHarness({ totalItems }: { totalItems: number }) {
  const [page, setPage] = useState(1);
  return (
    <AdminPagination
      page={page}
      totalItems={totalItems}
      onPageChange={setPage}
      itemsLabel="widgets"
    />
  );
}

describe('AdminPagination', () => {
  it('renders nothing when there are no items', () => {
    const { container } = render(
      <AdminPagination page={1} totalItems={0} onPageChange={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes a navigation landmark with a summary', () => {
    render(<PaginationHarness totalItems={60} />);

    expect(screen.getByRole('navigation', { name: 'widgets pagination' })).toBeInTheDocument();
    expect(screen.getByText('Showing 1–25 of 60 widgets')).toBeInTheDocument();
  });

  it('moves between pages and disables controls at the boundaries', () => {
    render(<PaginationHarness totalItems={60} />);

    const previous = () => screen.getByRole('button', { name: 'Previous page of widgets' });
    const next = () => screen.getByRole('button', { name: 'Next page of widgets' });

    expect(previous()).toBeDisabled();
    expect(next()).toBeEnabled();

    fireEvent.click(next());
    expect(screen.getByText('Showing 26–50 of 60 widgets')).toBeInTheDocument();
    expect(previous()).toBeEnabled();

    fireEvent.click(next());
    expect(screen.getByText('Showing 51–60 of 60 widgets')).toBeInTheDocument();
    expect(next()).toBeDisabled();

    fireEvent.click(previous());
    expect(screen.getByText('Showing 26–50 of 60 widgets')).toBeInTheDocument();
  });

  it('clamps an out-of-range page to the last available page', () => {
    render(
      <AdminPagination page={99} totalItems={30} onPageChange={jest.fn()} itemsLabel="widgets" />
    );

    expect(screen.getByText('Showing 26–30 of 30 widgets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page of widgets' })).toBeDisabled();
  });
});

describe('getPageSlice', () => {
  const rows = Array.from({ length: 26 }, (_, index) => index + 1);

  it('returns the requested page of rows', () => {
    const { currentPage, totalPages, pageRows } = getPageSlice(rows, 2, 25);
    expect(currentPage).toBe(2);
    expect(totalPages).toBe(2);
    expect(pageRows).toEqual([26]);
  });

  it('clamps the page when the result set shrinks', () => {
    const { currentPage, pageRows } = getPageSlice(rows.slice(0, 5), 4, 25);
    expect(currentPage).toBe(1);
    expect(pageRows).toHaveLength(5);
  });
});

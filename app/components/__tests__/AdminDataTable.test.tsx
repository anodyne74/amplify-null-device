import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import AdminDataTable, {
  AdminSortableHeader,
  useAdminTableSort,
} from '@/app/components/AdminDataTable';

const DEFAULT_ROWS = ['Charlie', 'Alpha', 'Bravo'];

function SortableHarness() {
  const { sortBy, sortDirection, toggleSort } = useAdminTableSort<'name'>();

  const rows = useMemo(() => {
    if (!sortBy) return DEFAULT_ROWS;
    const sorted = [...DEFAULT_ROWS].sort((a, b) => a.localeCompare(b));
    if (sortDirection === 'desc') sorted.reverse();
    return sorted;
  }, [sortBy, sortDirection]);

  return (
    <AdminDataTable ariaLabel="Sortable list">
      <thead>
        <tr>
          <AdminSortableHeader
            label="Name"
            sortKey="name"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={toggleSort}
          />
          <th scope="col">Other</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row}>
            <td>{row}</td>
            <td>—</td>
          </tr>
        ))}
      </tbody>
    </AdminDataTable>
  );
}

function getFirstColumnValues() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('td')?.textContent);
}

describe('AdminDataTable', () => {
  it('renders children inside an accessible table without sorting props', () => {
    render(
      <AdminDataTable ariaLabel="Plain table" hint="Scroll sideways">
        <tbody>
          <tr>
            <td>Cell</td>
          </tr>
        </tbody>
      </AdminDataTable>
    );

    expect(screen.getByRole('table', { name: 'Plain table' })).toBeInTheDocument();
    expect(screen.getByText('Scroll sideways')).toBeInTheDocument();
    expect(screen.getByText('Cell')).toBeInTheDocument();
  });

  it('sorts via a real header button and cycles aria-sort asc, desc, none', () => {
    render(<SortableHarness />);

    const button = screen.getByRole('button', { name: 'Sort by Name' });
    const th = button.closest('th');

    expect(th).toHaveAttribute('aria-sort', 'none');
    expect(getFirstColumnValues()).toEqual(['Charlie', 'Alpha', 'Bravo']);

    fireEvent.click(button);
    expect(th).toHaveAttribute('aria-sort', 'ascending');
    expect(getFirstColumnValues()).toEqual(['Alpha', 'Bravo', 'Charlie']);

    fireEvent.click(button);
    expect(th).toHaveAttribute('aria-sort', 'descending');
    expect(getFirstColumnValues()).toEqual(['Charlie', 'Bravo', 'Alpha']);

    fireEvent.click(button);
    expect(th).toHaveAttribute('aria-sort', 'none');
    expect(getFirstColumnValues()).toEqual(['Charlie', 'Alpha', 'Bravo']);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { DataTable, type DataColumn } from './DataTable';

type Row = { id: string; name: string; count: number; note: string };

const columns: DataColumn<Row>[] = [
  { key: 'name', header: 'Name' },
  { key: 'count', header: 'Count', numeric: true },
  { key: 'note', header: 'Note', numeric: true, align: 'center' },
];

describe('DataTable alignment', () => {
  it('aligns a numeric column header with its values, unless the column sets its own', () => {
    render(<DataTable columns={columns} rows={[{ id: 'a', name: 'A', count: 1, note: 'x' }]} />);

    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveStyle({ textAlign: 'left' });
    expect(screen.getByRole('columnheader', { name: 'Count' })).toHaveStyle({ textAlign: 'right' });
    expect(screen.getByRole('cell', { name: '1' })).toHaveStyle({ textAlign: 'right' });
    expect(screen.getByRole('columnheader', { name: 'Note' })).toHaveStyle({ textAlign: 'center' });
  });
});

describe('DataTable onRowClick', () => {
  const rows = [{ id: 'a', name: 'A', count: 1, note: 'x' }];

  it('calls back with the row when its cell is clicked', () => {
    const onRowClick = jest.fn();
    render(<DataTable columns={columns} rows={rows} onRowClick={onRowClick} />);

    fireEvent.click(screen.getByRole('cell', { name: '1' }));

    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('ignores clicks on a link or button inside the row', () => {
    const onRowClick = jest.fn();
    const withControls: DataColumn<Row>[] = [
      { key: 'name', header: 'Name', render: (row) => <a href="#x">{row.name} link</a> },
      { key: 'count', header: 'Count', render: () => <button type="button">Act</button> },
    ];
    render(<DataTable columns={withControls} rows={rows} onRowClick={onRowClick} />);

    fireEvent.click(screen.getByRole('link', { name: 'A link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Act' }));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('leaves rows inert without it', () => {
    render(<DataTable columns={columns} rows={rows} />);
    expect(screen.getByRole('cell', { name: '1' }).closest('tr')).not.toHaveStyle({ cursor: 'pointer' });
  });
});

describe('DataTable sortable headers', () => {
  const sortable: DataColumn<Row>[] = [
    { key: 'name', header: 'Name', sortKey: 'name' },
    { key: 'count', header: 'Count' },
  ];
  const rows = [{ id: 'a', name: 'A', count: 1, note: 'x' }];

  it('makes a sortable header a button that reports its key, and leaves other headers plain', () => {
    const onSort = jest.fn();
    render(<DataTable columns={sortable} rows={rows} onSort={onSort} />);

    fireEvent.click(screen.getByRole('button', { name: /name/i }));

    expect(onSort).toHaveBeenCalledWith('name');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: 'Count' })).not.toHaveAttribute('aria-sort');
  });

  it('exposes the active sort and its direction through aria-sort', () => {
    const { rerender } = render(<DataTable columns={sortable} rows={rows} onSort={jest.fn()} sortBy="name" sortDirection="desc" />);
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute('aria-sort', 'descending');

    rerender(<DataTable columns={sortable} rows={rows} onSort={jest.fn()} sortBy="name" sortDirection="asc" />);
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute('aria-sort', 'ascending');

    rerender(<DataTable columns={sortable} rows={rows} onSort={jest.fn()} sortBy={null} />);
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute('aria-sort', 'none');
  });

  it('shows the default order on its column while no sort is chosen, and drops it once one is', () => {
    const two: DataColumn<Row>[] = [
      { key: 'name', header: 'Name', sortKey: 'name' },
      { key: 'count', header: 'Count', sortKey: 'count' },
    ];
    const { rerender } = render(
      <DataTable columns={two} rows={rows} onSort={jest.fn()} defaultSort={{ key: 'count', direction: 'desc' }} />
    );
    expect(screen.getByRole('columnheader', { name: /count/i })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute('aria-sort', 'none');

    rerender(
      <DataTable columns={two} rows={rows} onSort={jest.fn()} sortBy="name" sortDirection="asc" defaultSort={{ key: 'count', direction: 'desc' }} />
    );
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /count/i })).toHaveAttribute('aria-sort', 'none');
  });

  it('draws the sort direction with an icon, not a text glyph', () => {
    render(<DataTable columns={sortable} rows={rows} onSort={jest.fn()} sortBy="name" sortDirection="asc" />);

    const header = screen.getByRole('columnheader', { name: /name/i });
    expect(header.querySelector('[data-icon="arrow-up"]')).not.toBeNull();
    expect(header.textContent).not.toMatch(/[▲▼↕]/);
  });
});

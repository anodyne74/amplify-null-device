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

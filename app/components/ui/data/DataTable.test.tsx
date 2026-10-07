import { render, screen } from '@testing-library/react';
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

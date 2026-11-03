import React from 'react';

export interface DataColumn<T = any> {
  key: string;
  header: React.ReactNode;
  /** Right-aligns and sets tabular mono figures — money, counts, durations. */
  numeric?: boolean;
  align?: 'left' | 'right' | 'center';
  width?: string | number;
  render?: (row: T) => React.ReactNode;
  /** Makes the header a button that calls onSort with this key. Needs a string header for its label. */
  sortKey?: string;
}

export interface DataTableProps<T = any> extends Omit<React.TableHTMLAttributes<HTMLTableElement>, 'children'> {
  columns: DataColumn<T>[];
  rows: T[];
  hoverable?: boolean;
  /** Wraps in a bordered card shell. Set false inside a padded={false} Card. */
  wrapped?: boolean;
  empty?: React.ReactNode;
  /** Makes a click on the row (outside any link, button or form control in it) call this. The row is
   *  not focusable: put a real link in one cell as the keyboard and screen-reader route. */
  onRowClick?: (row: T) => void;
  /** The active sort, from the caller; the table does not reorder rows itself. */
  sortBy?: string | null;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: string) => void;
}

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], [role="menuitem"]';

export function DataTable<T extends { id?: string | number } = any>({
  columns = [],
  rows = [],
  hoverable = true,
  wrapped = true,
  empty = 'Nothing here yet',
  onRowClick,
  sortBy = null,
  sortDirection = 'asc',
  onSort,
  className = '',
  ...rest
}: DataTableProps<T>) {
  const table = (
    <table className={`nd-table ${hoverable ? 'nd-table--hoverable' : ''} ${className}`} {...rest}>
      <thead>
        <tr>
          {columns.map((c) => {
            const sortable = Boolean(c.sortKey && onSort);
            const active = sortable && sortBy === c.sortKey;
            return (
              <th
                key={c.key}
                aria-sort={sortable ? (active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                style={{ textAlign: c.align || (c.numeric ? 'right' : 'left'), width: c.width }}
              >
                {sortable ? (
                  <button type="button" className="nd-table__sort" onClick={() => onSort?.(c.sortKey as string)}>
                    {c.header}
                    <span aria-hidden="true">{active ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </button>
                ) : (
                  c.header
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--text-subtle)', padding: 'var(--space-10)' }}>
              {empty}
            </td>
          </tr>
        )}
        {rows.map((r, i) => (
          <tr
            key={r.id ?? i}
            style={onRowClick ? { cursor: 'pointer' } : undefined}
            onClick={onRowClick ? (event) => {
              if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
              onRowClick(r);
            } : undefined}
          >
            {columns.map((c) => (
              <td key={c.key} className={c.numeric ? 'nd-table__num' : ''} style={{ textAlign: c.align || (c.numeric ? 'right' : 'left') }}>
                {c.render ? c.render(r) : (r as any)[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return wrapped ? <div className="nd-table__wrap">{table}</div> : table;
}
